import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExplorationState, expandExploration, takeExplorationPath, explorationCoverage } from '../lib/youtube-exploration-planner';

test('planner creates seed and bounded initial paths',()=>{
  const state=createExplorationState('solar sails');
  assert.equal(state.queue.length,4);
  assert.equal(state.maxDepth,2);
});
test('planner expands from sampled title concepts and deduplicates',()=>{
  const state=createExplorationState('solar sails',2,8);
  const expanded=expandExploration(state,[{id:'1',title:'Solar sails propulsion breakthrough',description:'Light pressure spacecraft'}]);
  assert.ok(expanded.queue.some(p=>p.query==='solar sails propulsion'));
  assert.ok(expanded.queue.some(p=>p.query==='solar sails breakthrough'));
});
test('taking a path marks it visited and avoids duplicate next path',()=>{
  const state=createExplorationState('solar sails');
  const first=takeExplorationPath(state);
  assert.ok(first.path);
  const second=takeExplorationPath(first.state);
  assert.notEqual(first.path?.query,second.path?.query);
  assert.equal(first.state.visited.length,1);
});
test('planner rejects empty seeds and bounds configuration',()=>{
  assert.throws(()=>createExplorationState('   '));
  const state=createExplorationState('topic',9,100);
  assert.equal(state.maxDepth,3);
  assert.equal(state.maxQueries,12);
});
