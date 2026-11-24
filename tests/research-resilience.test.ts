import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runIndependentResearchStages } from '../lib/research-resilience';

void test('one unavailable research provider does not cancel independent providers', async () => {
  const completed: string[] = [];
  const result = await runIndependentResearchStages([
    {
      name: 'YouTube Data API',
      run: async () => {
        completed.push('youtube');
        throw new Error('daily quota exhausted');
      },
    },
    {
      name: 'Publisher feeds',
      run: async () => {
        completed.push('publishers');
      },
    },
    {
      name: 'Independent web/news',
      run: async () => {
        completed.push('web');
      },
    },
    {
      name: 'Wikimedia',
      run: async () => {
        completed.push('wikimedia');
      },
    },
  ]);

  assert.deepEqual(new Set(completed), new Set(['youtube', 'publishers', 'web', 'wikimedia']));
  assert.deepEqual(result.failures, [{ name: 'YouTube Data API' }]);
});

void test('a provider that resolves with an empty result is not treated as a pipeline failure', async () => {
  const result = await runIndependentResearchStages([
    { name: 'Firecrawl', run: async () => [] },
    { name: 'Wikimedia', run: async () => undefined },
  ]);
  assert.deepEqual(result.failures, []);
});
