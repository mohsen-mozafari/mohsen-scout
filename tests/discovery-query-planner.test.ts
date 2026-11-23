import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDiscoveryQueryPlan } from '../lib/discovery-query-planner';

void test('discovery planner includes bounded diversified lanes in deterministic order', () => {
  const plan = buildDiscoveryQueryPlan({
    topic: 'solar storms',
    seedQueries: ['solar storms nasa', 'Solar storms NASA'],
    subtopics: ['coronal mass ejection', 'geomagnetic storm'],
    verificationTerms: ['scientific evidence', 'misconceptions'],
    evidenceGaps: ['historical examples'],
    maxQueries: 10,
  });
  assert.equal(plan[0].query, 'solar storms');
  assert.equal(plan[1].query, 'solar storms nasa');
  assert.ok(plan.some((item) => item.lane === 'questions'));
  assert.ok(plan.some((item) => item.lane === 'subtopics'));
  assert.ok(plan.some((item) => item.lane === 'verification'));
  assert.ok(plan.some((item) => item.lane === 'gap'));
  assert.equal(plan.length, 10);
  assert.equal(new Set(plan.map((item) => item.query.toLowerCase())).size, plan.length);
});

void test('discovery planner rejects blank topics and enforces the cap', () => {
  assert.deepEqual(buildDiscoveryQueryPlan({ topic: '  ' }), []);
  const plan = buildDiscoveryQueryPlan({
    topic: 'black holes',
    subtopics: Array.from({ length: 40 }, (_, index) => 'candidate ' + index),
    maxQueries: 100,
  });
  assert.equal(plan.length, 24);
});

void test('discovery planner normalizes and deduplicates input safely', () => {
  const plan = buildDiscoveryQueryPlan({
    topic: '  quantum   computing ',
    seedQueries: ['quantum computing', ' quantum computing ', 'quantum computing history'],
    subtopics: ['quantum computing history', 'qubits'],
  });
  assert.equal(plan[0].query, 'quantum computing');
  assert.equal(plan.filter((item) => item.query.toLowerCase() === 'quantum computing').length, 1);
  assert.equal(plan.filter((item) => item.query.toLowerCase() === 'quantum computing history').length, 1);
});
