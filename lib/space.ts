import { z } from 'zod';
import { requestJson, type Fetcher } from './api';

export type SpaceNewsSourceId = 'nasa' | 'jpl' | 'esa-space' | 'esa-science';
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
export type SpaceNewsSource = { id: SpaceNewsSourceId; name: string; url: string; label: string };
export type SpaceNewsItem = {
  id: string;
  sourceId: SpaceNewsSourceId;
  sourceName: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string | null;
};

export const SPACE_NEWS_SOURCES: SpaceNewsSource[] = [
  { id: 'nasa', name: 'NASA', label: 'NASA Science & News', url: 'https://www.nasa.gov/feed/' },
  { id: 'jpl', name: 'NASA JPL', label: 'JPL News', url: 'https://www.jpl.nasa.gov/feeds/news/' },
  { id: 'esa-space', name: 'ESA', label: 'ESA Space News', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_News' },
  { id: 'esa-science', name: 'ESA', label: 'ESA Space Science', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_Science' },
];
export const DEFAULT_SPACE_NEWS_SOURCES: SpaceNewsSourceId[] = [
  'nasa', 'jpl', 'esa-space', 'esa-science',
];

export const SPACE_NICHES = [
  { id: 'exoplanets', title: 'Exoplanets & Habitable Worlds', description: 'Worlds orbiting other stars, atmospheres and the search for habitability.', topic: 'exoplanet discoveries', keywords: ['exoplanet', 'extrasolar planet', 'habitable', 'planet atmosphere', 'earth-like world'] },
  { id: 'black-holes', title: 'Black Holes & Extreme Gravity', description: 'Event horizons, neutron stars, gravitational waves and extreme physics.', topic: 'black hole discoveries', keywords: ['black hole', 'neutron star', 'gravitational wave', 'event horizon', 'pulsar'] },
  { id: 'jwst', title: 'James Webb & Space Telescopes', description: 'New observations, early galaxies, star formation and telescope discoveries.', topic: 'James Webb Space Telescope discoveries', keywords: ['James Webb', 'JWST', 'space telescope', 'Hubble', 'early galaxy'] },
  { id: 'mars', title: 'Mars Exploration', description: 'Rovers, samples, geology, water history and future crewed missions.', topic: 'Mars exploration discoveries', keywords: ['Mars', 'Perseverance', 'Curiosity rover', 'Martian', 'Red Planet'] },
  { id: 'moon', title: 'Moon & Artemis', description: 'Lunar science, Artemis missions, landing systems and the next human exploration era.', topic: 'Moon exploration and Artemis', keywords: ['Moon', 'lunar', 'Artemis', 'Gateway', 'lunar lander'] },
  { id: 'astrobiology', title: 'Astrobiology & Life Beyond Earth', description: 'Biosignatures, ocean worlds, habitability and how scientists test life-related claims.', topic: 'astrobiology and life beyond Earth', keywords: ['astrobiology', 'biosignature', 'Europa', 'Enceladus', 'life beyond Earth', 'habitable'] },
  { id: 'sun', title: 'Sun & Space Weather', description: 'Solar flares, coronal mass ejections, auroras and effects on technology.', topic: 'solar activity and space weather', keywords: ['solar flare', 'coronal mass ejection', 'space weather', 'aurora', 'Sun'] },
  { id: 'asteroids', title: 'Asteroids & Planetary Defense', description: 'Near-Earth objects, impact risk, sample-return missions and deflection tests.', topic: 'asteroids and planetary defense', keywords: ['asteroid', 'near-Earth object', 'planetary defense', 'meteor', 'OSIRIS-REx', 'DART'] },
  { id: 'rockets', title: 'Rockets & Launch Technology', description: 'Launch systems, reusable rockets, propulsion and mission engineering.', topic: 'rocket launches and reusable spaceflight', keywords: ['rocket', 'launch', 'propulsion', 'reusable', 'Starship', 'Falcon'] },
  { id: 'cosmology', title: 'Cosmology & Dark Universe', description: 'Dark matter, dark energy, cosmic expansion and the structure of the universe.', topic: 'dark matter dark energy cosmology', keywords: ['dark matter', 'dark energy', 'cosmology', 'cosmic expansion', 'universe'] },
] as const;

const newsItemLimitPerFeed = 25;
const newsCache = new Map<string, { at: number; value: { items: SpaceNewsItem[]; warnings: string[] } }>();
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
export function parseRssFeed(xml: string, source: SpaceNewsSource): SpaceNewsItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, newsItemLimitPerFeed);
  return blocks.flatMap((match) => {
    const block = match[2];
    const title = xmlTag(block, 'title');
    const summary = xmlTag(block, 'description') || xmlTag(block, 'summary') || xmlTag(block, 'content:encoded');
    const rawLink = xmlTag(block, 'link') || block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || '';
    let url = '';
    try {
      const parsed = new URL(rawLink);
      if (parsed.protocol === 'https:') url = parsed.href;
    } catch {
      url = '';
    }
    const rawDate = xmlTag(block, 'pubDate') || xmlTag(block, 'published') || xmlTag(block, 'updated') || xmlTag(block, 'date');
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
    }];
  });
}

