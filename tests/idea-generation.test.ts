import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateDisplayIdeas, filterVideosToSelectedResearchPeriod, generateEditorialIdeas, selectIdeaGenerationVideos } from '../lib/idea-generation';
import { createManualIdea } from '../lib/engine';
import type { SpaceNewsItem } from '../lib/space';
import { defaults } from '../lib/types';
import { validateLocal } from '../lib/validation';
import { tokenizeResearchText } from '../lib/intelligence';

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

void test('idea engine receives the complete user-selected YouTube period, including all-time history', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const records = [
    { id: 'recent', publishedAt: '2026-11-10T12:00:00Z' },
    { id: 'older', publishedAt: '2026-08-25T12:00:00Z' },
    { id: 'too-old', publishedAt: '2026-08-20T12:00:00Z' },
    { id: 'future', publishedAt: '2026-11-21T12:00:00Z' },
    { id: 'invalid', publishedAt: 'not-a-date' },
  ];
  assert.deepEqual(filterVideosToSelectedResearchPeriod(records, 90, now).map((item) => item.id), ['recent', 'older']);
  assert.deepEqual(filterVideosToSelectedResearchPeriod(records, 0, now).map((item) => item.id), ['recent', 'older', 'too-old']);
});

void test('publisher idea generation ignores YouTube-only input', () => {
  const generated = generateEditorialIdeas({
    ...base,
    news: [],
    videos: [{
      id: '9bZkp7q19f0',
      title: 'JWST exoplanet atmosphere: measurement limits',
      description: 'An overview of atmospheric measurement uncertainty.',
      channel: 'MOCK Single Channel',
      publishedAt: '2026-11-15T12:00:00Z',
      viewCount: 1200,
    }],
    limit: 8,
  });
  assert.deepEqual(generated, []);
});

