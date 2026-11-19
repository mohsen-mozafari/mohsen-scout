import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateDisplayIdeas, generateEditorialIdeas, selectIdeaGenerationVideos } from '../lib/idea-generation';
import { createManualIdea } from '../lib/engine';
import type { SpaceNewsItem } from '../lib/space';
import { defaults } from '../lib/types';
import { validateLocal } from '../lib/validation';

const news: SpaceNewsItem[] = [
  {
    id: 'news-1',
    sourceId: 'nasa',
    sourceName: 'NASA',
    title: 'MOCK: Webb observes methane signatures in an exoplanet atmosphere',
    summary: 'MOCK: Spectroscopy measurements describe methane chemistry and instrument limits.',
    url: 'https://science.nasa.gov/mock-methane-report',
    publishedAt: '2026-11-15T12:00:00Z',
  },
  {
    id: 'news-2',
    sourceId: 'esa-science',
    sourceName: 'ESA',
    title: 'MOCK: New spectroscopy analysis examines methane on a distant world',
    summary: 'MOCK: Researchers compare observation methods and uncertainty in atmospheric readings.',
    url: 'https://www.esa.int/mock-spectroscopy-report',
    publishedAt: '2026-11-14T12:00:00Z',
  },
];

const videos = [
  {
    id: 'dQw4w9WgXcQ',
    title: 'MOCK: Exoplanet methane spectroscopy explained',
    description: 'MOCK: A video about measurement limits and atmospheric signals.',
    channel: 'MOCK Science Channel',
    publishedAt: '2026-11-13T12:00:00Z',
    viewCount: 12345,
  },
  {
    id: '9bZkp7q19f0',
    title: 'MOCK: How astronomers interpret distant atmosphere signals',
    description: 'MOCK: Explains spectroscopy and uncertainty.',
    channel: 'MOCK Astronomy',
    publishedAt: '2026-11-12T12:00:00Z',
    viewCount: 9876,
  },
];

const base = {
  topic: 'JWST exoplanet atmosphere',
  region: 'Germany' as const,
  languages: ['en'],
  language: 'en' as const,
  now: 1794760000000,
};

void test('idea generation works with official news only and links its original source', () => {
  const ideas = generateEditorialIdeas({ ...base, news, videos: [], limit: 5 });
  assert.ok(ideas.length >= 3);
  assert.ok(ideas.every((idea) => idea.engineGenerated && idea.ideaCategory));
  assert.ok(ideas.every((idea) => idea.sourceUrl?.startsWith('https://')));
  assert.ok(ideas.every((idea) => idea.videoIds.length === 0));
  assert.ok(ideas.every((idea) => idea.concept.includes('Central question:')));
  assert.ok(ideas.every((idea) => typeof idea.engineScore === 'number' && idea.engineScore >= 0 && idea.engineScore <= 100));
  assert.ok(ideas.every((idea) => Boolean(idea.engineScoreReason)));
  assert.deepEqual(
    ideas.map((idea) => idea.engineScore),
    [...ideas].map((idea) => idea.engineScore).sort((a, b) => (b ?? 0) - (a ?? 0)),
  );
});

void test('editorial priority survives the validated local SQLite data shape', () => {
  const generated = generateEditorialIdeas({ ...base, news, videos, limit: 2 });
  const data = defaults();
  data.ideas = generated;
  const restored = validateLocal(data);
  assert.deepEqual(
    restored.ideas.map((idea) => idea.engineScore),
    generated.map((idea) => idea.engineScore),
  );
  assert.deepEqual(
    restored.ideas.map((idea) => idea.engineScoreReason),
    generated.map((idea) => idea.engineScoreReason),
  );
});

void test('idea generation works with YouTube only without persisting raw video metadata', () => {
  const ideas = generateEditorialIdeas({ ...base, news: [], videos, reportId: 'report-1', limit: 4 });
  assert.ok(ideas.length > 0);
  assert.ok(ideas.every((idea) => idea.reportId === 'report-1'));
  assert.ok(ideas.every((idea) => idea.videoIds.length > 0));
  const persisted = JSON.stringify(ideas);
  assert.doesNotMatch(persisted, /MOCK: Exoplanet methane spectroscopy explained|MOCK Science Channel|12345/);
});

void test('mixed research can produce a category-specific cross-source idea', () => {
  const ideas = generateEditorialIdeas({
    ...base,
    news,
    videos,
    category: 'Cross-source',
    limit: 3,
  });
  assert.ok(ideas.length > 0);
  assert.ok(ideas.every((idea) => idea.ideaCategory === 'Cross-source'));
  assert.ok(ideas.some((idea) => idea.sourceName === 'NASA' || idea.sourceName === 'ESA'));
});

void test('refresh avoids generating titles already present in Ideas', () => {
  const first = generateEditorialIdeas({ ...base, news, videos, limit: 4 });
  const second = generateEditorialIdeas({ ...base, news, videos, existingIdeas: first, limit: 4 });
  const firstTitles = new Set(first.map((idea) => idea.topic));
  assert.ok(second.length > 0);
  assert.ok(second.every((idea) => !firstTitles.has(idea.topic)));
});

