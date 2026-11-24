import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableResearchRunSlots, canStartResearchRun, MAX_CONCURRENT_RESEARCH_RUNS } from '../lib/research-concurrency';

void test('research multitasking admits at most two independent runs', () => {
  assert.equal(MAX_CONCURRENT_RESEARCH_RUNS, 2);
  assert.equal(availableResearchRunSlots(0), 2);
  assert.equal(availableResearchRunSlots(1), 1);
  assert.equal(availableResearchRunSlots(2), 0);
  assert.equal(availableResearchRunSlots(20), 0);
  assert.equal(canStartResearchRun(1), true);
  assert.equal(canStartResearchRun(2), false);
});