void test('idea generation works with official news only and links its original source',() => {
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

void test('YouTube API samples remain separate from publisher editorial ideas', () => {
  const ideas = generateEditorialIdeas({ ...base, news: [], videos, reportId: 'report-1', limit: 4 });
  assert.deepEqual(ideas, []);
});

void test('the publisher editorial engine does not create cross-source YouTube ideas', () => {
  const ideas = generateEditorialIdeas({
    ...base,
    news,
    videos,
    category: 'Cross-source',
    limit: 3,
  });
  assert.deepEqual(ideas, []);
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

void test('topic-only fallback creates explicitly low-confidence exploratory ideas without inventing sources', () => {
  const ideas = generateEditorialIdeas({
    ...base,
    news: [],
    videos: [],
    context: [{
      title: base.topic,
      summary: 'User-selected topic context only; not an independent source or claim verification.',
      sourceName: 'User-provided topic',
    }],
    limit: 4,
  });
  assert.ok(ideas.length > 0);
  assert.ok(ideas.every((idea) => idea.assessment === 'Uncertain'));
  assert.ok(ideas.every((idea) => !idea.sourceUrl && !idea.sourceName));
  assert.ok(ideas.every((idea) => idea.concept.includes('user-provided topic only; no independent source evidence is available')));
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


void test('YouTube sample selection is independent of publisher editorial scoring', () => {
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

void test('missing publisher evidence keeps YouTube-only ideas unavailable', () => {
  const generated = generateEditorialIdeas({
    ...base,
    news: [],
    videos: [{ id: 'dQw4w9WgXcQ', title: 'Exoplanet atmosphere', viewCount: null }],
  });
  assert.deepEqual(generated, []);
});

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

void test('YouTube-only titles cannot become generated editorial ideas', () => {
  const generated = generateEditorialIdeas({
    ...base,
    news: [],
    videos: [{
      id: 'dQw4w9WgXcQ',
      title: 'JWST exoplanet atmosphere methane spectroscopy',
      description: 'Detailed methane signatures and spectroscopic measurement limits.',
      viewCount: 2400000,
      publishedAt: '2026-11-15T12:00:00Z',
    }],
    limit: 8,
  });
  assert.deepEqual(generated, []);
});

void test('semantic aliases are retained by the shared relevance matcher', () => {
  const selected = selectIdeaGenerationVideos('JWST', [
    { id: 'abcdefghijk', title: 'James Webb Space Telescope' },
    { id: 'dQw4w9WgXcQ', title: 'Unrelated gaming highlights' },
  ]);
  assert.deepEqual(selected.map((video) => video.id), ['abcdefghijk']);
});

void test('publisher idea evidence scope excludes the separate YouTube sample', () => {
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
    reportId: 'report-from-separate-youtube-sample',
    limit: 1,
  });
  assert.ok(generated.length > 0);
  assert.ok(generated[0].concept.includes('3 publisher item(s) received; 2 topic-matched'));
  assert.doesNotMatch(generated[0].concept, /YouTube record\(s\) received/);
  assert.equal(generated[0].videoIds.length, 0);
  assert.equal(generated[0].reportId, undefined);
});

void test('the local engine evaluates the complete retained YouTube sample without a fixed 100-record cutoff', () => {
  const records = Array.from({ length: 125 }, (_, index) => ({
    id: String(index).padStart(11, '0'),
    title: 'JWST exoplanet atmosphere methane spectroscopy sample ' + index,
    description: 'Measurement uncertainty and methane signatures.',
    channel: 'Science channel ' + (index % 5),
    publishedAt: '2026-11-15T12:00:00Z',
    viewCount: index + 1,
  }));
  const selected = selectIdeaGenerationVideos(base.topic, records);
  assert.equal(selected.length, records.length);
  assert.equal(new Set(selected.map((video) => video.id)).size, records.length);
});

void test('saved publisher memory contributes historical context without being mistaken for current news', () => {
  const priorMemory = {
    topic: base.topic,
    updatedAt: Date.parse('2026-11-16T12:00:00Z'),
    sources: [{
      sourceId: 'nasa',
      sourceName: 'NASA',
      title: 'MOCK: JWST methane spectroscopy reveals atmospheric measurement limits',
      sourceUrl: 'https://science.nasa.gov/mock-historical-methane',
      publishedAt: '2026-10-15T12:00:00Z',
    }],
    keyFindings: ['MOCK: Earlier measurements leave uncertainty about methane abundance.'],
    unresolvedQuestions: ['Which calibration limits remain unresolved?'],
    contradictions: [],
    confidence: 'moderate' as const,
    history: [{
      capturedAt: Date.parse('2026-10-20T12:00:00Z'),
      sourceFingerprint: 'historical-fingerprint',
      sourceCount: 2,
      newSourceCount: 1,
      updatedSourceCount: 0,
      keyFindings: ['MOCK: Earlier JWST spectroscopy measurements had calibration uncertainty.'],
      unresolvedQuestions: ['How did later methane measurements address calibration uncertainty?'],
      contradictions: [],
      confidence: 'low' as const,
      changes: ['A later source added a different calibration interpretation.'],
    }],
  };
  const generated = generateEditorialIdeas({
    ...base,
    news: [],
    videos: [],
    priorMemory,
    limit: 4,
  });
  assert.ok(generated.length > 0);
  assert.ok(generated.every((idea) => idea.sourceUrl === priorMemory.sources[0].sourceUrl));
  assert.match(generated[0].concept, /historical publisher record\(s\)/);
  assert.match(generated[0].concept, /saved findings, open questions and discrepancies/);
  assert.match(generated[0].concept, /1 historical research snapshots reviewed/);
  assert.match(generated[0].concept, /Evidence base: saved historical publisher records and prior research notes/);
  assert.doesNotMatch(generated[0].concept, /Wikimedia context/);
  assert.match(generated[0].concept, /Confidence: low;/, 'old memory alone must not inflate current evidence confidence');
});


void test('Wikimedia and saved research notes are included in the prepared editorial evidence score', () => {
  const generated = generateEditorialIdeas({
    ...base,
    news,
    videos,
    context: [{
      title: 'MOCK: JWST methane spectroscopy and atmospheric calibration',
      summary: 'MOCK: Wikimedia monthly article pageviews are a separate public-interest context, not YouTube demand.',
      sourceName: 'Wikimedia Pageviews',
    }],
    priorMemory: {
      topic: base.topic,
      updatedAt: base.now,
      sources: [],
      keyFindings: ['MOCK: Earlier methane spectroscopy measurements leave calibration uncertainty.'],
      unresolvedQuestions: ['Which calibration uncertainty remains unresolved?'],
      contradictions: [],
      confidence: 'moderate',
      history: [],
    },
    limit: 25,
  });
  assert.ok(generated.length > 0);
  assert.ok(generated.some((idea) => (idea.engineScoreReason ?? '').includes('supporting context record(s) matched')));;
  assert.ok(generated.every((idea) => idea.concept.includes('context source(s)')));
});

void test('saved positive and negative topic feedback adjusts matching editorial priorities transparently', () => {
  const neutral = generateEditorialIdeas({ ...base, news, videos, limit: 25 });
  assert.ok(neutral.length);
  const target = neutral[0];
  const anchor = target.concept.match(/understand [“"]([^”"]+)[”"]/i)?.[1] ?? '';
  assert.ok(anchor, 'the generated idea should expose its editorial anchor');
  const anchorTokens = tokenizeResearchText(anchor);
  const unrelatedTokens = ['pulsar', 'quasar', 'nebula', 'orbit', 'calibration', 'plasma', 'gravity', 'mission'];
  const extras = unrelatedTokens.filter((token) => !anchorTokens.includes(token)).slice(0, anchorTokens.length);
  assert.equal(extras.length, anchorTokens.length);
  // Exactly half the saved phrase overlaps this anchor: a deliberate partial-match case.
  const savedPhrase = [...anchorTokens, ...extras].join(' ');
  const preferred = generateEditorialIdeas({
    ...base, news, videos,
    feedback: { positiveTopics: [savedPhrase], negativeTopics: [] },
    limit: 25,
  });
  const discouraged = generateEditorialIdeas({
    ...base, news, videos,
    feedback: { positiveTopics: [], negativeTopics: [savedPhrase] },
    limit: 25,
  });
  const anchorOf = (idea: typeof target) => idea.concept.match(/understand [“"]([^”"]+)[”"]/i)?.[1] ?? '';
  const preferredMatch = preferred.find((idea) => anchorOf(idea) === anchor);
  const discouragedMatch = discouraged.find((idea) => anchorOf(idea) === anchor);
  assert.ok(preferredMatch, 'matching saved positive feedback should retain the target idea');
  assert.ok((preferredMatch.engineScore ?? 0) >= (target.engineScore ?? 0));
  assert.match(preferredMatch.engineScoreReason ?? '', /positive topics/);
  // A sufficiently strong negative preference may move the target outside the
  // top-25 shortlist; if it remains visible, its score and reason must reflect it.
  assert.ok(
    !discouragedMatch || (discouragedMatch.engineScore ?? 0) < (target.engineScore ?? 0),
    'matching saved negative feedback must lower priority or remove the idea from the shortlist',
  );
  if (discouragedMatch) {
    assert.match(discouragedMatch.engineScoreReason ?? '', /previously rejected/);
  }
  assert.ok(discouraged.length > 0);
});

void test('raw lifetime view counts cannot change the selected related-video order', () => {
  const sample = [
    { id: 'abcdefghijk', title: 'JWST exoplanet atmosphere methane spectroscopy', description: 'Methane measurement uncertainty.', viewCount: 100 },
    { id: 'lmnopqrstuv', title: 'JWST exoplanet atmosphere spectroscopy', description: 'Atmosphere calibration limits.', viewCount: 10 },
  ];
  const reversedViews = sample.map((video, index) => ({ ...video, viewCount: index === 0 ? 1 : 100000000 }));
  assert.deepEqual(
    selectIdeaGenerationVideos(base.topic, sample).map((video) => video.id),
    selectIdeaGenerationVideos(base.topic, reversedViews).map((video) => video.id),
  );
});
