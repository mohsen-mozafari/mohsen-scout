import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTextDirection } from '../lib/i18n';
import {
  analyzeMonthlyViews,
  analyzeSourceQuality,
  classifyPublicationFreshness,
  canonicalizeResearchUrl,
  deduplicateResearchEvidence,
  matchesResearchTerms,
  normalizeResearchText,
  rankResearchEvidence,
  scoreResearchText,
  sortResearchVideos,
  extractResearchEntityCandidates,
  buildResearchEntityRelations,
} from '../lib/intelligence';

void test('text normalization handles Persian Arabic character variants and zero-width marks', () => {
  assert.equal(normalizeResearchText('تلسکوپ جيمز\u200cوب'), 'تلسکوپ جیمز وب');
});

void test('semantic aliases connect JWST with James Webb without making unrelated topics match', () => {
  assert.ok(scoreResearchText('JWST', 'James Webb Space Telescope reveals a distant galaxy') > 0);
  assert.equal(scoreResearchText('JWST', 'Artemis lunar mission update'), 0);
  assert.ok(matchesResearchTerms('Webb NIRSpec observations', ['James Webb Space Telescope', 'NIRSpec']));
  assert.ok(scoreResearchText('JWST', 'The James Webb Space Telescope observes an exoplanet') > 0);
  assert.equal(scoreResearchText('JWST', 'A generic space telescope launch'), 0);
  assert.ok(matchesResearchTerms('JWST observations', ['James Webb Space Telescope']));
});

void test('canonical URLs remove tracking parameters but preserve article identity', () => {
  assert.equal(
    canonicalizeResearchUrl('https://example.com/story/?utm_source=feed&gclid=abc&id=42#top'),
    'https://example.com/story?id=42',
  );
});

void test('duplicate syndication is merged while original publisher families remain distinguishable', () => {
  const result = deduplicateResearchEvidence([
    { title: 'New exoplanet atmosphere observed', summary: 'A direct report.', sourceName: 'NASA', sourceId: 'nasa', sourceUrl: 'https://nasa.gov/story?utm_source=rss', publishedAt: '2026-11-14T10:00:00Z' },
    { title: 'New exoplanet atmosphere observed', summary: 'A direct report.', sourceName: 'NASA JPL', sourceId: 'jpl', sourceUrl: 'https://jpl.nasa.gov/story', publishedAt: '2026-11-14T10:00:00Z' },
    { title: 'New exoplanet atmosphere observed', summary: 'A direct report.', sourceName: 'ESA', sourceId: 'esa-space', sourceUrl: 'https://esa.int/story', publishedAt: '2026-11-14T10:00:00Z' },
  ]);
  assert.equal(result.items.length, 1);
  assert.equal(result.duplicatesMerged, 2);
  assert.equal(result.items[0].sourceCount, 3);
  const quality = analyzeSourceQuality([
    { title: 'A', sourceName: 'NASA', sourceId: 'nasa', publishedAt: '2026-11-14T10:00:00Z' },
    { title: 'B', sourceName: 'NASA JPL', sourceId: 'jpl', publishedAt: '2026-11-14T10:00:00Z' },
    { title: 'C', sourceName: 'ESA', sourceId: 'esa-space', publishedAt: null },
  ], 2, Date.parse('2026-11-16T00:00:00Z'));
  assert.equal(quality.feedsRepresented, 3);
  assert.equal(quality.independentPublishers, 2);
  assert.equal(quality.duplicateStoriesMerged, 2);
  assert.equal(quality.undatedItems, 1);
});

void test('news ranking prefers a direct topic match over a newer unrelated item', () => {
  const items = [
    { title: 'Artemis lunar mission update', summary: 'Crewed lunar exploration.', publishedAt: '2026-11-16T10:00:00Z' },
    { title: 'Webb observes an exoplanet atmosphere', summary: 'Spectral evidence from an extrasolar planet.', publishedAt: '2026-11-14T10:00:00Z' },
  ];
  assert.deepEqual(rankResearchEvidence('exoplanet atmospheres', items, 2), [items[1]]);
});

void test('pageview trend requires enough observations and identifies sustained directional change', () => {
  assert.equal(analyzeMonthlyViews([{ month: '2026-01', views: 20 }, { month: '2026-02', views: 30 }]).direction, 'insufficient-data');
  const rising = analyzeMonthlyViews([
    { month: '2026-01', views: 100 }, { month: '2026-02', views: 110 },
    { month: '2026-03', views: 120 }, { month: '2026-04', views: 160 },
    { month: '2026-05', views: 180 }, { month: '2026-06', views: 210 },
  ]);
  assert.equal(rising.direction, 'rising');
  assert.ok((rising.changePercent ?? 0) > 0);
  assert.equal(rising.scenarios.length, 3);
});

void test('pageview analysis labels a sudden last-month jump as an anomaly rather than a forecast', () => {
  const result = analyzeMonthlyViews([
    { month: '2026-01', views: 100 }, { month: '2026-02', views: 105 },
    { month: '2026-03', views: 98 }, { month: '2026-04', views: 101 },
    { month: '2026-05', views: 103 }, { month: '2026-06', views: 600 },
  ]);
  assert.equal(result.anomaly, 'spike');
  assert.equal(result.scenarios.length, 3);
  assert.ok(result.scenarios.every((scenario) => scenario.startsWith('If')));
});

