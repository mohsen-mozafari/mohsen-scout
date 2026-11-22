import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInternalResearch } from '../lib/engine';

void test('internal engine receives the YouTube sample as an isolated raw pass-through only', () => {
  const sample = [{
    id: 'dQw4w9WgXcQ',
    title: 'Raw YouTube title: Mars sample return',
    description: 'Raw description stays unchanged.',
    channel: 'Raw channel',
    publishedAt: '2026-11-20T12:00:00.000Z',
    viewCount: 123456,
    likeCount: 789,
  }];
  const result = buildInternalResearch({
    topic: 'Mars Sample Return',
    videos: sample,
    now: Date.parse('2026-11-23T00:00:00.000Z'),
  });

  assert.deepEqual(result.youtubeSample, sample);
  assert.equal(result.intelligence.selfEvaluation.youtubeRawSampleReceived, true);
  assert.equal(result.intelligence.selfEvaluation.youtubeSampleCount, 0);
  assert.equal(result.intelligence.selfEvaluation.matchedVideoCount, 0);
  assert.equal(result.intelligence.selfEvaluation.videoViewCountsAvailable, 0);
  assert.equal(result.entityCandidates.length, 0);
  assert.equal(result.evidence.some((item) => item.detail.includes('Raw YouTube title')), false);
});