void test('a selected category changes the generated angle rather than acting as a display-only filter', () => {
  const ideas = generateEditorialIdeas({
    ...base,
    news,
    videos,
    category: 'Evidence audit',
    limit: 4,
  });
  assert.ok(ideas.length > 0);
  assert.ok(ideas.every((idea) => idea.ideaCategory === 'Evidence audit'));
});

void test('no evidence produces no fabricated generated idea', () => {
  const ideas = generateEditorialIdeas({ ...base, news: [], videos: [], context: [] });
  assert.equal(ideas.length, 0);
});

void test('manual ideas remain distinct from locally generated ideas', () => {
  const manual = createManualIdea('My own subject', 'A user-authored editorial concept.', '', 'Germany', ['en']);
  const generated = generateEditorialIdeas({ ...base, news, existingIdeas: [manual], limit: 2 });
  assert.ok(generated.every((idea) => idea.engineGenerated === true));
  assert.equal(manual.engineGenerated, undefined);
});

void test('automatic ingestion does not create duplicate ideas for unchanged evidence', () => {
  const first = generateEditorialIdeas({ ...base, news, videos, skipExistingEvidence: true, limit: 3 });
  const second = generateEditorialIdeas({ ...base, news, videos, existingIdeas: first, skipExistingEvidence: true, limit: 3 });
  assert.ok(first.length > 0);
  assert.equal(second.length, 0);
});


void test('idea generation uses title and description relevance without discarding missing view metrics', () => {
  const selected = selectIdeaGenerationVideos('JWST exoplanet atmosphere', [
    { id: 'dQw4w9WgXcQ', title: 'Unrelated gaming highlights', viewCount: 99000000 },
    { id: 'abc123XYZ_1', title: 'Daily unrelated roundup', description: 'JWST exoplanet atmosphere discovery details', viewCount: 199000000 },
    { id: '9bZkp7q19f0', title: 'JWST exoplanet atmosphere: latest findings', viewCount: 1200000 },
    { id: '3JZ_D3ELwOQ', title: 'Exoplanet atmosphere explained', viewCount: 8500000 },
    { id: 'L_jWHffIx5E', title: 'Exoplanet atmosphere discussion', viewCount: null },
  ]);
  assert.ok(selected.some((video) => video.id === 'abc123XYZ_1'), 'description-only relevant evidence is retained');
  assert.ok(selected.some((video) => video.id === 'L_jWHffIx5E'), 'missing view metrics do not erase relevant evidence');
  assert.ok(!selected.some((video) => video.id === 'dQw4w9WgXcQ'), 'unrelated records remain excluded from topic-specific idea generation');
});

void test('repeated engine-generated cards collapse in the Ideas list without merging personal ideas or stored data', () => {
  const first = generateEditorialIdeas({ ...base, news, videos, limit: 1 })[0];
  assert.ok(first);
  const duplicate = { ...first, id: 'duplicate-generated-id', createdAt: first.createdAt + 1 };
  const personal = createManualIdea(first.topic, 'A separate personal concept.', '', 'Germany', ['en']);
  const stored = [duplicate, first, personal];
  const visible = deduplicateDisplayIdeas(stored);
  assert.equal(visible.length, 2);
  assert.equal(visible[0].id, duplicate.id);
  assert.equal(visible[1].id, personal.id);
  assert.equal(stored.length, 3);
});

void test('video-only idea hypotheses can use relevant videos even when view statistics are unavailable', () => {
  const generated = generateEditorialIdeas({
    ...base, news: [],
    videos: [{ id: 'dQw4w9WgXcQ', title: 'Exoplanet atmosphere', viewCount: null }],
  });
  assert.ok(generated.length > 0);
  assert.ok(generated.every((idea) => idea.engineScore !== undefined));
  assert.ok(generated.every((idea) => idea.engineScoreReason));
});

const batchAnchors = Array.from({ length: 30 }, (_, index) =>
  'astroterm' + String.fromCharCode(97 + Math.floor(index / 26)) + String.fromCharCode(97 + (index % 26)),
);
const batchAnchorText = batchAnchors.join(' ');
const batchNews: SpaceNewsItem[] = Array.from({ length: 12 }, (_, index) => ({
  id: 'batch-news-' + index,
  sourceId: index % 2 ? 'esa-science' : 'nasa',
  sourceName: index % 2 ? 'ESA' : 'NASA',
  title: 'MOCK: JWST exoplanet atmosphere ' + batchAnchorText + ' mission observation record' + index,
  summary: 'MOCK: JWST exoplanet atmosphere ' + batchAnchorText + ' measurement calibration uncertainty instrument response analysis',
  url: 'https://' + (index % 2 ? 'esa.int' : 'nasa.gov') + '/mock-batch-' + index,
  publishedAt: new Date(Date.UTC(2026, 10, 15 - index)).toISOString(),
}));

