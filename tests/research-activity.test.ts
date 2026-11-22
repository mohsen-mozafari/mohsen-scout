import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendResearchActivity,
  buildResearchActivityResults,
  MAX_RESEARCH_ACTIVITY,
  updateResearchActivityFeedback,
} from '../lib/research-activity';

void test('research activity canonicalizes and deduplicates source URLs, including tracking variants', () => {
  const results = buildResearchActivityResults('solar storm impact', [
    {
      id: 'a',
      title: 'Solar storm impact on power grids',
      summary: 'A technical account of solar storms and power infrastructure.',
      sourceName: 'Energy Research',
      url: 'https://example.org/report?utm_source=feed',
      includedInAnalysis: true,
      decisionReason: 'Passed to internal evidence analysis.',
    },
    {
      id: 'b',
      title: 'Solar storm impact on power grids',
      summary: 'Duplicate syndicated report.',
      sourceName: 'Mirror',
      url: 'https://example.org/report?utm_medium=rss',
      includedInAnalysis: true,
      decisionReason: 'Duplicate URL.',
    },
    {
      id: 'c',
      title: 'Gardening for beginners',
      summary: 'A general gardening article.',
      sourceName: 'Garden Daily',
      url: 'https://garden.example/articles/start',
      includedInAnalysis: false,
      decisionReason: 'Not passed: unrelated to the research topic.',
    },
    {
      id: 'youtube',
      title: 'Solar storm impact',
      summary: 'Raw YouTube metadata must stay in the expiring YouTube domain.',
      sourceName: 'YouTube',
      url: 'https://www.youtube.com/watch?v=abc123',
      includedInAnalysis: false,
      decisionReason: 'YouTube details are linked from the temporary report only.',
    },
  ]);
  assert.equal(results.length, 2);
  assert.equal(results[0].url, 'https://example.org/report');
  assert.ok(results[0].relevanceScore > results[1].relevanceScore);
  assert.equal(results.some((item) => item.url.includes('youtube.com')), false);
});

void test('research activity feedback updates one result without changing its evidence', () => {
  const events = [{
    id: 'run-1',
    engine: 'Firecrawl Search' as const,
    query: 'solar storm impact',
    topic: 'solar storm impact',
    niche: 'solar storm impact',
    startedAt: 100,
    status: 'success' as const,
    resultCount: 1,
    analyzedCount: 1,
    results: [{
      id: 'source-1',
      title: 'Solar storm impact',
      sourceName: 'Example',
      url: 'https://example.org/report',
      summary: 'Source summary',
      relevanceScore: 90,
      relevanceBand: 'high' as const,
      includedInAnalysis: true,
      decisionReason: 'Passed to analysis.',
    }],
    warnings: [],
  }];
  const next = updateResearchActivityFeedback(events, 'run-1', 'source-1', 'useful');
  assert.equal(next[0].results[0].feedback, 'useful');
  assert.equal(next[0].results[0].summary, 'Source summary');
  assert.equal(events[0].results[0].feedback, undefined);
  assert.equal(updateResearchActivityFeedback(events, 'missing', 'source-1', 'useful'), events);
});

void test('research activity history remains newest-first and bounded', () => {
  const event = (id: string, startedAt: number) => ({
    id,
    engine: 'Internal Engine' as const,
    query: 'topic',
    topic: 'topic',
    niche: 'topic',
    startedAt,
    status: 'success' as const,
    resultCount: 0,
    analyzedCount: 0,
    results: [],
    warnings: [],
  });
  const initial = Array.from({ length: MAX_RESEARCH_ACTIVITY }, (_, index) => event('old-' + index, index));
  const next = appendResearchActivity(initial, event('new', MAX_RESEARCH_ACTIVITY + 1));
  assert.equal(next.length, MAX_RESEARCH_ACTIVITY);
  assert.equal(next[0].id, 'new');
  assert.equal(next.at(-1)?.id, 'old-' + (MAX_RESEARCH_ACTIVITY - 2));
});
