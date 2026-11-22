import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchWebResearch } from '../lib/web-research';
import { generateEditorialIdeas } from '../lib/idea-generation';
import { structuredSecondOpinionPrompt } from '../lib/api';

const publishedAt = '2026-11-20T12:00:00.000Z';

void test('idea generation ignores legacy YouTube samples and scores independent publisher evidence only', () => {
  const ideas = generateEditorialIdeas({
    topic: 'Mars Sample Return',
    region: 'United States',
    languages: ['en'],
    language: 'en',
    now: Date.parse('2026-11-22T12:00:00.000Z'),
    limit: 5,
    news: [
      {
        id: 'nasa-mars-1', sourceId: 'nasa', sourceName: 'NASA',
        title: 'NASA reviews the Mars Sample Return mission architecture',
        summary: 'The mission study describes sample retrieval, transfer and scientific review requirements.',
        url: 'https://www.nasa.gov/example/mars-sample-return-1',
        publishedAt,
      },
      {
        id: 'esa-mars-2', sourceId: 'esa-space', sourceName: 'ESA',
        title: 'ESA discusses Mars Sample Return collaboration and next steps',
        summary: 'The independent agency update explains mission roles, sample handling and open technical questions.',
        url: 'https://www.esa.int/example/mars-sample-return-2',
        publishedAt,
      },
    ],
    videos: [{
      id: 'dQw4w9WgXcQ',
      title: 'MOCK YouTube: Mars Sample Return breakthrough and views',
      description: 'This mock video metadata must not enter idea scoring.',
      channel: 'MOCK channel',
      viewCount: 9999999,
      likeCount: 123456,
    }],
  });
  assert.ok(ideas.length > 0);
  assert.ok(ideas.every((idea) => idea.videoIds.length === 0));
  assert.ok(ideas.every((idea) => idea.engineScoreBasis === 'publisher-web-only-v2'));
  assert.ok(ideas.every((idea) => (idea.evidenceSources ?? []).every((source) => source.sourceType === 'publisher')));
  assert.ok(ideas.every((idea) => !/MOCK YouTube|9999999|123456/.test(idea.concept + idea.note)));
});

void test('Firecrawl keyless search uses independent web/news results and excludes YouTube domains', async () => {
  let requestBody: Record<string, unknown> | undefined;
  let authorization: string | null = null;
  const result = await fetchWebResearch('Mars Sample Return', {
    limit: 6,
    days: 7,
    fetcher: async (url, init) => {
      const requestUrl = url instanceof URL ? url.href : typeof url === 'string' ? url : url.url;
      assert.equal(requestUrl, 'https://api.firecrawl.dev/v2/search');
      const body = init?.body;
      if (typeof body !== 'string') throw new Error('Expected a JSON request body.');
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Expected a JSON object request body.');
      }
      requestBody = parsed;
      authorization = new Headers(init?.headers).get('Authorization');
      return new Response(JSON.stringify({
        success: true,
        data: {
          web: [
            { url: 'https://example.org/mission', title: 'Independent mission research', summary: 'Primary source summary.' },
            { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'YouTube result must be filtered', summary: 'Not an independent source.' },
          ],
          news: [
            { url: 'https://news.example.org/mars', title: 'Independent news report', description: 'A report about the mission.' },
          ],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  assert.deepEqual(requestBody?.sources, ['web', 'news']);
  const excludeDomains = requestBody?.excludeDomains;
  assert.ok(Array.isArray(excludeDomains));
  if (!Array.isArray(excludeDomains)) throw new Error('Expected domain exclusion list.');
  assert.ok(excludeDomains.includes('youtube.com'));
  assert.equal(requestBody?.tbs, 'qdr:w');
  assert.equal(authorization, null);
  assert.equal(requestBody?.query, 'Mars Sample Return');
  assert.equal(result.items.length, 2);
  assert.ok(result.items.every((item) => !/youtube\.com|youtu\.be/i.test(item.url)));
});

void test('external review prompt contains independent evidence and excludes YouTube URLs', () => {
  const prompt = structuredSecondOpinionPrompt(
    'Mars Sample Return',
    'Explain the mission and its unresolved technical questions.',
    'en',
    [
      { sourceType: 'publisher', sourceName: 'NASA', title: 'Mission overview', summary: 'The mission has several technical stages.', sourceUrl: 'https://www.nasa.gov/example/mission' },
      { sourceType: 'web', sourceName: 'YouTube', title: 'YouTube video', summary: 'Should be filtered.', sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    ],
  );
  assert.match(prompt, /Mission overview/);
  assert.match(prompt, /https:\/\/www\.nasa\.gov/);
  assert.doesNotMatch(prompt, /youtube\.com|dQw4w9WgXcQ/);
});
