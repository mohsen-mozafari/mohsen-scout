import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diffRecordCollection,
  getRecordDiffIndexMetrics,
  chunkRecordWriteBatches,
  recordExpiresAt,
  recordIdFor,
  recordTable,
  RECORD_DOMAINS,
} from '../lib/storage-records';
import { NO_EXPIRY } from '../lib/storage-records';

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


void test('immutable record indexes are reused and SQL batches stay below SQLite bind parameter limits', () => {
  const previous = Array.from({ length: 1200 }, (_, index) => ({ id: 'video-' + index, fetchedAt: index }));
  const next = [...previous, { id: 'video-new', fetchedAt: 1201 }];
  const before = getRecordDiffIndexMetrics();
  const first = diffRecordCollection('videos', next, previous);
  const afterFirst = getRecordDiffIndexMetrics();
  const second = diffRecordCollection('videos', next, previous);
  const afterSecond = getRecordDiffIndexMetrics();
  assert.equal(first.upserts.length, 1);
  assert.equal(second.upserts.length, 1);
  assert.ok(afterSecond.hits >= afterFirst.hits + 2);
  assert.equal(afterFirst.builds, before.builds + 2);
  for (const domain of ['videos', 'notes'] as const) {
    const batches = chunkRecordWriteBatches(domain, Array.from({ length: 1050 }, (_, index) => index));
    const bindsPerRow = domain === 'videos' ? 5 : 4;
    assert.equal(batches.flat().length, 1050);
    assert.ok(batches.every((batch) => batch.length * bindsPerRow <= 900));
  }
});
