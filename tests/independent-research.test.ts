import assert from 'node:assert/strict';
import { test } from 'node:test';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

import { enrichResearchEvidence, fetchWebResearch } from '../lib/web-research';
import { generateEditorialIdeas } from '../lib/idea-generation';
import { structuredSecondOpinionPrompt } from '../lib/api';

const publishedAt = '2026-11-20T12:00:00.000Z';

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

void test('idea generation links relevant YouTube platform signals while keeping publisher citations separate', () => {
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
      description: 'This mock video is a platform signal; raw counts must not become publisher evidence.',
      channel: 'MOCK channel',
      viewCount: 9999999,
      likeCount: 123456,
    }],
  });
  assert.ok(ideas.length > 0);
  assert.ok(ideas.every((idea) => idea.videoIds.includes('dQw4w9WgXcQ')));
  assert.ok(ideas.every((idea) => idea.engineScoreBasis === 'platform-aware-v3'));
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
      if (!isJsonObject(parsed)) throw new Error('Expected a JSON object request body.');
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


void test('Firecrawl search retrieves markdown source text only when the user key is configured', async () => {
  const originalText = ('The primary research team published its experimental method and measured results in the original report.\n\n').repeat(4);
  let requestBody: Record<string, unknown> | undefined;
  const result = await fetchWebResearch('primary research report', {
    apiKey: 'fc-test-key',
    limit: 1,
    fetcher: async (_url, init) => {
      const bodyText = typeof init?.body === 'string' ? init.body : '';
      const parsed: unknown = JSON.parse(bodyText);
      if (!isRecord(parsed)) throw new Error('Firecrawl search body was not a JSON object.');
      requestBody = parsed;
      return new Response(JSON.stringify({
        success: true,
        data: { web: [{ url: 'https://research.example.org/report', title: 'Original report', description: 'Short result description.', markdown: originalText }] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const scrapeOptions = requestBody && isRecord(requestBody.scrapeOptions) ? requestBody.scrapeOptions : undefined;
  const formats = scrapeOptions && Array.isArray(scrapeOptions.formats) ? scrapeOptions.formats : [];
  assert.deepEqual(formats, [{ type: 'markdown' }]);
  assert.ok(result.items[0]?.sourceText?.includes('experimental method'));
  assert.ok(result.items[0]?.sourceText?.includes('\n'));
  assert.ok((result.items[0]?.sourceText?.length ?? 0) >= 300);
});

void test('selected publisher evidence can be enriched through a bounded authenticated scrape', async () => {
  const originalText = ('The publisher document reports its measurement method and describes the evidence limitations in detail. ').repeat(8);
  let calls = 0;
  const result = await enrichResearchEvidence([{
    id: 'publisher:one',
    title: 'Publisher report',
    summary: 'Brief feed summary.',
    url: 'https://publisher.example.org/article',
    sourceName: 'Publisher',
    category: 'news',
  }], 'fc-test-key', 1, async (url, init) => {
    calls += 1;
    assert.equal(url, 'https://api.firecrawl.dev/v2/scrape');
    const bodyText = typeof init?.body === 'string' ? init.body : '';
    const request: unknown = JSON.parse(bodyText);
    if (!isRecord(request)) throw new Error('Firecrawl scrape body was not a JSON object.');
    assert.deepEqual(request.formats, [{ type: 'markdown' }]);
    return new Response(JSON.stringify({ success: true, data: { markdown: originalText } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  });
  assert.equal(calls, 1);
  assert.equal(result.enrichedCount, 1);
  assert.ok(result.items[0]?.sourceText?.includes('measurement method'));
  assert.equal(result.warnings.length, 0);
});
