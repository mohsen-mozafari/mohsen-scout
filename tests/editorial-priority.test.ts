import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEditorialPriorityBand, selectTopCurrentEditorialPriorities, summarizeEditorialPriority } from '../lib/editorial-priority';

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


void test('live top opportunities immediately replace completed, rejected and archived cards', () => {
  const ranked = selectTopCurrentEditorialPriorities([
    { id: 'completed', engineScore: 100, status: 'Completed Research', createdAt: 9 },
    { id: 'rejected', engineScore: 99, status: 'Rejected Ideas', createdAt: 8 },
    { id: 'archived', engineScore: 98, archived: true, createdAt: 7 },
    { id: 'active-1', engineScore: 90, status: 'New Discoveries', createdAt: 6 },
    { id: 'active-2', engineScore: 80, status: 'Saved Opportunities', createdAt: 5 },
    { id: 'active-3', engineScore: 70, status: 'New Discoveries', createdAt: 4 },
  ], 2);
  assert.deepEqual(ranked.map((idea) => idea.id), ['active-1', 'active-2']);
});
