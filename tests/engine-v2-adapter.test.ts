import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUnifiedBrief, type UnifiedBriefInput } from '../lib/engine-v2-adapter';
import type { WikiSignal } from '../lib/space';
import { defaults, type Video } from '../lib/types';
import { validateLocal } from '../lib/validation';

const NOW = Date.parse('2026-11-20T12:00:00Z');

const wiki: WikiSignal = {
  provider: 'wikimedia-pageviews',
  language: 'fa',
  articleTitle: 'Mars',
  articleUrl: 'https://fa.wikipedia.org/wiki/Mars',
  apiUrl: 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fa.wikipedia.org/all-access/all-agents/Mars/monthly/2026050100/2026110100',
  summary: 'سیاره مریخ و مأموریت‌های رباتیک اخیر',
  monthlyViews: [
    { month: '2026-09', views: 1200 },
    { month: '2026-10', views: 1800 },
  ],
};

function newsItem(index: number) {
  return {
    id: 'n' + index,
    sourceId: 'nasa' as const,
    sourceName: 'NASA',
    title: [
      'Mars rover mineral sample analysis report',
      'Mars rover mineral sample crater update',
      'Mars rover mineral sample instrument findings',
      'Mars rover mineral sample soil measurement',
    ][index],
    summary: 'The Mars rover collected a mineral sample from a crater and analysed the soil with its instrument during survey ' + index + '.',
    url: 'https://example.org/mars/news/' + index,
    publishedAt: new Date(NOW - (index + 1) * 3600000).toISOString(),
  };
}

function videoItem(index: number): Video {
  const id = 'mars000000' + index;
  return {
    id,
    title: [
      'Mars rover mineral sample walkthrough',
      'Mars rover mineral sample crater explained',
      'Mars rover mineral sample instrument guide',
    ][index],
    description: [
      'A walkthrough of the rover mineral sample collected from the crater floor.',
      'An instrument overview explaining soil measurements at the landing site.',
      'Orbital imagery review shows layered rocks near the dusty basin.',
    ][index],
    channel: 'Mars Lab',
    thumbnail: 'https://example.org/' + id + '.jpg',
    publishedAt: new Date(NOW - (index + 2) * 3600000).toISOString(),
    fetchedAt: NOW,
    query: index % 2 ? 'Mars rover · popularity' : 'Mars rover · relevance',
    viewCount: 90000 + index * 10000,
    likeCount: 3000 + index * 100,
  };
}

function fixture(): UnifiedBriefInput {
  return {
    topic: 'Mars rover mineral sample',
    news: [0, 1, 2, 3].map(newsItem),
    videos: [0, 1, 2].map(videoItem),
    wiki,
    now: NOW,
    niche: 'space-science',
    language: 'en',
    region: 'United States',
    languages: ['en'],
    reportId: 'report-42',
  };
}

void test('adapter mapping preserves channel stats, search bucket and Wikimedia evidence', () => {
  const brief = buildUnifiedBrief(fixture());
  assert.equal(brief.fallback, false);
  assert.ok(brief.ideas.length > 0);

  const video = brief.result.items.find((item) => item.id === 'youtube:mars0000001');
  assert.ok(video);
  assert.equal(video.channelTitle, 'Mars Lab');
  assert.equal(video.channelId, undefined); // Video (the saved shape) has no channelId column.
  assert.equal(video.views, 100000);
  assert.equal(video.likes, 3100);
  assert.equal(video.bucket, 'Mars rover · popularity');
  assert.equal(video.url, 'https://www.youtube.com/watch?v=mars0000001');
  assert.equal(
    brief.result.coverage.find((coverage) => coverage.source === 'youtube')?.fetched,
    3,
  );

  const wikiItem = brief.result.items.find((item) => item.source === 'wikimedia');
  assert.ok(wikiItem);
  assert.equal(wikiItem.language, 'fa');
  assert.equal(wikiItem.title, 'Mars');
  assert.match(wikiItem.text, /pageviews 1800/);
  assert.equal(
    brief.result.coverage.find((coverage) => coverage.source === 'wikimedia')?.fetched,
    1,
  );
});

