import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeVideoFeatures, median, percentile } from '../lib/engine/features';
import { estimateIncomeByNiche, findNicheByTopic } from '../lib/engine/income';
import { runEngineV2 } from '../lib/engine/orchestrator';
import type { EngineV2NewsInput, EngineV2VideoInput } from '../lib/engine/types';

const NOW = Date.parse('2026-11-21T12:00:00Z');

function makeVideos(count: number): EngineV2VideoInput[] {
  return Array.from({ length: count }, (_, index) => {
    const channel = 'ch-' + (index % 10);
    return {
      id: 'v' + index,
      title: 'ستاره نوترونی: کشف جدید — عدد ' + (index % 50),
      description: 'A description about quantum computing experiments and telemetry data for video ' + index + '.',
      channel,
      channelId: channel,
      publishedAt: new Date(NOW - (index * 1_800_000 + 6_000_000)).toISOString(),
      viewCount: index % 7 === 0 ? 500_000 : Math.floor((index * 7919) % 400_000) + 100,
      likeCount: Math.floor((index * 31) % 9000) + 10,
      commentCount: Math.floor((index * 17) % 700) + 1,
      channelSubscriberCount: index % 2 === 0 ? null : Math.floor((index * 13) % 800_000) + 100_000,
      channelVideoCount: index % 2 === 0 ? null : Math.floor((index * 7) % 6000) + 50,
      fetchedAt: NOW - 1_000,
    };
  });
}

function makeNews(count: number, tag: string): EngineV2NewsInput[] {
  return Array.from({ length: count }, (_, index) => ({
    title: 'کشف جدید درباره ' + tag + ' — رقم ' + (index + 1),
    summary: 'Suspicious telemetry results published by ' + tag + ' journal this week.',
    sourceName: 'Journal of ' + tag,
    sourceUrl: 'https://example.org/' + tag + '/' + index,
    publishedAt: new Date(NOW - (index + 1) * 86_400_000).toISOString(),
  }));
}

void test('percentile and median are sane', () => {
  assert.equal(percentile([10, 20, 30, 40], 50), 25);
  assert.equal(percentile([5], 50), 5);
  assert.equal(percentile([], 50), 0);
  assert.equal(median([1, 2, 3, 4, 5]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

void test('computeVideoFeatures: growth, engagement, outlier, title patterns', () => {
  const video: EngineV2VideoInput = {
    id: 'v1',
    title: 'چگونه هوش مصنوعی کمک می‌کند؟',
    description: 'Deep dive',
    channel: 'ch1',
    channelId: 'ch1',
    publishedAt: new Date(NOW - 5 * 3_600_000).toISOString(),
    viewCount: 1000,
    likeCount: 100,
    commentCount: 20,
    channelSubscriberCount: null,
    channelVideoCount: null,
    fetchedAt: NOW,
  };
  const feature = computeVideoFeatures(video, { now: NOW, channelMedianViews: new Map([['ch1', 1000]]), channelMedianSubs: new Map() });
  assert.ok(feature.growthRate > 150 && feature.growthRate < 250);
  assert.ok(Math.abs(feature.engagementRatio - 0.12) < 0.001);
  assert.equal(feature.outlierScore, 1);
  assert.equal(feature.titlePatterns.isQuestion, true);
  assert.equal(feature.hasStats, true);
  assert.ok(feature.hoursSincePublish > 4 && feature.hoursSincePublish < 6);
});

void test('findNicheByTopic matches jwst niche', () => {
  assert.equal(findNicheByTopic('James Webb Space Telescope discoveries')?.id, 'jwst');
});

void test('income estimator is labeled estimate and carries assumptions', () => {
  const niche = findNicheByTopic('exoplanet discoveries 2025');
  assert.ok(niche);
  const estimate = estimateIncomeByNiche(niche, 500);
  assert.equal(estimate.label, 'estimate');
  assert.ok(estimate.estimate > 0);
  assert.ok(estimate.assumptions.length >= 2);
  assert.equal(estimateIncomeByNiche(niche, 0).estimate, 0);
});

void test('gap topics: news without video coverage', () => {
  const result = runEngineV2({ videos: makeVideos(50), news: [
    { title: 'زمرد زمرد زمرد زمرد زمرد — جدیدترین پیش‌بینی', summary: 'گزارج اول دوپامین بی‌اطمینان 2026', sourceName: 'Teardrop News', sourceUrl: 'https://example.org/teardrop/1', publishedAt: new Date(NOW - 2 * 86_400_000).toISOString() },
    { title: 'زمرد زمرد زمرد زمرد زمرد — دومین گزارج پیش‌بینی', summary: 'دوپامین بی‌اطمینان با اولین گزارج 2026', sourceName: 'Teardrop News', sourceUrl: 'https://example.org/teardrop/2', publishedAt: new Date(NOW - 1 * 86_400_000).toISOString() },
  ], topic: 'teardrop discovery', language: 'en' });
  assert.ok(result.plan.gapTopics.length >= 1);
});

void test('risk topics: concentrated video competition', () => {
  const videos = makeVideos(12).map((video, index) => ({
    ...video,
    id: 'risk-' + index,
    title: 'کالامالی کالامالی کالامالی: نتیجه جدید برای خشک‌فروشان',
    channel: 'risk-channel-' + index,
    channelId: 'risk-channel-' + index,
    viewCount: 1_000_000 + index * 1000,
    publishedAt: new Date(NOW - 10 * 86_400_000 + index * 3600_000).toISOString(),
  }));
  const result = runEngineV2({ videos, news: [], topic: 'کالامالی', language: 'en' });
  assert.ok(result.plan.riskTopics.length >= 1);
});

void test('runEngineV2 on 300 videos + 200 news (JVM baseline)', () => {
  const videos = makeVideos(300);
  const news = makeNews(200, 'telemetry');
  const result = runEngineV2({ videos, news, topic: 'telemetry and AI discoveries', language: 'en' });
  const elapsed = result.processingMs;
  assert.equal(result.version, 2);
  assert.equal(result.stageFallbacks.length, 0);
  assert.ok(result.timings.length >= 4);
  assert.ok(result.topics.length >= 0);
  assert.ok(result.opportunities.length >= 0);
  assert.ok(elapsed >= 0);
  assert.ok(elapsed < 4000, 'engine v2 JVM baseline exceeded 4000ms: ' + elapsed);
  console.log('[engine-v2] JVM baseline:', JSON.stringify(result.timings), 'totalMs:', elapsed, 'opportunities:', result.opportunities.length);
});

void test('budget fallback returns partial result without throwing', () => {
  const result = runEngineV2({ videos: makeVideos(10), news: [], topic: 'budget topic', budgetMs: 0, language: 'en' });
  assert.equal(result.version, 2);
  assert.ok(result.stageFallbacks.length >= 1);
});
