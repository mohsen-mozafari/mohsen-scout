import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintText, internalEngineReviewPrompt, nextOpenRouterUsage } from '../lib/api';

void test('AI engine review prompt is grounded in aggregate local intelligence signals', () => {
  const prompt = internalEngineReviewPrompt({
    topic: 'Space science and exploration',
    summary: 'The local engine processed a limited set of publisher records.',
    evidence: [
      { label: 'Feed records', detail: '12 records processed' },
      { label: 'Independent publisher groups', detail: '3 groups represented' },
      { label: 'Duplicate records merged', detail: '4 duplicates merged' },
    ],
    confidence: { level: 'moderate', reason: 'Computed from sample coverage and freshness only.' },
    language: 'en',
  });
  assert.match(prompt, /local engine processed/i);
  assert.match(prompt, /12 records processed/);
  assert.match(prompt, /3 groups represented/);
  assert.match(prompt, /Evidence Audit/);
  assert.match(prompt, /Independent Analysis/);
  assert.match(prompt, /Adversarial Critique/);
  assert.match(prompt, /Revised Conclusion/);
  assert.doesNotMatch(prompt, /https?:\/\//i);
  assert.doesNotMatch(prompt, /youtube\.com|nasa\.gov|esa\.int/i);
});

void test('OpenRouter usage counter increments and resets on a new local day', () => {
  assert.deepEqual(nextOpenRouterUsage('2026-11-16', 6, '2026-11-16'), {
    openRouterUsageDay: '2026-11-16',
    openRouterRequestsToday: 7,
  });
  assert.deepEqual(nextOpenRouterUsage('2026-11-15', 29, '2026-11-16'), {
    openRouterUsageDay: '2026-11-16',
    openRouterRequestsToday: 1,
  });
  assert.throws(
    () => nextOpenRouterUsage('2026-11-16', 30, '2026-11-16'),
    /30 requests for today/,
  );
});

void test('AI prompt cache fingerprint is stable and changes with content or model identity', () => {
  const prompt = 'processed evidence summary';
  const first = fingerprintText('free-model-a\n' + prompt);
  assert.equal(first, fingerprintText('free-model-a\n' + prompt));
  assert.notEqual(first, fingerprintText('free-model-b\n' + prompt));
  assert.notEqual(first, fingerprintText('free-model-a\n' + prompt + ' changed'));
});

void test('external review prompt explicitly separates agreement and disagreement with the local engine', () => {
  const prompt = internalEngineReviewPrompt({
    topic: 'Test topic', summary: 'Processed local assessment.', evidence: [],
    confidence: { level: 'low', reason: 'Small sample.' }, language: 'en',
  });
  assert.match(prompt, /Agreement with Local Engine/);
  assert.match(prompt, /Disagreement with Local Engine/);
});
