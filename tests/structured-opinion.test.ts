import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStructuredSecondOpinion,
  parseStructuredSecondOpinion,
  structuredSecondOpinionPrompt,
} from '../lib/api';

void test('second-opinion prompt includes selected topic/concept and an empty YouTube signal lane when none is supplied', () => {
  const prompt = structuredSecondOpinionPrompt('Mars exploration', 'A source-led explainer about sample return.', 'en');
  assert.ok(prompt.includes('Mars exploration'));
  assert.ok(prompt.includes('A source-led explainer'));
  assert.ok(prompt.includes('\"topic\":\"Mars exploration\"'));
  assert.ok(prompt.includes('\"candidateConcept\":\"A source-led explainer about sample return.\"'));
  assert.ok(prompt.includes('\"youtubePlatformSignals\":[]'));
  assert.ok(prompt.includes('\"independentSources\":[]'));
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
