import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRssFeed,
  parseJsonFeed,
  buildDiscoveryOpportunities,
  fetchSpaceNews,
  newsForNiche,
  buildResearchOutline,
  getWikipediaSignal,
  SEARCH_DEMAND_PROVIDERS,
  SPACE_NEWS_SOURCES,
  DEFAULT_SPACE_NEWS_SOURCES,
  buildNicheSuggestions,
  hydrateSpaceNewsRegistry,
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
  const feed = SPACE_NEWS_SOURCES.find((source) => source.id === 'cneos')!;
  const fetcher: typeof fetch = async () => {
    attempts++;
    if (attempts === 1) return new Response('Unavailable', { status: 503 });
    return new Response('<rss><item><title>JWST telescope update</title><link>https://example.com/jwst</link></item></rss>', { status: 200 });
  };
  const first = await fetchSpaceNews([feed.id], fetcher, true);
  assert.equal(first.items.length, 0);
  assert.equal(first.warnings.length, 1);
  const second = await fetchSpaceNews([feed.id], fetcher, true);
  assert.equal(second.items.length, 1);
  assert.equal(attempts, 2);
});

void test('CNEOS is registered and fetched as an independent official feed', async () => {
  const source = SPACE_NEWS_SOURCES.find((item) => item.id === 'cneos')!;
  assert.equal(source.url, 'https://cneos.jpl.nasa.gov/feed/news.xml');
  const result = await fetchSpaceNews([source.id], async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    assert.equal(url, source.url);
    return new Response('<rss><item><title>CNEOS close approach update</title><link>https://cneos.jpl.nasa.gov/news/cneos-update</link></item></rss>', { status: 200 });
  }, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].sourceId, 'cneos');
  assert.equal(result.items[0].sourceName, 'CNEOS');
  assert.equal(result.warnings.length, 0);
});

void test('ESA Space News and Space Science point to verified current official feed endpoints', () => {
  const space = SPACE_NEWS_SOURCES.find((item) => item.id === 'esa-space')!;
  const science = SPACE_NEWS_SOURCES.find((item) => item.id === 'esa-science')!;
  assert.equal(space.url, 'https://www.esa.int/rss/news.rss');
  assert.equal(science.url, 'https://www.esa.int/rss/science.rss');
  assert.equal(space.fallbackUrls, undefined);
  assert.equal(science.fallbackUrls, undefined);
});

