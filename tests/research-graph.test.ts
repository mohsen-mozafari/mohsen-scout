import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInternalResearch } from '../lib/engine';
import { buildResearchGraphModel } from '../lib/research-graph';
import type { SpaceNewsItem, WikiSignal } from '../lib/space';
import type { YouTubeSampleVideo } from '../lib/api';

const news: SpaceNewsItem[] = [{
  id: 'news-1',
  sourceId: 'nasa',
  sourceName: 'NASA',
  title: 'MOCK: NASA James Webb Space Telescope observes an exoplanet atmosphere',
  summary: 'MOCK: A publisher summary about a measured atmospheric observation.',
  url: 'https://science.nasa.gov/mock-story',
  publishedAt: '2026-11-15T12:00:00Z',
}];

const wiki: WikiSignal = {
  provider: 'wikimedia-pageviews',
  language: 'en',
  articleTitle: 'MOCK: James Webb Space Telescope',
  articleUrl: 'https://en.wikipedia.org/wiki/James_Webb_Space_Telescope',
  apiUrl: 'https://wikimedia.org/api/rest_v1/mock-pageviews',
  summary: 'MOCK: Encyclopedia context, not a primary scientific source.',
  monthlyViews: [
    { month: '2026-08', views: 100 },
    { month: '2026-09', views: 120 },
    { month: '2026-10', views: 140 },
    { month: '2026-11', views: 160 },
  ],
};

const videos: YouTubeSampleVideo[] = [{
  id: 'mock-video-1',
  title: 'MOCK: Webb exoplanet observation explained',
  description: 'MOCK: Video description retained as a temporary YouTube sample.',
  channel: 'MOCK Astronomy Channel',
  channelId: 'UCmock-channel',
  publishedAt: '2026-11-14T12:00:00Z',
  thumbnailUrl: 'https://example.com/mock-thumbnail.jpg',
  viewCount: 1200,
  likeCount: 36,
  commentCount: 12,
  channelSubscriberCount: 5000,
  channelVideoCount: 80,
  url: 'https://www.youtube.com/watch?v=mock-video-1',
}];

void test('research graph preserves original source, video and monthly pageview details', () => {
  const analysis = buildInternalResearch({
    topic: 'JWST exoplanet atmosphere',
    news: news.map((item) => ({
      title: item.title, summary: item.summary, sourceName: item.sourceName,
      sourceUrl: item.url, publishedAt: item.publishedAt, sourceId: item.sourceId,
    })),
    wiki, videos, language: 'en',
  });
  const generatedIdeas = [{
    id: 'idea-1',
    topic: 'How methane signals are interpreted',
    concept: 'Explain the evidence trail and its limitations.',
    videoIds: ['mock-video-1'],
    sourceUrl: news[0].url,
    sourceName: 'NASA',
    ideaCategory: 'Explainer',
  }];
  const model = buildResearchGraphModel({
    topic: 'JWST exoplanet atmosphere', news, wiki, videos, analysis, language: 'en', generatedIdeas,
  });
  const sourceGroup = model.groups.find((group) => group.id === 'sources');
  const videoGroup = model.groups.find((group) => group.id === 'youtube');
  const contextGroup = model.groups.find((group) => group.id === 'context');
  const entityGroup = model.groups.find((group) => group.id === 'entities');

  assert.equal(sourceGroup?.items[0].title, news[0].title);
  assert.equal(sourceGroup?.items[0].url, news[0].url);
  assert.match(sourceGroup?.items[0].detail ?? '', /measured atmospheric observation/);
  assert.match(videoGroup?.items[0].detail ?? '', /1,200/);
  assert.match(videoGroup?.items[0].detail ?? '', /5,000/);
  assert.match(contextGroup?.items.find((item) => item.id === 'trend-observations')?.detail ?? '', /2026-11 — 160/);
  assert.ok(model.groups.find((group) => group.id === 'evidence')?.items.length);
  assert.ok(entityGroup?.items.some((item) => item.title === 'NASA'));
  assert.ok(entityGroup?.items.some((item) => item.title === 'JWST'));
  assert.ok(entityGroup?.items.every((item) => item.detail.includes('does not establish causation')));
  assert.ok(model.groups.find((group) => group.id === 'findings')?.items.length);
  assert.ok(model.groups.find((group) => group.id === 'ideas')?.items.some((item) => item.id === 'idea-idea-1'));
  assert.ok(model.edges.some((edge) => edge.source === 'source-news-1' && edge.target === 'publisher:nasa:NASA' && edge.relation === 'published by'));
  assert.ok(model.edges.some((edge) => edge.source === 'source-news-1' && edge.target === 'entity-entity:nasa' && edge.relation === 'mentions entity'));
  assert.ok(model.edges.some((edge) =>
    ((edge.source === 'entity-entity:nasa' && edge.target === 'entity-entity:jwst') ||
      (edge.source === 'entity-entity:jwst' && edge.target === 'entity-entity:nasa')) &&
    edge.relation.includes('co-mentioned in 1')
  ));
  assert.ok(model.edges.some((edge) => edge.source === 'idea-idea-1' && edge.target === 'source-news-1' && edge.relation === 'generated from official source'));
  assert.ok(model.edges.some((edge) => edge.source === 'idea-idea-1' && edge.target === 'video-mock-video-1' && edge.relation === 'references temporary YouTube sample'));
  assert.ok(model.edges.some((edge) => edge.relation.includes('word overlap only')));
  assert.equal(model.summary, analysis.summary);
});