const batchVideos = Array.from({ length: 6 }, (_, index) => ({
  id: ['dQw4w9WgXcQ', '9bZkp7q19f0', '3JZ_D3ELwOQ', 'L_jWHffIx5E', 'kJQP7kiw5Fk', 'fJ9rUzIMcZQ'][index],
  title: 'MOCK: JWST exoplanet atmosphere spectroscopy sample ' + index,
  description: 'MOCK: JWST exoplanet atmosphere ' + batchAnchorText + ' uncertainty measurement',
  channel: 'MOCK channel ' + index,
  publishedAt: new Date(Date.UTC(2026, 10, 10 - index)).toISOString(),
  viewCount: 1800000 - index * 25000,
}));

void test('one batch can return more than eight ideas without duplicate IDs or titles', () => {
  const generated = generateEditorialIdeas({ ...base, topic: 'JWST exoplanet atmosphere', news: batchNews, videos: batchVideos, limit: 25 });
  assert.ok(generated.length > 8, 'the controlled evidence set should yield more than the old eight-idea ceiling');
  assert.ok(generated.length <= 25);
  assert.equal(new Set(generated.map((idea) => idea.id)).size, generated.length);
  assert.equal(new Set(generated.map((idea) => idea.topic)).size, generated.length);
});

void test('repeated generation uses additional unique evidence anchors without recycling existing ideas', () => {
  const first = generateEditorialIdeas({
    ...base, news: batchNews, videos: batchVideos, limit: 25,
    evidenceKey: 'mock-five-batch-evidence-v1',
  });
  const second = generateEditorialIdeas({
    ...base, news: batchNews, videos: batchVideos, existingIdeas: first, limit: 25,
    evidenceKey: 'mock-five-batch-evidence-v1', now: base.now + 1000,
  });
  assert.ok(first.length > 8, 'the sample should still yield a useful set of independent ideas');
  assert.ok(first.length <= 25);
  assert.equal(new Set(first.map((idea) => idea.id)).size, first.length);
  assert.equal(new Set(first.map((idea) => idea.topic)).size, first.length);
  const firstTitles = new Set(first.map((idea) => idea.topic));
  assert.ok(second.every((idea) => !firstTitles.has(idea.topic)), 'later batches must not recycle an existing idea title');
  assert.ok(second.length <= 25);
});

void test('distinct evidence anchors in the same category are not incorrectly collapsed as semantic duplicates', () => {
  const generated = generateEditorialIdeas({
    ...base,
    news: batchNews,
    videos: [],
    category: 'Explainer',
    limit: 20,
  });
  assert.ok(generated.length > 1);
  assert.ok(generated.every((idea) => idea.ideaCategory === 'Explainer'));
  assert.equal(new Set(generated.map((idea) => idea.topic)).size, generated.length);
});

void test('video-only idea generation derives angles from the highest-ranked relevant video concepts', () => {
  const generated = generateEditorialIdeas({
    ...base, news: [],
    videos: [{ id: 'dQw4w9WgXcQ', title: 'JWST exoplanet atmosphere methane spectroscopy', description: 'Detailed methane signatures and spectroscopic measurement limits.', viewCount: 2400000, publishedAt: '2026-11-15T12:00:00Z' }],
    limit: 8,
  });
  assert.ok(generated.length > 0);
  assert.ok(generated.some((idea) => /methane|spectroscopy/i.test(idea.topic)));
  assert.ok(generated.every((idea) => idea.videoIds.includes('dQw4w9WgXcQ')));
  assert.doesNotMatch(JSON.stringify(generated), /JWST exoplanet atmosphere methane spectroscopy/);
});

void test('semantic aliases are retained by the shared relevance matcher', () => {
  const selected = selectIdeaGenerationVideos('JWST', [
    { id: 'abcdefghijk', title: 'James Webb Space Telescope' },
    { id: 'dQw4w9WgXcQ', title: 'Unrelated gaming highlights' },
  ]);
  assert.deepEqual(selected.map((video) => video.id), ['abcdefghijk']);
});

void test('idea evidence scope reports all received records separately from detailed topic matches', () => {
  const unrelatedNews: SpaceNewsItem = {
    id: 'unrelated-news',
    sourceId: 'sky-telescope',
    sourceName: 'Sky & Telescope',
    title: 'MOCK: Lunar observation schedule published',
    summary: 'MOCK: A separate lunar observing guide with no exoplanet or spectroscopy detail.',
    url: 'https://skyandtelescope.org/mock-lunar-schedule',
    publishedAt: '2026-11-10T12:00:00Z',
  };
  const generated = generateEditorialIdeas({
    ...base,
    news: [...news, unrelatedNews],
    videos,
    limit: 1,
  });
  assert.ok(generated.length > 0);
  assert.match(generated[0].concept, /3 publisher item\(s\) received; 2 topic-matched/);
  assert.match(generated[0].concept, /2 YouTube record\(s\) received; 2 relevant sample\(s\) selected for detailed analysis/);
});
