import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diffRecordCollection,
  recordExpiresAt,
  recordIdFor,
  recordTable,
  RECORD_DOMAINS,
} from '../lib/storage-records';
import { RETENTION_MS } from '../lib/types';

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
  assert.deepEqual(RECORD_DOMAINS, ['ideas', 'links', 'notes', 'opinions', 'researchMemory', 'researchActivity', 'reports', 'videos']);
});

void test('research memory uses a stable normalized topic identity', () => {
  assert.equal(recordIdFor('researchMemory', { topic: '  JWST   Exoplanets ' }), 'topic:jwst exoplanets');
  assert.equal(recordTable('researchMemory'), 'personal_records');
  assert.equal(recordTable('videos'), 'youtube_records');
  assert.throws(() => recordIdFor('researchMemory', { topic: ' ' }), /identifier/);
});

void test('only YouTube API metadata records receive the 29-day expiry timestamp', () => {
  const fetchedAt = 1000;
  assert.equal(recordExpiresAt('videos', { fetchedAt }), fetchedAt + RETENTION_MS);
  assert.equal(recordExpiresAt('reports', { createdAt: fetchedAt }), fetchedAt + RETENTION_MS);
  assert.equal(recordExpiresAt('ideas', { createdAt: fetchedAt }), null);
});
