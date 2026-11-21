import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInternalResearch } from '../lib/engine';
import {
  DEFAULT_WEIGHTS,
  MIN_EVIDENCE,
  buildTopics,
  extractFeatures,
  generateIdeas,
  normalizeEvidence,
  runEngineV2,
  scoreOpportunity,
  type EngineV2Result,
  type EvidenceItem,
  type ItemFeatures,
  type RawEvidenceInput,
  type ScoreWeights,
  type Topic,
} from '../lib/engine-v2';

const NOW = Date.parse('2026-11-20T12:00:00Z');

function makeItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: 'x1',
    source: 'youtube',
    title: 'Webb reveals 3 new details',
    text: 'webb reveals three new details from the telescope',
    publishedAt: NOW - 2 * 86400000,
    language: 'en',
    views: 1000,
    likes: 40,
    comments: 10,
    ...overrides,
  };
}

function makeTopics(items: readonly EvidenceItem[], features: ReadonlyMap<string, ItemFeatures>): Topic[] {
  return buildTopics(items, features, { now: NOW });
}

// ---------------------------------------------------------------------------
// Normalizer / dedupe / coverage
// ---------------------------------------------------------------------------

void test('normalization preserves channel stats and buckets, strips HTML and reports coverage', () => {
  const result = normalizeEvidence([
    {
      id: 'n1',
      title: '<p>Webb observes an exoplanet atmosphere</p>',
      summary: 'Spectral evidence &amp; details. Read more',
      sourceUrl: 'https://example.com/story?utm_source=rss',
      publishedAt: '2026-11-14T10:00:00Z',
      sourceName: 'NASA',
    },
    {
      id: 'n2',
      title: 'Webb observes an exoplanet atmosphere',
      summary: 'Spectral evidence and details.',
      sourceUrl: 'https://other.example.org/story?gclid=abc',
      publishedAt: '2026-11-14T11:00:00Z',
    },
    {
      id: 'n3',
      title: 'Webb observes an exoplanet atmospheric spectra',
      summary: 'Spectral evidence from a distant world.',
      publishedAt: '2026-11-14T12:00:00Z',
    },
    {
      source: 'youtube',
      id: 'v1',
      title: 'Mars rover sample analysis',
      description: 'Rover science with a mineral sample.',
      channel: 'Mars Lab',
      channelId: 'UC123',
      channelSubscriberCount: 120000,
      channelVideoCount: 340,
      viewCount: 90000,
      likeCount: 3000,
      publishedAt: '2026-11-15T12:00:00Z',
      query: 'mars rover',
    },
    {
      source: 'wikimedia',
      articleTitle: 'Mars',
      language: 'fa',
      summary: 'سیاره مریخ و اکتشافات اخیر',
      articleUrl: 'https://fa.wikipedia.org/wiki/Mars',
      monthlyViews: [{ month: '2026-10', views: 1234 }],
    },
    { id: 'bad' },
  ]);

  // n2 is an exact normalized-title duplicate; the malformed record is dropped.
  assert.equal(result.items.length, 4);
  assert.equal(result.dropped, 1);
  assert.deepEqual(
    result.stats.map((coverage) => [coverage.source, coverage.fetched, coverage.normalized, coverage.deduped]),
    [['news', 4, 3, 1], ['youtube', 1, 1, 0], ['wikimedia', 1, 1, 0]],
  );

  const first = result.items.find((item) => item.id === 'news:n1');
  assert.ok(first);
  assert.equal(first.title, 'Webb observes an exoplanet atmosphere');
  assert.match(first.text, /spectral evidence and details/);
  assert.doesNotMatch(first.text, /read more/);

  const video = result.items.find((item) => item.id === 'youtube:v1');
  assert.ok(video);
  assert.equal(video.channelSubscribers, 120000);
  assert.equal(video.channelVideoCount, 340);
  assert.equal(video.channelTitle, 'Mars Lab');
  assert.equal(video.channelId, 'UC123');
  assert.equal(video.bucket, 'mars rover');
  assert.equal(video.views, 90000);

  const wiki = result.items.find((item) => item.source === 'wikimedia');
  assert.ok(wiki);
  assert.equal(wiki.language, 'fa');
  assert.match(wiki.text, /سیاره مریخ/);
});

void test('normalization applies Persian-aware character normalization', () => {
  const result = normalizeEvidence([{ title: 'تلسکوپ جيمز وب', summary: 'رصد کهکشان دوردست' }]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, 'تلسکوپ جیمز وب');
  assert.match(result.items[0].text, /رصد کهکشان دوردست/);
  assert.doesNotMatch(result.items[0].title, /جيمز/);
});

