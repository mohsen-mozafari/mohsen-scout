import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, type Opinion } from '../lib/types';
import { decodeStorageRows, encodeStorageRows } from '../lib/storage-layout';

const sample: Opinion = {
  id: 'op-1', ideaId: 'idea-1', text: 'A saved second opinion.', model: 'free-model', createdAt: 1794850000000,
};

void test('new SQLite layout stores each opinion as a separate personal row and round-trips it', () => {
  const data = { ...defaults(), opinions: [sample] };
  const rows = encodeStorageRows(data);
  assert.equal(rows.some((row) => row.key === 'opinions'), false);
  assert.deepEqual(rows.filter((row) => row.key.startsWith('opinion:')).map((row) => row.key), ['opinion:op-1']);
  assert.equal(rows.find((row) => row.key === 'opinion:op-1')?.table, 'personal');
  assert.deepEqual(decodeStorageRows(rows), data);
});

void test('legacy opinions JSON array remains readable and migrates without losing preference data', () => {
  const data = decodeStorageRows([
    { key: 'preferences', value: JSON.stringify({ model: 'saved-model', hybridIntelligenceEnabled: true }) },
    { key: 'opinions', value: JSON.stringify([sample]) },
  ]);
  assert.equal(data.preferences.model, 'saved-model');
  assert.equal(data.preferences.hybridIntelligenceEnabled, true);
  assert.deepEqual(data.opinions, [sample]);
  const migrated = encodeStorageRows(data);
  assert.equal(migrated.some((row) => row.key === 'opinions'), false);
  assert.deepEqual(decodeStorageRows(migrated).opinions, [sample]);
});

void test('legacy and split opinion rows deduplicate by opinion id', () => {
  const rows = [
    { key: 'opinions', value: JSON.stringify([sample]) },
    { key: 'opinion:op-1', value: JSON.stringify(sample) },
  ];
  assert.deepEqual(decodeStorageRows(rows).opinions, [sample]);
});

void test('malformed rows fail safely rather than being silently discarded', () => {
  assert.throws(() => decodeStorageRows([{ key: 'opinions', value: '{broken' }]), /Saved data is unreadable/);
});
