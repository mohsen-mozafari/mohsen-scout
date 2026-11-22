import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ResearchActivityEvent } from '../lib/types';
import {
  appendResearchActivity,
  buildResearchActivityFeedbackProfile,
  buildResearchActivityResults,
  buildResearchActivitySourceExclusions,
  explainResearchActivitySourceExclusion,
  MAX_RESEARCH_ACTIVITY,
  updateResearchActivityFeedback,
} from '../lib/research-activity';

void test('research activity canonicalizes and deduplicates source URLs, including tracking variants', () => {
  const results = buildResearchActivityResults('solar storm impact', [
    {
      id: 'a',
      title: 'Solar storm impact on power grids',
      summary: 'A technical account of solar storms and power infrastructure.',
      sourceName: 'Energy Research',
      url: 'https://example.org/report?utm_source=feed',
      includedInAnalysis: true,
      decisionReason: 'Passed to internal evidence analysis.',
    },
    {
      id: 'b',
      title: 'Solar storm impact on power grids',
      summary: 'Duplicate syndicated report.',
      sourceName: 'Mirror',
      url: 'https://example.org/report?utm_medium=rss',
      includedInAnalysis: true,
      decisionReason: 'Duplicate URL.',
    },
    {
      id: 'c',
      title: 'Gardening for beginners',
      summary: 'A general gardening article.',
      sourceName: 'Garden Daily',
      url: 'https://garden.example/articles/start',
      includedInAnalysis: false,
      decisionReason: 'Not passed: unrelated to the research topic.',
    },
    {
      id: 'youtube',
      title: 'Solar storm impact',
      summary: 'Raw YouTube metadata must stay in the expiring YouTube domain.',
      sourceName: 'YouTube',
      url: 'https://www.youtube.com/watch?v=abc123',
      includedInAnalysis: false,
      decisionReason: 'YouTube details are linked from the temporary report only.',
    },
  ]);
  assert.equal(results.length, 2);
  assert.equal(results[0].url, 'https://example.org/report');
  assert.ok(results[0].relevanceScore > results[1].relevanceScore);
  assert.equal(results.some((item) => item.url?.includes('youtube.com') ?? false), false);
});

void test('research activity feedback updates one result without changing its evidence', () => {
  const events: ResearchActivityEvent[] = [{
    id: 'run-1',
    engine: 'Firecrawl Search' as const,
    query: 'solar storm impact',
    topic: 'solar storm impact',
    niche: 'solar storm impact',
    startedAt: 100,
    status: 'success' as const,
    resultCount: 1,
    analyzedCount: 1,
    results: [{
      id: 'source-1',
      title: 'Solar storm impact',
      sourceName: 'Example',
      url: 'https://example.org/report',
      summary: 'Source summary',
      relevanceScore: 90,
      relevanceBand: 'high',
      sourceAssessment: 'not-assessed',
      includedInAnalysis: true,
      decisionReason: 'Passed to analysis.',
    }],
    warnings: [],
  }];
  const next = updateResearchActivityFeedback(events, 'run-1', 'source-1', 'useful');
  assert.equal(next[0].results[0].feedback, 'useful');
  assert.equal(next[0].results[0].summary, 'Source summary');
  assert.equal(events[0].results[0].feedback, undefined);
  assert.equal(updateResearchActivityFeedback(events, 'missing', 'source-1', 'useful'), events);
});

void test('research activity history remains newest-first and bounded', () => {
  const event = (id: string, startedAt: number) => ({
    id,
    engine: 'Internal Engine' as const,
    query: 'topic',
    topic: 'topic',
    niche: 'topic',
    startedAt,
    status: 'success' as const,
    resultCount: 0,
    analyzedCount: 0,
    results: [],
    warnings: [],
  });
  const initial = Array.from({ length: MAX_RESEARCH_ACTIVITY }, (_, index) => event('old-' + index, index));
  const next = appendResearchActivity(initial, event('new', MAX_RESEARCH_ACTIVITY + 1));
  assert.equal(next.length, MAX_RESEARCH_ACTIVITY);
  assert.equal(next[0].id, 'new');
  assert.equal(next.at(-1)?.id, 'old-1');
});

