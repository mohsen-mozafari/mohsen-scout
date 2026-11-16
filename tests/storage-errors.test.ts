import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeStorageError } from '../lib/storage-errors';

void test('SQLite FULL is reported as device storage exhaustion', () => {
  assert.match(describeStorageError(new Error('SQLITE_FULL: database or disk is full')), /Device storage is full/);
});

void test('SQLite BUSY and READONLY have distinct actionable messages', () => {
  assert.match(describeStorageError(new Error('SQLITE_BUSY: database is locked')), /database is busy/i);
  assert.match(describeStorageError(new Error('attempt to write a readonly database')), /read-only/i);
});

void test('unknown low-level errors do not leak raw driver text', () => {
  const result = describeStorageError(new Error('driver internal path /private/db secret=token'));
  assert.match(result, /unidentified reason/i);
  assert.doesNotMatch(result, /private|secret|token/i);
});
