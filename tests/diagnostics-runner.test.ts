import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDiagnostics } from '../lib/diagnostics';

void test('on-device mock regression runner completes every isolated check', async () => {
  const results = await runDiagnostics();
  assert.ok(results.length >= 35, 'expected the complete registered mock regression suite');
  const failures = results.filter((result) => !result.passed);
  assert.deepEqual(failures, []);
});
