import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextDiscoveryRound } from '../lib/discovery-feedback-loop';
import { buildDiscoveryQueryPlan } from '../lib/discovery-query-planner';

void test('loop controller is bounded and filters visited queries', () => {
  const plan=buildDiscoveryQueryPlan({topic:'solar storms',subtopics:['solar flare','geomagnetic storm','aurora'],maxQueries:10});
  const selected=nextDiscoveryRound(plan,{visitedQueries:['solar storms'],summaries:[],round:0},{maxQueriesPerRound:3});
  assert.ok(selected.length<=3);
  assert.ok(selected.every(q=>q.query.toLowerCase()!=='solar storms'));
  assert.deepEqual(nextDiscoveryRound(plan,{visitedQueries:[],summaries:[],round:3},{maxRounds:3}),[]);
});
