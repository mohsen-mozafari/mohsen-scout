import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchChartData } from '../lib/research-chart';

const now = Date.parse('2026-11-16T12:00:00.000Z');
void test('research overview chart aggregates dated news, sampled videos, ideas and external reviews', () => {
  const result = buildResearchChartData({
    news: [
      { id: 'n1', url: 'https://example.org/a', publishedAt: '2026-11-16T09:00:00Z' },
      { id: 'n2', url: 'https://example.org/a', publishedAt: '2026-11-16T09:10:00Z' },
      { id: 'n3', url: 'https://example.org/b', publishedAt: '2026-11-15T09:00:00Z' },
      { id: 'undated', url: 'https://example.org/c', publishedAt: null },
    ],
    reports: [{ createdAt: now, videos: [{ id: 'v1' }, { id: 'v2' }, { id: 'v2' }] }],
    ideas: [{ createdAt: now }, { createdAt: now }],
    opinions: [{ createdAt: now }],
  }, now, 7);
  assert.equal(result.points.length, 7);
  assert.deepEqual(result.totals, { news: 2, youtube: 2, ideas: 2, aiReviews: 1 });
  assert.equal(result.points.at(-1)?.news, 1);
  assert.equal(result.points.at(-2)?.news, 1);
});

void test('chart ignores undated and out-of-window records and bounds the requested range', () => {
  const result = buildResearchChartData({
    news: [{ id: 'old', url: 'https://example.org/old', publishedAt: '2026-01-01T00:00:00Z' }],
    reports: [{ createdAt: Date.parse('2026-01-01T00:00:00Z'), videos: [{ id: 'v1' }] }],
    ideas: [],
    opinions: [],
  }, now, 100);
  assert.equal(result.points.length, 30);
  assert.deepEqual(result.totals, { news: 0, youtube: 0, ideas: 0, aiReviews: 0 });
});
