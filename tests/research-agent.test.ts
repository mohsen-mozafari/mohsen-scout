import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults } from '../lib/types';
import {
  buildResearchAgentPrompt,
  parseResearchAgentJson,
  parseResearchDossier,
  type ResearchAgentInput,
} from '../lib/research-agent-core';
import type { WebResearchItem } from '../lib/web-research';

const evidence: WebResearchItem[] = [
  {
    id: 'web:one',
    title: 'Independent battery recycling study',
    summary: 'The study reports a measurable recovery improvement.',
    url: 'https://research.example.org/report',
    sourceName: 'Research Institute',
    publishedAt: '2026-10-10T00:00:00.000Z',
    category: 'web',
  },
  {
    id: 'web:two',
    title: 'Policy review disputes one claimed benefit',
    summary: 'A separate review describes important limitations.',
    url: 'https://policy.example.net/review',
    sourceName: 'Policy Journal',
    publishedAt: '2026-09-10T00:00:00.000Z',
    category: 'news',
  },
];

void test('research prompt contains only independent web evidence and previous research, never YouTube API metadata', () => {
  const input: ResearchAgentInput = {
    topic: 'battery recycling',
    evidence: [
      ...evidence,
      {
        id: 'yt:private-video',
        title: 'Raw YouTube title must not leave the device',
        summary: 'viewCount 987654 and likeCount 12345',
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        sourceName: 'YouTube',
        category: 'web',
      },
    ],
    preferences: defaults().preferences,
  };
  const prompt = buildResearchAgentPrompt(input);
  assert.ok(prompt.includes('Independent battery recycling study'));
  assert.ok(!prompt.includes('Raw YouTube title must not leave the device'));
  assert.ok(!prompt.includes('987654'));
  assert.ok(prompt.includes('counterevidence'));
});

void test('research response parser accepts fenced JSON but rejects non-object payloads', () => {
  assert.deepEqual(parseResearchAgentJson('\x60\x60\x60json\n{"hypotheses":[]}\n\x60\x60\x60'), { hypotheses: [] });
  assert.throws(() => parseResearchAgentJson('[]'));
  assert.throws(() => parseResearchAgentJson('not json'));
});

void test('research dossier filters fabricated and YouTube evidence IDs and duplicate next queries', () => {
  const raw = {
    hypotheses: [{
      id: 'h1',
      claim: 'Recycling capacity may constrain supply',
      rationale: 'Both supporting and challenging material is present.',
      status: 'contested',
      confidence: 'moderate',
      supportingEvidenceIds: ['web:one', 'made-up-id', 'yt:private-video'],
      challengingEvidenceIds: ['web:two'],
      missingEvidence: ['A primary production dataset'],
    }],
    evidenceReviews: [
      { evidenceId: 'web:one', role: 'supports', credibility: 'medium', sourceType: 'secondary', freshness: 'recent', reason: 'Study summary describes the effect.' },
      { evidenceId: 'made-up-id', role: 'supports', credibility: 'high', sourceType: 'primary', freshness: 'recent', reason: 'Unknown source.' },
      { evidenceId: 'yt:private-video', role: 'supports', credibility: 'high', sourceType: 'primary', freshness: 'recent', reason: 'YouTube must not be accepted here.' },
    ],
    nextQueries: [
      { query: 'battery recycling primary production dataset', purpose: 'primary-source', hypothesisId: 'h1', priority: 5, reason: 'Find original figures.' },
      { query: 'battery recycling primary production dataset', purpose: 'primary-source', hypothesisId: 'h1', priority: 4, reason: 'Duplicate.' },
      { query: 'battery recycling criticism', purpose: 'counterevidence', hypothesisId: 'h1', priority: 4, reason: 'Try to disprove the claim.' },
    ],
    contradictions: [
      { description: 'Sources disagree about capacity constraints.', evidenceIds: ['web:one', 'web:two', 'made-up-id'] },
    ],
    gaps: ['Primary data is missing.'],
    conclusion: 'The evidence is mixed and needs primary-source validation.',
    confidence: 'low',
    stoppingReason: 'A primary dataset is not yet available.',
  };
  const dossier = parseResearchDossier(
    raw,
    [
      ...evidence,
      {
        id: 'yt:private-video',
        title: 'Video metadata',
        summary: 'This record should not be admissible in a web research dossier.',
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        sourceName: 'YouTube',
        category: 'web',
      },
    ],
    undefined,
    ['battery recycling criticism'],
    'gemini',
    'test-model',
    1764000000000,
  );
  // Model-proposed evidence IDs and verdicts are not proof without fetched text and an independent review.
  assert.deepEqual(dossier.hypotheses[0]?.supportingEvidenceIds, []);
  assert.deepEqual(dossier.hypotheses[0]?.challengingEvidenceIds, []);
  assert.equal(dossier.hypotheses[0]?.status, 'insufficient-evidence');
  assert.equal(dossier.hypotheses[0]?.confidence, 'low');
  assert.equal(dossier.reviewStatus, 'pending-independent-review');
  assert.deepEqual(dossier.evidenceReviews.map((item) => item.evidenceId), ['web:one']);
  assert.equal(dossier.nextQueries.length, 1);
  assert.equal(dossier.nextQueries[0]?.query, 'battery recycling primary production dataset');
  assert.deepEqual(dossier.contradictions[0]?.evidenceIds, ['web:one', 'web:two']);
});
