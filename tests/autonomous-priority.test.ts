import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AUTONOMOUS_QUEUE_MAX_AGE_MS,
  isAutonomousDiscoveryFresh,
  sortAutonomousPriority,
} from '../lib/autonomous-priority';

void test('newly published topics outrank older backlog even when backlog has a larger score', () => {
  const now = Date.parse('2026-11-25T12:00:00.000Z');
  const sorted = sortAutonomousPriority([
    { id: 'old-high-score', status: 'queued' as const, publishedAt: '2026-11-01T12:00:00.000Z', priority: 1000, discoveredAt: now - 86400000 },
    { id: 'fresh-low-score', status: 'queued' as const, publishedAt: '2026-11-25T11:00:00.000Z', priority: 1, discoveredAt: now },
    { id: 'same-day-higher-score', status: 'queued' as const, publishedAt: '2026-11-25T11:00:00.000Z', priority: 5, discoveredAt: now - 1000 },
    { id: 'completed', status: 'completed' as const, publishedAt: '2026-11-25T11:59:00.000Z', priority: 10000, discoveredAt: now },
  ]);
  assert.deepEqual(sorted.map((item) => item.id), [
    'same-day-higher-score', 'fresh-low-score', 'old-high-score', 'completed',
  ]);
});

void test('autonomous backlog older than fourteen days is ineligible but its persisted checkpoint is separate', () => {
  const now = Date.parse('2026-11-25T12:00:00.000Z');
  assert.equal(AUTONOMOUS_QUEUE_MAX_AGE_MS, 14 * 86400000);
  assert.equal(isAutonomousDiscoveryFresh(now - 13 * 86400000, now), true);
  assert.equal(isAutonomousDiscoveryFresh(now - 15 * 86400000, now), false);
  assert.equal(isAutonomousDiscoveryFresh(now + 60000, now), false);
});

void test('queue polling preserves in-flight running leases and does not relaunch them', async () => {
  const { normalizeAutonomousQueue, nextAutonomousJob } = await import('../lib/autonomous-queue');
  const now = Date.parse('2026-11-25T12:00:00.000Z');
  const input = {
    topic: 'space science and exploration',
    region: 'Iran' as const,
    languages: ['en'],
    days: 7,
    duration: 'any' as const,
    category: '',
    maxResults: 25,
  };
  const base = {
    input,
    sourceId: 'source-default',
    source: 'publisher' as const,
    sourceUrl: 'https://example.org/story',
    publishedAt: '2026-11-25T11:00:00.000Z',
    discoveredAt: now,
    priority: 50,
    attempts: 1,
  };
  const queue = normalizeAutonomousQueue({
    version: 1,
    jobs: [
      { ...base, id: 'running-fresh', sourceId: 'running-source', status: 'running', startedAt: now },
      { ...base, id: 'queued-new', sourceId: 'queued-source', status: 'queued' },
    ],
    seenKeys: [],
    lastNicheSeedAt: now,
  }, now);
  assert.equal(queue.jobs.find((job) => job.id === 'running-fresh')?.status, 'running');
  assert.equal(nextAutonomousJob(queue, now)?.id, 'queued-new');
});
