import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueAutonomousCandidates,
  emptyAutonomousQueue,
  nextAutonomousJob,
  normalizeAutonomousQueue,
  type AutonomousResearchCandidate,
  type AutonomousResearchJob,
} from '../lib/autonomous-queue';
import type { ResearchInput } from '../lib/types';

const input = (topic: string): ResearchInput => ({
  topic,
  region: 'United States',
  languages: ['en'],
  days: 7,
  duration: 'any',
  category: '',
  maxResults: 25,
});

const now = Date.parse('2026-11-25T12:00:00.000Z');

function job(
  id: string,
  source: AutonomousResearchJob['source'],
  publishedAt: string,
  priority: number,
): AutonomousResearchJob {
  const topic = source + ' ' + id;
  return {
    id, topic, input: input(topic), source, sourceId: id, publishedAt,
    discoveredAt: now - 1000, priority, attempts: 0, status: 'queued',
  };
}

void test('autonomous queue prioritizes YouTube discovery before fresher publisher headlines', () => {
  const publisher = job('publisher-1', 'publisher', '2026-11-25T11:59:00.000Z', 70);
  const youtube = job('video-1', 'youtube', '2026-11-23T11:59:00.000Z', 125);
  const queue = normalizeAutonomousQueue({
    version: 1, jobs: [publisher, youtube], seenKeys: [], lastNicheSeedAt: now,
  }, now);
  assert.equal(nextAutonomousJob(queue, now)?.source, 'youtube');
});

void test('newly enqueued YouTube discoveries stay ahead of fresher lower-priority publisher items', () => {
  const publisher: AutonomousResearchCandidate = {
    topic: 'Publisher headline', input: input('Publisher headline'),
    source: 'publisher', sourceId: 'publisher:1', publishedAt: '2026-11-25T11:59:00.000Z',
    priority: 70,
  };
  const youtube: AutonomousResearchCandidate = {
    topic: 'YouTube video topic', input: input('YouTube video topic'),
    source: 'youtube', sourceId: 'video:1', publishedAt: '2026-11-23T11:59:00.000Z',
    priority: 125,
  };
  const queue = enqueueAutonomousCandidates(emptyAutonomousQueue(), [publisher, youtube], now);
  assert.equal(queue.jobs[0]?.source, 'youtube');
  assert.equal(nextAutonomousJob(queue, now)?.source, 'youtube');
});

void test('legacy autonomous queue data receives a safe YouTube discovery timestamp default', () => {
  const queue = normalizeAutonomousQueue({
    version: 1, jobs: [], seenKeys: [], lastNicheSeedAt: 1234,
  }, now);
  assert.equal(queue.lastYouTubeDiscoveryAt, 0);
  assert.equal(queue.lastNicheSeedAt, 1234);
});
