import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDiagnosticReport, runDiagnostics } from '../lib/diagnostics';

test('the in-app Mock regression console executes all 52 isolated checks', async () => {
  const results = await runDiagnostics();
  const failures = results.filter((result) => !result.passed);
  assert.equal(results.length, 52, formatDiagnosticReport(results));
  assert.deepEqual(failures, [], formatDiagnosticReport(results, true));
});

test('the Mock report formatter produces a clipboard-ready failure-only export', () => {
  const report = formatDiagnosticReport([
    { name: 'Synthetic success', passed: true },
    { name: 'Synthetic failure', passed: false, detail: 'Controlled mismatch' },
  ], true);
  assert.match(report, /1 passed · 1 failed · 2 total/);
  assert.match(report, /FAIL \| Synthetic failure/);
  assert.doesNotMatch(report, /PASS \| Synthetic success/);
});