void test('video sorting puts missing values last and uses deterministic tie breakers', () => {
  const videos = [
    { id: 'b', title: 'B', publishedAt: '2026-11-14T00:00:00Z', viewCount: 200, likeCount: 10 },
    { id: 'a', title: 'A', publishedAt: '2026-11-15T00:00:00Z', viewCount: 200, likeCount: null },
    { id: 'c', title: 'C', publishedAt: '2026-11-13T00:00:00Z', viewCount: null, likeCount: null },
  ];
  assert.deepEqual(sortResearchVideos(videos, 'Most Views').map((video) => video.id), ['a', 'b', 'c']);
  assert.deepEqual(sortResearchVideos(videos, 'Newest').map((video) => video.id), ['a', 'b', 'c']);
  const topical = [
    { id: 'unrelated', title: 'Artemis lunar mission update', publishedAt: '2026-11-16T00:00:00Z' },
    { id: 'relevant', title: 'Webb observes an exoplanet atmosphere', publishedAt: '2026-11-14T00:00:00Z' },
  ];
  assert.deepEqual(sortResearchVideos(topical, 'Most Relevant', 'exoplanet atmospheres').map((video) => video.id), ['relevant', 'unrelated']);
});


void test('text direction follows the first strong character, not the selected app language', () => {
  assert.equal(resolveTextDirection('تلسکوپ Webb'), 'rtl');
  assert.equal(resolveTextDirection('NASA report تلسکوپ'), 'ltr');
  assert.equal(resolveTextDirection('1234 — Webb'), 'ltr');
  assert.equal(resolveTextDirection('گزارش 2026'), 'rtl');
});
void test('text direction ignores punctuation, digits and emoji before the first strong letter', () => {
  assert.equal(resolveTextDirection('، ۱۲۳ — NASA report'), 'ltr');
  assert.equal(resolveTextDirection('🚀 2026: Webb telescope'), 'ltr');
  assert.equal(resolveTextDirection('، ۲۰۲۶: گزارش فارسی'), 'rtl');
});

void test('semantic aliases cover precise Persian space-science equivalents', () => {
  assert.ok(scoreResearchText('سیاره فراخورشیدی', 'James Webb Space Telescope observes an exoplanet') > 0);
  assert.ok(scoreResearchText('سیاهچاله', 'Black hole observations reveal a new structure') > 0);
  assert.ok(scoreResearchText('امواج گرانشی', 'A new gravitational wave signal was recorded') > 0);
  assert.equal(scoreResearchText('سیاهچاله', 'Artemis lunar mission update'), 0);
});



void test('publication freshness distinguishes recent, old, undated and future-dated reports', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  assert.equal(classifyPublicationFreshness('2026-11-15T12:00:00Z', now).status, 'fresh');
  assert.equal(classifyPublicationFreshness('2026-11-01T12:00:00Z', now).status, 'recent');
  assert.equal(classifyPublicationFreshness('2026-08-01T12:00:00Z', now).status, 'stale');
  assert.equal(classifyPublicationFreshness(null, now).status, 'undated');
  assert.equal(classifyPublicationFreshness('2026-11-20T12:00:00Z', now).status, 'future-dated');
});

void test('known entity aliases are normalized across Persian and English and retain evidence provenance', () => {
  const entities = extractResearchEntityCandidates([
    { id: 'nasa-story', sourceId: 'nasa', text: 'NASA reports a Mars observation by the James Webb Space Telescope (JWST).' },
    { id: 'esa-story', sourceId: 'esa-space', text: 'ESA publishes a new Mars mission update.' },
    { id: 'unrelated', sourceId: 'jpl', text: 'تلسکوپ جیمز وب داده تازه‌ای درباره سیاره فراخورشیدی ثبت کرد.' },
  ]);
  const nasa = entities.find((entity) => entity.name === 'NASA');
  const mars = entities.find((entity) => entity.name === 'Mars');
  const jwst = entities.find((entity) => entity.name === 'JWST');
  assert.ok(nasa);
  assert.ok(mars);
  assert.ok(jwst);
  assert.deepEqual(nasa.evidenceIds, ['nasa-story']);
  assert.deepEqual(mars.evidenceIds.sort(), ['esa-story', 'nasa-story']);
  assert.deepEqual(jwst.evidenceIds.sort(), ['nasa-story', 'unrelated']);
  assert.ok(jwst.mentionCount >= 2);
});

void test('entity relationships are evidence-backed co-mentions and never labelled causal', () => {
  const entities = extractResearchEntityCandidates([
    { id: 'nasa-story', sourceId: 'nasa', text: 'NASA reports a Mars observation.' },
    { id: 'esa-story', sourceId: 'esa-space', text: 'ESA publishes a Mars mission update.' },
  ]);
  const relations = buildResearchEntityRelations(entities);
  assert.ok(relations.length > 0);
  assert.ok(relations.every((relation) => relation.type === 'co-mentioned'));
  assert.ok(relations.every((relation) => relation.evidenceCount === relation.evidenceIds.length));
  const nasa = entities.find((entity) => entity.name === 'NASA')!;
  const esa = entities.find((entity) => entity.name === 'ESA')!;
  assert.equal(relations.some((relation) =>
    (relation.fromEntityId === nasa.id && relation.toEntityId === esa.id) ||
    (relation.fromEntityId === esa.id && relation.toEntityId === nasa.id)
  ), false);
});