void test('near-duplicate text is deduped even when titles differ', () => {
  const result = normalizeEvidence([
    {
      title: 'Alpha headline one',
      summary: 'The shuttle mission discovered a new mineral sample near the crater floor and reported it today',
    },
    {
      title: 'A completely different headline',
      summary: 'The shuttle mission discovered a new mineral sample near the crater floor and reported it today!',
    },
  ]);
  assert.equal(result.items.length, 1);
  assert.equal(result.stats[0].deduped, 1);
});

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

void test('feature math is safe for zero, future and missing values', () => {
  const zeroDate = extractFeatures(makeItem({ publishedAt: 0, views: 5000 }), { now: NOW });
  assert.equal(zeroDate.viewsPerHour, 0);
  assert.equal(zeroDate.freshness, 0);

  const futureDate = extractFeatures(makeItem({ publishedAt: NOW + 86400000, views: 5000 }), { now: NOW });
  assert.equal(futureDate.viewsPerHour, 0);
  assert.equal(futureDate.freshness, 0);

  const twoHours = extractFeatures(makeItem({ publishedAt: NOW - 2 * 3600000, views: 2000 }), { now: NOW });
  assert.equal(twoHours.viewsPerHour, 1000);

  const noViews = extractFeatures(makeItem({ views: 0, likes: 10, comments: 5 }), { now: NOW });
  assert.equal(noViews.engagementRate, 0);
  assert.equal(noViews.channelToViewRatio, 0);

  const engagement = extractFeatures(makeItem({ views: 100, likes: 5, comments: 5 }), { now: NOW });
  assert.equal(engagement.engagementRate, 0.1);
});

void test('outlier is neutral without channel history and log-scaled with it', () => {
  const without = extractFeatures(makeItem({ views: 8000, channelId: 'UC1' }), { now: NOW });
  assert.equal(without.outlierScore, 0.5);

  const withHistory = extractFeatures(makeItem({ views: 8000, channelId: 'UC1' }), {
    now: NOW,
    channelMedianViews: { UC1: 1000 },
  });
  assert.equal(withHistory.outlierScore, 1);
  assert.match(withHistory.explanation, /channel median/);

  const below = extractFeatures(makeItem({ views: 125, channelId: 'UC1' }), {
    now: NOW,
    channelHistory: { UC1: [900, 1000, 1100] },
  });
  assert.equal(below.outlierScore, 0);
  assert.ok(below.explanation.length <= 220);
});

