import { z } from 'zod';
import { requestJson, type Fetcher } from './api';
import { classifyPublicationFreshness, deduplicateResearchEvidence, matchesResearchTerms, normalizeResearchText, scoreResearchText } from './intelligence';
import type { FeedRegistryRecord } from './types';

export type SpaceNewsSourceId = 'nasa' | 'jpl' | 'cneos' | 'esa-space' | 'esa-science';
export type WikiLanguage = 'en' | 'fa' | 'de' | 'fr' | 'es' | 'ja';
export type SearchDemandProviderId = 'wikimedia-pageviews';
export type SearchDemandSignal = WikiSignal;
export const SEARCH_DEMAND_PROVIDERS = [{
  id: 'wikimedia-pageviews' as const,
  label: 'Wikimedia Pageviews',
  metric: 'Monthly encyclopedia article views',
  limitation: 'An attention proxy, not Google search volume or YouTube views.',
  apiKeyRequired: false,
  run: getWikipediaSignal,
}];
export type SpaceNewsSource = { id: SpaceNewsSourceId; name: string; url: string; label: string; fallbackUrls?: string[] };
export type SpaceNewsItem = {
  id: string;
  sourceId: SpaceNewsSourceId;
  sourceName: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string | null;
  imageUrl?: string;
};

export const SPACE_NEWS_SOURCES: SpaceNewsSource[] = [
  {
    id: 'nasa', name: 'NASA', label: 'NASA Science & News', url: 'https://www.nasa.gov/feed/',
    fallbackUrls: ['https://science.nasa.gov/feed/', 'https://www.nasa.gov/news-release/feed/'],
  },
  {
    id: 'jpl', name: 'NASA JPL', label: 'JPL News', url: 'https://www.jpl.nasa.gov/feeds/news/',
  },
  {
    id: 'cneos', name: 'CNEOS', label: 'CNEOS Recent News', url: 'https://cneos.jpl.nasa.gov/feed/news.xml',
  },
  {
    id: 'esa-space', name: 'ESA', label: 'ESA Top News / Space News', url: 'https://www.esa.int/rss/news.rss',
  },
  {
    id: 'esa-science', name: 'ESA', label: 'ESA Space Science', url: 'https://www.esa.int/rss/science.rss',
  },
];
export const DEFAULT_SPACE_NEWS_SOURCES: SpaceNewsSourceId[] = [
  'nasa', 'jpl', 'cneos', 'esa-space', 'esa-science',
];

export const SPACE_NICHES = [
  { id: 'exoplanets', title: 'Exoplanets & Habitable Worlds', description: 'Worlds orbiting other stars, atmospheres and the search for habitability.', topic: 'exoplanet discoveries', keywords: ['exoplanet', 'extrasolar planet', 'habitable', 'planet atmosphere', 'earth-like world'] },
  { id: 'black-holes', title: 'Black Holes & Extreme Gravity', description: 'Event horizons, neutron stars, gravitational waves and extreme physics.', topic: 'black hole discoveries', keywords: ['black hole', 'neutron star', 'gravitational wave', 'event horizon', 'pulsar'] },
  { id: 'jwst', title: 'James Webb & Space Telescopes', description: 'New observations, early galaxies, star formation and telescope discoveries.', topic: 'James Webb Space Telescope discoveries', keywords: ['James Webb', 'JWST', 'Webb', 'Webb telescope', 'space telescope', 'Hubble', 'NIRCam', 'NIRSpec', 'MIRI', 'early galaxy', 'early galaxies', 'first galaxies', 'deep field', 'star formation'] },
  { id: 'mars', title: 'Mars Exploration', description: 'Rovers, samples, geology, water history and future crewed missions.', topic: 'Mars exploration discoveries', keywords: ['Mars', 'Perseverance', 'Curiosity rover', 'Martian', 'Red Planet'] },
  { id: 'moon', title: 'Moon & Artemis', description: 'Lunar science, Artemis missions, landing systems and the next human exploration era.', topic: 'Moon exploration and Artemis', keywords: ['Moon', 'lunar', 'Artemis', 'Gateway', 'lunar lander'] },
  { id: 'astrobiology', title: 'Astrobiology & Life Beyond Earth', description: 'Biosignatures, ocean worlds, habitability and how scientists test life-related claims.', topic: 'astrobiology and life beyond Earth', keywords: ['astrobiology', 'biosignature', 'Europa', 'Enceladus', 'life beyond Earth', 'habitable'] },
  { id: 'sun', title: 'Sun & Space Weather', description: 'Solar flares, coronal mass ejections, auroras and effects on technology.', topic: 'solar activity and space weather', keywords: ['solar flare', 'coronal mass ejection', 'space weather', 'aurora', 'Sun'] },
  { id: 'asteroids', title: 'Asteroids & Planetary Defense', description: 'Near-Earth objects, impact risk, sample-return missions and deflection tests.', topic: 'asteroids and planetary defense', keywords: ['asteroid', 'near-Earth object', 'planetary defense', 'meteor', 'OSIRIS-REx', 'DART'] },
  { id: 'rockets', title: 'Rockets & Launch Technology', description: 'Launch systems, reusable rockets, propulsion and mission engineering.', topic: 'rocket launches and reusable spaceflight', keywords: ['rocket', 'launch', 'propulsion', 'reusable', 'Starship', 'Falcon'] },
  { id: 'cosmology', title: 'Cosmology & Dark Universe', description: 'Dark matter, dark energy, cosmic expansion and the structure of the universe.', topic: 'dark matter dark energy cosmology', keywords: ['dark matter', 'dark energy', 'cosmology', 'cosmic expansion', 'universe'] },
] as const;

