import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults } from '../lib/types';
import {
  internalEngineReviewPrompt,
  opinionPrompt,
  structuredSecondOpinionPrompt,
  type YouTubeSampleVideo,
} from '../lib/api';
import {
  buildIndependentReviewPrompt,
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

void test('research prompt receives primary YouTube platform signals, growth and selected niche without treating them as publisher citations', () => {
  const input: ResearchAgentInput = {
    topic: 'battery recycling',
    researchNiche: 'space science and exploration',
    evidence,
    youtubeSignals: [{
      id: 'video-1',
      title: 'MOCK YouTube trend: battery recycling breakthrough',
      description: 'A sampled video with measured view velocity.',
      channel: 'MOCK science channel',
      channelId: 'UCmock',
      publishedAt: '2026-11-20T12:00:00.000Z',
      thumbnailUrl: 'https://example.org/thumb.jpg',
      viewCount: 120000,
      likeCount: 6000,
      channelSubscriberCount: 50000,
      channelVideoCount: 1200,
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      growth: {
        snapshotCount: 3, deltaViews: 18000, viewsPerHour: 750, viewsPerDay: 18000,
        channelBaselineViewsPerDay: 2500, channelOutlierRatio: 7.2,
        measuredAt: 1795195200000, status: 'measured',
      },
    }],
    internalEngineFindings: {
      summary: 'Local engine found a new platform trend.',
      keyFindings: ['Three related videos accelerated.'],
      gaps: ['Independent primary data is missing.'],
      verificationQuestions: ['Is the reported mechanism real?'],
      potentialContradictions: ['One publisher disputes the reported scale.'],
    },
    preferences: defaults().preferences,
  };
  const prompt = buildResearchAgentPrompt(input);
  assert.ok(prompt.includes('Independent battery recycling study'));
  assert.ok(prompt.includes('MOCK YouTube trend: battery recycling breakthrough'));
  assert.ok(prompt.includes('750'));
  assert.ok(prompt.includes('7.2'));
  assert.ok(prompt.includes('space science and exploration'));
  assert.ok(prompt.includes('Local engine found a new platform trend.'));
  assert.ok(prompt.includes('مشاهدات پلتفرمی‌اند'));
  const reviewDossier = parseResearchDossier({
    hypotheses: [], evidenceReviews: [], nextQueries: [], contradictions: [],
    gaps: [], conclusion: 'Fixture only.', confidence: 'low', stoppingReason: 'Fixture only.',
  }, evidence, undefined, [], 'gemini', 'mock-model', 1795195200000);
  const independentPrompt = buildIndependentReviewPrompt(
    input.topic, reviewDossier, evidence, 'en', input.youtubeSignals ?? [],
    { researchNiche: input.researchNiche, internalEngineFindings: input.internalEngineFindings },
  );
  assert.ok(independentPrompt.includes('Local engine found a new platform trend.'));
  assert.ok(independentPrompt.includes('Three related videos accelerated.'));
  assert.ok(independentPrompt.includes('Independent primary data is missing.'));
});
void test('the complete collected YouTube sample reaches both external research prompts without a 25-video cap', () => {
  const youtubeSignals = Array.from({ length: 32 }, (_, index) => ({
    id: 'mock-video-' + index,
    title: 'MOCK complete YouTube sample marker ' + index,
    description: 'MOCK description for complete sample item ' + index,
    channel: 'MOCK channel ' + index,
    channelId: 'UCmock' + index,
    publishedAt: '2026-11-20T12:00:00.000Z',
    thumbnailUrl: 'https://example.org/mock-' + index + '.jpg',
    viewCount: 1000 + index,
    likeCount: 50 + index,
    commentCount: 5 + index,
    channelSubscriberCount: 10000 + index,
    channelVideoCount: 100 + index,
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    growth: {
      snapshotCount: 2, deltaViews: 100 + index, viewsPerHour: 4 + index,
      viewsPerDay: 96 + index, channelBaselineViewsPerDay: 80,
      channelOutlierRatio: 1.2 + index / 100, measuredAt: 1795195200000, status: 'measured' as const,
    },
  }));
  const input: ResearchAgentInput = {
    topic: 'battery recycling',
    evidence,
    youtubeSignals,
    preferences: defaults().preferences,
  };
  const firstPrompt = buildResearchAgentPrompt(input);
  const dossier = parseResearchDossier({
    hypotheses: [],
    evidenceReviews: [],
    nextQueries: [],
    contradictions: [],
    gaps: [],
    conclusion: 'YouTube-only platform review fixture.',
    confidence: 'low',
    stoppingReason: 'Fixture used to validate full sample handoff.',
  }, evidence, undefined, [], 'gemini', 'mock-model', 1795195200000);
  const reviewPrompt = buildIndependentReviewPrompt(
    'battery recycling', dossier, evidence, 'en', youtubeSignals,
  );
  assert.ok(firstPrompt.includes('MOCK complete YouTube sample marker 31'));
  assert.ok(reviewPrompt.includes('MOCK complete YouTube sample marker 31'));
  assert.ok(firstPrompt.includes('channelSubscriberCount'));
  assert.ok(firstPrompt.includes('commentCount'));
});

void test('all second-opinion prompt helpers receive the complete YouTube sample', () => {
  const youtubeSignals: YouTubeSampleVideo[] = Array.from({ length: 32 }, (_, index) => ({
    id: 'sample-video-' + index,
    title: 'MOCK second opinion full sample item ' + index,
    description: 'MOCK full video description ' + index,
    channel: 'MOCK channel ' + index,
    channelId: 'UCsample' + index,
    publishedAt: '2026-11-20T12:00:00.000Z',
    thumbnailUrl: 'https://example.org/thumb-' + index + '.jpg',
    viewCount: 5000 + index,
    likeCount: 200 + index,
    commentCount: 10 + index,
    channelSubscriberCount: 10000 + index,
    channelVideoCount: 500 + index,
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    growth: {
      snapshotCount: 3, deltaViews: 300 + index, viewsPerHour: 12 + index,
      viewsPerDay: 288 + index, channelBaselineViewsPerDay: 200,
      channelOutlierRatio: 1.4 + index / 100, measuredAt: 1795195200000, status: 'measured',
    },
  }));
  const structured = structuredSecondOpinionPrompt(
    'battery recycling', 'A platform-aware concept', 'en', [], youtubeSignals,
  );
  const legacy = opinionPrompt(
    'battery recycling', 'A platform-aware concept', '', 'en', youtubeSignals,
  );
  const internal = internalEngineReviewPrompt({
    topic: 'battery recycling',
    summary: 'Local engine summary',
    evidence: [{ label: 'YouTube momentum', detail: 'Measured trend signals are available.' }],
    confidence: { level: 'low', reason: 'Fixture only.' },
    youtubeSignals,
    language: 'en',
  });
  for (const prompt of [structured, legacy, internal]) {
    assert.ok(prompt.includes('MOCK second opinion full sample item 31'));
    assert.ok(prompt.includes('channelSubscriberCount'));
    assert.ok(prompt.includes('commentCount'));
  }
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


void test('research prompt sends multiple original-text excerpts per source for deeper review', () => {
  const first = 'The original instrument team reports the methane line measurement and describes the calibration procedure in this section.';
  const middle = 'The analysis method compares multiple spectral windows and identifies the limits of the measurement.';
  const final = 'The authors explicitly state the uncertainty range and the alternative interpretation that remains unresolved.';
  const sourceText = [first, middle, final, ('Additional method and limitation context. ').repeat(12)].join('\n\n');
  const prompt = buildResearchAgentPrompt({
    topic: 'JWST methane spectroscopy',
    evidence: [{
      id: 'web:multi',
      title: 'Original instrument report',
      summary: 'Short summary.',
      url: 'https://science.example.org/methane',
      sourceName: 'Research Institute',
      category: 'web',
      sourceText,
    }],
    preferences: defaults().preferences,
  });
  assert.ok(prompt.includes('sourceTextExcerpts'));
  assert.ok(prompt.includes('original instrument team reports'));
  assert.ok(prompt.includes('alternative interpretation'));
});
