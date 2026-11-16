import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../lib/types';
import { buildResearchOverview } from '../lib/research-overview';
void test('overview aggregates local records and deduplicates news IDs', () => {
  const data = defaults();
  data.feedRegistry = [
    { sourceId: 'nasa', configuredUrl: 'https://nasa.gov/rss', endpoint: 'https://nasa.gov/rss', format: 'rss', status: 'healthy', lastCheckedAt: 1000, lastSuccessAt: 1000, failureCount: 0, retryAt: 0, lastError: '', cachedItems: [{ id: 'story-1', sourceId: 'nasa', sourceName: 'NASA', title: 'A', summary: '', url: 'https://nasa.gov/a', publishedAt: '2026-11-16T10:00:00.000Z' }] },
    { sourceId: 'jpl', configuredUrl: 'https://jpl.nasa.gov/rss', endpoint: 'https://jpl.nasa.gov/rss', format: 'rss', status: 'healthy', lastCheckedAt: 1000, lastSuccessAt: 1000, failureCount: 0, retryAt: 0, lastError: '', cachedItems: [{ id: 'story-1', sourceId: 'jpl', sourceName: 'JPL', title: 'Duplicate', summary: '', url: 'https://jpl.nasa.gov/a', publishedAt: '2026-11-16T10:00:00.000Z' }, { id: 'story-2', sourceId: 'jpl', sourceName: 'JPL', title: 'B', summary: '', url: 'https://jpl.nasa.gov/b', publishedAt: '2026-11-15T10:00:00.000Z' }] },
  ];
  data.videos = [{ id: 'video-1', title: 'Video', description: '', channel: '', thumbnail: '', publishedAt: '2026-11-16T10:00:00.000Z', fetchedAt: Date.parse('2026-11-16T11:00:00.000Z'), query: '' }];
  data.reports = [{ id: 'report-1', input: { topic: 'Test', region: 'Germany', languages: ['en'], days: 7, duration: 'any', category: '', maxResults: 5 }, videos: [], queries: [], warnings: [], createdAt: Date.parse('2026-11-16T12:00:00.000Z'), analyzed: true }];
  data.ideas = [{ id: 'idea-1', topic: 'Idea', concept: '', note: '', status: 'New Discoveries', decision: '', videoIds: [], createdAt: Date.parse('2026-11-16T13:00:00.000Z'), archived: false, assessment: 'Worth Exploring', region: 'Germany', languages: ['en'] }];
  data.researchMemory = [{ topic: 'Test', updatedAt: 1, sources: [], keyFindings: [], unresolvedQuestions: [], contradictions: [], confidence: 'low' }];
  data.opinions = [{ id: 'ai-1', ideaId: 'engine:test', text: 'review', model: 'free-model', createdAt: Date.parse('2026-11-16T14:00:00.000Z') }];
  const overview = buildResearchOverview(data, Date.parse('2026-11-16T15:00:00.000Z'));
  assert.deepEqual(overview.totals, { news: 2, videos: 1, reports: 1, ideas: 1, links: 0, notes: 0, memory: 1, ai: 1 });
  assert.equal(overview.activity[6].news, 1); assert.equal(overview.activity[5].news, 1);
  assert.equal(overview.activity[6].videos, 1); assert.equal(overview.activity[6].reports, 1);
  assert.equal(overview.activity[6].ideas, 1); assert.equal(overview.activity[6].ai, 1);
  assert.equal(overview.hasActivity, true);
});
void test('undated cached news is counted in inventory but not assigned a fabricated activity date', () => {
  const data = defaults();
  data.feedRegistry = [{ sourceId: 'nasa', configuredUrl: 'https://nasa.gov/rss', endpoint: 'https://nasa.gov/rss', format: 'rss', status: 'healthy', lastCheckedAt: 1000, lastSuccessAt: 1000, failureCount: 0, retryAt: 0, lastError: '', cachedItems: [{ id: 'undated', sourceId: 'nasa', sourceName: 'NASA', title: 'Undated', summary: '', url: 'https://nasa.gov/story', publishedAt: null }] }];
  const overview = buildResearchOverview(data, Date.parse('2026-11-16T15:00:00.000Z'));
  assert.equal(overview.totals.news, 1); assert.equal(overview.hasActivity, false);
});