void test('freshness is bounded and title patterns are detected', () => {
  assert.equal(extractFeatures(makeItem({ publishedAt: NOW }), { now: NOW }).freshness, 1);
  const old = extractFeatures(makeItem({ publishedAt: NOW - 60 * 86400000 }), { now: NOW }).freshness;
  assert.ok(old > 0 && old < 1);
  const pattern = extractFeatures(makeItem({ title: 'Why Webb revealed 3 secrets' }), { now: NOW }).titlePattern;
  assert.equal(pattern.hasNumber, true);
  assert.equal(pattern.isQuestion, true);
  assert.equal(pattern.curiosityGap, true);
  assert.equal(pattern.hasPowerWord, true);
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoringFixture(momentum: number, itemIds = ['n1', 'n2', 'v1'], includeViews = true) {
  const items: EvidenceItem[] = [
    makeItem({ id: 'n1', source: 'news', title: 'Mars rover report', views: undefined, likes: undefined, comments: undefined }),
    makeItem({ id: 'n2', source: 'news', title: 'Mars rover update', views: undefined, likes: undefined, comments: undefined }),
    makeItem({
      id: 'v1',
      source: 'youtube',
      title: 'Mars rover explainer',
      views: includeViews ? 100000 : undefined,
      channelId: 'UC1',
    }),
  ].filter((item) => itemIds.includes(item.id));
  const features = new Map<string, ItemFeatures>(
    items.map((item): [string, ItemFeatures] => [item.id, extractFeatures(item, { now: NOW })]),
  );
  const topic: Topic = {
    id: 'topic:test',
    label: 'mars rover',
    keywords: ['mars', 'rover'],
    itemIds,
    newsCount: itemIds.filter((id) => id.startsWith('n')).length,
    videoCount: itemIds.filter((id) => id.startsWith('v')).length,
    momentum,
    avgOutlier: 0.6,
    supplyGap: 0.6,
  };
  return { items, features, topic, ctx: { items, features, now: NOW, niche: 'space-science' } };
}

void test('scoring is monotonic in momentum and components explain the value', () => {
  const low = scoringFixture(0.1);
  const high = scoringFixture(0.9);
  const lowScore = scoreOpportunity(low.topic, low.ctx);
  const highScore = scoreOpportunity(high.topic, high.ctx);
  assert.ok(highScore.value > lowScore.value);
  assert.ok(highScore.why.includes(String(highScore.value)));

  const sum = highScore.components.reduce((total, part) => total + part.contribution, 0);
  assert.ok(Math.abs(sum - highScore.value) <= 1);
  assert.ok(highScore.components.every((part) => part.evidence.length > 0));
});

void test('scoring weights are tunable', () => {
  const low = scoringFixture(0);
  const high = scoringFixture(1);
  const defaultDelta = scoreOpportunity(high.topic, high.ctx).value - scoreOpportunity(low.topic, low.ctx).value;
  const focused: ScoreWeights = {
    baseline: 0.5,
    momentum: 0.5,
    avgOutlier: 0,
    supplyGap: 0,
    freshness: 0,
    newsRecency: 0,
    competition: 0,
  };
  const focusedDelta = scoreOpportunity(high.topic, high.ctx, { weights: focused }).value -
    scoreOpportunity(low.topic, low.ctx, { weights: focused }).value;
  assert.ok(focusedDelta > defaultDelta);
  assert.equal(DEFAULT_WEIGHTS.baseline, 0.2);
});

void test('confidence shrinks with sparse evidence and revenue stays a labeled estimate', () => {
  const rich = scoringFixture(0.7);
  const sparse = scoringFixture(0.7, ['n1'], false);
  const richScore = scoreOpportunity(rich.topic, rich.ctx);
  const sparseScore = scoreOpportunity(sparse.topic, sparse.ctx);
  assert.ok(sparseScore.confidence < richScore.confidence);
  assert.ok(sparseScore.confidence >= 0 && sparseScore.confidence <= 1);

  assert.equal(sparseScore.estRevenue.low, 0);
  assert.equal(sparseScore.estRevenue.high, 0);
  assert.equal(sparseScore.estRevenue.label, 'estimate');
  assert.match(sparseScore.estRevenue.basis, /insufficient/i);

  assert.ok(richScore.estRevenue.low > 0);
  assert.ok(richScore.estRevenue.high > richScore.estRevenue.low);
  assert.equal(richScore.estRevenue.label, 'estimate');
  assert.match(richScore.estRevenue.basis, /estimate/i);
  assert.equal(richScore.estRevenue.rpm, 3.2);
});

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

void test('clustering separates distinct topics, groups related items and is deterministic', () => {
  const raws: RawEvidenceInput[] = [
    ...[0, 1, 2].map((index) => ({
      id: 'm' + index,
      title: ['Mars rover mineral sample study', 'Mars rover crater soil analysis', 'Mars rover instrument measurement report'][index],
      summary: 'The rover studies mars soil and mineral samples on the planet surface in survey variant' + index + '.',
      publishedAt: '2026-11-1' + index + 'T10:00:00Z',
      sourceUrl: 'https://example.org/mars/' + index,
    })),
    ...[0, 1, 2].map((index) => ({
      id: 'e' + index,
      title: ['Exoplanet atmosphere spectral observation', 'Exoplanet atmosphere water vapor detection', 'Exoplanet atmosphere transit spectrum study'][index],
      summary: 'Astronomers analyse the exoplanet atmosphere with spectroscopic observations using method' + index + '.',
      publishedAt: '2026-11-1' + index + 'T12:00:00Z',
      sourceUrl: 'https://example.org/exo/' + index,
    })),
  ];
  const normalized = normalizeEvidence(raws);
  assert.equal(normalized.items.length, 6);
  const features = new Map<string, ItemFeatures>(
    normalized.items.map((item): [string, ItemFeatures] => [item.id, extractFeatures(item, { now: NOW })]),
  );
  const topics = makeTopics(normalized.items, features);
  assert.equal(topics.length, 2);
  for (const topic of topics) {
    const prefixes = new Set(topic.itemIds.map((id) => id.slice(0, 1)));
    assert.equal(prefixes.size, 1);
  }
  assert.deepEqual(makeTopics(normalized.items, features), topics);
});

void test('clustering output is bounded for many documents', () => {
  const raws: RawEvidenceInput[] = Array.from({ length: 120 }, (_, index) => ({
    id: 'doc' + index,
    title: 'cluster' + index + ' galaxy' + index + ' observation report',
    summary: 'A distinct observation report number ' + index + ' about galaxy' + index + '.',
    publishedAt: '2026-11-14T10:00:00Z',
    sourceUrl: 'https://example.org/doc/' + index,
  }));
  const normalized = normalizeEvidence(raws);
  assert.equal(normalized.items.length, 120);
  const features = new Map<string, ItemFeatures>(
    normalized.items.map((item): [string, ItemFeatures] => [item.id, extractFeatures(item, { now: NOW })]),
  );
  const topics = buildTopics(normalized.items, features, { now: NOW, maxTopics: 6 });
  assert.ok(topics.length > 0 && topics.length <= 6);
});

// ---------------------------------------------------------------------------
// Ideas
// ---------------------------------------------------------------------------

void test('ideas reference only real items, flag insufficient data and respect the limit', () => {
  const normalized = normalizeEvidence([
    ...[0, 1, 2].map((index) => ({
      id: 'n' + index,
      title: 'Mars rover science bulletin report' + index,
      summary: 'New rover measurement of a mineral sample in a crater during survey' + index + '.',
      sourceUrl: 'https://example.org/mars/news/' + index,
      publishedAt: '2026-11-1' + index + 'T08:00:00Z',
    })),
    ...[0, 1].map((index) => ({
      id: 'v' + index,
      source: 'youtube',
      title: 'Mars rover explainer version' + index,
      description: 'A walkthrough of the rover measurement and mineral sample in episode' + index + '.',
      viewCount: 50000 + index,
      publishedAt: '2026-11-1' + index + 'T18:00:00Z',
      url: 'https://youtube.com/watch?v=mars' + index,
    })),
  ]);
  const items = normalized.items;
  const features = new Map<string, ItemFeatures>(
    items.map((item): [string, ItemFeatures] => [item.id, extractFeatures(item, { now: NOW })]),
  );
  const good: Topic = {
    id: 'topic:good',
    label: 'mars rover',
    keywords: ['mars', 'rover'],
    itemIds: items.map((item) => item.id),
    newsCount: 3,
    videoCount: 2,
    momentum: 0.8,
    avgOutlier: 0.6,
    supplyGap: 0.6,
  };
  const thin: Topic = {
    id: 'topic:thin',
    label: 'solar flare',
    keywords: ['solar', 'flare'],
    itemIds: items.slice(0, 1).map((item) => item.id),
    newsCount: 1,
    videoCount: 0,
    momentum: 0,
    avgOutlier: 0.5,
    supplyGap: 1,
  };
  const ctx = { items, features, now: NOW, niche: 'science' };
  const goodScore = scoreOpportunity(good, ctx);
  const thinScore = { ...scoreOpportunity(thin, ctx), value: 99 };
  const realIds = new Set(items.map((item) => item.id));
  assert.ok(MIN_EVIDENCE > 1);

  const ideas = generateIdeas(
    { topics: [good, thin], scores: [goodScore, thinScore], items, features, now: NOW, timezoneOffsetMinutes: 210 },
    { limit: 2 },
  );
  assert.equal(ideas.length, 2);
  const insufficient = ideas.find((idea) => idea.topicId === thin.id);
  assert.ok(insufficient);
  assert.equal(insufficient.dataSufficient, false);
  assert.match(insufficient.message ?? '', /insufficient/i);

  const full = ideas.find((idea) => idea.topicId === good.id);
  assert.ok(full);
  assert.equal(full.dataSufficient, true);
  for (const reference of [...full.evidence, ...full.supportingNews]) {
    assert.ok(realIds.has(reference.id));
  }
  assert.ok(full.evidence.length > 0);
  assert.ok(full.why.length > 0);
  assert.match(full.bestTimeToPublish, /Assumption:/);
  assert.equal(full.risk, full.score.risk);

  const limited = generateIdeas(
    { topics: [good, thin], scores: [goodScore, thinScore], items, features, now: NOW },
    { limit: 1 },
  );
  assert.equal(limited.length, 1);
});

// ---------------------------------------------------------------------------
// Orchestration / fallback
// ---------------------------------------------------------------------------

void test('runEngineV2 produces timings and degrades to previous on budget overrun', () => {
  const evidence: RawEvidenceInput[] = [
    {
      id: 'n1',
      title: 'Space telescope observes a distant galaxy',
      summary: 'An observatory recorded a measurement and published the result.',
      sourceUrl: 'https://example.org/space/1',
      publishedAt: '2026-11-18T10:00:00Z',
    },
    {
      id: 'v1',
      source: 'youtube',
      title: 'Space telescope galaxy explainer',
      description: 'An explainer of the observation with public metrics.',
      viewCount: 25000,
      publishedAt: '2026-11-18T18:00:00Z',
    },
  ];
  const previous = runEngineV2({ now: NOW, evidence }, { clock: () => 0 });
  assert.equal(previous.fallback, false);
  assert.deepEqual(previous.timings.map((timing) => timing.stage), [
    'normalize', 'features', 'topics', 'scoring', 'ideas',
  ]);
  assert.equal(previous.items.length, 2);

  let tick = 0;
  const overrun = runEngineV2({ now: NOW, evidence }, {
    budgetMs: 10,
    previous,
    clock: () => {
      tick += 1;
      return tick * 1000;
    },
  });
  assert.equal(overrun.fallback, true);
  assert.deepEqual(overrun.topics, previous.topics);
  assert.ok(overrun.warnings.length > previous.warnings.length);
  assert.ok(overrun.timings.some((timing) => timing.stage === 'fallback'));
});

void test('runEngineV2 never throws on a failing stage or malformed input', () => {
  let calls = 0;
  const failing = runEngineV2({ now: NOW, evidence: [] }, {
    clock: () => {
      calls += 1;
      if (calls === 2) throw new Error('injected-clock-failure');
      return calls;
    },
  });
  assert.equal(failing.fallback, true);
  assert.ok(failing.warnings.some((warning) => warning.includes('injected-clock-failure')));
  assert.equal(failing.coverage.length, 3);

  const malformed = runEngineV2({
    now: NOW,
    evidence: [{} as RawEvidenceInput, { title: 123 } as unknown as RawEvidenceInput],
  });
  assert.equal(malformed.fallback, false);
  assert.equal(malformed.dropped, 2);
  assert.ok(malformed.warnings.some((warning) => /dropped/.test(warning)));
});

// ---------------------------------------------------------------------------
// Timing baseline comparison
// ---------------------------------------------------------------------------

void test('TIMING: legacy baseline vs engine v2 on 1000 news and 1500 videos', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');
  const news = Array.from({ length: 1000 }, (_, index) => ({
    id: 'n' + index,
    title: 'Space observation cluster' + index + ' alpha mission report',
    summary: 'Astronomers recorded a measurement of galaxy' + index + ' using an orbital instrument and published the result.',
    sourceName: index % 2 ? 'NASA' : 'ESA',
    sourceUrl: 'https://example.org/news/space-' + index,
    publishedAt: new Date(now - (index % 30) * 86400000).toISOString(),
  }));
  const videos = Array.from({ length: 1500 }, (_, index) => ({
    id: 'vid' + String(index).padStart(11, '0'),
    title: 'Space observation cluster' + index + ' beta mission walkthrough',
    description: 'A creator explains galaxy' + index + ' observations using orbital instrument footage.',
    channel: 'Channel ' + (index % 40),
    channelId: 'UC' + (index % 40),
    publishedAt: new Date(now - (index % 45) * 86400000).toISOString(),
    viewCount: 1000 + (index % 500) * 37,
    likeCount: 50 + (index % 50) * 3,
    channelSubscriberCount: 100000,
    channelVideoCount: 200,
    query: 'space observation ' + (index % 5),
  }));
  const evidence: RawEvidenceInput[] = [...news, ...videos];

  const baselineStart = performance.now();
  const legacy = buildInternalResearch({ topic: 'space observation', news, videos, now });
  const baselineMs = performance.now() - baselineStart;

  const engineStart = performance.now();
  const result: EngineV2Result = runEngineV2(
    { now, evidence, niche: 'space-science' },
    { budgetMs: 20000 },
  );
  const engineMs = performance.now() - engineStart;

  console.log('BASELINE legacy=' + baselineMs.toFixed(1) + 'ms');
  console.log('ENGINE_V2=' + engineMs.toFixed(1) + 'ms');

  assert.ok(legacy.evidence.length > 0);
  assert.equal(result.fallback, false);
  assert.ok(result.items.length > 0);
  assert.equal(result.timings.length, 5);
  // Generous ceiling: this is a CI comparison signal, not a performance regression gate.
  assert.ok(baselineMs < 20000);
  assert.ok(engineMs < 20000);
});
