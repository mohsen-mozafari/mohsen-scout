import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchPlannedWebResearch } from '../lib/web-research';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

void test('bounded web plan performs three sequential independent searches and deduplicates canonical URLs', async () => {
  const queries: string[] = [];
  let active = 0;
  let maximumActive = 0;
  const result = await fetchPlannedWebResearch('Mars Sample Return', {
    limit: 6,
    language: 'en',
    fetcher: async (_url, init) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const body = JSON.parse(String(init?.body)) as { query: string };
      queries.push(body.query);
      await Promise.resolve();
      active -= 1;
      return jsonResponse({
        success: true,
        data: {
          web: [
            { url: 'https://example.org/primary?utm_source=search', title: 'Independent primary report', summary: body.query },
          ],
          news: [
            { url: 'https://news.example.org/report-' + queries.length, title: 'Independent news item ' + queries.length, summary: body.query },
          ],
        },
      });
    },
  });

  assert.equal(result.queries.length, 3);
  assert.equal(queries.length, 3);
  assert.equal(maximumActive, 1, 'queries should run sequentially to bound rate and cost');
  assert.equal(result.items.length, 4, 'the shared canonical URL must be merged');
  assert.ok(result.items.some((item) => item.url.includes('example.org/primary')));
  assert.ok(result.items.every((item) => !/youtube\.com|youtu\.be/i.test(item.url)));
});

void test('partial Firecrawl failures preserve successful research angles and report warnings', async () => {
  let calls = 0;
  const result = await fetchPlannedWebResearch('Mars Sample Return', {
    language: 'en',
    limit: 6,
    fetcher: async () => {
      calls += 1;
      if (calls === 2) return new Response('Unavailable', { status: 503 });
      return jsonResponse({ success: true, data: { web: [
        { url: 'https://example.org/result-' + calls, title: 'Primary report ' + calls, summary: 'Evidence.' },
      ] } });
    },
  });
  assert.equal(calls, 3);
  assert.equal(result.queries.length, 3);
  assert.equal(result.items.length, 2);
  assert.ok(result.warnings.some((warning) => warning.includes('temporarily unavailable')));
});