export async function fetchSpaceNews(
  enabledSources: readonly string[] = DEFAULT_SPACE_NEWS_SOURCES,
  fetcher: Fetcher = fetch,
): Promise<{ items: SpaceNewsItem[]; warnings: string[] }> {
  const ids = SPACE_NEWS_SOURCES.filter((source) => enabledSources.includes(source.id)).map((source) => source.id);
  const cacheKey = [...ids].sort().join(',');
  const cached = newsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  if (!ids.length) return { items: [], warnings: ['Enable at least one official news feed in Space Radar sources.'] };
  const selected = SPACE_NEWS_SOURCES.filter((source) => ids.includes(source.id));
  const results = await Promise.all(selected.map(async (source) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      let response: Response;
      let xml: string;
      try {
        response = await fetcher(source.url, {
          headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Feed request was not successful.');
        xml = await response.text();
      } finally {
        clearTimeout(timeout);
      }
      const items = parseRssFeed(xml, source);
      if (!items.length) throw new Error('Feed returned no readable items.');
      return { items, warning: '' };
    } catch {
      return { items: [] as SpaceNewsItem[], warning: source.label + ' could not be refreshed. Other sources remain available.' };
    }
  }));
  const warnings = results.map((result) => result.warning).filter(Boolean);
  const unique = new Map<string, SpaceNewsItem>();
  for (const result of results) for (const item of result.items) unique.set(item.url, item);
  const items = [...unique.values()].sort((a, b) => {
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
  const value = { items, warnings };
  if (items.length) newsCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

export function newsForNiche(items: SpaceNewsItem[], nicheId: string): SpaceNewsItem[] {
  const niche = SPACE_NICHES.find((entry) => entry.id === nicheId);
  if (!niche) return items;
  return items.filter((item) => {
    const haystack = (item.title + ' ' + item.summary).toLowerCase();
    return niche.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
  });
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
  const cacheKey = language + ':' + query.toLowerCase();
  const cached = wikiCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const searchParams = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, srlimit: '1', format: 'json', origin: '*' });
  const searchUrl = 'https://' + language + '.wikipedia.org/w/api.php?' + searchParams.toString();
  const search = wikiSearchSchema.safeParse(await requestJson(searchUrl, { headers: { 'Api-User-Agent': 'MOHSEN-SCOUT/1.0' } }, fetcher));
  if (!search.success || !search.data.query.search.length) throw new Error('No Wikipedia article matched "' + query + '". Try a more specific phrase.');
  const articleTitle = search.data.query.search[0].title;
  const articlePath = encodeURIComponent(articleTitle.replace(/ /g, '_'));
  const summaryUrl = 'https://' + language + '.wikipedia.org/api/rest_v1/page/summary/' + articlePath;
  let summary = '';
  let articleUrl = 'https://' + language + '.wikipedia.org/wiki/' + articlePath;
  try {
    const parsedSummary = wikiSummarySchema.safeParse(await requestJson(summaryUrl, { headers: { 'Api-User-Agent': 'MOHSEN-SCOUT/1.0' } }, fetcher));
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
  const views = pageviewsSchema.safeParse(await requestJson(apiUrl, { headers: { 'Api-User-Agent': 'MOHSEN-SCOUT/1.0' } }, fetcher));
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

export function buildResearchOutline(topic: string, sourceHeadlines: string[]): { titleIdeas: string[]; outline: string[]; verificationQuestions: string[] } {
  const safeTopic = topic.trim().slice(0, 140);
  const lead = sourceHeadlines.slice(0, 3);
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
