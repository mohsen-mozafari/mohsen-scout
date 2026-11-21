import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  engineV2ReviewPrompt,
  getStructuredOpinion,
  validateEngineV2Opinion,
  type EngineV2Opinion,
  type EngineV2ReviewInput,
  type Fetcher,
} from '../lib/api';
import type { EvidenceItem, OpportunityScore, Topic } from '../lib/engine-v2';

const MOCK_KEY = 'sk-or-v1-MOCK_SECRET_KEY';
const MODEL = 'provider/mock-free:free';

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetcher =
  (work: (url: string) => Response | Promise<Response>): Fetcher =>
  async (url) =>
    work(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);

const evidence: EvidenceItem[] = [
  { id: 'n1', source: 'news', title: 'Mars rover finds a real mineral sample', text: '', publishedAt: 0, language: 'en' },
  { id: 'v1', source: 'youtube', title: 'A real walkthrough of the rover lab', text: '', publishedAt: 0, language: 'en', views: 12345 },
  { id: 'w1', source: 'wikimedia', title: 'Mars exploration wiki signal', text: '', publishedAt: 0, language: 'en' },
  { id: 'n2', source: 'news', title: 'A second real Mars news report', text: '', publishedAt: 0, language: 'en' },
];
const topics: Topic[] = [
  { id: 't1', label: 'Mars sample return', keywords: ['mars'], itemIds: ['n1', 'v1', 'w1', 'n2'], newsCount: 2, videoCount: 1, momentum: 0.61, supplyGap: 0.55, avgOutlier: 0.62 },
  { id: 't2', label: 'Rover minerals', keywords: ['rover'], itemIds: [], newsCount: 0, videoCount: 0, momentum: 0.2, supplyGap: 0.4, avgOutlier: 0.5 },
  { id: 't3', label: 'Launch window', keywords: ['launch'], itemIds: ['n2'], newsCount: 1, videoCount: 0, momentum: 0.3, supplyGap: 0.45, avgOutlier: 0.51 },
];
const score = (topicId: string, value: number): OpportunityScore => ({
  topicId,
  value,
  confidence: 0.42,
  components: [],
  why: 'Based on real observed counts.',
  risk: 'low',
  estRevenue: { low: 0, high: 0, rpm: 3, basis: 'none', label: 'estimate' },
});
const input: EngineV2ReviewInput = {
  topic: 'Mars exploration',
  result: {
    topics,
    scores: [score('t1', 71.6), score('t2', 40), score('t3', 10)],
    items: evidence,
  },
  idea: {
    titleSuggestion: 'What the rover actually found',
    angle: 'Compare mission goals with observed samples',
    why: 'Two real news items and one video were observed.',
  },
  language: 'en',
};

const validOpinion: EngineV2Opinion = {
  decision: 'develop',
  usefulFindings: ['One grounded finding.', 'Another grounded finding.'],
  counterCritique: 'The sample is small and may be biased.',
  nextAction: 'Search one more publisher by hand.',
  missingData: 'Comparable historical outcomes are missing.',
};
const invalidCode = (error: unknown) => error instanceof ApiError && error.code === 'invalid';