const newsItemLimitPerFeed = 80;
type NewsFeedCacheEntry = {
  at: number;
  items: SpaceNewsItem[];
  format?: 'rss' | 'atom' | 'json' | 'unknown';
  etag?: string;
  lastModified?: string;
  endpoint?: string;
};
type NewsFeedHealth = { failures: number; retryAt: number; warning: string; checkedAt: number };
const newsSourceCache = new Map<string, NewsFeedCacheEntry>();
const newsSourceHealth = new Map<string, NewsFeedHealth>();
const fetcherNamespaces = new WeakMap<Fetcher, string>();
let nextFetcherNamespace = 1;
function fetcherNamespace(fetcher: Fetcher): string {
  let namespace = fetcherNamespaces.get(fetcher);
  if (!namespace) {
    namespace = 'feed-client-' + nextFetcherNamespace++;
    fetcherNamespaces.set(fetcher, namespace);
  }
  return namespace;
}
const wikiCache = new Map<string, { at: number; value: WikiSignal }>();
const CACHE_MS = 10 * 60 * 1000;

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const point = Number(code);
      return point >= 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : ' ';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
      const point = parseInt(code, 16);
      return Number.isFinite(point) && point >= 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}
function xmlTag(block: string, tag: string): string {
  const expression = '<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>';
  const match = block.match(new RegExp(expression, 'i'));
  return match ? decodeXml(match[1]) : '';
}
function xmlLink(block: string): string {
  const links = [...block.matchAll(/<link\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/link\s*>)/gi)];
  if (!links.length) return '';
  const preferred = links.find((entry) => {
    const rel = entry[1].match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    return !rel || rel === 'alternate';
  }) ?? links[0];
  const href = preferred[1].match(/\bhref=["']([^"']+)["']/i)?.[1];
  return decodeXml((href || preferred[2] || '').trim());
}

function safeOfficialImageUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase();
    const trusted = host === 'nasa.gov' || host.endsWith('.nasa.gov') ||
      host === 'jpl.nasa.gov' || host.endsWith('.jpl.nasa.gov') ||
      host === 'esa.int' || host.endsWith('.esa.int');
    return parsed.protocol === 'https:' && trusted ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
function rssImageUrl(block: string): string | undefined {
  const candidates = [
    block.match(/<(?:media:content|media:thumbnail)\b[^>]*\burl=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1],
    block.match(/<enclosure\b(?=[^>]*\btype=["']image\/)[^>]*\burl=["']([^"']+)["'][^>]*>/i)?.[1],
    block.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1],
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const safe = safeOfficialImageUrl(decodeXml(candidate));
    if (safe) return safe;
  }
  return undefined;
}
export function parseRssFeed(xml: string, source: SpaceNewsSource): SpaceNewsItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, newsItemLimitPerFeed);
  return blocks.flatMap((match) => {
    const block = match[2];
    const title = xmlTag(block, 'title');
    const summary = xmlTag(block, 'description') || xmlTag(block, 'summary') || xmlTag(block, 'content:encoded');
    const rawLink = xmlLink(block);
    let url = '';
    try {
      const parsed = new URL(rawLink);
      if (parsed.protocol === 'https:') url = parsed.href;
    } catch {
      url = '';
    }
    const rawDate = xmlTag(block, 'pubDate') || xmlTag(block, 'published') || xmlTag(block, 'updated') || xmlTag(block, 'dc:date') || xmlTag(block, 'date');
    const parsedDate = rawDate ? Date.parse(rawDate) : NaN;
    const publishedAt = Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : null;
    if (!title || !url) return [];
    return [{
      id: source.id + ':' + url,
      sourceId: source.id,
      sourceName: source.name,
      title: title.slice(0, 300),
      summary: summary.slice(0, 1200),
      url,
      publishedAt,
      imageUrl: rssImageUrl(block),
    }];
  });
}

