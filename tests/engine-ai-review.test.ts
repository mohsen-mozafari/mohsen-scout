import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintText, internalEngineReviewPrompt, nextOpenRouterUsage } from '../lib/api';
import { buildInternalResearch } from '../lib/engine';

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
    recommendation: { topic: 'Build a Mars sample-return explainer', concept: 'Compare mission goals with evidence that could verify each claim.' },
    language: 'en',
  });
  assert.match(prompt, /local engine processed/i);
  assert.match(prompt, /12 records processed/);
  assert.match(prompt, /3 groups represented/);
  assert.match(prompt, /Decision/);
  assert.match(prompt, /Useful Findings/);
  assert.match(prompt, /Adversarial Check/);
  assert.match(prompt, /Next Action/);
  assert.match(prompt, /Gather more evidence/);
  assert.match(prompt, /Build a Mars sample-return explainer/);
  assert.match(prompt, /Compare mission goals/);
  assert.match(prompt, /Independently critique the proposed idea rather than endorsing the local engine/i);
  assert.match(prompt, /only if the supplied evidence includes enough comparable historical outcomes/i);
  assert.match(prompt, /no reliable percentage can be calculated from the available evidence/i);
  assert.match(prompt, /Never invent a number to fill the gap/i);
  assert.match(prompt, /aggregate local-engine indicators/i);
  assert.match(prompt, /raw headlines, video titles, descriptions, links and per-item statistics are intentionally excluded/i);
  assert.match(prompt, /Do not pretend to have seen individual sources or videos/i);
  assert.match(prompt, /do not infer growth rates, market competition or virality/i);
  assert.doesNotMatch(prompt, /https?:\/\//i);
  assert.doesNotMatch(prompt, /youtube\.com|nasa\.gov|esa\.int/i);
});

void test('internal engine evaluates more than twelve matching news records without truncating the evidence audit', () => {
  const news = Array.from({ length: 24 }, (_, index) => ({
    title: 'Mars exploration mission update ' + index,
    summary: 'New rover and planetary science findings for Mars.',
    sourceName: index % 2 ? 'NASA JPL' : 'ESA',
    sourceUrl: 'https://' + (index % 2 ? 'www.nasa.gov' : 'www.esa.int') + '/mars/story-' + index,
    publishedAt: new Date(Date.UTC(2026, 10, 1 + (index % 15))).toISOString(),
    sourceId: index % 2 ? 'jpl' : 'esa-space',
  }));
  const result = buildInternalResearch({ topic: 'Mars exploration', news, now: Date.parse('2026-11-18T12:00:00Z') });
  assert.equal(result.intelligence.selfEvaluation.topicMatchedNewsCount, 24);
  assert.equal(result.intelligence.sourceQuality.uniqueStories, 24);
});


void test('internal engine retains unmatched and historical evidence as context while separating current matches', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  const result = buildInternalResearch({
    topic: 'Mars exploration',
    now,
    news: [
      { title: 'Mars rover mission science update', summary: 'A rover measures a mineral sample.', sourceName: 'NASA', sourceId: 'nasa', sourceUrl: 'https://nasa.gov/mars', publishedAt: '2026-11-17T12:00:00Z' },
      { title: 'Artemis lunar launch update', summary: 'A separate lunar programme report.', sourceName: 'ESA', sourceId: 'esa-space', sourceUrl: 'https://esa.int/moon', publishedAt: '2026-11-16T12:00:00Z' },
    ],
    videos: [
      { id: 'dQw4w9WgXcQ', title: 'Mars rover sample analysis', description: 'Recent rover science.', channel: 'Mars Lab', publishedAt: '2026-11-15T12:00:00Z', viewCount: 100000, likeCount: 3000 },
      { id: '9bZkp7q19f0', title: 'Mars exploration documentary', description: 'Historical rover mission archive.', channel: 'Space History', publishedAt: '2025-11-15T12:00:00Z', viewCount: 900000, likeCount: 20000 },
    ],
  });
  assert.equal(result.intelligence.selfEvaluation.uniqueNewsCount, 2);
  assert.equal(result.intelligence.selfEvaluation.topicMatchedNewsCount, 1);
  assert.equal(result.intelligence.sourceQuality.uniqueStories, 2);
  assert.equal(result.intelligence.selfEvaluation.allTimeMatchedVideoCount, 2);
  assert.equal(result.intelligence.selfEvaluation.recentMatchedVideoCount, 1);
  assert.equal(result.intelligence.selfEvaluation.outsideVideoWindowCount, 1);
  assert.ok(result.entityCandidates.length >= 1);
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
    () => nextOpenRouterUsage('2026-11-16', 50, '2026-11-16', 50, 50),
    /daily request limit is exhausted/,
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
  assert.match(prompt, /Decision/);
  assert.match(prompt, /Missing Data/);
  assert.match(prompt, /Reframe the topic/);
});
