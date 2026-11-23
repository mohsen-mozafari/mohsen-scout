export type WebResearchItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  sourceName: string;
  publishedAt?: string;
  category: 'web' | 'news';
};

export type WebResearchResult = {
  items: WebResearchItem[];
  query: string;
  warnings: string[];
};

import { canonicalizeResearchUrl } from './intelligence';
import { buildResearchQueryPlan, type PlannedResearchQuery } from './research-plan';

export type WebResearchOptions = {
  apiKey?: string;
  limit?: number;
  days?: number;
  includeContent?: boolean;
  fetcher?: typeof fetch;
  language?: 'fa' | 'en';
};

export type WebResearchPlanResult = {
  items: WebResearchItem[];
  queries: PlannedResearchQuery[];
  warnings: string[];
};

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
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
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
      const summary = cleanText(item.summary ?? item.markdown ?? item.content ?? item.description ?? item.snippet, 1500);
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
 * is subject to per-IP daily caps. Full source summaries are requested only
 * when a personal API key is configured, to avoid surprise scrape charges.
 */
export async function fetchWebResearch(
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
        ...(includeContent ? { scrapeOptions: { formats: ['summary'], onlyMainContent: true } } : {}),
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


/**
 * Executes a bounded three-angle research plan sequentially. Results are
 * de-duplicated by canonical URL, while partial failures are retained as
 * warnings so publisher feeds and Wikimedia can still complete the run.
 */
export async function fetchPlannedWebResearch(
  topic: string,
  options: WebResearchOptions = {},
): Promise<WebResearchPlanResult> {
  const queries = buildResearchQueryPlan(topic, options.language ?? 'en');
  if (!queries.length) throw new Error('Enter a research topic before searching the web.');

  const totalLimit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(8, Math.floor(options.limit!)))
    : 6;
  const perQueryLimit = Math.max(1, Math.ceil(totalLimit / queries.length));
  const itemsByUrl = new Map<string, WebResearchItem>();
  const warnings: string[] = [];

  for (const planned of queries) {
    try {
      const result = await fetchWebResearch(planned.query, {
        ...options,
        limit: perQueryLimit,
      });
      warnings.push(...result.warnings.map((warning) => planned.intent + ': ' + warning));
      for (const item of result.items) {
        const canonical = canonicalizeResearchUrl(item.url);
        if (!canonical) continue;
        const previous = itemsByUrl.get(canonical);
        if (!previous) {
          itemsByUrl.set(canonical, item);
          continue;
        }
        const sourceNames = [...new Set([previous.sourceName, item.sourceName].filter(Boolean))];
        itemsByUrl.set(canonical, {
          ...previous,
          sourceName: sourceNames.join(' · ').slice(0, 160),
          summary: [previous.summary, item.summary]
            .filter((value, index, all) => value && all.indexOf(value) === index)
            .sort((a, b) => b.length - a.length)
            .slice(0, 2)
            .join(' '),
          publishedAt: previous.publishedAt ?? item.publishedAt,
        });
      }
    } catch (error) {
      warnings.push(
        planned.intent + ': ' +
        (error instanceof Error ? error.message : 'This search angle was unavailable.'),
      );
    }
  }

  const items = [...itemsByUrl.values()].slice(0, totalLimit);
  if (!items.length) {
    warnings.push('The bounded web research plan returned no usable independent source. Publisher feeds and Wikimedia remain available.');
  }
  return { items, queries, warnings: [...new Set(warnings)].slice(0, 12) };
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
