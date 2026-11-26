import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acquireManualResearchLease,
  availableAutonomousResearchRunSlots,
  isManualResearchActive,
  mapWithConcurrency,
  runWithResearchPriorityQueue,
} from '../lib/research-concurrency';
import { fetchWebResearch } from '../lib/web-research';
import { getRuntimeMetrics, recordRuntimeFinish, recordRuntimeStart } from '../lib/runtime-metrics';

void test('manual research lease pauses autonomous work and releases exactly once', () => {
  assert.equal(isManualResearchActive(), false);
  const release = acquireManualResearchLease();
  assert.equal(isManualResearchActive(), true);
  release();
  release();
  assert.equal(isManualResearchActive(), false);
});

void test('bounded mapper never exceeds its limit and preserves input order', async () => {
  let active = 0;
  let maximumActive = 0;
  const values = await mapWithConcurrency([30, 10, 20, 5], 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, value));
    active -= 1;
    return value * 2;
  });
  assert.equal(maximumActive, 2);
  assert.deepEqual(values, [60, 20, 40, 10]);
});

void test('manual model work jumps ahead of queued autonomous work without interrupting active work', async () => {
  const started: string[] = [];
  let releaseActive: (() => void) | undefined;
  let activeStarted: (() => void) | undefined;
  const activeReady = new Promise<void>((resolve) => { activeStarted = resolve; });
  const active = runWithResearchPriorityQueue(async () => {
    started.push('active-autonomous');
    activeStarted?.();
    await new Promise<void>((resolve) => { releaseActive = resolve; });
  }, 'automatic');
  await activeReady;
  const queuedAutomatic = runWithResearchPriorityQueue(async () => { started.push('queued-autonomous'); }, 'automatic');
  const manual = runWithResearchPriorityQueue(async () => { started.push('manual'); }, 'manual');
  releaseActive?.();
  await Promise.all([active, queuedAutomatic, manual]);
  assert.deepEqual(started, ['active-autonomous', 'manual', 'queued-autonomous']);
});

void test('Firecrawl search deduplicates concurrent identical requests and caches safe copies briefly', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(JSON.stringify({
      success: true,
      data: {
        web: [{
          title: 'NASA source report',
          url: 'https://example.org/nasa-report',
          summary: 'Original research context.',
          markdown: 'Original report body. '.repeat(30),
          source: 'Example Research',
          publishedDate: '2026-11-20T00:00:00.000Z',
        }],
        news: [],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const [first, second] = await Promise.all([
    fetchWebResearch('NASA research cache test', { fetcher, apiKey: 'test-key', limit: 2, days: 7 }),
    fetchWebResearch('NASA research cache test', { fetcher, apiKey: 'test-key', limit: 2, days: 7 }),
  ]);
  assert.equal(calls, 1);
  first.items[0]!.title = 'Mutated caller copy';
  const cached = await fetchWebResearch('NASA research cache test', { fetcher, apiKey: 'test-key', limit: 2, days: 7 });
  assert.equal(calls, 1);
  assert.equal(second.items[0]?.title, 'NASA source report');
  assert.equal(cached.items[0]?.title, 'NASA source report');
  assert.ok(cached.items[0]?.sourceText);
});

void test('runtime telemetry captures deterministic last and average stage durations', () => {
  const before = getRuntimeMetrics().modules.AI;
  recordRuntimeStart('AI', 1000);
  recordRuntimeFinish('AI', 'success', '', 1450);
  const after = getRuntimeMetrics().modules.AI;
  assert.equal(after.lastDurationMs, 450);
  assert.equal(after.totalDurationMs, before.totalDurationMs + 450);
  assert.equal(after.completedDurationCount, before.completedDurationCount + 1);
  assert.equal(after.averageDurationMs, Math.round(after.totalDurationMs / after.completedDurationCount));
});

void test('autonomous work always leaves one of two research slots available for manual requests', () => {
  assert.equal(availableAutonomousResearchRunSlots(0), 1);
  assert.equal(availableAutonomousResearchRunSlots(1), 0);
  assert.equal(availableAutonomousResearchRunSlots(2), 0);
});
