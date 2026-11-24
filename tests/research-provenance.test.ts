import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults } from '../lib/types';
import type { ResearchDossier } from '../lib/types';
import type { WebResearchItem } from '../lib/web-research';
import {
  applyIndependentResearchReview,
  buildIndependentReviewPrompt,
  buildResearchAgentPrompt,
  markResearchReviewUnavailable,
  parseResearchDossier,
} from '../lib/research-agent-core';
import {
  assessEvidenceProvenance,
  countDistinctEvidenceGroups,
  quoteOccursInSource,
} from '../lib/research-provenance';

const quoteA = 'The independent laboratory measured a twenty percent reduction in energy consumption across three production runs.';
const quoteB = 'The second research team measured a twenty percent reduction in energy consumption across its own production trials.';
function item(id: string, url: string, text: string, title = 'Independent battery process evaluation'): WebResearchItem {
  return { id, url, title, summary: 'Brief search result summary only.', sourceName: id, category: 'web', sourceText: text };
}
const evidence = [
  item('e1', 'https://research.university.edu/report', quoteA),
  item('e2', 'https://policy-lab.example.net/review', quoteB),
];

function pendingDossier(records: readonly WebResearchItem[] = evidence): ResearchDossier {
  return parseResearchDossier({
    hypotheses: [{
      id: 'h1',
      claim: 'The process reduced energy use by about twenty percent.',
      rationale: 'The available sources appear relevant.',
      status: 'supported',
      confidence: 'high',
      supportingEvidenceIds: records.map((record) => record.id),
      supportingCitations: records.map((record) => ({ evidenceId: record.id, quote: record.sourceText ?? '' })),
      challengingEvidenceIds: [],
      missingEvidence: [],
    }],
    nextQueries: [],
    evidenceReviews: [],
    contradictions: [],
    gaps: [],
    conclusion: 'Provisional hypothesis.',
    confidence: 'high',
    stoppingReason: 'Awaiting cross-provider validation.',
  }, records, undefined, [], 'gemini', 'primary-model', 1764000000000);
}

void test('verbatim quote validation rejects summary-only, invented and too-short quotes', () => {
  assert.equal(quoteOccursInSource(quoteA, quoteA), true);
  assert.equal(quoteOccursInSource(undefined, quoteA), false);
  assert.equal(quoteOccursInSource('A summary says energy fell.', quoteA), false);
  assert.equal(quoteOccursInSource(quoteA, 'energy fell'), false);
});

void test('same registrable domain and likely syndicated copies do not inflate source diversity', () => {
  const sameFamily = [
    item('a', 'https://science.example.com/report', quoteA),
    item('b', 'https://policy.example.com/report', quoteB),
  ];
  assert.equal(countDistinctEvidenceGroups(['a', 'b'], sameFamily), 1);
  const syndicated = [
    item('c', 'https://publisher-one.org/story', quoteA, 'A major new discovery in battery recycling capacity and recovery'),
    item('d', 'https://publisher-two.net/story', quoteB, 'A major new discovery in battery recycling capacity and recovery'),
  ];
  const result = assessEvidenceProvenance(syndicated);
  assert.equal(result.publisherFamilyCount, 1);
  assert.ok(result.syndicatedItemCount >= 2);
  assert.ok(result.limitations.some((note) => note.includes('do not prove legal ownership')));
});

void test('primary researcher cannot self-certify a supported hypothesis', () => {
  const dossier = pendingDossier();
  assert.equal(dossier.hypotheses[0]?.status, 'insufficient-evidence');
  assert.equal(dossier.hypotheses[0]?.confidence, 'low');
  assert.deepEqual(dossier.hypotheses[0]?.supportingEvidenceIds, ['e1', 'e2']);
  assert.equal(dossier.reviewStatus, 'pending-independent-review');
});

void test('independent cross-provider reviewer plus exact quotes from two publisher families can support a claim', () => {
  const dossier = pendingDossier();
  const reviewed = applyIndependentResearchReview(dossier, {
    reviews: [{
      hypothesisId: 'h1',
      verdict: 'support',
      supportingCitations: [
        { evidenceId: 'e1', quote: quoteA },
        { evidenceId: 'e2', quote: quoteB },
      ],
      challengingCitations: [],
      reason: 'Both original reports independently describe the same measured outcome.',
    }],
  }, evidence, 'groq', 'reviewer-model', 1764000000000);
  assert.equal(reviewed.reviewStatus, 'independently-reviewed');
  assert.equal(reviewed.reviewerProvider, 'groq');
  assert.equal(reviewed.hypotheses[0]?.status, 'supported');
  assert.equal(reviewed.hypotheses[0]?.confidence, 'moderate');
  assert.equal(reviewed.hypotheses[0]?.supportingQuotes?.length, 2);
  assert.equal(reviewed.verifiedCitationCount, 2);
});

