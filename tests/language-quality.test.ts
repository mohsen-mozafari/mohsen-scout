import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isolateMixedDirectionText,
  resolveParagraphDirection,
  translateText,
} from '../lib/i18n';
import { buildResearchOutline } from '../lib/space';
import { buildInternalResearch } from '../lib/engine';
import { internalEngineReviewPrompt, structuredSecondOpinionPrompt } from '../lib/api';

void test('Persian UI keeps a mixed Persian-English paragraph RTL even when the English phrase comes first', () => {
  assert.equal(resolveParagraphDirection('JWST discoveries — شواهد تازه', 'fa'), 'rtl');
});

void test('English-only publisher and YouTube text stays LTR inside Persian UI', () => {
  assert.equal(resolveParagraphDirection('NASA confirms new JWST observation', 'fa'), 'ltr');
  assert.equal(resolveParagraphDirection('NASA video title', 'en'), 'ltr');
});

void test('opposite-direction runs are isolated without changing the original words', () => {
  const mixed = 'گزارش NASA درباره JWST منتشر شد';
  const isolated = isolateMixedDirectionText(mixed, 'rtl');
  assert.ok(isolated.includes('\u2066NASA درباره JWST\u2069') || isolated.includes('\u2066NASA\u2069'));
  assert.ok(isolated.includes('گزارش'));
  assert.ok(isolated.includes('منتشر شد'));
  assert.equal(isolateMixedDirectionText('NASA JWST', 'ltr'), 'NASA JWST');
});

void test('app-owned labels and enum values have natural Persian equivalents', () => {
  assert.equal(translateText('Evidence audit', 'fa'), 'بررسی شواهد');
  assert.equal(translateText('Explainer', 'fa'), 'توضیح ساده');
  assert.equal(translateText('low', 'fa'), 'کم');
  assert.equal(translateText('moderate', 'fa'), 'متوسط');
  assert.equal(translateText('high', 'fa'), 'زیاد');
  assert.equal(translateText('Source findings', 'fa'), 'یافته‌های منابع');
  assert.equal(translateText('Verification checklist', 'fa'), 'فهرست راستی‌آزمایی');
  assert.equal(translateText('Open latest YouTube report', 'fa'), 'بازکردن آخرین گزارش یوتیوب');
  assert.equal(translateText('RESEARCH ARCHIVE', 'fa'), 'بایگانی پژوهش');
  assert.equal(translateText('Choose a question, build one evidence-backed brief, then review the sections you need.', 'fa'), 'یک پرسش انتخاب کن، گزارش مبتنی بر شواهد بساز و سپس بخش‌های موردنیازت را بررسی کن.');
  assert.equal(translateText('Open page', 'fa'), 'بازکردن صفحه');
});

void test('Persian research outline reads naturally and preserves original publisher headlines verbatim', () => {
  const headline = 'NASA reports a new observation from JWST';
  const outline = buildResearchOutline('آب‌وهوای سیاره‌های فراخورشیدی', [headline], 'fa');
  assert.ok(outline.titleIdeas.every((line) => /[آ-ی]/.test(line)));
  assert.ok(outline.outline.some((line) => line.includes(headline)));
  assert.ok(outline.outline.every((line) => !line.startsWith('Evidence:')));
  assert.ok(outline.verificationQuestions.every((line) => /[آ-ی]/.test(line)));
});

void test('Persian local engine copy stays Persian while original news titles remain unchanged', () => {
  const headline = 'NASA reports a new JWST observation';
  const result = buildInternalResearch({
    topic: 'JWST exoplanet atmosphere',
    language: 'fa',
    now: Date.parse('2026-11-22T12:00:00Z'),
    news: [{
      title: headline,
      summary: 'The telescope measured an atmosphere spectrum.',
      sourceName: 'NASA',
      sourceId: 'nasa',
      sourceUrl: 'https://www.nasa.gov/example',
      publishedAt: '2026-11-20T12:00:00Z',
    }],
  });
  assert.ok(/[آ-ی]/.test(result.summary));
  assert.ok(/[آ-ی]/.test(result.angles[0].title));
  assert.ok(result.evidence.some((item) => item.detail.includes(headline)));
  assert.ok(/[آ-ی]/.test(result.intelligence.confidence.reason));
});

void test('second-opinion prompts ask both language models for natural, readable language', () => {
  const persian = structuredSecondOpinionPrompt('مریخ', 'مقایسه مأموریت‌ها', 'fa');
  const english = structuredSecondOpinionPrompt('Mars', 'Compare the missions', 'en');
  assert.match(persian, /زبان طبیعی و روان/);
  assert.match(persian, /اصطلاح تخصصی/);
  assert.match(english, /natural, clear language/i);
  assert.match(english, /unexplained technical jargon/i);
});

void test('Persian internal-review prompts localize their own field labels', () => {
  const prompt = internalEngineReviewPrompt({
    topic: 'مریخ',
    summary: 'شواهد محدود است.',
    evidence: [{ label: 'ناشر', detail: 'یک خبر دریافت شد.' }],
    confidence: { level: 'low', reason: 'نمونه کوچک است.' },
    language: 'fa',
  });
  assert.ok(prompt.includes('موضوع:'));
  assert.ok(prompt.includes('خلاصه موتور داخلی:'));
  assert.ok(prompt.includes('شواهد بررسی‌شده:'));
  assert.ok(prompt.includes('میزان اطمینان: کم'));
  assert.ok(prompt.includes('مواردی که هنوز روشن نیستند:'));
});
