import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, buildYouTubeSearchPlan, getOpinion, rankYouTubeSearchResults, requestJson, selectFreeModel, type Fetcher } from '../lib/api';
import { getWikipediaSignal, newsForNiche, SPACE_NEWS_SOURCES } from '../lib/space';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const urlOf = (input: string | URL | Request) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

void test('YouTube search plan distributes the 12-request cap across languages before secondary angles', () => {
  const languages = ['en', 'fa', 'de', 'fr'];
  const plan = buildYouTubeSearchPlan('Mars exploration', languages);
  assert.equal(plan.length, 12);
  assert.deepEqual(plan.slice(0, 4).map((item) => item.language), languages);
  assert.deepEqual(plan.slice(0, 4).map((item) => item.bucket), ['relevance', 'relevance', 'relevance', 'relevance']);
  assert.ok(languages.every((language) => plan.some((item) => item.language === language && item.bucket === 'relevance')));
});

void test('YouTube search plan removes duplicate language codes and preserves all four query angles when possible', () => {
  const plan = buildYouTubeSearchPlan('JWST', ['en', 'EN', 'fa']);
  assert.equal(plan.length, 8);
  assert.deepEqual([...new Set(plan.map((item) => item.language))], ['en', 'fa']);
  assert.deepEqual([...new Set(plan.map((item) => item.bucket))], ['relevance', 'popularity', 'recent', 'explainer']);
});

void test('YouTube results rank clear title matches ahead of unrelated descriptions', () => {
  const results = rankYouTubeSearchResults('JWST exoplanet atmosphere', [
    { id: 'noise-video', title: 'Football final highlights', description: 'A sports recap.' },
    { id: 'relevant-video', title: 'James Webb Space Telescope observes an exoplanet atmosphere', description: 'A telescope observation.' },
  ]);
  assert.deepEqual(results.map((item) => item.id), ['relevant-video', 'noise-video']);
});

void test('Free model selection retains a valid preference and replaces a stale model', () => {
  const models = [{ id: 'provider/model-a:free' }, { id: 'provider/model-b:free' }];
  assert.equal(selectFreeModel(models, 'provider/model-b:free'), 'provider/model-b:free');
  assert.equal(selectFreeModel(models, 'removed/model:free'), 'provider/model-a:free');
  assert.equal(selectFreeModel([], 'removed/model:free'), '');
});

void test('OpenRouter HTTP 402 is reported as an account-credit problem rather than a generic request error', async () => {
  await assert.rejects(
    () => requestJson('https://openrouter.ai/api/v1/chat/completions', { method: 'POST' }, async () => jsonResponse({ error: { code: 402 } }, 402)),
    (error) => error instanceof ApiError && error.code === 'credits' && /insufficient provider credits/i.test(error.message),
  );
});

void test('OpenRouter HTTP 429 is clear and generation POST is not retried automatically', async () => {
  let calls = 0;
  await assert.rejects(
    () => getOpinion('MOCK_KEY', 'provider/model:free', 'Review this idea.', undefined, async () => {
      calls += 1;
      return jsonResponse({ error: { code: 429 } }, 429);
    }),
    (error) => error instanceof ApiError && error.code === 'rate' && /rate limit/i.test(error.message),
  );
  assert.equal(calls, 1);
});

void test('OpenRouter error envelopes returned with HTTP 200 are still treated as provider errors', async () => {
  await assert.rejects(
    () => getOpinion('MOCK_KEY', 'provider/model:free', 'Review this idea.', undefined, async () => jsonResponse({ error: { code: 402, message: 'private provider detail' } })),
    (error) => error instanceof ApiError && error.code === 'credits' && !error.message.includes('private provider detail'),
  );
});

void test('OpenRouter successful second opinion returns trimmed text', async () => {
  const result = await getOpinion('MOCK_KEY', 'provider/model:free', 'Review this idea.', undefined, async () =>
    jsonResponse({ choices: [{ message: { content: '  A useful second opinion.  ' } }] }),
  );
  assert.equal(result, 'A useful second opinion.');
});

void test('Wikimedia search chooses the best title match instead of trusting the first search result', async () => {
  const requested: string[] = [];
  const fetcher: Fetcher = async (input) => {
    const url = new URL(urlOf(input));
    requested.push(url.href);
    if (url.pathname.endsWith('/w/api.php')) {
      assert.equal(url.searchParams.get('srlimit'), '10');
      return jsonResponse({ query: { search: [
        { title: 'Mars exploration' },
        { title: 'James Webb Space Telescope exoplanet atmosphere' },
      ] } });
    }
    if (url.pathname.includes('/page/summary/')) return jsonResponse({
      title: 'James Webb Space Telescope',
      extract: 'A space telescope.',
      content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/James_Webb_Space_Telescope' } },
    });
    if (url.pathname.includes('/metrics/pageviews/')) return jsonResponse({ items: [{ timestamp: '2026060100', views: 125 }] });
    throw new Error('Unexpected Wikimedia endpoint: ' + url.pathname);
  };
  const result = await getWikipediaSignal('JWST exoplanets', 'en', fetcher, new Date('2026-11-16T12:00:00Z'));
  assert.equal(result.articleTitle, 'James Webb Space Telescope exoplanet atmosphere');
  assert.equal(result.monthlyViews[0].views, 125);
  assert.ok(requested.some((url) => url.includes('James%20Webb%20Space%20Telescope')));
});

void test('Wikimedia refuses to attach pageviews when no returned article title matches the topic', async () => {
  let calls = 0;
  const fetcher: Fetcher = async () => {
    calls += 1;
    return jsonResponse({ query: { search: [{ title: 'Mars exploration' }] } });
  };
  await assert.rejects(
    () => getWikipediaSignal('James Webb telescope', 'en', fetcher, new Date('2026-11-16T12:00:00Z')),
    /none had a clear title match/i,
  );
  assert.equal(calls, 1);
});

void test('Official niche news results rank direct headline matches above summary-only matches', () => {
  const source = SPACE_NEWS_SOURCES[0];
  const summaryOnly = {
    id: 'summary-only', sourceId: source.id, sourceName: source.name,
    title: 'A general science update',
    summary: 'The James Webb Space Telescope is mentioned in this background article.',
    url: 'https://example.com/summary-only', publishedAt: '2026-11-16T12:00:00Z',
  };
  const titleMatch = {
    id: 'title-match', sourceId: source.id, sourceName: source.name,
    title: 'James Webb Space Telescope reveals an exoplanet atmosphere',
    summary: 'A new observation.',
    url: 'https://example.com/title-match', publishedAt: '2026-11-15T12:00:00Z',
  };
  const results = newsForNiche([summaryOnly, titleMatch], 'jwst');
  assert.deepEqual(results.map((item) => item.id), ['title-match', 'summary-only']);
});
