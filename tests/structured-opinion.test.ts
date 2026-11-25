import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStructuredSecondOpinion,
  parseStructuredSecondOpinion,
  structuredSecondOpinionPrompt,
} from '../lib/api';

void test('second-opinion prompt receives YouTube signals without disclosing internal ranking decisions', () => {
  const prompt = structuredSecondOpinionPrompt(
    'Mars exploration', 'A source-led explainer about sample return.', 'en', [],
    [{ id: 'mock-video', title: 'MOCK YouTube Mars sample-return trend', description: 'Public platform sample', channel: 'MOCK channel', channelId: 'mock-channel', publishedAt: '2026-11-20T00:00:00Z', thumbnailUrl: '', viewCount: 120000, likeCount: 6000, channelSubscriberCount: null, channelVideoCount: null, url: 'https://www.youtube.com/watch?v=mock-video', growth: { snapshotCount: 2, deltaViews: 12000, viewsPerHour: 500, viewsPerDay: 12000, channelBaselineViewsPerDay: 3000, channelOutlierRatio: 4, measuredAt: Date.parse('2026-11-21T00:00:00Z'), status: 'measured' } }],
  );
  assert.ok(prompt.includes('Mars exploration'));
  assert.ok(prompt.includes('A source-led explainer'));
  assert.ok(prompt.includes('youtubePlatformSignals'));
  assert.ok(prompt.includes('MOCK YouTube Mars sample-return trend'));
  assert.doesNotMatch(prompt, /engineScore|decision from the engine|localRanking/i);
});

void test('structured second opinion accepts the exact schema and formats both languages', () => {
  const content = JSON.stringify({
    decision: 'gather_more_evidence',
    strengths: ['Clear central question'],
    risks: ['The production angle may be too broad'],
    missingData: ['A primary mission source'],
    validationSteps: ['Check the mission status page'],
    nextAction: 'Narrow the question to one verifiable claim',
  });
  const parsed = parseStructuredSecondOpinion(content);
  assert.equal(parsed.decision, 'gather_more_evidence');
  assert.match(formatStructuredSecondOpinion(parsed, 'en'), /Gather more evidence/);
  assert.match(formatStructuredSecondOpinion(parsed, 'fa'), /جمع‌آوری شواهد بیشتر/);
});

void test('structured second opinion accepts a fenced JSON object but rejects extra or missing fields', () => {
  const valid = {
    decision: 'develop',
    strengths: [],
    risks: [],
    missingData: [],
    validationSteps: [],
    nextAction: 'Draft the outline',
  };
  assert.equal(parseStructuredSecondOpinion('```json\n' + JSON.stringify(valid) + '\n```').decision, 'develop');
  assert.throws(() => parseStructuredSecondOpinion(JSON.stringify({ ...valid, inventedScore: 99 })), /schema/i);
  const { missingData: _missingData, ...missing } = valid;
  assert.throws(() => parseStructuredSecondOpinion(JSON.stringify(missing)), /schema/i);
});

void test('invalid JSON and invalid decision values are rejected without fallback numbers', () => {
  assert.throws(() => parseStructuredSecondOpinion('not json'), /valid JSON/i);
  assert.throws(() => parseStructuredSecondOpinion(JSON.stringify({
    decision: 'viral',
    strengths: [],
    risks: [],
    missingData: [],
    validationSteps: [],
    nextAction: 'Make a video',
  })), /schema/i);
});
