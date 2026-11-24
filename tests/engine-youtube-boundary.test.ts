import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInternalResearch } from '../lib/engine';

void test('internal engine analyzes YouTube metadata as platform evidence without treating it as independent publisher proof', () => {
  const sample = [{
    id: 'dQw4w9WgXcQ',
    title: 'Raw YouTube title: Mars sample return',
    description: 'Raw description stays unchanged.',
    channel: 'Raw channel',
    publishedAt: '2026-11-20T12:00:00.000Z',
    viewCount: 123456,
    likeCount: 789,
    growth: {
      snapshotCount: 3, deltaViews: 18000, viewsPerHour: 750, viewsPerDay: 18000,
      channelBaselineViewsPerDay: 2500, channelOutlierRatio: 7.2,
      measuredAt: Date.parse('2026-11-22T00:00:00.000Z'), status: 'measured',
    },
  }];
  const result = buildInternalResearch({
    topic: 'Mars Sample Return',
    videos: sample,
    now: Date.parse('2026-11-23T00:00:00.000Z'),
  });

  assert.equal(result.intelligence.selfEvaluation.youtubeRawSampleReceived, true);
  const serializedAnalysis = JSON.stringify(result);
  assert.match(serializedAnalysis, /Raw YouTube title/);
  assert.match(serializedAnalysis, /123,456/);
  assert.match(serializedAnalysis, /789/);
  assert.equal(result.intelligence.selfEvaluation.youtubeSampleCount, 1);
  assert.equal(result.intelligence.selfEvaluation.matchedVideoCount, 1);
  assert.equal(result.intelligence.selfEvaluation.videoViewCountsAvailable, 1);
  assert.equal(result.intelligence.selfEvaluation.measuredGrowthVideoCount, 1);
  assert.equal(result.intelligence.selfEvaluation.medianMeasuredViewsPerHour, 750);
  assert.equal(result.intelligence.selfEvaluation.channelOutlierVideoCount, 1);
  assert.match(JSON.stringify(result.evidence), /750/);
  assert.match(JSON.stringify(result.intelligence.paradigms), /750/);
  assert.equal(result.evidence.some((item) => item.detail.includes('Raw YouTube title')), true);
});
