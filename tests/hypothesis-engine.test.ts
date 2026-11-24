import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewResearchHypotheses } from '../lib/hypothesis-engine';

const evidence = [
  { id: 'a', title: 'Battery recycling confirms lower material waste', summary: 'The study demonstrates recovery gains.', url: 'https://research.example.org/a' },
  { id: 'b', title: 'Battery recycling supports lower material waste', summary: 'Independent evidence confirms improved recovery.', url: 'https://science.example.net/b' },
  { id: 'c', title: 'Battery recycling limitations and criticism', summary: 'The report disputes the claimed recovery benefit and notes uncertainty.', url: 'https://policy.example.com/c' },
];

void test('hypothesis review separates support, challenge and context instead of treating search rank as truth', () => {
  const result = reviewResearchHypotheses('battery recycling', evidence);
  assert.equal(result.usableEvidenceCount, 3);
  assert.ok(result.independentHostCount >= 3);
  assert.ok(result.hypotheses.length > 0);
  assert.ok(result.hypotheses.some((item) => item.status === 'contested'));
  assert.ok(result.hypotheses.every((item) => item.rationale.length > 0));
});

void test('hypothesis review excludes YouTube and invalid URLs from independent evidence', () => {
  const result = reviewResearchHypotheses('battery recycling', [
    ...evidence,
    { id: 'yt', title: 'Battery recycling confirms everything', summary: 'supports', url: 'https://www.youtube.com/watch?v=12345678901' },
    { id: 'bad', title: 'Invalid source', summary: 'text', url: 'javascript:alert(1)' },
  ]);
  assert.equal(result.usableEvidenceCount, 3);
});

void test('next research directions actively seek counterevidence and avoid exact repeated queries', () => {
  const first = reviewResearchHypotheses('battery recycling', evidence);
  assert.ok(first.nextDirections.some((item) => item.purpose === 'counterevidence'));
  const repeated = reviewResearchHypotheses('battery recycling', evidence, first.nextDirections.map((item) => item.query));
  const priorQueries = new Set(first.nextDirections.map((item) => item.query.trim().toLowerCase()));
  assert.ok(repeated.nextDirections.every((item) => !priorQueries.has(item.query.trim().toLowerCase())));
});

void test('host diversity is described as a proxy and not proof of ownership independence', () => {
  const result = reviewResearchHypotheses('battery recycling', evidence);
  assert.ok(result.limitations.some((item) => item.includes('ownership')));
});
