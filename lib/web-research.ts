export type WebResearchItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  sourceName: string;
  publishedAt?: string;
  category: 'web' | 'news';
  /** Transient fetched page text; never persist this field in local memory or backups. */
  sourceText?: string;
};

export type WebResearchResult = {
  items: WebResearchItem[];
  query: string;
  warnings: string[];
};

export type WebResearchOptions = {
  apiKey?: string;
  limit?: number;
  days?: number;
  includeContent?: boolean;
  fetcher?: typeof fetch;
};

type WebSearchCacheEntry = { expiresAt: number; value: WebResearchResult };
const WEB_SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;
const WEB_SEARCH_CACHE_LIMIT = 64;
const webSearchCache = new Map<string, WebSearchCacheEntry>();
const webSearchInflight = new Map<string, Promise<WebResearchResult>>();
const fetcherIdentities = new WeakMap<typeof fetch, number>();
let nextFetcherIdentity = 1;

function fetcherIdentity(fetcher: typeof fetch): number {
  const existing = fetcherIdentities.get(fetcher);
  if (existing) return existing;
  const identity = nextFetcherIdentity++;
  fetcherIdentities.set(fetcher, identity);
  return identity;
}

function keyFingerprint(value: string | undefined): string {
  if (!value) return 'anonymous';
  // Ephemeral non-cryptographic fingerprint: the API key itself is never retained in the cache key.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cloneWebResearchResult(value: WebResearchResult): WebResearchResult {
  return {
    query: value.query,
    warnings: [...value.warnings],
    items: value.items.map((item) => ({ ...item })),
  };
}

/** Clear the ephemeral query cache (also useful for deterministic test isolation). */
export function clearWebResearchCache(): void {
  webSearchCache.clear();
  webSearchInflight.clear();
}

function cleanSourceText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|section|article|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/[\x60*_>#]+/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, maxLength);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\((https?:\/\/[^)]+)\)/g, ' ')
    .replace(/[\x60*_>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function safeWebUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return undefined;
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com') ||
        host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com') ||
        host === 'googlevideo.com' || host.endsWith('.googlevideo.com')) return undefined;
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return 'Web source';
  }
}

function parseFirecrawlItems(raw: unknown, limit: number): WebResearchItem[] {
  const root = asRecord(raw);
  const data = root && asRecord(root.data);
  const groups: { kind: 'web' | 'news'; values: unknown[] }[] = [];
  if (data) {
    if (Array.isArray(data.web)) groups.push({ kind: 'web', values: data.web });
    if (Array.isArray(data.news)) groups.push({ kind: 'news', values: data.news });
    if (Array.isArray(data.results)) groups.push({ kind: 'web', values: data.results });
  } else if (root && Array.isArray(root.data)) {
    groups.push({ kind: 'web', values: root.data });
  }
  const output: WebResearchItem[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const rawItem of group.values) {
      const item = asRecord(rawItem);
      if (!item) continue;
      const url = safeWebUrl(item.url);
      const title = cleanText(item.title, 500);
      if (!url || !title || seen.has(url)) continue;
      seen.add(url);
      const rawSourceText = typeof item.markdown === 'string' ? item.markdown
        : typeof item.content === 'string' ? item.content
          : typeof item.text === 'string' ? item.text : '';
      const sourceText = cleanSourceText(rawSourceText, 12000);
      const summary = cleanText(item.summary ?? item.description ?? item.snippet ?? rawSourceText, 1500);
      const dateRaw = item.publishedDate ?? item.publishedAt ?? item.date;
      const publishedAt = typeof dateRaw === 'string' && Number.isFinite(Date.parse(dateRaw))
        ? new Date(dateRaw).toISOString()
        : undefined;
      const host = sourceHost(url);
      const sourceName = cleanText(item.source ?? item.siteName ?? item.domain ?? host, 160) || host;
      output.push({
        id: 'web:' + url,
        title,
        summary: summary || 'No readable summary was returned. Open the original source before using its claims.',
        url,
        sourceName,
        ...(publishedAt ? { publishedAt } : {}),
        ...(sourceText.length >= 300 ? { sourceText } : {}),
        category: group.kind,
      });
      if (output.length >= limit) return output;
    }
  }
  return output;
}

function timeFilter(days?: number): string | undefined {
  if (!Number.isFinite(days) || !days || days <= 0) return undefined;
  if (days <= 1) return 'qdr:d';
  if (days <= 7) return 'qdr:w';
  if (days <= 31) return 'qdr:m';
  if (days <= 365) return 'qdr:y';
  return undefined;
}

/**
 * Performs one bounded Firecrawl v2 search. Keyless mode returns snippets and
 * is subject to per-IP daily caps. Markdown source text is requested only when
 * the user has configured a personal Firecrawl key.
 */
