import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEditorialPriorityBand, summarizeEditorialPriority } from '../lib/editorial-priority';

void test('editorial priority summary counts scored and unscored active ideas in the visible bands', () => {
  const summary = summarizeEditorialPriority([
    { engineScore: 91 },
    { engineScore: 85 },
    { engineScore: 84 },
    { engineScore: 65 },
    { engineScore: 64 },
    { engineScore: 0 },
    { engineScore: undefined },
    { engineScore: Number.NaN },
    { engineScore: 100, archived: true },
    { engineScore: 100, status: 'Rejected Ideas' },
    { engineScore: 100, status: 'Completed Research' },
  ]);

  assert.deepEqual(summary, {
    scored: 6,
    strong: 2,
    moderate: 2,
    weak: 2,
    unscored: 2,
  });
});

void test('editorial priority thresholds match the labels shown to users', () => {
  assert.equal(getEditorialPriorityBand(85), 'strong');
  assert.equal(getEditorialPriorityBand(65), 'moderate');
  assert.equal(getEditorialPriorityBand(64.99), 'weak');
});

void test('editorial priority summary handles an empty dashboard', () => {
  assert.deepEqual(summarizeEditorialPriority([]), {
    scored: 0,
    strong: 0,
    moderate: 0,
    weak: 0,
    unscored: 0,
  });
});
