import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResearchMemoryEntry } from '../lib/research-memory';
import { defaults } from '../lib/types';
import { exportBackup, importBackup } from '../lib/backup';
import { validateLocal } from '../lib/validation';

const analysis = (confidence: 'low' | 'moderate' | 'high' = 'moderate') => ({
  evidence: [{ id: 'publisher-news', detail: 'Two selected official publisher reports were compared.' }],
  verificationQuestions: ['Which primary report supports the measurement?'],
  intelligence: {
    gaps: ['Independent confirmation is limited.'],
    potentialContradictions: [],
    confidence: { level: confidence },
  },
});
const story = (suffix: string, title = 'JWST exoplanet atmosphere report') => ({
  sourceId: 'nasa',
  sourceName: 'NASA',
  title,
  url: 'https://science.nasa.gov/story-' + suffix + '?utm_source=feed',
  publishedAt: '2026-11-15T10:00:00.000Z',
});

void test('research memory stores publisher-only evidence and creates a bounded analysis history', () => {
  const first = createResearchMemoryEntry({
    topic: 'JWST exoplanets',
    news: [story('one')],
    analysis: analysis(),
    now: 1000,
    language: 'en',
  });
  assert.ok(first);
  assert.equal(first.sources.length, 1);
  assert.equal(first.sources[0].sourceUrl, 'https://science.nasa.gov/story-one');
  assert.equal(first.history?.length, 1);
  assert.equal(first.history?.[0].newSourceCount, 1);

  const unchanged = createResearchMemoryEntry({
    topic: 'JWST exoplanets',
    news: [story('one')],
    analysis: analysis(),
    previous: first,
    now: 2000,
    language: 'en',
  });
  assert.ok(unchanged);
  assert.equal(unchanged.history?.length, 1);

  const changed = createResearchMemoryEntry({
    topic: 'JWST exoplanets',
    news: [story('two', 'A new JWST exoplanet atmosphere report'), story('one')],
    analysis: analysis('high'),
    previous: unchanged,
    now: 3000,
    language: 'en',
  });
  assert.ok(changed);
  assert.equal(changed.history?.length, 2);
  assert.equal(changed.history?.[0].newSourceCount, 1);
  assert.equal(changed.history?.[0].confidence, 'high');
  assert.ok(changed.history?.[0].changes.length);
});

void test('research memory does not create an empty entry and caps snapshots at eight', () => {
  assert.equal(createResearchMemoryEntry({
    topic: 'No publisher evidence',
    news: [],
    analysis: analysis(),
  }), undefined);
  const base = createResearchMemoryEntry({
    topic: 'JWST',
    news: [story('seed')],
    analysis: analysis(),
    now: 1,
  })!;
  const oldHistory = Array.from({ length: 8 }, (_, index) => ({
    capturedAt: index + 1,
    sourceFingerprint: 'old-' + index,
    sourceCount: 1,
    newSourceCount: 0,
    updatedSourceCount: 0,
    keyFindings: [],
    unresolvedQuestions: [],
    contradictions: [],
    confidence: 'moderate' as const,
    changes: [],
  }));
  const capped = createResearchMemoryEntry({
    topic: 'JWST',
    news: [story('new')],
    analysis: analysis(),
    previous: { ...base, history: oldHistory },
    now: 99,
  })!;
  assert.equal(capped.history?.length, 8);
});

void test('legacy local data and backup memory remain readable with versioned history', () => {
  const data = defaults();
  const memory = createResearchMemoryEntry({
    topic: 'JWST',
    news: [story('backup')],
    analysis: analysis(),
    now: 1234,
  })!;
  data.researchMemory = [memory];
  const parsed = validateLocal(data);
  assert.equal(parsed.researchMemory[0].history?.length, 1);
  const restored = importBackup(exportBackup(parsed));
  assert.equal(restored.researchMemory[0].history?.[0].sourceCount, 1);

  const legacy = JSON.parse(JSON.stringify(data)) as typeof data;
  delete legacy.researchMemory[0].history;
  const restoredLegacy = importBackup(exportBackup(legacy));
  assert.equal(restoredLegacy.researchMemory[0].history?.length, 0);
});