void test('A failed forced refresh returns clearly labelled stale items and retries later', async () => {
  const source = SPACE_NEWS_SOURCES.find((item) => item.id === 'jpl')!;
  let attempts = 0;
  const fetcher: typeof fetch = async () => {
    attempts++;
    if (attempts === 1) return new Response('<rss><item><title>JPL baseline story</title><link>https://www.jpl.nasa.gov/baseline</link></item></rss>', { status: 200 });
    if (attempts === 2) return new Response('Unavailable', { status: 503 });
    return new Response('<rss><item><title>JPL recovered story</title><link>https://www.jpl.nasa.gov/recovered-later</link></item></rss>', { status: 200 });
  };
  const first = await fetchSpaceNews([source.id], fetcher, true);
  const failed = await fetchSpaceNews([source.id], fetcher, true);
  assert.equal(first.items.length, 1);
  assert.equal(failed.items[0].title, 'JPL baseline story');
  assert.match(failed.warnings[0], /last successful copy/i);
  const recovered = await fetchSpaceNews([source.id], fetcher, true);
  assert.equal(recovered.items[0].title, 'JPL recovered story');
  assert.equal(attempts, 3);
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
  assert.deepEqual(DEFAULT_SPACE_NEWS_SOURCES, ['nasa', 'jpl', 'cneos', 'esa-space', 'esa-science']);
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

void test('Space News retries only the unavailable official feed instead of caching partial results', async () => {
  const nasa = SPACE_NEWS_SOURCES.find((source) => source.id === 'nasa')!;
  const science = SPACE_NEWS_SOURCES.find((source) => source.id === 'esa-science')!;
  let scienceAttempts = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === science.url) {
      scienceAttempts++;
      if (scienceAttempts <= 1) return new Response('Unavailable', { status: 503 });
      return new Response('<rss><item><title>ESA science story</title><link>https://www.esa.int/science-recovered</link></item></rss>', { status: 200 });
    }
    if (url === nasa.url) return new Response('<rss><item><title>NASA Webb telescope story</title><link>https://www.nasa.gov/working</link></item></rss>', { status: 200 });
    throw new Error('Unexpected feed URL: ' + url);
  };
  const first = await fetchSpaceNews([nasa.id, science.id], fetcher, true);
  assert.equal(first.items.length, 1);
  assert.equal(first.warnings.length, 1);
  assert.match(first.warnings[0], /HTTP 503/);
  const second = await fetchSpaceNews([nasa.id, science.id], fetcher, true);
  assert.equal(second.items.length, 2);
  assert.equal(second.warnings.length, 0);
  assert.equal(scienceAttempts, 2);
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


void test('Manual niche matching uses explicit semantic aliases without broad generic matches', () => {
  const items = [
    {
      id: 'mock-webb',
      title: 'James Webb Space Telescope reveals an exoplanet atmosphere',
      summary: 'A NIRSpec observation.',
      sourceName: 'NASA',
      sourceId: 'nasa' as const,
      url: 'https://www.nasa.gov/mock-webb',
      publishedAt: '2026-11-14T10:00:00.000Z',
      imageUrl: '',
    },
    {
      id: 'mock-generic',
      title: 'A generic space telescope launch',
      summary: 'An unrelated observatory announcement.',
      sourceName: 'ESA',
      sourceId: 'esa-space' as const,
      url: 'https://www.esa.int/mock-launch',
      publishedAt: '2026-11-14T10:00:00.000Z',
      imageUrl: '',
    },
  ];
  const results = newsForNiche(items, 'custom', 'JWST');
  assert.deepEqual(results.map((item) => item.url), ['https://www.nasa.gov/mock-webb']);
});


void test('Discovery deduplicates Persian publisher headlines and keeps the latest source record', () => {
  const nasa = SPACE_NEWS_SOURCES.find((source) => source.id === 'nasa')!;
  const jpl = SPACE_NEWS_SOURCES.find((source) => source.id === 'jpl')!;
  const xmlA = '<rss><item><title>تلسکوپ جیمز وب جو یک سیاره فراخورشیدی را بررسی کرد</title><link>https://www.nasa.gov/persian-story-a</link><pubDate>Sat, 14 Nov 2026 10:00:00 GMT</pubDate></item></rss>';
  const xmlB = '<rss><item><title>تلسکوپ جیمز وب جو یک سیاره فراخورشیدی را بررسی کرد</title><link>https://www.jpl.nasa.gov/persian-story-b</link><pubDate>Sun, 15 Nov 2026 10:00:00 GMT</pubDate></item></rss>';
  const opportunities = buildDiscoveryOpportunities(
    [...parseRssFeed(xmlA, nasa), ...parseRssFeed(xmlB, jpl)],
    'custom',
    Date.parse('2026-11-16T12:00:00Z'),
    'جیمز وب',
  );
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].sourceCount, 2);
  assert.equal(opportunities[0].publishedAt, '2026-11-15T10:00:00.000Z');
  assert.equal(opportunities[0].freshness, 'fresh');
});

void test('Discovery labels undated and historical reports instead of treating them as new', () => {
  const source = SPACE_NEWS_SOURCES.find((item) => item.id === 'nasa')!;
  const xml = '<rss><item><title>Exoplanet atmosphere research archived report</title><link>https://www.nasa.gov/old-report</link><pubDate>Fri, 01 May 2026 12:00:00 GMT</pubDate></item><item><title>Exoplanet atmosphere report without a date</title><link>https://www.nasa.gov/undated-report</link></item></rss>';
  const opportunities = buildDiscoveryOpportunities(
    parseRssFeed(xml, source),
    'exoplanets',
    Date.parse('2026-11-16T12:00:00Z'),
  );
  assert.ok(opportunities.some((item) => item.labels.includes('Older Source Story')));
  assert.ok(opportunities.some((item) => item.labels.includes('Publication Date Unavailable')));
});


void test('JSON Feed parser accepts validated entries and rejects unsafe links', () => {
  const source = SPACE_NEWS_SOURCES.find((item) => item.id === 'cneos')!;
  const json = JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: 'CNEOS JSON feed',
    items: [
      { id: 'one', url: 'https://cneos.jpl.nasa.gov/one', title: 'Near-Earth object update', content_text: 'A safe summary.', date_published: '2026-11-15T10:00:00Z' },
      { id: 'two', url: 'http://unsafe.example/two', title: 'Unsafe link' },
      { id: 'three', url: 'https://cneos.jpl.nasa.gov/three', content_text: 'Missing a title' },
    ],
  });
  const parsed = parseJsonFeed(json, source);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'Near-Earth object update');
  assert.equal(parsed[0].summary, 'A safe summary.');
  assert.equal(parsed[0].sourceId, 'cneos');
});

