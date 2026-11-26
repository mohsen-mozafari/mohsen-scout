import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  captureYouTubeSnapshots,
  getYouTubeGrowthIndexMetrics,
} from '../lib/youtube-growth';
import { mergeResearchMemoryEntries } from '../lib/research-memory';
import { researchQueriesPerRound, planResearchRound, MAX_DEEP_RESEARCH_QUERIES } from '../lib/research-orchestrator';
import type { ResearchMemoryEntry, Video, YouTubeSnapshot } from '../lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;

void test('YouTube growth reuses an indexed 12,000-snapshot history without losing retention or continuity', () => {
  const base = Date.parse('2026-11-01T12:00:00.000Z');
  const history: YouTubeSnapshot[] = [];
  for (let videoIndex = 0; videoIndex < 4000; videoIndex += 1) {
    for (let day = 0; day < 3; day += 1) {
      history.push({
        id: 'video-' + videoIndex + ':' + day,
        videoId: 'video-' + videoIndex,
        channel: 'channel-' + (videoIndex % 20),
        capturedAt: base + day * DAY_MS,
        viewCount: (day + 1) * 1000 + videoIndex,
        likeCount: null,
        commentCount: null,
      });
    }
  }
  const sample: Video = {
    id: 'video-0',
    title: 'Synthetic performance regression sample',
    description: 'Bounded test fixture; not a live YouTube observation.',
    channel: 'channel-0',
    thumbnail: '',
    publishedAt: new Date(base).toISOString(),
    fetchedAt: base + 3 * DAY_MS,
    query: 'performance regression',
    viewCount: 4000,
    likeCount: null,
    commentCount: null,
  };

  const before = getYouTubeGrowthIndexMetrics();
  const first = captureYouTubeSnapshots([sample], history, base + 3 * DAY_MS);
  const afterFirst = getYouTubeGrowthIndexMetrics();

  assert.equal(history.length, 12_000);
  assert.equal(first.history.length, 12_001);
  assert.equal(first.snapshots.length, 1);
  assert.equal(first.videos[0]?.growth?.snapshotCount, 4);
  assert.equal(first.videos[0]?.growth?.status, 'measured');
  assert.equal(first.videos[0]?.growth?.viewsPerDay, 1000);
  assert.equal(first.videos[0]?.growth?.channelBaselineViewsPerDay, 1000);
  assert.equal(afterFirst.fullBuilds, before.fullBuilds + 1);

  const second = captureYouTubeSnapshots(
    [{ ...sample, viewCount: 5000 }],
    first.history,
    base + 4 * DAY_MS,
  );
  const afterSecond = getYouTubeGrowthIndexMetrics();

  assert.equal(second.history.length, 12_002);
  assert.equal(second.videos[0]?.growth?.snapshotCount, 5);
  assert.equal(second.videos[0]?.growth?.deltaViews, 1000);
  assert.equal(second.videos[0]?.growth?.viewsPerDay, 1000);
  assert.equal(afterSecond.fullBuilds, afterFirst.fullBuilds);
  assert.ok(afterSecond.cacheHits >= afterFirst.cacheHits + 1);
  assert.ok(afterSecond.incrementalUpdates >= afterFirst.incrementalUpdates + 1);
});

void test('research archive keeps all distinct topics and replaces only the matching topic', () => {
  const memory = (index: number): ResearchMemoryEntry => ({
    topic: 'Research topic ' + index,
    updatedAt: index,
    sources: [],
    keyFindings: [],
    unresolvedQuestions: [],
    contradictions: [],
    confidence: 'low',
  });
  const original = Array.from({ length: 55 }, (_, index) => memory(index));
  const next = memory(55);
  const appended = mergeResearchMemoryEntries(original, next);
  assert.equal(appended.length, 56);
  assert.equal(appended[0]?.topic, next.topic);

  const replacement = { ...memory(20), updatedAt: 999 };
  const replaced = mergeResearchMemoryEntries(appended, replacement);
  assert.equal(replaced.length, 56);
  assert.equal(replaced[0]?.updatedAt, 999);
  assert.equal(replaced.filter((item) => item.topic === replacement.topic).length, 1);
  assert.ok(replaced.some((item) => item.topic === 'Research topic 0'));
  assert.ok(replaced.some((item) => item.topic === 'Research topic 54'));
});

void test('adaptive Deep Research uses the configured two-query fan-out and retains its global ceiling', () => {
  assert.equal(researchQueriesPerRound(0), 1);
  for (let round = 1; round <= 4; round += 1) {
    assert.equal(researchQueriesPerRound(round), 2);
  }
  assert.equal(researchQueriesPerRound(-1), 0);

  let attempted = 1; // One seed search starts the research plan.
  const alreadyAsked = ['seed topic'];
  for (let round = 1; round <= 4; round += 1) {
    const plan = planResearchRound({
      round,
      queriesAttempted: attempted,
      evidenceCount: attempted * 2,
      previousRoundNewEvidenceCount: 2,
      nextQueries: [
        { query: 'round ' + round + ' primary source', priority: 5, purpose: 'primary-source', hypothesisId: 'h1', reason: 'Primary record' },
        { query: 'round ' + round + ' counterevidence', priority: 4, purpose: 'counterevidence', hypothesisId: 'h1', reason: 'Test opposition' },
      ],
      alreadyAsked,
    });
    const accepted = plan.queries.slice(0, researchQueriesPerRound(round));
    attempted += accepted.length;
    alreadyAsked.push(...accepted.map((item) => item.query));
  }
  assert.equal(attempted, MAX_DEEP_RESEARCH_QUERIES);
  assert.ok(attempted <= MAX_DEEP_RESEARCH_QUERIES);
});


void test('one video retains over 10,000 snapshots across more than 40 days with measured continuity', () => {
  const base = Date.parse('2026-01-01T00:00:00.000Z');
  const history: YouTubeSnapshot[] = [];
  for (let index = 0; index < 10_050; index += 1) {
    history.push({
      id: 'long-video:' + index,
      videoId: 'long-video',
      channel: 'long-channel',
      capturedAt: base + index * 6 * 60 * 1000,
      viewCount: 100_000 + index * 12,
      likeCount: null,
      commentCount: null,
    });
  }
  const capturedAt = base + 42 * DAY_MS;
  const sample: Video = {
    id: 'long-video',
    title: 'Synthetic long-retention fixture',
    description: 'Regression fixture only; not a live YouTube observation.',
    channel: 'long-channel',
    thumbnail: '',
    publishedAt: new Date(base).toISOString(),
    fetchedAt: capturedAt,
    query: 'long retention fixture',
    viewCount: 100_000 + 10_050 * 12,
    likeCount: null,
    commentCount: null,
  };
  const result = captureYouTubeSnapshots([sample], history, capturedAt);
  assert.equal(result.history.length, 10_051);
  assert.equal(result.snapshots.length, 1);
  assert.equal(result.videos[0]?.growth?.snapshotCount, 10_051);
  assert.equal(result.videos[0]?.growth?.status, 'measured');
  assert.ok((result.videos[0]?.growth?.viewsPerDay ?? 0) > 0);
  assert.ok(result.history.some((item) => item.id === 'long-video:0'));
  assert.ok(result.history.some((item) => item.id === 'long-video:10049'));
});