void test('research graph does not invent empty source, video or public-interest nodes', () => {
  const analysis = buildInternalResearch({ topic: 'Unverified topic', language: 'en' });
  const model = buildResearchGraphModel({
    topic: 'Unverified topic', news: [], videos: [], analysis, language: 'en',
  });
  assert.equal(model.groups.some((group) => group.id === 'sources'), false);
  assert.equal(model.groups.some((group) => group.id === 'youtube'), false);
  assert.equal(model.groups.some((group) => group.id === 'context'), false);
  assert.equal(model.groups.some((group) => group.id === 'entities'), false);
  assert.equal(model.groups.some((group) => group.id === 'ideas'), false);
  assert.ok(model.groups.some((group) => group.id === 'evidence'));
  assert.ok(model.groups.some((group) => group.id === 'findings'));
  assert.equal(model.nodes.filter((node) => node.type === 'news').length, 0);
  assert.equal(model.edges.some((edge) => edge.relation.includes('word overlap')), false);
});

void test('research graph retains every source node while bounding cross-source overlap edges', () => {
  const analysis = buildInternalResearch({
    topic: 'JWST exoplanet atmosphere',
    news: news.map((item) => ({
      title: item.title, summary: item.summary, sourceName: item.sourceName,
      sourceUrl: item.url, publishedAt: item.publishedAt, sourceId: item.sourceId,
    })),
    wiki, videos, language: 'en',
  });
  const manyNews = Array.from({ length: 90 }, (_, index) => ({
    ...news[0],
    id: 'news-' + index,
    title: 'MOCK: NASA JWST exoplanet observation ' + index,
    url: 'https://science.nasa.gov/mock-story-' + index,
  }));
  const manyVideos = Array.from({ length: 90 }, (_, index) => ({
    ...videos[0],
    id: 'mock-video-' + index,
    title: 'MOCK: JWST exoplanet atmosphere video ' + index,
    url: 'https://www.youtube.com/watch?v=mockvideo' + String(index).padStart(4, '0'),
  }));
  const model = buildResearchGraphModel({
    topic: 'JWST exoplanet atmosphere', news: manyNews, videos: manyVideos, analysis, language: 'en',
  });
  assert.equal(model.groups.find((group) => group.id === 'sources')?.items.length, manyNews.length);
  assert.equal(model.groups.find((group) => group.id === 'youtube')?.items.length, manyVideos.length);
  assert.ok(model.edges.length < 5000, 'cross-source edge growth must stay bounded');
});
