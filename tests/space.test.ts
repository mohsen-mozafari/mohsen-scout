import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRssFeed,
  fetchSpaceNews,
  newsForNiche,
  buildResearchOutline,
  getWikipediaSignal,
  SEARCH_DEMAND_PROVIDERS,
  SPACE_NEWS_SOURCES,
  DEFAULT_SPACE_NEWS_SOURCES,
} from '../lib/space';

void test('RSS parser reads RSS items, CDATA, entities and safe HTTPS links', () => {
  const feed = SPACE_NEWS_SOURCES.find((source) => source.id === 'nasa')!;
  const xml = '<rss><channel><item><title><![CDATA[Webb &amp; exoplanets]]></title><link>https://example.com/story</link><description><![CDATA[An atmosphere &amp; new result.]]></description><pubDate>Sun, 15 Nov 2026 12:00:00 GMT</pubDate></item></channel></rss>';
  const items = parseRssFeed(xml, feed);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Webb & exoplanets');
  assert.match(items[0].summary, /An atmosphere & new result/);
  assert.equal(items[0].sourceId, 'nasa');
  assert.equal(items[0].publishedAt, '2026-11-15T12:00:00.000Z');
});

void test('RSS parser safely handles invalid numeric entities in external feed text', () => {
  const feed = SPACE_NEWS_SOURCES[0];
  const parsed = parseRssFeed('<rss><item><title>Exoplanets &#x110000; &amp; Webb</title><link>https://example.com/safe</link></item></rss>', feed);
  assert.equal(parsed.length, 1);
  assert.match(parsed[0].title, /Webb/);
});

void test('A failed feed refresh is not cached and can recover on the next user request', async () => {
  let attempts = 0;
  const feed = SPACE_NEWS_SOURCES.find((source) => source.id === 'nasa')!;
  const fetcher: typeof fetch = async () => {
    attempts++;
    if (attempts === 1) return new Response('Unavailable', { status: 503 });
    return new Response('<rss><item><title>JWST telescope update</title><link>https://example.com/jwst</link></item></rss>', { status: 200 });
  };
  const first = await fetchSpaceNews([feed.id], fetcher);
  assert.equal(first.items.length, 0);
  assert.equal(first.warnings.length, 1);
  const second = await fetchSpaceNews([feed.id], fetcher);
  assert.equal(second.items.length, 1);
  assert.equal(attempts, 2);
});

void test('RSS parser ignores entries without a title or HTTPS source link', () => {
  const feed = SPACE_NEWS_SOURCES[0];
  const xml = '<rss><item><title>Unsafe</title><link>http://example.com/no</link></item><item><link>https://example.com/no-title</link></item></rss>';
  assert.equal(parseRssFeed(xml, feed).length, 0);
});

void test('RSS parser reads Atom link attributes', () => {
  const feed = SPACE_NEWS_SOURCES.find((source) => source.id === 'jpl')!;
  const xml = '<feed><entry><title>Solar mission update</title><link href="https://example.com/solar"/><summary>Solar observation</summary><updated>2026-11-15T10:00:00Z</updated></entry></feed>';
  const parsed = parseRssFeed(xml, feed);
  assert.equal(parsed[0].url, 'https://example.com/solar');
  assert.equal(parsed[0].summary, 'Solar observation');
});

void test('Niche matching filters source headlines without assigning a market score', () => {
  const source = SPACE_NEWS_SOURCES[0];
  const parsed = parseRssFeed('<rss><item><title>New exoplanet atmosphere observed</title><link>https://example.com/a</link></item><item><title>Artemis lunar mission update</title><link>https://example.com/b</link></item></rss>', source);
  assert.equal(newsForNiche(parsed, 'exoplanets').length, 1);
  assert.equal(newsForNiche(parsed, 'moon').length, 1);
});

void test('Research outline keeps unknowns and verification questions explicit', () => {
  const outline = buildResearchOutline('Europa ocean worlds', ['New plume observation']);
  assert.equal(outline.titleIdeas.length, 3);
  assert.ok(outline.outline.some((line) => line.includes('open scientific questions')));
  assert.equal(outline.verificationQuestions.length, 4);
});

void test('Provider defaults are official source IDs and can be replaced by local settings', () => {
  assert.deepEqual(DEFAULT_SPACE_NEWS_SOURCES, ['nasa', 'jpl', 'esa-space', 'esa-science']);
  assert.ok(DEFAULT_SPACE_NEWS_SOURCES.every((id) => SPACE_NEWS_SOURCES.some((source) => source.id === id)));
});


void test('Wikimedia provider returns language-scoped article pageviews, not a synthetic trend score', async () => {
  const calls: string[] = [];
  const mockedFetch: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url.includes('/w/api.php')) {
      return new Response(JSON.stringify({ query: { search: [{ title: 'Exoplanet' }] } }), { status: 200 });
    }
    if (url.includes('/page/summary/')) {
      return new Response(JSON.stringify({
        title: 'Exoplanet',
        extract: 'A planet outside the Solar System.',
        content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Exoplanet' } },
      }), { status: 200 });
    }
    if (url.includes('/metrics/pageviews/')) {
      assert.match(url, /en\.wikipedia\.org\/all-access\/all-agents/);
      return new Response(JSON.stringify({ items: [
        { timestamp: '2026060100', views: 130 },
        { timestamp: '2026070100', views: 150 },
      ] }), { status: 200 });
    }
    throw new Error('Unexpected Wikimedia URL: ' + url);
  };
  const signal = await getWikipediaSignal('exoplanets', 'en', mockedFetch, new Date('2026-11-15T00:00:00Z'));
  assert.equal(signal.provider, 'wikimedia-pageviews');
  assert.equal(signal.articleTitle, 'Exoplanet');
  assert.equal(signal.monthlyViews[0].views, 130);
  assert.equal(calls.length, 3);
  assert.equal(SEARCH_DEMAND_PROVIDERS[0].id, 'wikimedia-pageviews');
});