void test('adapter builds channel medians so outlier scoring is not neutral', () => {
  const withChannel = buildUnifiedBrief({
    ...fixture(),
    // YouTubeSampleVideo-style channel stats are preserved for outlier scoring.
    videos: [0, 1, 2].map((index) => ({
      ...videoItem(index),
      channelId: 'UC123',
      channelSubscriberCount: 500000,
      channelVideoCount: 340,
    })),
  });
  const video = withChannel.result.items.find((item) => item.id === 'youtube:mars0000000');
  assert.ok(video);
  assert.equal(video.channelSubscribers, 500000);
  assert.equal(video.channelVideoCount, 340);
  assert.equal(video.channelId, 'UC123');
  const outlier = withChannel.result.features.get(video.id)?.outlierScore;
  assert.equal(typeof outlier, 'number');
  assert.notEqual(outlier, 0.5);
  assert.match(withChannel.result.features.get(video.id)?.explanation ?? '', /channel median/);
});

void test('ideas have deterministic ids and complete engine-v2 explainability fields', () => {
  const brief = buildUnifiedBrief(fixture());
  const ids = brief.ideas.map((idea) => idea.id);
  assert.ok(ids.length > 0);
  assert.ok(ids.every((id) => id.startsWith('v2:')));
  assert.equal(new Set(ids).size, ids.length);
  for (const idea of brief.ideas) {
    assert.equal(idea.status, 'New Discoveries');
    assert.equal(idea.archived, false);
    assert.equal(idea.engineGenerated, true);
    assert.equal(typeof idea.engineScore, 'number');
    assert.match(idea.assessment, /Opportunity|Promising|Exploring|Uncertain|Competitive/);
    assert.ok(idea.generationKey?.startsWith('v2:'));
    assert.equal(typeof idea.engineV2Score, 'number');
    assert.equal(typeof idea.engineV2Confidence, 'number');
    assert.ok(idea.engineV2Why && idea.engineV2Why.length > 0);
    assert.ok(idea.engineV2BestTime && idea.engineV2BestTime.length > 0);
    assert.ok(idea.engineV2RevenueLabel && idea.engineV2RevenueLabel.length > 0);
    assert.equal(typeof idea.dataSufficient, 'boolean');
  }
  const scores = brief.ideas.map((idea) => idea.engineScore ?? 0);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

void test('ideas reference only real video ids and real evidence sources', () => {
  const brief = buildUnifiedBrief(fixture());
  const allowed = new Set(['mars0000000', 'mars0000001', 'mars0000002']);
  assert.ok(brief.ideas.length > 0);
  for (const idea of brief.ideas) {
    for (const id of idea.videoIds) assert.ok(allowed.has(id), 'unexpected invented video id: ' + id);
    for (const reference of idea.engineV2Evidence ?? []) {
      assert.ok(reference.title.length > 0);
      assert.ok(['news', 'youtube', 'wikimedia'].includes(reference.source));
    }
    assert.ok(idea.note.length > 0);
    assert.ok(idea.decision.length > 0);
    assert.ok(idea.concept.length > 0);
  }
});

void test('adapter links ideas to real news URLs and propagates the report id', () => {
  const brief = buildUnifiedBrief(fixture());
  assert.ok(brief.ideas.length > 0);
  for (const idea of brief.ideas) {
    assert.equal(idea.reportId, 'report-42');
    assert.ok(idea.sourceUrl, 'a real news url must be attached');
    assert.match(idea.sourceUrl!, /^https:\/\/example\.org\/mars\/news\//);
    assert.ok(brief.result.items.some((item) => item.source === 'news' && item.url === idea.sourceUrl));
  }
});

void test('engine fields carry data-driven text, a real evidence digest and literal claims', () => {
  const brief = buildUnifiedBrief(fixture());
  assert.ok(brief.ideas.length > 0);
  const idea = brief.ideas[0];
  const realTitles = new Set(brief.result.items.map((item) => item.title));

  assert.equal(idea.engineScoreReason, idea.engineV2Why);
  assert.match(idea.engineScoreReason ?? '', /^Evidence:/);
  assert.match(idea.engineScoreReason ?? '', /real views/);
  assert.ok([...realTitles].some((title) => idea.engineScoreReason!.includes(title.slice(0, 30))));
  assert.ok(!idea.engineScoreReason!.includes('A timely explainer'));

  const refs = idea.engineV2Evidence ?? [];
  assert.ok(refs.length > 0 && refs.length <= 3);
  for (const ref of refs) {
    assert.ok(ref.title.length > 0);
    assert.ok(ref.source.length > 0);
    assert.ok(ref.url && ref.url.startsWith('http'));
    assert.ok(ref.views != null && ref.views >= 90000);
    assert.ok(idea.note.includes(ref.title));
    assert.ok(idea.note.includes(ref.url!));
  }
  assert.match(idea.note, /Evidence \(real refs\):/);
  assert.equal(idea.note.split('\n').filter((line) => /^\d+\./.test(line)).length, refs.length);

  const claims = idea.engineV2Claims ?? [];
  assert.ok(claims.length > 0 && claims.length <= 3);
  for (const claim of claims) {
    assert.ok(realTitles.has(claim.text), 'claim must be literal real text: ' + claim.text);
    assert.ok(['NASA', 'Mars Lab'].includes(claim.source));
  }
});

void test('insufficient engine topics never become adapter ideas', () => {
  const brief = buildUnifiedBrief({
    topic: 'Mars rover mineral sample',
    news: [newsItem(0)],
    videos: [videoItem(0)],
    now: NOW,
    language: 'en',
  });
  assert.equal(brief.result.fallback, false);
  assert.deepEqual(brief.ideas, []);
  assert.ok(brief.warnings.some((warning) => /data-sufficient/i.test(warning)));
});

void test('engine explainability fields survive validated local persistence', () => {
  const brief = buildUnifiedBrief(fixture());
  assert.ok(brief.ideas.length > 0);
  const data = defaults();
  data.ideas = brief.ideas;
  const restored = validateLocal(data);
  assert.deepEqual(restored.ideas.map((idea) => idea.engineV2Claims), brief.ideas.map((idea) => idea.engineV2Claims));
  assert.deepEqual(restored.ideas.map((idea) => idea.engineV2Evidence), brief.ideas.map((idea) => idea.engineV2Evidence));
  assert.deepEqual(restored.ideas.map((idea) => idea.sourceUrl), brief.ideas.map((idea) => idea.sourceUrl));
  assert.deepEqual(restored.ideas.map((idea) => idea.dataSufficient), brief.ideas.map((idea) => idea.dataSufficient));
});

void test('fallback or empty output yields no adapter ideas', () => {
  const good = buildUnifiedBrief(fixture());
  assert.ok(good.ideas.length > 0);
  const forced = buildUnifiedBrief({
    ...fixture(),
    budgetMs: 0.000001,
    previous: good.result,
  });
  assert.equal(forced.fallback, true);
  assert.deepEqual(forced.ideas, []);
  assert.ok(forced.warnings.length > 0);

  const empty = buildUnifiedBrief({ topic: 'nothing', news: [], videos: [], now: NOW });
  assert.equal(empty.fallback, true);
  assert.deepEqual(empty.ideas, []);
  assert.deepEqual(empty.angles, []);
});

void test('adapter never throws on malformed inputs', () => {
  assert.doesNotThrow(() => buildUnifiedBrief({
    topic: '',
    news: [null as unknown as ReturnType<typeof newsItem>, {} as ReturnType<typeof newsItem>],
    videos: [null as unknown as Video, {} as Video],
    wiki: null,
    now: Number.NaN,
  }));
  assert.doesNotThrow(() => buildUnifiedBrief(undefined as unknown as UnifiedBriefInput));
});

void test('two runs with the same input produce identical ideas and angles', () => {
  const first = buildUnifiedBrief(fixture());
  const second = buildUnifiedBrief(fixture());
  assert.ok(first.ideas.length > 0);
  assert.deepEqual(second.ideas, first.ideas);
  assert.deepEqual(second.angles, first.angles);
  assert.deepEqual(second.coverage, first.coverage);
});