void test('Feed autodiscovery follows an official JSON Feed alternate link', async () => {
  const source = SPACE_NEWS_SOURCES.find((item) => item.id === 'nasa')!;
  const feedUrl = new URL('/news/discovered.json', source.url).href;
  const requested: string[] = [];
  const result = await fetchSpaceNews([source.id], async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requested.push(url);
    if (url === source.url) {
      return new Response('<html><head><link rel="alternate" type="application/feed+json" href="/news/discovered.json"></head></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    if (url === feedUrl) {
      return new Response(JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        items: [{ id: 'webb-1', title: 'Webb telescope update', url: 'https://www.nasa.gov/webb-json', content_text: 'A JSON Feed item.' }],
      }), { status: 200, headers: { 'content-type': 'application/feed+json' } });
    }
    return new Response('Unexpected endpoint', { status: 500 });
  }, true);
  assert.deepEqual(requested, [source.url, feedUrl]);
  assert.equal(result.items[0].title, 'Webb telescope update');
});

void test('Conditional feed requests send ETag and Last-Modified and reuse the last-good cache on 304', async () => {
  const source = SPACE_NEWS_SOURCES.find((item) => item.id === 'cneos')!;
  let calls = 0;
  let conditionalSeen = false;
  const fetcher: typeof fetch = async (_input, init) => {
    calls++;
    const headers = new Headers(init?.headers);
    if (calls === 1) {
      return new Response('<rss><item><title>CNEOS baseline</title><link>https://cneos.jpl.nasa.gov/baseline</link></item></rss>', {
        status: 200,
        headers: { ETag: '"v1"', 'Last-Modified': 'Sun, 15 Nov 2026 10:00:00 GMT' },
      });
    }
    conditionalSeen = headers.get('If-None-Match') === '"v1"' &&
      headers.get('If-Modified-Since') === 'Sun, 15 Nov 2026 10:00:00 GMT';
    return new Response(null, { status: 304 });
  };
  const initial = await fetchSpaceNews([source.id], fetcher, true);
  const unchanged = await fetchSpaceNews([source.id], fetcher, true);
  assert.equal(initial.items[0].title, 'CNEOS baseline');
  assert.equal(unchanged.items[0].title, 'CNEOS baseline');
  assert.equal(conditionalSeen, true);
  assert.equal(calls, 2);
});

void test('A failed refresh preserves last-good data, labels it stale, and recovers after exponential retry backoff', async () => {
  const source = SPACE_NEWS_SOURCES.find((item) => item.id === 'cneos')!;
  let attempts = 0;
  const fetcher: typeof fetch = async () => {
    attempts++;
    if (attempts === 1) return new Response('<rss><item><title>CNEOS last good</title><link>https://cneos.jpl.nasa.gov/last-good</link></item></rss>', { status: 200 });
    return new Response('Unavailable', { status: 503 });
  };
  const good = await fetchSpaceNews([source.id], fetcher, true);
  const failed = await fetchSpaceNews([source.id], fetcher, true);
  const deferred = await fetchSpaceNews([source.id], fetcher);
  assert.equal(good.items[0].title, 'CNEOS last good');
  assert.equal(failed.items[0].title, 'CNEOS last good');
  assert.match(failed.warnings[0], /last successful copy/i);
  assert.equal(deferred.items[0].title, 'CNEOS last good');
  assert.match(deferred.warnings[0], /temporarily paused/i);
  assert.equal(attempts, 2);
});

void test('Feed Registry persists last-good cache and HTTP validators across an app restart', async () => {
  const source = SPACE_NEWS_SOURCES.find((item) => item.id === 'cneos')!;
  const firstFetcher: typeof fetch = async () => new Response(
    '<rss><channel><item><title>CNEOS persisted registry story</title><link>https://cneos.jpl.nasa.gov/persisted-registry-story</link></item></channel></rss>',
    { status: 200, headers: { 'content-type': 'application/rss+xml', etag: '"cneos-registry-v1"', 'last-modified': 'Sun, 15 Nov 2026 10:00:00 GMT' } },
  );
  const first = await fetchSpaceNews([source.id], firstFetcher, true);
  assert.equal(first.registry[0].status, 'healthy');
  assert.equal(first.registry[0].format, 'rss');
  assert.equal(first.registry[0].etag, '"cneos-registry-v1"');
  assert.equal(first.registry[0].cachedItems[0].title, 'CNEOS persisted registry story');

  let validatorsRestored = false;
  const restartedFetcher: typeof fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    validatorsRestored = headers.get('If-None-Match') === '"cneos-registry-v1"' &&
      headers.get('If-Modified-Since') === 'Sun, 15 Nov 2026 10:00:00 GMT';
    return new Response(null, { status: 304 });
  };
  hydrateSpaceNewsRegistry(first.registry, restartedFetcher);
  const restored = await fetchSpaceNews([source.id], restartedFetcher, true);
  assert.equal(validatorsRestored, true);
  assert.equal(restored.items[0].title, 'CNEOS persisted registry story');
  assert.equal(restored.registry[0].status, 'healthy');
  assert.equal(restored.warnings.length, 0);
});

