import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ResearchDossier } from '../lib/types';
import type { WebResearchItem } from '../lib/web-research';
import {
  applyIndependentResearchReview,
  markResearchReviewUnavailable,
  parseResearchDossier,
} from '../lib/research-agent-core';

const topic = 'battery recycling recovery performance';
const quoteOne = 'The controlled laboratory experiment measured a twenty percent increase in battery material recovery after recycling.';
const quoteTwo = 'A separate research team measured a twenty percent increase in recovered battery materials during its recycling trials.';
const quoteChallenge = 'The follow up audit found the claimed recovery increase was not statistically significant in the expanded production sample.';

function source(id: string, url: string, sourceText?: string): WebResearchItem {
  return {
    id,
    url,
    title: 'Battery recycling recovery performance report',
    summary: 'A brief result summary from a research publication.',
    sourceName: id,
    category: 'web',
    ...(sourceText ? { sourceText } : {}),
  };
}

function dossier(records: readonly WebResearchItem[]): ResearchDossier {
  return parseResearchDossier({
    hypotheses: [{
      id: 'h1',
      claim: 'Battery recycling increased material recovery by about twenty percent.',
      rationale: 'A testable hypothesis for the independent benchmark.',
      status: 'supported',
      confidence: 'high',
      supportingEvidenceIds: records.map((item) => item.id),
      challengingEvidenceIds: [],
      supportingCitations: [],
      challengingCitations: [],
      missingEvidence: [],
    }],
    evidenceReviews: [],
    nextQueries: [],
    contradictions: [],
    gaps: [],
    conclusion: 'Provisional model-generated conclusion.',
    confidence: 'high',
    stoppingReason: 'Benchmark input.',
  }, records, undefined, [], 'gemini', 'primary-model', 1764000000000);
}

function reviewed(
  records: readonly WebResearchItem[],
  verdict: 'support' | 'challenge' | 'mixed' | 'insufficient',
  supporting: Array<{ evidenceId: string; quote: string }> = [],
  challenging: Array<{ evidenceId: string; quote: string }> = [],
) {
  return applyIndependentResearchReview(dossier(records), {
    reviews: [{
      hypothesisId: 'h1',
      verdict,
      supportingCitations: supporting,
      challengingCitations: challenging,
      reason: 'Synthetic gold-standard reviewer fixture.',
    }],
  }, records, 'groq', 'independent-review-model', 1764000000000, 'en');
}

void test('synthetic gold-standard benchmark: only exact quotes from independent publisher families can support claims', () => {
  const independent = [
    source('a', 'https://lab-alpha.org/study', quoteOne),
    source('b', 'https://science-beta.net/report', quoteTwo),
  ];
  const samePublisherFamily = [
    source('c', 'https://research.example.org/study', quoteOne),
    source('d', 'https://policy.example.org/report', quoteTwo),
  ];
  const summaryOnly = [
    source('e', 'https://lab-alpha.org/study'),
    source('f', 'https://science-beta.net/report'),
  ];
  const unsupported = [
    source('g', 'https://lab-alpha.org/study', quoteOne),
    source('h', 'https://science-beta.net/report', quoteTwo),
  ];
  const contestedRecords = [
    ...independent,
    source('i', 'https://audit-gamma.com/review', quoteChallenge),
  ];

  const scenarios = [
    {
      name: 'two independent originals with exact citations',
      expected: 'supported',
      actual: reviewed(independent, 'support', [
        { evidenceId: 'a', quote: quoteOne },
        { evidenceId: 'b', quote: quoteTwo },
      ]).hypotheses[0]?.status,
    },
    {
      name: 'two subdomains of one publisher family',
      expected: 'insufficient-evidence',
      actual: reviewed(samePublisherFamily, 'support', [
        { evidenceId: 'c', quote: quoteOne },
        { evidenceId: 'd', quote: quoteTwo },
      ]).hypotheses[0]?.status,
    },
    {
      name: 'summary-only sources',
      expected: 'insufficient-evidence',
      actual: reviewed(summaryOnly, 'support', [
        { evidenceId: 'e', quote: quoteOne },
        { evidenceId: 'f', quote: quoteTwo },
      ]).hypotheses[0]?.status,
    },
    {
      name: 'fabricated quotation',
      expected: 'insufficient-evidence',
      actual: reviewed(unsupported, 'support', [
        { evidenceId: 'g', quote: 'This invented sentence never appeared in the original research document.' },
        { evidenceId: 'h', quote: quoteTwo },
      ]).hypotheses[0]?.status,
    },
    {
      name: 'verified counterevidence',
      expected: 'contested',
      actual: reviewed(contestedRecords, 'mixed', [
        { evidenceId: 'a', quote: quoteOne },
        { evidenceId: 'b', quote: quoteTwo },
      ], [
        { evidenceId: 'i', quote: quoteChallenge },
      ]).hypotheses[0]?.status,
    },
  ];
  for (const scenario of scenarios) {
    assert.equal(scenario.actual, scenario.expected, scenario.name);
  }
  const falsePositiveCount = scenarios.filter((scenario) =>
    scenario.actual === 'supported' && scenario.expected !== 'supported',
  ).length;
  assert.equal(falsePositiveCount, 0);
});

void test('synthetic gold-standard benchmark: missing cross-provider review cannot be represented as validated', () => {
  const records = [
    source('a', 'https://lab-alpha.org/study', quoteOne),
    source('b', 'https://science-beta.net/report', quoteTwo),
  ];
  const unavailable = markResearchReviewUnavailable(dossier(records), records, 'en');
  assert.equal(unavailable.reviewStatus, 'review-unavailable');
  assert.equal(unavailable.hypotheses[0]?.status, 'insufficient-evidence');
  assert.equal(unavailable.hypotheses[0]?.confidence, 'low');
  assert.equal(unavailable.verifiedCitationCount, 0);
  assert.ok(unavailable.conclusion.includes('No hypothesis has been validated'));
});