void test('a model cannot validate citations that are absent from the fetched source text', () => {
  const summaryOnly = evidence.map(({ sourceText: _sourceText, ...rest }) => rest);
  const dossier = pendingDossier(summaryOnly);
  const reviewed = applyIndependentResearchReview(dossier, {
    reviews: [{
      hypothesisId: 'h1',
      verdict: 'support',
      supportingCitations: evidence.map((source) => ({ evidenceId: source.id, quote: quoteA })),
      challengingCitations: [],
    }],
  }, summaryOnly, 'groq', 'reviewer-model');
  assert.equal(reviewed.hypotheses[0]?.status, 'insufficient-evidence');
  assert.equal(reviewed.hypotheses[0]?.confidence, 'low');
  assert.equal(reviewed.verifiedCitationCount, 0);
});

void test('independent reviewer cannot count two subdomains of the same publisher family as corroboration', () => {
  const sameFamily = [
    item('e1', 'https://research.example.com/one', quoteA),
    item('e2', 'https://policy.example.com/two', quoteB),
  ];
  const dossier = pendingDossier(sameFamily);
  const reviewed = applyIndependentResearchReview(dossier, {
    reviews: [{
      hypothesisId: 'h1',
      verdict: 'support',
      supportingCitations: [{ evidenceId: 'e1', quote: quoteA }, { evidenceId: 'e2', quote: quoteB }],
      challengingCitations: [],
    }],
  }, sameFamily, 'groq', 'reviewer-model');
  assert.equal(reviewed.hypotheses[0]?.status, 'insufficient-evidence');
  assert.equal(reviewed.hypotheses[0]?.confidence, 'low');
});

void test('validated counterevidence makes a claim contested instead of hiding disagreement', () => {
  const records = [...evidence, item('e3', 'https://counter.example.org/audit', 'The follow up audit found the claimed energy reduction was not statistically significant in the full production sample.')];
  const dossier = pendingDossier(records);
  const reviewed = applyIndependentResearchReview(dossier, {
    reviews: [{
      hypothesisId: 'h1',
      verdict: 'mixed',
      supportingCitations: [{ evidenceId: 'e1', quote: quoteA }, { evidenceId: 'e2', quote: quoteB }],
      challengingCitations: [{ evidenceId: 'e3', quote: 'The follow up audit found the claimed energy reduction was not statistically significant in the full production sample.' }],
    }],
  }, records, 'groq', 'reviewer-model');
  assert.equal(reviewed.hypotheses[0]?.status, 'contested');
  assert.equal(reviewed.hypotheses[0]?.challengingQuotes?.length, 1);
});

void test('unavailable independent review forces all hypotheses to low-confidence insufficient evidence', () => {
  const result = markResearchReviewUnavailable(pendingDossier(), evidence);
  assert.equal(result.reviewStatus, 'review-unavailable');
  assert.equal(result.confidence, 'low');
  assert.equal(result.hypotheses[0]?.status, 'insufficient-evidence');
  assert.equal(result.hypotheses[0]?.supportingQuotes?.length, 0);
});

void test('both research prompts include evidence records beyond the old first-24 cutoff and exclude YouTube', () => {
  const records = Array.from({ length: 48 }, (_, index) =>
    item('evidence-' + index, 'https://publisher-' + index + '.example.org/story', 'Fetched original research material from independent source number ' + index + '. A second supporting sentence has more detail for source ' + index + '.', 'Distinct source title number ' + index),
  );
  records.push({
    id: 'youtube-private',
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    title: 'Must never reach the reviewer',
    summary: 'private video metadata',
    sourceName: 'YouTube',
    category: 'web',
  });
  const input = { topic: 'battery processes', evidence: records, preferences: defaults().preferences };
  const prompt = buildResearchAgentPrompt(input);
  assert.ok(prompt.includes('evidence-47'));
  assert.ok(prompt.includes('Distinct source title number 47'));
  assert.ok(!prompt.includes('youtube-private'));
  const verifierInput = pendingDossier(records.slice(0, 48));
  const independent = buildIndependentReviewPrompt('battery processes', verifierInput, records, 'en');
  assert.ok(independent.includes('evidence-47'));
  assert.ok(!independent.includes('youtube-private'));
});
