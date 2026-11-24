import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diffRecordCollection,
  recordExpiresAt,
  NO_EXPIRY,
  recordIdFor,
  recordTable,
  RECORD_DOMAINS,
} from '../lib/storage-records';
import { defaults } from '../lib/types';
import { validateLocal } from '../lib/validation';

void test('record collections upsert only new or changed identities and delete removed records', () => {
  const unchanged = { id: 'idea-1', topic: 'Mars', createdAt: 1 };
  const changed = { id: 'idea-2', topic: 'Changed idea', createdAt: 2 };
  const added = { id: 'idea-3', topic: 'New idea', createdAt: 3 };
  const delta = diffRecordCollection('ideas', [unchanged, changed, added], [
    unchanged,
    { id: 'idea-2', topic: 'Old idea', createdAt: 2 },
    { id: 'idea-4', topic: 'Removed', createdAt: 4 },
  ]);
  assert.deepEqual(delta.upserts.map((entry) => entry.id), ['idea-2', 'idea-3']);
  assert.deepEqual(delta.deleteIds, ['idea-4']);
  assert.equal(delta.replaceAll, false);
});

void test('first record write replaces only its own domain and supports empty collections', () => {
  const delta = diffRecordCollection('notes', [], undefined);
  assert.equal(delta.replaceAll, true);
  assert.deepEqual(delta.upserts, []);
  assert.deepEqual(delta.deleteIds, []);
  assert.deepEqual(RECORD_DOMAINS, ['ideas', 'links', 'notes', 'opinions', 'researchMemory', 'researchActivity', 'reports', 'videos', 'youtubeSnapshots']);
});

void test('research memory uses a stable normalized topic identity', () => {
  assert.equal(recordIdFor('researchMemory', { topic: '  JWST   Exoplanets ' }), 'topic:jwst exoplanets');
  assert.equal(recordTable('researchMemory'), 'personal_records');
  assert.equal(recordTable('videos'), 'youtube_records');
  assert.throws(() => recordIdFor('researchMemory', { topic: ' ' }), /identifier/);
});

void test('YouTube reports, videos and snapshots receive the indefinite-retention sentinel', () => {
  const fetchedAt = 1000;
  assert.equal(recordExpiresAt('videos', { fetchedAt }), NO_EXPIRY);
  assert.equal(recordExpiresAt('youtubeSnapshots', { capturedAt: fetchedAt }), NO_EXPIRY);
  assert.equal(recordExpiresAt('reports', { createdAt: fetchedAt }), NO_EXPIRY);
  assert.equal(recordExpiresAt('ideas', { createdAt: fetchedAt }), null);
});

void test('local validation preserves more than ten thousand YouTube snapshots', () => {
  const data = defaults();
  data.youtubeSnapshots = Array.from({ length: 10005 }, (_, index) => ({
    id: 'snapshot-' + index,
    videoId: 'video-' + index,
    channel: 'MOCK channel',
    capturedAt: 1795000000000 + index,
    viewCount: 1000 + index,
    likeCount: null,
    commentCount: null,
  }));
  const validated = validateLocal(data);
  assert.equal(validated.youtubeSnapshots.length, 10005);
});
