import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearchText, normalizeSearchText } from '../lib/search';

void test('Persian/Arabic letters and diacritics are normalized consistently', () => {
  assert.equal(normalizeSearchText('كِتاب يوتيوب'), 'کتاب یوتیوب');
});

void test('Persian and Arabic-Indic digits are normalized to Latin digits', () => {
  assert.equal(normalizeSearchText('۱۲۳ ٤٥٦'), '123 456');
});

void test('Zero-width characters and half-spaces do not break token search', () => {
  assert.equal(matchesSearchText('تحلیل‌داده درباره یوتیوب', 'داده تحلیل یوتیوب'), true);
});

void test('Search tokens match independent of order and punctuation', () => {
  assert.equal(matchesSearchText('Space, science & exploration!', 'EXPLORATION space'), true);
});

void test('Every query token must exist; this is not substring or fuzzy matching', () => {
  assert.equal(matchesSearchText('YouTube analytics guide', 'YouTube analytics beginner'), false);
  assert.equal(matchesSearchText('analytics', 'analytic'), false);
});

void test('Empty search matches all records', () => {
  assert.equal(matchesSearchText('Any title', '   '), true);
});
