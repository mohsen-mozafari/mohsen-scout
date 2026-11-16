import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateEditorialIdeas } from '../lib/idea-generation';
import { createManualIdea } from '../lib/engine';
import type { SpaceNewsItem } from '../lib/space';

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
