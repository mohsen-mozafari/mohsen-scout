import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSequentiallyWithIsolatedFailures } from '../lib/sequential-review';

void test('one failed AI review does not prevent later ideas from being reviewed', async () => {
  const attempted: string[] = [];
  const failures: string[] = [];
  const results = await runSequentiallyWithIsolatedFailures(
    ['idea-a', 'idea-b', 'idea-c'],
    3,
    async (idea) => {
      attempted.push(idea);
      if (idea === 'idea-b') throw new Error('provider chain unavailable');
      return idea.toUpperCase();
    },
    (idea, error) => failures.push(idea + ':' + (error instanceof Error ? error.message : String(error))),
  );

  assert.deepEqual(attempted, ['idea-a', 'idea-b', 'idea-c']);
  assert.deepEqual(results, ['IDEA-A', 'IDEA-C']);
  assert.deepEqual(failures, ['idea-b:provider chain unavailable']);
});

void test('sequential AI review respects its per-run item limit', async () => {
  const attempted: number[] = [];
  const results = await runSequentiallyWithIsolatedFailures(
    [1, 2, 3, 4],
    2,
    async (item) => { attempted.push(item); return item * 10; },
    () => assert.fail('No item should fail.'),
  );
  assert.deepEqual(attempted, [1, 2]);
  assert.deepEqual(results, [10, 20]);
});
