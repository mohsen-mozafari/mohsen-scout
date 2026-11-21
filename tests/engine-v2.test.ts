import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInternalResearch } from '../lib/engine';
import {
  DEFAULT_WEIGHTS,
  MIN_EVIDENCE,
  buildTopics,
  computeCompetition,
  computeSupplyGap,
  extractFeatures,
  generateIdeas,
  generateIdeasWithInsufficient,
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

void test('supply gap is a bounded, saturating per-topic transform', () => {
  assert.equal(computeSupplyGap(0, 0), 0.5);
  assert.equal(computeSupplyGap(3, 3), 0.5);
  const newsHeavy = computeSupplyGap(20, 2);
  const saturated = computeSupplyGap(2, 20);
  assert.ok(newsHeavy > 0.85 && newsHeavy < 1, 'news-heavy topic must score high: ' + newsHeavy);
  assert.ok(saturated > 0 && saturated < 0.15, 'video-saturated topic must score low: ' + saturated);
  assert.ok(computeSupplyGap(40, 2) > computeSupplyGap(20, 2));
  assert.ok(computeSupplyGap(2, 40) < computeSupplyGap(2, 20));
  for (const value of [computeSupplyGap(0, 0), computeSupplyGap(1, 0), newsHeavy, saturated]) {
    assert.ok(value >= 0 && value <= 1);
  }
  // Competition is topic-level and damped: a low supplyGap is not charged twice.
  assert.ok(computeCompetition(newsHeavy, 1) < 0.35);
  assert.ok(computeCompetition(saturated, 5) > computeCompetition(saturated, 1));
  assert.ok(computeCompetition(saturated, 1) < 0.6);
});

function supplyFixture(news: number, videos: number) {
  const items: EvidenceItem[] = [
    ...Array.from({ length: news }, (_, index): EvidenceItem => makeItem({
      id: 'news-' + index,
      source: 'news',
      title: 'Demand report number ' + index,
      publishedAt: NOW - 86400000,
      views: undefined,
      likes: undefined,
      comments: undefined,
    })),
    ...Array.from({ length: videos }, (_, index): EvidenceItem => makeItem({
      id: 'video-' + index,
      source: 'youtube',
      title: 'Existing walkthrough number ' + index,
      publishedAt: NOW - 86400000,
      views: 1000,
      channelId: 'UC' + index,
    })),
  ];
  const features = new Map<string, ItemFeatures>(
    items.map((item): [string, ItemFeatures] => [item.id, extractFeatures(item, { now: NOW })]),
  );
  const supplyGap = computeSupplyGap(news, videos);
  const topic: Topic = {
    id: 'topic:supply-' + news + '-' + videos,
    label: 'supply fixture',
    keywords: [],
    itemIds: items.map((item) => item.id),
    newsCount: news,
    videoCount: videos,
    momentum: 0.8,
    avgOutlier: 0.55,
    supplyGap,
    competition: computeCompetition(supplyGap, videos),
  };
  return { items, features, topic, ctx: { items, features, now: NOW, niche: 'science' } };
}

void test('a news-heavy topic outscores a video-saturated topic with equal inputs', () => {
  const newsHeavy = supplyFixture(20, 2);
  const saturated = supplyFixture(2, 20);
  const good = scoreOpportunity(newsHeavy.topic, newsHeavy.ctx);
  const bad = scoreOpportunity(saturated.topic, saturated.ctx);
  assert.ok(good.value > bad.value + 10, 'expected a real spread, got ' + good.value + ' vs ' + bad.value);
  assert.ok(good.value > 40, 'news-heavy topic should no longer look weak: ' + good.value);
  assert.ok(good.components.find((part) => part.name === 'supplyGap')!.value >
    bad.components.find((part) => part.name === 'supplyGap')!.value);
  assert.ok(good.components.find((part) => part.name === 'competition')!.value <
    bad.components.find((part) => part.name === 'competition')!.value);
});

void test('scores spread meaningfully on a realistic mixed corpus', () => {
  const raws: RawEvidenceInput[] = [
    ...Array.from({ length: 12 }, (_, index) => ({
      id: 'demand-' + index,
      title: 'Lunar sample laboratory finding number ' + index,
      summary: 'Researchers measured a distinct lunar mineral sample variant' + index + ' using instrument series' + index + ' and published record phase' + index + '.',
      sourceUrl: 'https://example.org/lunar/news/' + index,
      publishedAt: '2026-11-1' + (index % 9) + 'T10:00:00Z',
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      id: 'supply-' + index,
      source: 'youtube',
      title: 'Lunar sample creator walkthrough number ' + index,
      description: 'A creator explains a lunar mineral sample measurement variant' + index + ' in episode series' + index + ' with phase' + index + '.',
      viewCount: 20000 + index * 1000,
      publishedAt: '2026-11-1' + (index % 9) + 'T18:00:00Z',
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      id: 'noise-' + index,
      title: 'Exoplanet atmosphere spectrum measurement number ' + index,
      summary: 'Astronomers measured an exoplanet atmosphere spectrum variant' + index + ' using telescope series' + index + ' during campaign phase' + index + '.',
      sourceUrl: 'https://example.org/exo/news/' + index,
      publishedAt: '2026-11-10T10:00:00Z',
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      id: 'noise-video-' + index,
      source: 'youtube',
      title: 'Exoplanet atmosphere creator explainer number ' + index,
      description: 'A creator describes an exoplanet atmosphere spectrum variant' + index + ' in episode series' + index + ' with phase' + index + '.',
      viewCount: 5000 + index * 100,
      publishedAt: '2026-11-10T18:00:00Z',
    })),
  ];
  const result = runEngineV2({ now: NOW, evidence: raws, niche: 'space-science' });
  assert.equal(result.fallback, false);
  assert.ok(result.scores.length >= 2);
  const values = result.scores.map((score) => score.value);
  assert.ok(Math.max(...values) > 40, 'top score should be meaningful, got ' + values.join(', '));
  assert.ok(Math.max(...values) - Math.min(...values) >= 10, 'scores should spread, got ' + values.join(', '));
  assert.ok(result.topics.every((topic) => topic.supplyGap >= 0 && topic.supplyGap <= 1));
});

void test('avgOutlier uses pooled channel history when channelId is unavailable', () => {
  const items = [makeItem({ id: 'v-pooled', views: 9000, channelId: undefined })];
  const features = new Map<string, ItemFeatures>([
    ['v-pooled', extractFeatures(items[0], {
      now: NOW,
      channelHistory: { UC_UNKNOWN: [1000, 1100, 1200] },
    })],
  ]);
  const outlier = features.get('v-pooled')?.outlierScore ?? 0.5;
  assert.notEqual(outlier, 0.5);
  assert.match(features.get('v-pooled')?.explanation ?? '', /pooled channel median/);
  const topics = buildTopics(items, features, { now: NOW });
  assert.equal(topics[0].avgOutlier, outlier);
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

  const generated = generateIdeasWithInsufficient(
    { topics: [good, thin], scores: [goodScore, thinScore], items, features, now: NOW, timezoneOffsetMinutes: 210 },
    { limit: 2 },
  );
  // Insufficient placeholders live in their own list and are never publishable.
  assert.equal(generated.ideas.length, 1);
  assert.ok(generated.insufficientIdeas.length > 0);
  const insufficient = generated.insufficientIdeas.find((idea) => idea.topicId === thin.id);
  assert.ok(insufficient);
  assert.equal(insufficient.dataSufficient, false);
  assert.match(insufficient.message ?? '', /insufficient/i);
  assert.ok(generated.ideas.every((idea) => idea.dataSufficient !== false));

  const full = generated.ideas.find((idea) => idea.topicId === good.id);
  assert.ok(full);
  assert.equal(full.dataSufficient, true);
  for (const reference of [...full.evidence, ...full.supportingNews]) {
    assert.ok(realIds.has(reference.id));
  }
  assert.ok(full.evidence.length > 0);
  assert.match(full.bestTimeToPublish, /Assumption:/);
  assert.equal(full.risk, full.score.risk);

  // Title, angle and why are composed from real evidence, not fixed templates.
  const topVideoTitle = 'Mars rover explainer version1';
  const newsTitle = 'Mars rover science bulletin report2';
  assert.ok(full.titleSuggestion.includes(topVideoTitle.slice(0, 40)));
  assert.match(full.titleSuggestion, /real views/);
  assert.ok(full.angle.includes(newsTitle));
  assert.match(full.angle, /3 news and 2 videos/);
  assert.match(full.angle, /50,001 real views/);
  assert.ok(full.why.length > 0 && full.why.length <= 320);
  assert.match(full.why, /real views/);
  assert.match(full.why, /supply gap/);
  assert.ok(full.why.includes('Mars rover'));
  assert.ok(full.claims && full.claims.length > 0 && full.claims.length <= 3);
  assert.ok(full.claims!.every((claim) => claim.text.length > 0 && claim.source.length > 0));
  assert.ok(full.claims!.some((claim) => claim.text === newsTitle));
  assert.ok(full.claims!.some((claim) => claim.text === topVideoTitle));
  for (const claim of full.claims!) {
    assert.ok(items.some((item) => item.title === claim.text), 'claim must be literal real text: ' + claim.text);
  }

  const limited = generateIdeas(
    { topics: [good, thin], scores: [goodScore, thinScore], items, features, now: NOW },
    { limit: 1 },
  );
  assert.equal(limited.length, 1);
  assert.equal(limited[0].dataSufficient, true);
});

void test('idea language switches the data-driven title to a Persian variant', () => {
  const normalized = normalizeEvidence([
    ...[0, 1, 2].map((index) => ({
      id: 'fn' + index,
      title: 'Mars rover science bulletin report' + index,
      summary: 'New rover measurement of a mineral sample in a crater during survey' + index + '.',
      publishedAt: '2026-11-1' + index + 'T08:00:00Z',
    })),
    ...[0, 1].map((index) => ({
      id: 'fv' + index,
      source: 'youtube',
      title: 'Mars rover explainer version' + index,
      viewCount: 50000 + index,
      publishedAt: '2026-11-1' + index + 'T18:00:00Z',
    })),
  ]);
  const items = normalized.items;
  const features = new Map<string, ItemFeatures>(
    items.map((item): [string, ItemFeatures] => [item.id, extractFeatures(item, { now: NOW })]),
  );
  const topic: Topic = {
    id: 'topic:lang',
    label: 'mars rover',
    keywords: ['mars'],
    itemIds: items.map((item) => item.id),
    newsCount: 3,
    videoCount: 2,
    momentum: 0.8,
    avgOutlier: 0.5,
    supplyGap: computeSupplyGap(3, 2),
    competition: computeCompetition(computeSupplyGap(3, 2), 1),
  };
  const ctx = { items, features, now: NOW, niche: 'science' };
  const score = scoreOpportunity(topic, ctx);
  const en = generateIdeas({ topics: [topic], scores: [score], items, features, now: NOW, language: 'en' })[0];
  const fa = generateIdeas({ topics: [topic], scores: [score], items, features, now: NOW, language: 'fa' })[0];
  assert.ok(en && fa);
  assert.notEqual(en.titleSuggestion, fa.titleSuggestion);
  assert.ok(fa.titleSuggestion.includes('«'));
  assert.match(fa.titleSuggestion, /بازدید واقعی/);
  assert.match(en.titleSuggestion, /real views/);
  assert.ok(fa.why.includes('شاهد:'));
  assert.ok(fa.why.length <= 320);
});

void test('runEngineV2 separates insufficient diagnostics from publishable ideas', () => {
  const evidence: RawEvidenceInput[] = [
    { id: 'thin-news', title: 'Solitary lunar observation report', summary: 'A single lunar observation was recorded.', publishedAt: '2026-11-19T10:00:00Z' },
    { id: 'thin-video', source: 'youtube', title: 'Solitary lunar walkthrough', viewCount: 200, publishedAt: '2026-11-19T18:00:00Z' },
  ];
  const result = runEngineV2({ now: NOW, evidence });
  assert.equal(result.fallback, false);
  assert.equal(result.ideas.length, 0);
  assert.ok(result.insufficientIdeas.length > 0);
  assert.ok(result.insufficientIdeas.every((idea) => idea.dataSufficient === false));
  assert.equal(result.ideas.some((idea) => idea.dataSufficient === false), false);
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

void test('TIMING: legacy baseline vs engine v2 on 500 news and 700 videos', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');
  const news = Array.from({ length: 500 }, (_, index) => ({
    id: 'n' + index,
    title: 'Space observation cluster' + index + ' alpha mission report',
    summary: 'Astronomers recorded a measurement of galaxy' + index + ' using an orbital instrument and published the result.',
    sourceName: index % 2 ? 'NASA' : 'ESA',
    sourceUrl: 'https://example.org/news/space-' + index,
    publishedAt: new Date(now - (index % 30) * 86400000).toISOString(),
  }));
  const videos = Array.from({ length: 700 }, (_, index) => ({
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
