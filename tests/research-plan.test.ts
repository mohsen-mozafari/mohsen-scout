import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildResearchQueryPlan } from '../lib/research-plan';

void test('English plan covers direct discovery, primary evidence and critical review', () => {
  const plan = buildResearchQueryPlan('Mars Sample Return', 'en');
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((item) => item.intent), ['direct', 'primary-source', 'critical-review']);
  assert.equal(plan[0].query, 'Mars Sample Return');
  assert.match(plan[1].query, /primary source|official research|original data/i);
  assert.match(plan[2].query, /limitations|conflicting evidence|alternative explanations/i);
});

void test('Persian plan creates equivalent independent search angles', () => {
  const plan = buildResearchQueryPlan('بازگشت نمونه از مریخ', 'fa');
  assert.equal(plan.length, 3);
  assert.match(plan[1].query, /منبع اولیه|پژوهش رسمی/);
  assert.match(plan[2].query, /محدودیت‌ها|شواهد مخالف|توضیح جایگزین/);
});

void test('blank and repeated topics never create empty or duplicate queries', () => {
  assert.deepEqual(buildResearchQueryPlan('   ', 'en'), []);
  const plan = buildResearchQueryPlan('Mars', 'en');
  assert.equal(new Set(plan.map((item) => item.query.toLowerCase())).size, plan.length);
  assert.ok(plan.every((item) => item.query.length > 0 && item.query.length <= 220));
});