void test('engineV2ReviewPrompt is bounded, grounded and requests strict JSON only', () => {
  const prompt = engineV2ReviewPrompt(input);
  assert.ok(prompt.length <= 4000, 'prompt must be bounded');
  assert.ok(!prompt.includes(MOCK_KEY), 'prompt must never contain an API key');
  assert.match(prompt, /STRICT JSON ONLY/i);
  assert.match(prompt, /"decision"/);
  assert.match(prompt, /"usefulFindings"/);
  assert.match(prompt, /"counterCritique"/);
  assert.match(prompt, /"nextAction"/);
  assert.match(prompt, /"missingData"/);
  assert.match(prompt, /Never invent a view count/i);
  assert.match(prompt, /Do not invent evidence that is not in the payload/i);
  assert.match(prompt, /Criticize the local engine decision independently/i);
  assert.match(prompt, /if the supplied data is insufficient/i);

  // Real evidence titles are present; per-topic evidence is capped at three.
  assert.match(prompt, /Mars rover finds a real mineral sample/);
  assert.match(prompt, /A real walkthrough of the rover lab/);
  assert.doesNotMatch(prompt, /Mars exploration wiki signal/);
  assert.match(prompt, /What the rover actually found/);

  const payloadLine = prompt.split('\n').find((line) => line.startsWith('Top local topics')) ?? '';
  const start = payloadLine.indexOf('[');
  const end = payloadLine.lastIndexOf(']');
  assert.ok(start >= 0 && end > start, 'compact topic payload is present');
  const payload = JSON.parse(payloadLine.slice(start, end + 1)) as Array<{
    score: number;
    confidence: number;
    momentum: number;
    supplyGap: number;
    avgOutlier: number;
    evidence: Array<{ title: string; source: string; views?: number }>;
  }>;
  assert.equal(payload.length, 3, 'at most three top topics');
  assert.equal(payload[0].score, 72, 'score is rounded');
  assert.equal(payload[0].confidence, 0.42);
  assert.equal(payload[0].momentum, 0.61);
  assert.equal(payload[0].supplyGap, 0.55);
  assert.equal(payload[0].avgOutlier, 0.62);
  assert.equal(payload[0].evidence.length, 3, 'at most three evidence items');
  const withViews = payload[0].evidence.find((item) => item.title.includes('real walkthrough'));
  const withoutViews = payload[0].evidence.find((item) => item.title.includes('real mineral sample'));
  assert.equal(withViews?.views, 12345, 'views are included only when observed');
  assert.equal('views' in (withoutViews ?? {}), false, 'unobserved views are omitted');
});

void test('validateEngineV2Opinion enforces the strict bounded shape', () => {
  assert.deepEqual(validateEngineV2Opinion(validOpinion), validOpinion);
  assert.throws(() => validateEngineV2Opinion({ ...validOpinion, extra: true }), invalidCode);
  assert.throws(() => validateEngineV2Opinion({ ...validOpinion, decision: 'maybe' }), invalidCode);
  assert.throws(() => validateEngineV2Opinion({ ...validOpinion, usefulFindings: ['a', 'b', 'c'] }), invalidCode);
  assert.throws(() => validateEngineV2Opinion({ ...validOpinion, counterCritique: 'x'.repeat(601) }), invalidCode);
  assert.throws(() => validateEngineV2Opinion({ ...validOpinion, nextAction: 42 }), invalidCode);
  assert.throws(() => validateEngineV2Opinion({ ...validOpinion, missingData: null }), invalidCode);
  assert.throws(() => validateEngineV2Opinion(null), invalidCode);
});

void test('getStructuredOpinion rejects malformed or invalid model output with ApiError invalid', async () => {
  await assert.rejects(
    getStructuredOpinion(MOCK_KEY, MODEL, 'prompt', undefined, fetcher(() =>
      response({ choices: [{ message: { content: 'not json at all' } }] }))),
    invalidCode,
  );
  await assert.rejects(
    getStructuredOpinion(MOCK_KEY, MODEL, 'prompt', undefined, fetcher(() =>
      response({ choices: [{ message: { content: JSON.stringify({ ...validOpinion, surprise: 1 }) } }] }))),
    invalidCode,
  );
  await assert.rejects(
    getStructuredOpinion(MOCK_KEY, MODEL, 'prompt', undefined, fetcher(() => response({ choices: [] }))),
    invalidCode,
  );
});

void test('getStructuredOpinion parses a valid reply and strips markdown fences', async () => {
  const fenced = '```json\n' + JSON.stringify(validOpinion) + '\n```';
  let calls = 0;
  const parsed = await getStructuredOpinion(MOCK_KEY, MODEL, 'prompt', undefined, fetcher(() => {
    calls += 1;
    return response({ choices: [{ message: { content: fenced } }] });
  }));
  assert.deepEqual(parsed, validOpinion);
  assert.equal(calls, 1);
});
