import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, purgeExpired, RETENTION_MS, type Report, type ResearchInput } from '../lib/types';
import { createManualIdea } from '../lib/engine';
import { exportBackup, importBackup } from '../lib/backup';
import {
  attachReportToIdea,
  attachVideoReferenceToIdea,
  getOrCreateSourceIdea,
} from '../lib/idea-research';

const input: ResearchInput = {
  topic: 'James Webb',
  region: 'Germany',
  languages: ['en'],
  days: 30,
  duration: 'any',
  category: '',
  maxResults: 10,
};
const now = 1794760000000;

test('source stories reuse one local idea across research entry points', () => {
  const data = defaults();
  const source = {
    topic: 'James Webb new observation',
    concept: 'Verify the observation against its original source.',
    sourceUrl: 'https://www.nasa.gov/mock-jwst-story',
    sourceName: 'NASA',
    region: 'Germany' as const,
    languages: ['en'],
  };
  const first = getOrCreateSourceIdea(data, source, now);
  const second = getOrCreateSourceIdea(first.data, source, now + 1);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.idea.id, first.idea.id);
  assert.equal(second.data.ideas.length, 1);
  assert.throws(() => getOrCreateSourceIdea(data, { ...source, sourceUrl: 'http://example.com' }, now));
});

test('a saved YouTube report connects to one idea without duplicate video references', () => {
  const data = defaults();
  const idea = createManualIdea('James Webb', 'Explain one verified observation.', '', 'Germany', ['en']);
  const sampleVideo = {
    id: 'dQw4w9WgXcQ',
    title: 'MOCK title',
    description: 'MOCK description',
    channel: 'MOCK channel',
    thumbnail: 'https://example.com/mock.jpg',
    publishedAt: '2026-11-14T12:00:00Z',
    fetchedAt: now,
    query: 'James Webb',
  };
  const report: Report = {
    id: 'linked-report',
    input,
    videos: [sampleVideo],
    queries: ['James Webb'],
    warnings: [],
    createdAt: now,
    analyzed: false,
  };
  data.ideas = [idea];
  data.reports = [report];
  const linked = attachReportToIdea(data, idea.id, report.id);
  const linkedAgain = attachReportToIdea(linked, idea.id, report.id);
  assert.equal(linkedAgain.ideas[0].reportId, report.id);
  assert.deepEqual(linkedAgain.ideas[0].videoIds, ['dQw4w9WgXcQ']);
  assert.throws(() => attachReportToIdea(data, idea.id, 'missing-report'));
});

test('only a manually selected YouTube URL becomes a durable personal reference', () => {
  const data = defaults();
  const idea = createManualIdea('James Webb', 'Explain one verified observation.', '', 'Germany', ['en']);
  data.ideas = [idea];
  const linked = attachVideoReferenceToIdea(data, idea.id, 'dQw4w9WgXcQ', now);
  assert.deepEqual(linked.ideas[0].videoIds, ['dQw4w9WgXcQ']);
  assert.equal(linked.links[0].url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(linked.links[0].manualTitle, '');
  assert.equal(linked.videos.length, 0);
  const expired = purgeExpired(linked, now + RETENTION_MS + 1);
  assert.deepEqual(expired.ideas[0].videoIds, ['dQw4w9WgXcQ']);
  assert.equal(attachVideoReferenceToIdea(linked, idea.id, 'dQw4w9WgXcQ', now + 2).links.length, 1);
  assert.throws(() => attachVideoReferenceToIdea(data, idea.id, 'invalid-id', now));
});


test('linked research notes survive backup and legacy notes remain compatible', () => {
  const data = defaults();
  data.notes = [{
    id: 'linked-note',
    title: 'Wikimedia comparison',
    folder: 'Space Research',
    tags: ['space'],
    blocks: [{ id: 'block-1', type: 'paragraph', text: 'Article pageviews, not search volume.' }],
    updatedAt: now,
    ideaId: 'idea-1',
  }];
  const restored = importBackup(exportBackup(data));
  assert.equal(restored.notes[0].ideaId, 'idea-1');
  const legacy = defaults();
  legacy.notes = [{ ...data.notes[0], ideaId: undefined }];
  assert.equal(importBackup(exportBackup(legacy)).notes[0].ideaId, undefined);
});
