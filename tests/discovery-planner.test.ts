import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planEvidenceFollowUps } from '../lib/discovery-planner';

describe('planEvidenceFollowUps', () => {
  it('creates bounded, topic-anchored follow-ups from independent evidence', () => {
    const result = planEvidenceFollowUps('electric bicycles', [
      { title: 'Battery recycling supply chain research', summary: 'Battery recycling capacity and policy', url: 'https://example.com/a' },
      { title: 'Battery recycling market regulation', summary: 'New battery recycling standards', url: 'https://example.org/b' },
      { title: 'Battery recycling technology review', summary: 'Recycling technology and materials', url: 'https://example.net/c' },
    ]);
    assert.ok(result.length > 0 && result.length <= 2);
    assert.ok(result.every((query) => query.startsWith('electric bicycles ')));
  });

  it('returns no queries without valid source evidence', () => {
    assert.deepEqual(planEvidenceFollowUps('topic', [{ title: 'x', summary: '', url: 'javascript:alert(1)' }]), []);
  });

  it('does not repeat an already-issued query', () => {
    const result = planEvidenceFollowUps('topic alpha beta', [
      { title: 'gamma delta epsilon', summary: '', url: 'https://example.com/a' },
    ], ['topic alpha beta gamma delta epsilon']);
    assert.equal(result.length, 0);
  });
});
