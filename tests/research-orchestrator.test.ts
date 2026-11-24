import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessResearchEvidenceCoverage,
  canonicalizeIndependentResearchUrl,
  MAX_DEEP_RESEARCH_EVIDENCE,
  MAX_DEEP_RESEARCH_QUERIES,
  MAX_DEEP_RESEARCH_QUERIES_PER_ROUND,
  MAX_DEEP_RESEARCH_ROUNDS,
  mergeIndependentResearchEvidence,
  planResearchRound,
} from '../lib/research-orchestrator';
import type { ResearchDossierQuery } from '../lib/types';
import type { WebResearchItem } from '../lib/web-research';

const query = (value: string, priority: number, purpose: ResearchDossierQuery['purpose'] = 'independent-confirmation'): ResearchDossierQuery => ({
  query: value, priority, purpose, hypothesisId: 'h1', reason: 'Test query',
});
const evidenceItem = (url: string, title = 'Research source', publishedAt?: string): WebResearchItem => ({
  id: url, title, summary: 'A bounded independent source summary.', url, sourceName: 'Publisher',
  ...(publishedAt ? { publishedAt } : {}), category: 'web',
});

void test('canonical research URLs remove tracking identity and reject video or unsafe hosts', () => {
  assert.equal(
    canonicalizeIndependentResearchUrl('https://www.example.org/report/?utm_source=feed&b=2&a=1#section'),
    'https://www.example.org/report?a=1&b=2',
  );
  assert.equal(canonicalizeIndependentResearchUrl('https://youtube.com/watch?v=abc'), undefined);
  assert.equal(canonicalizeIndependentResearchUrl('javascript:alert(1)'), undefined);
  assert.equal(canonicalizeIndependentResearchUrl('https://user:pass@example.org/private'), undefined);
});

void test('evidence merge deduplicates canonical URLs and enforces a hard evidence ceiling', () => {
  const result = mergeIndependentResearchEvidence(
    [evidenceItem('https://example.org/a?utm_source=one')],
    [evidenceItem('https://example.org/a#fragment'), evidenceItem('https://other.org/b'), evidenceItem('https://youtube.com/watch?v=abc')],
    2,
  );
  assert.equal(result.items.length, 2);
  assert.equal(result.addedItems.length, 1);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.items[1]?.url, 'https://other.org/b');
});

void test('evidence coverage reports dates and distinct hosts without claiming audience demand', () => {
  const coverage = assessResearchEvidenceCoverage([
    evidenceItem('https://a.example.org/one', 'One', '2026-11-20T00:00:00.000Z'),
    evidenceItem('https://b.example.net/two'),
    evidenceItem('https://a.example.org/three', 'Three', '2024-01-01T00:00:00.000Z'),
  ], Date.parse('2026-11-24T00:00:00.000Z'));
  assert.equal(coverage.uniqueUrlCount, 3);
  assert.equal(coverage.uniqueHostCount, 2);
  assert.equal(coverage.datedCount, 2);
  assert.equal(coverage.undatedCount, 1);
  assert.equal(coverage.olderThanOneYearCount, 1);
});

void test('adaptive planner prioritizes non-repeating and purpose-diverse follow-up searches', () => {
  const plan = planResearchRound({
    round: 1, queriesAttempted: 0, evidenceCount: 8,
    nextQueries: [
      query('primary source', 5, 'primary-source'),
      query('another primary source', 4, 'primary-source'),
      query('counter evidence', 3, 'counterevidence'),
    ],
    alreadyAsked: [],
  });
  assert.equal(plan.queries.length, MAX_DEEP_RESEARCH_QUERIES_PER_ROUND);
  assert.deepEqual(plan.queries.map((item) => item.query), ['primary source', 'counter evidence']);
});

void test('adaptive planner stops on exhausted budgets, no new evidence and no novel questions', () => {
  const base = { nextQueries: [query('new query', 5)], alreadyAsked: [] };
  assert.equal(planResearchRound({ ...base, round: MAX_DEEP_RESEARCH_ROUNDS + 1, queriesAttempted: 0, evidenceCount: 1 }).queries.length, 0);
  assert.equal(planResearchRound({ ...base, round: 1, queriesAttempted: MAX_DEEP_RESEARCH_QUERIES, evidenceCount: 1 }).queries.length, 0);
  assert.equal(planResearchRound({ ...base, round: 1, queriesAttempted: 0, evidenceCount: MAX_DEEP_RESEARCH_EVIDENCE }).queries.length, 0);
  assert.equal(planResearchRound({ ...base, round: 2, queriesAttempted: 2, evidenceCount: 3, previousRoundNewEvidenceCount: 0 }).queries.length, 0);
  assert.equal(planResearchRound({ ...base, round: 2, queriesAttempted: 1, evidenceCount: 3, previousRoundNewEvidenceCount: 1, alreadyAsked: ['new query'] }).queries.length, 0);
});

void test('adaptive planner never exceeds the remaining global search budget', () => {
  const plan = planResearchRound({
    round: 4, queriesAttempted: MAX_DEEP_RESEARCH_QUERIES - 1, evidenceCount: 4,
    nextQueries: [query('one', 5), query('two', 4)], alreadyAsked: [],
  });
  assert.equal(plan.queries.length, 1);
  assert.ok(plan.queries.length <= MAX_DEEP_RESEARCH_QUERIES);
});