void test('saved research feedback influences topic preferences without treating weak sources as weak topics', () => {
  const events: ResearchActivityEvent[] = [{
    id: 'feedback-run',
    engine: 'Firecrawl Search',
    query: 'space telescope research',
    topic: 'space telescope research',
    niche: 'astronomy',
    startedAt: 100,
    status: 'success',
    resultCount: 3,
    analyzedCount: 3,
    results: [
      {
        id: 'useful',
        title: 'JWST exoplanet atmosphere measurements',
        sourceName: 'Research Journal',
        url: 'https://journal.example/jwst-atmosphere',
        summary: 'Useful research evidence.',
        relevanceScore: 90,
        relevanceBand: 'high',
        sourceAssessment: 'not-assessed',
        includedInAnalysis: true,
        decisionReason: 'Passed to analysis.',
        feedback: 'useful',
      },
      {
        id: 'irrelevant',
        title: 'Celebrity gossip unrelated to astronomy',
        sourceName: 'News Mirror',
        url: 'https://mirror.example/celebrity',
        summary: 'Unrelated content.',
        relevanceScore: 0,
        relevanceBand: 'low',
        sourceAssessment: 'not-assessed',
        includedInAnalysis: false,
        decisionReason: 'Not relevant.',
        feedback: 'irrelevant',
      },
      {
        id: 'weak',
        title: 'Astronomy claims from a weak publisher',
        sourceName: 'Weak Example',
        url: 'https://weak.example/report',
        summary: 'The topic may be useful but the source is weak.',
        relevanceScore: 55,
        relevanceBand: 'medium',
        sourceAssessment: 'not-assessed',
        includedInAnalysis: false,
        decisionReason: 'User marked the source as weak.',
        feedback: 'weak-source',
      },
    ],
    warnings: [],
  }];
  const profile = buildResearchActivityFeedbackProfile(events);
  assert.ok(profile.positiveTopics.includes('JWST exoplanet atmosphere measurements'));
  assert.ok(profile.negativeTopics.includes('Celebrity gossip unrelated to astronomy'));
  assert.equal(profile.negativeTopics.includes('Astronomy claims from a weak publisher'), false);
});

void test('weak-source and duplicate feedback exclude matching sources from later research', () => {
  const events: ResearchActivityEvent[] = [{
    id: 'source-feedback-run',
    engine: 'Publisher Feeds',
    query: 'space telescopes',
    topic: 'space telescopes',
    niche: 'astronomy',
    startedAt: 100,
    status: 'success',
    resultCount: 2,
    analyzedCount: 2,
    results: [
      {
        id: 'weak-source',
        title: 'A weak source article',
        sourceName: 'Weak Publisher',
        url: 'https://weak.example/story',
        summary: '',
        relevanceScore: 50,
        relevanceBand: 'medium',
        sourceAssessment: 'not-assessed',
        includedInAnalysis: false,
        decisionReason: 'Marked as a weak source.',
        feedback: 'weak-source',
      },
      {
        id: 'duplicate-source',
        title: 'A repeated source URL',
        sourceName: 'Duplicate Publisher',
        url: 'https://duplicate.example/story?utm_source=rss',
        summary: '',
        relevanceScore: 50,
        relevanceBand: 'medium',
        sourceAssessment: 'not-assessed',
        includedInAnalysis: false,
        decisionReason: 'Marked as a duplicate.',
        feedback: 'duplicate',
      },
    ],
    warnings: [],
  }];
  const exclusions = buildResearchActivitySourceExclusions(events);
  assert.match(
    explainResearchActivitySourceExclusion('https://sub.weak.example/another-story', exclusions) ?? '',
    /weak source/i,
  );
  assert.match(
    explainResearchActivitySourceExclusion('https://duplicate.example/story?utm_campaign=new', exclusions) ?? '',
    /duplicate/i,
  );
  assert.equal(explainResearchActivitySourceExclusion('https://trusted.example/story', exclusions), undefined);
});