export function parseJsonFeed(json: string, source: SpaceNewsSource): SpaceNewsItem[] {
  let payload: unknown;
  try { payload = JSON.parse(json); } catch { return []; }
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { items?: unknown }).items)) return [];
  return (payload as { items: unknown[] }).items.slice(0, newsItemLimitPerFeed).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const rawUrl = typeof item.url === 'string' ? item.url
      : typeof item.external_url === 'string' ? item.external_url : '';
    let url = '';
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'https:') url = parsed.href;
    } catch { url = ''; }
    if (!title || !url) return [];
    const summary = typeof item.content_text === 'string' ? item.content_text
      : typeof item.summary === 'string' ? item.summary
        : typeof item.content_html === 'string' ? item.content_html : '';
    const rawDate = typeof item.date_published === 'string' ? item.date_published
      : typeof item.date_modified === 'string' ? item.date_modified : '';
    const parsedDate = rawDate ? Date.parse(rawDate) : Number.NaN;
    const publishedAt = Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : null;
    const rawImage = typeof item.image === 'string' ? item.image
      : typeof item.banner_image === 'string' ? item.banner_image : '';
    const imageUrl = rawImage ? safeOfficialImageUrl(rawImage) : undefined;
    return [{
      id: source.id + ':' + url,
      sourceId: source.id,
      sourceName: source.name,
      title: title.slice(0, 300),
      summary: decodeXml(summary).slice(0, 1200),
      url,
      publishedAt,
      ...(imageUrl ? { imageUrl } : {}),
    }];
  });
}

const newsInflight = new Map<string, Promise<{ items: SpaceNewsItem[]; warnings: string[]; registry: FeedRegistryRecord[] }>>();

function feedHttpReason(status: number) {
  return status === 403 ? 'access was refused by the publisher'
    : status === 404 ? 'the configured feed was not found'
    : status === 429 ? 'the publisher is rate-limiting requests'
    : status >= 500 ? 'the publisher service is temporarily unavailable'
    : 'the publisher returned an unsuccessful response';
}

