import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRssFeed,
  buildDiscoveryOpportunities,
  fetchSpaceNews,
  newsForNiche,
  buildResearchOutline,
  getWikipediaSignal,
  SEARCH_DEMAND_PROVIDERS,
  SPACE_NEWS_SOURCES,
  DEFAULT_SPACE_NEWS_SOURCES,
  buildNicheSuggestions,
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

void test('JWST matching includes Webb and instrument aliases and accepts custom niche terms', () => {
  const feed = SPACE_NEWS_SOURCES[0];
  const stories = parseRssFeed(
    '<rss><item><title>Webb NIRSpec reveals a distant galaxy</title><link>https://www.nasa.gov/webb-nirspec</link><description>New JWST observations.</description></item><item><title>Artemis lunar mission update</title><link>https://www.nasa.gov/artemis-custom</link></item></rss>',
    feed,
  );
  assert.equal(newsForNiche(stories, 'jwst').length, 1);
  assert.equal(newsForNiche(stories, 'custom', 'NIRSpec, exoplanet atmospheres').length, 1);
  assert.ok(buildNicheSuggestions(stories).some((item) => item.id === 'jwst' && item.matchedStories === 1));
  assert.ok(buildNicheSuggestions(stories).some((item) => item.id.startsWith('story:') && item.title.includes('Webb NIRSpec')));
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
  const mockedFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    assert.match(headers.get('User-Agent') ?? '', /^MOHSEN-SCOUT\/1\.3/);
    assert.match(headers.get('Api-User-Agent') ?? '', /^MOHSEN-SCOUT\/1\.3/);
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

void test('A forced partial refresh clears stale complete cache so later entry can retry', async () => {
  const nasa = SPACE_NEWS_SOURCES.find((source) => source.id === 'esa-space')!;
  let attempts = 0;
  const fetcher: typeof fetch = async () => {
    attempts++;
    if (attempts === 1) return new Response('<rss><item><title>ESA Space News baseline</title><link>https://www.esa.int/baseline</link></item></rss>', { status: 200 });
    if (attempts === 2) return new Response('Unavailable', { status: 503 });
    return new Response('<rss><item><title>ESA Space News recovered</title><link>https://www.esa.int/recovered</link></item></rss>', { status: 200 });
  };
  const initial = await fetchSpaceNews([nasa.id], fetcher);
  assert.equal(initial.warnings.length, 0);
  assert.equal(attempts, 1);
  const cached = await fetchSpaceNews([nasa.id], fetcher);
  assert.equal(cached.items[0].title, 'ESA Space News baseline');
  assert.equal(attempts, 1);
  const partial = await fetchSpaceNews([nasa.id], fetcher, true);
  assert.equal(partial.warnings.length, 1);
  const recovered = await fetchSpaceNews([nasa.id], fetcher);
  assert.equal(recovered.items[0].title, 'ESA Space News recovered');
  assert.equal(attempts, 3);
});

void test('Space News retries only the unavailable official feed instead of caching partial results', async () => {
  const nasa = SPACE_NEWS_SOURCES.find((source) => source.id === 'nasa')!;
  const jpl = SPACE_NEWS_SOURCES.find((source) => source.id === 'jpl')!;
  let jplAttempts = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === jpl.url) {
      jplAttempts++;
      if (jplAttempts === 1) return new Response('Unavailable', { status: 503 });
      return new Response('<rss><item><title>JPL Webb update</title><link>https://www.jpl.nasa.gov/recovered</link></item></rss>', { status: 200 });
    }
    if (url === nasa.url) return new Response('<rss><item><title>NASA Webb telescope story</title><link>https://www.nasa.gov/working</link></item></rss>', { status: 200 });
    throw new Error('Unexpected feed URL: ' + url);
  };
  const first = await fetchSpaceNews([nasa.id, jpl.id], fetcher);
  assert.equal(first.items.length, 1);
  assert.equal(first.warnings.length, 1);
  assert.match(first.warnings[0], /HTTP 503/);
  const second = await fetchSpaceNews([nasa.id, jpl.id], fetcher);
  assert.equal(second.items.length, 2);
  assert.equal(second.warnings.length, 0);
  assert.equal(jplAttempts, 2);
});

void test('RSS parser extracts only trusted official HTTPS image URLs', () => {
  const feed = SPACE_NEWS_SOURCES.find((source) => source.id === 'nasa')!;
  const trusted = parseRssFeed('<rss><item><title>Exoplanet atmosphere report</title><link>https://www.nasa.gov/story</link><media:content url="https://images-assets.nasa.gov/image/example.jpg" medium="image" /></item></rss>', feed);
  assert.equal(trusted[0].imageUrl, 'https://images-assets.nasa.gov/image/example.jpg');
  const untrusted = parseRssFeed('<rss><item><title>Exoplanet atmosphere report</title><link>https://www.nasa.gov/story-2</link><media:thumbnail url="https://evil.example/image.jpg" /></item></rss>', feed);
  assert.equal(untrusted[0].imageUrl, undefined);
});

void test('Discovery groups exact matching official headlines and labels evidence without scoring demand', () => {
  const nasa = SPACE_NEWS_SOURCES.find((source) => source.id === 'nasa')!;
  const jpl = SPACE_NEWS_SOURCES.find((source) => source.id === 'jpl')!;
  const xmlA = '<rss><item><title>New exoplanet atmosphere observed</title><link>https://www.nasa.gov/story-a</link><description>Researchers report an exoplanet atmosphere observation.</description><pubDate>Sat, 14 Nov 2026 12:00:00 GMT</pubDate></item></rss>';
  const xmlB = '<rss><item><title>New exoplanet atmosphere observed</title><link>https://www.jpl.nasa.gov/story-b</link><description>Researchers report an exoplanet atmosphere observation.</description><pubDate>Sat, 14 Nov 2026 13:00:00 GMT</pubDate></item></rss>';
  const opportunities = buildDiscoveryOpportunities(
    [...parseRssFeed(xmlA, nasa), ...parseRssFeed(xmlB, jpl)],
    'exoplanets',
    Date.parse('2026-11-15T12:00:00Z'),
  );
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].sourceCount, 2);
  assert.ok(opportunities[0].labels.includes('Recently Reported'));
  assert.ok(opportunities[0].labels.includes('Multiple Source Coverage'));
  assert.match(opportunities[0].reason, /not proof of audience demand/);
});

void test('Discovery does not invent an opportunity when the selected niche has no matching report', () => {
  const feed = SPACE_NEWS_SOURCES[0];
  const news = parseRssFeed('<rss><item><title>Artemis lunar mission update</title><link>https://www.nasa.gov/artemis</link></item></rss>', feed);
  assert.equal(buildDiscoveryOpportunities(news, 'exoplanets').length, 0);
});
