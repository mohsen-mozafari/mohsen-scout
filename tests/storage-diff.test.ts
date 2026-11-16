import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../lib/types';
import { changedLocalDataEntries, LOCAL_DATA_KEYS } from '../lib/storage-diff';

void test('saving an AI opinion writes only the opinion domain, not large news/video/report tables', () => {
  const previous = defaults();
  previous.feedRegistry = [{ sourceId: 'nasa', configuredUrl: 'https://nasa.gov/rss', endpoint: 'https://nasa.gov/rss', format: 'rss', status: 'healthy', lastCheckedAt: 1, lastSuccessAt: 1, failureCount: 0, retryAt: 0, lastError: '', cachedItems: [] }];
  previous.videos = [{ id: 'abcdefghijk', title: 'Sample', description: '', channel: '', thumbnail: '', publishedAt: '', fetchedAt: 1, query: '' }];
  previous.reports = [{ id: 'report', input: { topic: 'topic', region: 'Germany', languages: ['en'], days: 7, duration: 'any', category: '', maxResults: 5 }, videos: [], queries: [], warnings: [], createdAt: 1, analyzed: true }];
  const next = { ...previous, opinions: [{ id: 'opinion', ideaId: 'engine:test', text: 'second opinion', model: 'free-model', createdAt: 2 }] };
  assert.deepEqual(changedLocalDataEntries(next, previous).map((entry) => entry.key), ['opinions']);
});

void test('unchanged local data does not trigger a SQLite write', () => {
  const data = defaults();
  assert.deepEqual(changedLocalDataEntries(data, data), []);
});

void test('full restore/write without a previous snapshot includes all persisted domains', () => {
  const data = defaults();
  assert.deepEqual(changedLocalDataEntries(data).map((entry) => entry.key), LOCAL_DATA_KEYS);
});