async function fetchWebResearchUncached(
  query: string,
  options: WebResearchOptions = {},
): Promise<WebResearchResult> {
  const cleanQuery = query.trim().replace(/\s+/g, ' ').slice(0, 220);
  if (!cleanQuery) throw new Error('Enter a research topic before searching the web.');
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(8, Math.floor(options.limit!)))
    : 6;
  const perSourceLimit = Math.max(1, Math.min(4, Math.ceil(limit / 2)));
  const includeContent = options.includeContent ?? Boolean(options.apiKey?.trim());
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.apiKey?.trim()) headers.Authorization = 'Bearer ' + options.apiKey.trim();
    const response = await fetcher('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        query: cleanQuery,
        limit: perSourceLimit,
        sources: ['web', 'news'],
        excludeDomains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
        ...(timeFilter(options.days) ? { tbs: timeFilter(options.days) } : {}),
        ...(includeContent ? { scrapeOptions: { formats: [{ type: 'markdown' }], onlyMainContent: true } } : {}),
      }),
    });
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? 'Firecrawl denied web research. Check the optional API key or access permissions.'
        : response.status === 402
          ? 'Firecrawl credits are unavailable. Continue with publisher feeds and Wikimedia.'
          : response.status === 429
            ? 'Firecrawl keyless/API rate limit reached. Continue with publisher feeds and Wikimedia.'
            : response.status >= 500
              ? 'Firecrawl web search is temporarily unavailable.'
              : 'Firecrawl rejected the web research request.';
      throw new Error(message);
    }
    const raw: unknown = await response.json();
    const root = asRecord(raw);
    if (root?.success === false) throw new Error('Firecrawl reported that web search did not complete.');
    const items = parseFirecrawlItems(raw, limit);
    const warnings = items.length
      ? []
      : ['Firecrawl returned no usable web/news results. Publisher RSS and Wikimedia remain independent sources.'];
    return { items, query: cleanQuery, warnings };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Firecrawl web search timed out. Other research sources can still be used.');
    }
    throw error instanceof Error ? error : new Error('Firecrawl web search failed.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchWebResearch(
  query: string,
  options: WebResearchOptions = {},
): Promise<WebResearchResult> {
  const cleanQuery = query.trim().replace(/\\s+/g, ' ').slice(0, 220);
  if (!cleanQuery) throw new Error('Enter a research topic before searching the web.');
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(8, Math.floor(options.limit!))) : 6;
  const days = Number.isFinite(options.days) ? Math.max(0, Math.floor(options.days!)) : 0;
  const includeContent = options.includeContent ?? Boolean(options.apiKey?.trim());
  const fetcher = options.fetcher ?? fetch;
  const cacheKey = [
    fetcherIdentity(fetcher),
    cleanQuery.toLocaleLowerCase(),
    limit,
    days,
    includeContent ? 'content' : 'snippets',
    keyFingerprint(options.apiKey?.trim()),
  ].join('|');
  const cached = webSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    webSearchCache.delete(cacheKey);
    webSearchCache.set(cacheKey, cached);
    return cloneWebResearchResult(cached.value);
  }
  if (cached) webSearchCache.delete(cacheKey);
  const inflight = webSearchInflight.get(cacheKey);
  if (inflight) return cloneWebResearchResult(await inflight);

  const request = fetchWebResearchUncached(cleanQuery, { ...options, limit, days, includeContent });
  webSearchInflight.set(cacheKey, request);
  try {
    const result = await request;
    if (result.items.length) {
      webSearchCache.set(cacheKey, { expiresAt: Date.now() + WEB_SEARCH_CACHE_TTL_MS, value: cloneWebResearchResult(result) });
      while (webSearchCache.size > WEB_SEARCH_CACHE_LIMIT) {
        const oldest = webSearchCache.keys().next().value;
        if (oldest === undefined) break;
        webSearchCache.delete(oldest);
      }
    }
    return cloneWebResearchResult(result);
  } finally {
    if (webSearchInflight.get(cacheKey) === request) webSearchInflight.delete(cacheKey);
  }
}

export async function testFirecrawlKey(key: string, fetcher: typeof fetch = fetch): Promise<void> {
  if (!key.trim()) throw new Error('Enter a Firecrawl API key first.');
  const result = await fetchWebResearch('NASA space science', {
    apiKey: key,
    limit: 1,
    includeContent: false,
    fetcher,
  });
  if (!result.items.length) throw new Error('Firecrawl responded, but no test search result was available.');
}


export type EnrichResearchEvidenceResult = {
  items: WebResearchItem[];
  enrichedCount: number;
  warnings: string[];
};

/**
 * Fetches original page text for a small, bounded set of selected publisher URLs.
 * Requires the user's own Firecrawl key. Text remains transient and is not saved
 * into the ResearchMemoryEntry or backup schemas.
 */
export async function enrichResearchEvidence(
  items: readonly WebResearchItem[],
  apiKey: string | undefined,
  maximum = 6,
  fetcher: typeof fetch = fetch,
): Promise<EnrichResearchEvidenceResult> {
  const output = [...items];
  const warnings: string[] = [];
  const key = apiKey?.trim();
  if (!key || maximum <= 0) return { items: output, enrichedCount: 0, warnings };
  const candidates = output
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.sourceText && Boolean(safeWebUrl(item.url)))
    .slice(0, Math.min(8, Math.max(0, Math.floor(maximum))));
  let cursor = 0;
  let enrichedCount = 0;
  let failedCount = 0;
  const worker = async () => {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++];
      if (!candidate) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 22000);
      try {
        const response = await fetcher('https://api.firecrawl.dev/v2/scrape', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            url: candidate.item.url,
            formats: [{ type: 'markdown' }],
            onlyMainContent: true,
          }),
        });
        if (!response.ok) {
          failedCount += 1;
          continue;
        }
        const raw: unknown = await response.json();
        const root = asRecord(raw);
        const data = root && asRecord(root.data);
        const markdown = cleanSourceText(data?.markdown ?? data?.content ?? root?.markdown ?? '', 12000);
        if (markdown.length < 300) {
          failedCount += 1;
          continue;
        }
        output[candidate.index] = { ...candidate.item, sourceText: markdown };
        enrichedCount += 1;
      } catch {
        failedCount += 1;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, candidates.length) }, () => worker()));
  if (failedCount) {
    warnings.push(failedCount + ' selected publisher page(s) could not provide enough readable original text. Their summaries remain context only, not claim-level proof.');
  }
  return { items: output, enrichedCount, warnings };
}