function discoverOfficialFeeds(html: string, pageUrl: string, source: SpaceNewsSource): string[] {
  let sourceHost = '';
  try { sourceHost = new URL(source.url).hostname.toLowerCase(); } catch { return []; }
  const rootDomain = sourceHost.split('.').slice(-2).join('.');
  const candidates: string[] = [];
  for (const match of html.matchAll(/<link\b([^>]*?)\/?>/gi)) {
    const attrs = match[1];
    const rel = attrs.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase().split(/\s+/) ?? [];
    const type = attrs.match(/\btype=["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? '';
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href || !rel.includes('alternate') || !/(rss|atom|json|xml)/i.test(type)) continue;
    try {
      const parsed = new URL(decodeXml(href), pageUrl);
      if (parsed.protocol !== 'https:') continue;
      const host = parsed.hostname.toLowerCase();
      if (host !== rootDomain && !host.endsWith('.' + rootDomain)) continue;
      candidates.push(parsed.href);
    } catch { /* Ignore malformed alternate links. */ }
  }
  return [...new Set(candidates)];
}

type FeedRefreshResult = {
  items: SpaceNewsItem[];
  warning: string;
  endpoint?: string;
  etag?: string;
  lastModified?: string;
  format?: 'rss' | 'atom' | 'json' | 'unknown';
  notModified?: boolean;
};

async function loadOfficialFeed(
  source: SpaceNewsSource,
  fetcher: Fetcher,
  previous?: NewsFeedCacheEntry,
): Promise<FeedRefreshResult> {
  const endpoints = [...new Set([
    ...(previous?.endpoint ? [previous.endpoint] : []),
    source.url,
    ...(source.fallbackUrls ?? []),
  ])];
  const failures: string[] = [];
  const visited = new Set<string>();
  for (let index = 0; index < endpoints.length && index < 8; index++) {
    const endpoint = endpoints[index];
    if (visited.has(endpoint)) continue;
    visited.add(endpoint);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/rss+xml, application/atom+xml, application/feed+json, application/json;q=0.9, application/xml, text/xml;q=0.8, text/html;q=0.5, */*;q=0.3',
        'Cache-Control': 'no-cache',
        'User-Agent': 'MOHSEN-SCOUT/1.3.9 (+https://github.com/mohsen-mozafari/mohsen-scout)',
      };
      if (previous?.endpoint === endpoint && previous.etag) headers['If-None-Match'] = previous.etag;
      if (previous?.endpoint === endpoint && previous.lastModified) headers['If-Modified-Since'] = previous.lastModified;
      const response = await fetcher(endpoint, {
        headers,
        redirect: 'follow',
        signal: controller.signal,
      });
      if (response.status === 304 && previous?.items.length) {
        return {
          items: previous.items,
          warning: '',
          endpoint,
          etag: response.headers.get('ETag') ?? previous.etag,
          lastModified: response.headers.get('Last-Modified') ?? previous.lastModified,
          format: previous.format ?? 'unknown',
          notModified: true,
        };
      }
      if (!response.ok) {
        failures.push('HTTP ' + response.status + ': ' + feedHttpReason(response.status));
        continue;
      }
      const body = await response.text();
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      const isJson = contentType.includes('json') || body.trimStart().startsWith('{');
      const format: 'rss' | 'atom' | 'json' = isJson ? 'json' : contentType.includes('atom') || /<feed\b/i.test(body) ? 'atom' : 'rss';
      const items = isJson ? parseJsonFeed(body, source) : parseRssFeed(body, source);
      if (items.length) {
        return {
          items,
          warning: '',
          endpoint,
          etag: response.headers.get('ETag') ?? undefined,
          lastModified: response.headers.get('Last-Modified') ?? undefined,
          format,
        };
      }
      const discovered = discoverOfficialFeeds(body, response.url || endpoint, source);
      const preferredDiscovered = discovered.filter((candidate) => !visited.has(candidate) && !endpoints.includes(candidate));
      if (preferredDiscovered.length) endpoints.splice(index + 1, 0, ...preferredDiscovered);
      failures.push(isJson
        ? 'the JSON response did not contain readable Feed items'
        : 'the endpoint responded but contained no readable RSS/Atom entries');
    } catch (error) {
      const timedOut = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
      const message = error instanceof Error ? error.message : '';
      failures.push(timedOut
        ? 'the request timed out'
        : /certificate|tls|ssl/i.test(message)
          ? 'the secure TLS connection failed'
          : /getaddrinfo|enotfound|eai_again|dns/i.test(message)
            ? 'the publisher hostname could not be resolved (DNS)'
            : 'the publisher could not be reached over the network');
    } finally {
      clearTimeout(timeout);
    }
  }
  const lastFailure = failures[failures.length - 1] ?? 'no feed endpoint was available';
  return { items: [], warning: source.label + ' could not refresh: ' + lastFailure + '. Other publishers remain available.' };
}

export async function fetchSpaceNews(
  enabledSources: readonly string[] = DEFAULT_SPACE_NEWS_SOURCES,
  fetcher: Fetcher = fetch,
  force = false,
): Promise<{ items: SpaceNewsItem[]; warnings: string[]; registry: FeedRegistryRecord[] }> {
  const ids = SPACE_NEWS_SOURCES.filter((source) => enabledSources.includes(source.id)).map((source) => source.id);
  if (!ids.length) return { items: [], warnings: ['Enable at least one official news feed in Space Radar sources.'], registry: [] };
  const namespace = fetcherNamespace(fetcher);
  const cacheKey = namespace + ':' + [...ids].sort().join(',');
  const inflight = newsInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    const selected = SPACE_NEWS_SOURCES.filter((source) => ids.includes(source.id));
    const results = await Promise.all(selected.map(async (source) => {
      const sourceCacheKey = namespace + ':' + source.id;
      const previous = newsSourceCache.get(sourceCacheKey);
      const health = newsSourceHealth.get(sourceCacheKey);
      const now = Date.now();
      if (!force && previous && !health && now - previous.at < CACHE_MS) {
        return { items: previous.items, warning: '' };
      }
      if (!force && health && now < health.retryAt) {
        const retryAt = new Date(health.retryAt).toLocaleTimeString();
        return {
          items: previous?.items ?? [],
          warning: previous?.items.length
            ? source.label + ' refresh is temporarily paused after a feed error. Showing the last successful copy; next retry after ' + retryAt + '.'
            : health.warning + ' Retry after ' + retryAt + '.',
        };
      }
      const refreshed = await loadOfficialFeed(source, fetcher, previous);
      if (refreshed.items.length) {
        newsSourceCache.set(sourceCacheKey, {
          at: Date.now(),
          items: refreshed.items,
          etag: refreshed.etag,
          lastModified: refreshed.lastModified,
          endpoint: refreshed.endpoint,
          format: refreshed.format ?? 'unknown',
        });
        newsSourceHealth.delete(sourceCacheKey);
        return { items: refreshed.items, warning: '' };
      }
      const failures = (health?.failures ?? 0) + 1;
      const retryDelay = Math.min(6 * 60 * 60 * 1000, 30_000 * 2 ** Math.min(10, failures - 1));
      const retryAt = Date.now() + retryDelay;
      newsSourceHealth.set(sourceCacheKey, {
        failures,
        retryAt,
        warning: refreshed.warning,
        checkedAt: Date.now(),
      });
      if (previous?.items.length) {
        return {
          items: previous.items,
          warning: refreshed.warning + ' Showing the last successful copy; its contents may be out of date.',
        };
      }
      return refreshed;
    }));
    const warnings = results.map((result) => result.warning).filter(Boolean);
    const unique = new Map<string, SpaceNewsItem>();
    for (const result of results) for (const item of result.items) unique.set(item.url, item);
    const items = [...unique.values()].sort((a, b) => {
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    });
    return { items, warnings, registry: getSpaceNewsRegistry(ids, fetcher) };
  })();
  newsInflight.set(cacheKey, request);
  try { return await request; }
  finally { newsInflight.delete(cacheKey); }
}

export function getSpaceNewsRegistry(enabledSources: readonly string[] = DEFAULT_SPACE_NEWS_SOURCES, fetcher: Fetcher = fetch): FeedRegistryRecord[] {
  const namespace = fetcherNamespace(fetcher);
  return SPACE_NEWS_SOURCES.filter((source) => enabledSources.includes(source.id)).map((source) => {
    const key = namespace + ':' + source.id;
    const cached = newsSourceCache.get(key);
    const health = newsSourceHealth.get(key);
    return {
      sourceId: source.id,
      configuredUrl: source.url,
      endpoint: cached?.endpoint ?? source.url,
      format: cached?.format ?? 'unknown',
      status: health ? cached?.items.length ? 'stale' : 'unavailable' : cached ? 'healthy' : 'unknown',
      lastCheckedAt: health?.checkedAt ?? cached?.at ?? 0,
      lastSuccessAt: cached?.at ?? 0,
      failureCount: health?.failures ?? 0,
      retryAt: health?.retryAt ?? 0,
      lastError: health?.warning ?? '',
      ...(cached?.etag ? { etag: cached.etag } : {}),
      ...(cached?.lastModified ? { lastModified: cached.lastModified } : {}),
      cachedItems: cached?.items ?? [],
    };
  });
}

export function hydrateSpaceNewsRegistry(records: readonly FeedRegistryRecord[], fetcher: Fetcher = fetch): void {
  const namespace = fetcherNamespace(fetcher);
  for (const record of records) {
    const key = namespace + ':' + record.sourceId;
    if (record.cachedItems.length && record.lastSuccessAt > 0) {
      newsSourceCache.set(key, {
        at: record.lastSuccessAt,
        items: record.cachedItems,
        endpoint: record.endpoint,
        format: record.format,
        etag: record.etag,
        lastModified: record.lastModified,
      });
    }
    if (record.failureCount > 0 && record.retryAt > 0) {
      newsSourceHealth.set(key, {
        failures: record.failureCount,
        retryAt: record.retryAt,
        warning: record.lastError,
        checkedAt: record.lastCheckedAt,
      });
    }
  }
}

/** Returns saved publisher items immediately, before any network refresh. */
export function getCachedSpaceNews(
  records: readonly FeedRegistryRecord[],
  enabledSources: readonly string[],
): SpaceNewsItem[] {
  const enabled = new Set(enabledSources);
  const byUrl = new Map<string, SpaceNewsItem>();
  for (const record of records) {
    if (!enabled.has(record.sourceId)) continue;
    for (const item of record.cachedItems) {
      const previous = byUrl.get(item.url);
      const currentDate = item.publishedAt ? Date.parse(item.publishedAt) || 0 : 0;
      const previousDate = previous?.publishedAt ? Date.parse(previous.publishedAt) || 0 : 0;
      if (!previous || currentDate > previousDate) byUrl.set(item.url, item);
    }
  }
  return [...byUrl.values()].sort((a, b) =>
    (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0),
  );
}

export function newsForNiche(items: SpaceNewsItem[], nicheId: string, customNiche = ''): SpaceNewsItem[] {
  if (nicheId === 'all' || nicheId === 'auto') return items;
  const niche = SPACE_NICHES.find((entry) => entry.id === nicheId);
  const rawTerms = niche
    ? [...niche.keywords]
    : nicheId === 'custom'
      ? customNiche.split(/[,;\n]+/).map((term) => term.trim()).filter(Boolean)
      : [];
  if (!rawTerms.length) return [];
  return items.map((item, index) => {
    const titleScore = Math.max(0, ...rawTerms.map((term) => scoreResearchText(term, item.title)));
    const relevanceScore = Math.max(0, ...rawTerms.map((term) => scoreResearchText(term, item.title, item.summary)));
    const matches = rawTerms.some((term) => matchesResearchTerms(item.title + ' ' + item.summary, [term]));
    return { item, index, titleScore, relevanceScore, matches };
  }).filter((entry) => entry.matches && entry.relevanceScore > 0)
    .sort((a, b) => b.titleScore - a.titleScore || b.relevanceScore - a.relevanceScore ||
      (Date.parse(b.item.publishedAt ?? '') || 0) - (Date.parse(a.item.publishedAt ?? '') || 0) || a.index - b.index)
    .map((entry) => entry.item);
}
export type SpaceNicheSuggestion = {
  id: string; title: string; topic: string; description: string;
  matchedStories: number; newestAt: string | null;
};
export function buildNicheSuggestions(items: SpaceNewsItem[], limit = 6): SpaceNicheSuggestion[] {
  const maxItems = Math.max(1, Math.min(10, limit));
  const curated = SPACE_NICHES.map((niche) => {
    const matches = newsForNiche(items, niche.id);
    const newestAt = matches.map((item) => item.publishedAt)
      .filter((date): date is string => Boolean(date))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
    return {
      id: niche.id, title: niche.title, topic: niche.topic,
      description: niche.description + ' Current match count reflects only selected official publisher feeds.',
      matchedStories: matches.length, newestAt,
    };
  }).filter((item) => item.matchedStories > 0)
    .sort((a, b) => b.matchedStories - a.matchedStories ||
      (b.newestAt ? Date.parse(b.newestAt) : 0) - (a.newestAt ? Date.parse(a.newestAt) : 0))
    .slice(0, Math.min(4, maxItems));

  // Combine established subject areas with actual new headlines so the dashboard
  // is not limited to a fixed niche catalogue.
  const storyLeads = [...items]
    .sort((a, b) => {
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    })
    .slice(0, Math.max(0, maxItems - curated.length))
    .map((item) => ({
      id: 'story:' + item.id,
      title: item.title,
      topic: item.title,
      description: 'Fresh official headline from ' + item.sourceName + '. Open the original report and verify its scientific claims before treating it as a full niche.',
      matchedStories: 1,
      newestAt: item.publishedAt,
    }));
  return [...curated, ...storyLeads];
}

export type DiscoveryOpportunity = {
  id: string;
  topic: string;
  summary: string;
  publishedAt: string | null;
  sourceName: string;
  sourceCount: number;
  sourceUrl: string;
  imageUrl?: string;
  labels: string[];
  reason: string;
  freshness: 'fresh' | 'recent' | 'stale' | 'undated' | 'future-dated';
};

/** Build source-backed opportunities only; no YouTube API is called here. */
export function buildDiscoveryOpportunities(
  items: SpaceNewsItem[],
  nicheId: string,
  now = Date.now(),
  customNiche = '',
): DiscoveryOpportunity[] {
  const relevant = newsForNiche(items, nicheId, customNiche);
  const dateValue = (value: string | null) => {
    const parsed = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const newestFirst = [...relevant].sort((a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt));
  const deduplicated = deduplicateResearchEvidence(newestFirst.map((item) => ({
    ...item,
    sourceUrl: item.url,
  })));
  const freshnessOrder = { fresh: 0, recent: 1, stale: 2, undated: 3, 'future-dated': 4 } as const;
  return deduplicated.items.map((latest) => {
    const sources = [...new Set(latest.sourceIds?.length ? latest.sourceIds : [latest.sourceId])];
    const sourceCount = Math.max(1, sources.length, latest.sourceCount ?? 0);
    const freshness = classifyPublicationFreshness(latest.publishedAt, now);
    const labels = ['New Source Story'];
    if (freshness.status === 'fresh') labels.push('Recently Reported');
    else if (freshness.status === 'recent') labels.push('Reported Within 30 Days');
    else if (freshness.status === 'stale') labels.push('Older Source Story');
    else if (freshness.status === 'undated') labels.push('Publication Date Unavailable');
    else labels.push('Date Needs Verification');
    if (sourceCount > 1) labels.push('Multiple Source Coverage');
    const sourceName = latest.sourceName || latest.sourceId;
    let reason = 'A report from ' + sourceName + ' matches your selected niche. Check its date and verify the original claim before prioritizing it.';
    if (freshness.status === 'fresh' || freshness.status === 'recent') {
      reason = 'A recently published report from ' + sourceName + ' matches your selected niche. Audience demand and YouTube competition have not been checked.';
    } else if (freshness.status === 'stale') {
      reason = 'This older report from ' + sourceName + ' may provide historical context; check for newer developments before prioritizing it.';
    } else if (freshness.status === 'undated') {
      reason = 'A report from ' + sourceName + ' matches your selected niche, but its publication date is unavailable or invalid.';
    } else if (freshness.status === 'future-dated') {
      reason = 'The reported publication date is in the future; verify the publisher page before treating this item as current.';
    }
    if (sourceCount > 1) {
      reason = 'Matching reports appeared in ' + sourceCount + ' selected official feeds. This is feed coverage, not proof of independent verification and not proof of audience demand.';
    }
    return {
      id: latest.id,
      topic: latest.title,
      summary: latest.summary,
      publishedAt: latest.publishedAt,
      sourceName,
      sourceCount,
      sourceUrl: latest.url,
      imageUrl: latest.imageUrl,
      labels,
      reason,
      freshness: freshness.status,
    };
  }).sort((a, b) =>
    freshnessOrder[a.freshness] - freshnessOrder[b.freshness] ||
    b.sourceCount - a.sourceCount ||
    dateValue(b.publishedAt) - dateValue(a.publishedAt),
  ).slice(0, 40);
}

const wikiSearchSchema = z.object({ query: z.object({ search: z.array(z.object({ title: z.string() })) }) });
const wikiSummarySchema = z.object({
  title: z.string(),
  extract: z.string().optional().default(''),
  content_urls: z.object({ desktop: z.object({ page: z.string().url() }) }).optional(),
});
const pageviewsSchema = z.object({ items: z.array(z.object({ timestamp: z.string(), views: z.number().nonnegative() })) });
export type WikiSignal = {
  provider: 'wikimedia-pageviews';
  language: WikiLanguage;
  articleTitle: string;
  articleUrl: string;
  apiUrl: string;
  summary: string;
  monthlyViews: { month: string; views: number }[];
};
const formatApiMonth = (date: Date) => String(date.getUTCFullYear()) + String(date.getUTCMonth() + 1).padStart(2, '0') + '0100';
export async function getWikipediaSignal(
  topic: string,
  language: WikiLanguage = 'en',
  fetcher: Fetcher = fetch,
  now = new Date(),
): Promise<WikiSignal> {
  const query = topic.trim().slice(0, 120);
  if (!query) throw new Error('Enter a topic to compare.');
  const cacheKey = language + ':' + normalizeResearchText(query);
  const cached = wikiCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const searchParams = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, srlimit: '10', format: 'json', origin: '*' });
  const searchUrl = 'https://' + language + '.wikipedia.org/w/api.php?' + searchParams.toString();
  const wikiHeaders = {
    'User-Agent': 'MOHSEN-SCOUT/1.3 (+https://github.com/mohsen-mozafari/mohsen-scout)',
    'Api-User-Agent': 'MOHSEN-SCOUT/1.3 (https://github.com/mohsen-mozafari/mohsen-scout)',
  };
  const search = wikiSearchSchema.safeParse(await requestJson(searchUrl, { headers: wikiHeaders }, fetcher));
  if (!search.success || !search.data.query.search.length) throw new Error('No Wikipedia article matched "' + query + '". Try a more specific phrase.');
  const rankedArticles = search.data.query.search.map((item, index) => ({
    item, index, score: scoreResearchText(query, item.title),
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  const bestArticle = rankedArticles[0];
  if (!bestArticle || bestArticle.score <= 0)
    throw new Error('Wikipedia returned results, but none had a clear title match for "' + query + '". Try a more specific phrase or another language.');
  const articleTitle = bestArticle.item.title;
  const articlePath = encodeURIComponent(articleTitle.replace(/ /g, '_'));
  const summaryUrl = 'https://' + language + '.wikipedia.org/api/rest_v1/page/summary/' + articlePath;
  let summary = '';
  let articleUrl = 'https://' + language + '.wikipedia.org/wiki/' + articlePath;
  try {
    const parsedSummary = wikiSummarySchema.safeParse(await requestJson(summaryUrl, { headers: wikiHeaders }, fetcher));
    if (parsedSummary.success) {
      summary = parsedSummary.data.extract;
      articleUrl = parsedSummary.data.content_urls?.desktop.page ?? articleUrl;
    }
  } catch {
    // The pageviews series remains useful when the summary endpoint is unavailable.
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const project = language + '.wikipedia.org';
  const apiUrl = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/' + project + '/all-access/all-agents/' + articlePath + '/monthly/' + formatApiMonth(start) + '/' + formatApiMonth(end);
  const views = pageviewsSchema.safeParse(await requestJson(apiUrl, { headers: wikiHeaders }, fetcher));
  if (!views.success) throw new Error('Wikimedia pageview data could not be read for this article.');
  const value: WikiSignal = {
    provider: 'wikimedia-pageviews',
    language,
    articleTitle,
    articleUrl,
    apiUrl,
    summary,
    monthlyViews: views.data.items.map((item) => ({
      month: item.timestamp.slice(0, 4) + '-' + item.timestamp.slice(4, 6),
      views: item.views,
    })),
  };
  wikiCache.set(cacheKey, { at: Date.now(), value });
  if (wikiCache.size > 60) {
    const oldest = wikiCache.keys().next().value;
    if (oldest) wikiCache.delete(oldest);
  }
  return value;
}

export function buildResearchOutline(
  topic: string,
  sourceHeadlines: string[],
  language: 'fa' | 'en' = 'en',
): { titleIdeas: string[]; outline: string[]; verificationQuestions: string[] } {
  const safeTopic = topic.trim().slice(0, 140);
  const lead = sourceHeadlines.slice(0, 3);
  if (language === 'fa') {
    return {
      titleIdeas: [
        'دانشمندان واقعاً درباره ' + safeTopic + ' چه کشف کرده‌اند؟',
        safeTopic + ': شواهد، رازها و آنچه در ادامه می‌آید',
        'چرا ' + safeTopic + ' مهم‌تر از چیزی است که ابتدا به نظر می‌رسد؟',
      ],
      outline: [
        'شروع: پرسش اصلی درباره ' + safeTopic + ' را بدون بزرگ‌نمایی مطرح کن.',
        'زمینه: مأموریت، ابزار یا روش علمی پشت شواهد را توضیح بده.',
        ...(lead.length ? ['شواهد: گزارش‌های منبع اخیر را بررسی کن — ' + lead.join('؛ ') + '؛ عنوان‌ها را از نتیجه‌گیری علمی جدا نگه دار.'] : ['شواهد: قوی‌ترین مدارک اولیه موجود را ارائه کن و توضیح بده چه چیزی را ثابت می‌کنند و چه چیزی را نه.']),
        'جزئیات جالب: یک نتیجه تأییدشده را انتخاب کن و اهمیت آن را توضیح بده.',
        'موارد ناشناخته: پرسش‌های علمی باز را از مشاهدات تأییدشده جدا کن.',
        'اهمیت: یافته را به داستان گسترده‌تر نجوم و اکتشافات فضایی وصل کن.',
        'پایان: یک پرسش مشخص برای دنبال کردن مأموریت یا مشاهده بعدی مطرح کن.',
      ],
      verificationQuestions: [
        'آیا منبع اولیه یک اندازه‌گیری مستقیم را شرح می‌دهد، یک تفسیر یا یک فرضیه؟',
        'آیا نتیجه گزارش‌شده مستقل تأیید شده یا هنوز مقدماتی است؟',
        'آیا تاریخ‌ها، وضعیت مأموریت و نام ابزارها به‌روز هستند؟',
        'چه مدرکی می‌تواند توضیح پیشنهادی را تغییر دهد یا تضعیف کند؟',
      ],
    };
  }
  return {
    titleIdeas: [
      'What Scientists Have Actually Discovered About ' + safeTopic,
      safeTopic + ': The Evidence, the Mystery and What Comes Next',
      'Why ' + safeTopic + ' Matters More Than It First Appears',
    ],
    outline: [
      'Opening: introduce the central question behind ' + safeTopic + ' without overstating the discovery.',
      'Context: explain the mission, instrument or scientific method behind the evidence.',
      ...(lead.length ? ['Evidence: unpack the latest source reports — ' + lead.join('; ') + '.'] : ['Evidence: present the strongest primary-source material available and explain what it does and does not establish.']),
      'The surprising detail: select one verified result and explain why it changes the picture.',
      'What remains unknown: separate open scientific questions from confirmed observations.',
      'Why it matters: connect the finding to the wider story of astronomy and space exploration.',
      'Ending: give viewers one precise question to watch for in the next mission or observation.',
    ],
    verificationQuestions: [
      'Does the primary source describe a measurement, an interpretation or a hypothesis?',
      'Is the reported result independently confirmed, or is it preliminary?',
      'Are dates, mission status and instrument names current?',
      'What evidence would change or weaken the proposed explanation?',
    ],
  };
}
