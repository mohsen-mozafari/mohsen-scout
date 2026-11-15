import { z } from 'zod';
import { type Budget, type ResearchInput, type Video, type Region } from './types';
export type Fetcher = typeof fetch;
export class ApiError extends Error {
  constructor(
    message: string,
    public code = 'unknown',
  ) {
    super(message);
  }
}
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export function retryDelayMs(
  retryAfter: string | null,
  fallbackMs: number,
  now = Date.now(),
): number | null {
  let delay = fallbackMs;
  if (retryAfter) {
    const value = retryAfter.trim();
    const serverDelay = /^\d+(\.\d+)?$/.test(value)
      ? Number(value) * 1000
      : Date.parse(value) - now;
    if (Number.isFinite(serverDelay)) delay = Math.max(delay, serverDelay);
  }
  return delay > 30000 ? null : Math.max(0, delay);
}
export async function requestJson(
  url: string,
  init: RequestInit = {},
  fetcher: Fetcher = fetch,
  beforeAttempt?: () => Promise<void>,
  timeoutMs = 15000,
  backoffBaseMs = 500,
): Promise<unknown> {
  const attempts = init.method === 'POST' ? 1 : 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    await beforeAttempt?.();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, { ...init, signal: controller.signal });
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (response.ok)
          throw new ApiError('The service returned an unreadable response.', 'invalid');
        body = null;
      }
      clearTimeout(timer);
      if (response.ok) return body;
      const serialized = JSON.stringify(body);
      const hostname = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } })();
      const isGoogleApi = hostname === 'www.googleapis.com';
      const isOpenRouter = hostname === 'openrouter.ai' || hostname.endsWith('.openrouter.ai');
      const isWikimedia = hostname.endsWith('wikipedia.org') || hostname === 'wikimedia.org' || hostname.endsWith('.wikimedia.org');
      if (isGoogleApi && /quotaExceeded|dailyLimitExceeded/.test(serialized))
        throw new ApiError('YouTube quota is exhausted. Check Google Cloud before trying again.', 'quota');
      if (/keyInvalid|API_KEY_INVALID/.test(serialized) ||
          (response.status === 401 && (isGoogleApi || isOpenRouter)))
        throw new ApiError(isOpenRouter
          ? 'The OpenRouter key was rejected. Check or replace it in Settings.'
          : 'The API key is invalid. Replace it in Settings.', 'key');
      if (response.status === 403 && isGoogleApi)
        throw new ApiError('YouTube API access was denied. Enable YouTube Data API v3 and check key restrictions in Google Cloud.', 'permission');
      if (response.status === 403 && isWikimedia)
        throw new ApiError('Wikimedia refused this request. The app identification header may be missing, or the service may be rate-limiting this network. Retry later or open the article directly.', 'permission');
      if (response.status === 403 && isOpenRouter)
        throw new ApiError('OpenRouter refused this request. Check the key, model access and provider limits.', 'permission');
      if (response.status === 403)
        throw new ApiError('The external service refused the request. Check its access policy or retry later.', 'permission');
      if (response.status === 404)
        throw new ApiError(isOpenRouter
          ? 'That model or endpoint is unavailable. Refresh the model list.'
          : 'The requested data endpoint was not found.', 'endpoint');
      if (response.status === 429 || response.status >= 500) {
        if (attempt < attempts - 1) {
          const delay = retryDelayMs(
            response.headers.get('Retry-After'),
            backoffBaseMs * 2 ** attempt,
          );
          if (delay !== null) {
            await wait(delay);
            continue;
          }
        }
        throw new ApiError(
          response.status === 429
            ? 'The service is rate limited. Try again later.'
            : 'The service is unavailable. Try again later.',
          'service',
        );
      }
      throw new ApiError('The request was rejected. Check your API configuration.', 'request');
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (attempt === attempts - 1)
        throw new ApiError(
          controller.signal.aborted
            ? 'The request timed out. Try again.'
            : 'Could not connect. Check your internet connection.',
          controller.signal.aborted ? 'timeout' : 'offline',
        );
      await wait(backoffBaseMs * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ApiError('Could not complete the request.');
}
export function quotaDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function nextBudget(old: Budget, limit: number, units: number, now = new Date()): Budget {
  const date = quotaDay(now);
  const current = old.date === date ? old : { date, units: 0, requests: 0, exhausted: false };
  if (current.exhausted || current.units + units > limit)
    throw new ApiError(
      'Your local request budget is reached. Change it in Settings or wait for the next Pacific-time day.',
      'budget',
    );
  return { ...current, units: current.units + units, requests: current.requests + 1 };
}
const searchSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z.array(
    z.object({
      id: z.object({ videoId: z.string().regex(/^[\w-]{11}$/) }),
      snippet: z.object({
        title: z.string(),
        description: z.string(),
        channelTitle: z.string(),
        publishedAt: z.string().datetime(),
        thumbnails: z.object({
          medium: z.object({ url: z.string() }).optional(),
          default: z.object({ url: z.string() }).optional(),
        }),
      }),
    }),
  ),
});
export const relatedQueries = (topic: string) => [
  topic.trim(),
  `${topic.trim()} beginner guide`,
  `${topic.trim()} common mistakes`,
  `${topic.trim()} comparison`,
];
const inflight = new Map<string, Promise<unknown>>();
export type YouTubeOptions = {
  key: string;
  charge: (units: number) => Promise<void>;
  fetcher?: Fetcher;
  onQuota?: () => Promise<void>;
};
async function youtube(
  endpoint: string,
  params: Record<string, string>,
  options: YouTubeOptions,
  units: number,
) {
  const query = new URLSearchParams({ ...params, key: options.key });
  const url = `https://www.googleapis.com/youtube/v3/${endpoint}?${query}`;
  const existing = inflight.get(url);
  if (existing) return existing;
  const promise = requestJson(url, {}, options.fetcher, () => options.charge(units));
  inflight.set(url, promise);
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'quota') await options.onQuota?.();
    throw error;
  } finally {
    inflight.delete(url);
  }
}
export async function testYouTube(options: YouTubeOptions) {
  const raw = await youtube(
    'videos',
    { part: 'id', id: 'dQw4w9WgXcQ', fields: 'items(id)' },
    options,
    1,
  );
  if (!z.object({ items: z.array(z.object({ id: z.string() })) }).safeParse(raw).success)
    throw new ApiError('YouTube returned an invalid response.', 'invalid');
}
export async function searchYouTube(
  input: ResearchInput,
  options: YouTubeOptions,
  onProgress?: (text: string) => void,
) {
  const queries = relatedQueries(input.topic);
  const videos = new Map<string, Video>();
  const warnings: string[] = [];
  let calls = 0;
  const searches = input.languages.flatMap((language) => [
    ...queries.map((query) => ({ language, query, order: 'date' })),
    { language, query: input.topic, order: 'viewCount' },
  ]);
  for (const search of searches) {
    if (calls >= 12) {
      warnings.push('Stopped at the 12-search safety cap. Not all query and language combinations were sampled.');
      break;
    }
    onProgress?.(`Searching ${search.query} · ${search.language}`);
    let pageToken = '';
    let page = 0;
    do {
      const params: Record<string, string> = {
        part: 'snippet', type: 'video', q: search.query, order: search.order,
        relevanceLanguage: search.language,
        maxResults: String(Math.min(50, Math.max(1, Math.ceil(input.maxResults / searches.length)))),
        videoDuration: input.duration,
        fields: 'nextPageToken,items(id/videoId,snippet(title,description,channelTitle,publishedAt,thumbnails))',
      };
      const regionCodes: Partial<Record<Region, string>> = { 'United States': 'US', Iran: 'IR', 'United Kingdom': 'GB', Germany: 'DE' };
      if (regionCodes[input.region]) params.regionCode = regionCodes[input.region]!;
      if (input.category) params.videoCategoryId = input.category;
      if (input.days) params.publishedAfter = new Date(Date.now() - input.days * 86400000).toISOString();
      if (pageToken) params.pageToken = pageToken;
      let raw: unknown;
      try {
        raw = await youtube('search', params, options, 100);
      } catch (error) {
        if (!videos.size) throw error;
        warnings.push(error instanceof Error ? error.message : 'A search failed.');
        return { videos: [...videos.values()], queries, warnings };
      }
      calls++;
      const parsed = searchSchema.safeParse(raw);
      if (!parsed.success) throw new ApiError('YouTube returned an invalid search response.', 'invalid');
      for (const item of parsed.data.items) {
        if (!videos.has(item.id.videoId) && videos.size < input.maxResults)
          videos.set(item.id.videoId, {
            id: item.id.videoId, title: item.snippet.title, description: item.snippet.description,
            channel: item.snippet.channelTitle, publishedAt: item.snippet.publishedAt,
            thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? '',
            fetchedAt: Date.now(), query: search.order === 'viewCount' ? 'YouTube popularity order' : search.query,
          });
      }
      pageToken = parsed.data.nextPageToken ?? '';
      page++;
    } while (pageToken && page < 2 && calls < 12 && videos.size < input.maxResults);
  }
  const collected = [...videos.values()];
  for (let offset = 0; offset < collected.length; offset += 50) {
    const batch = collected.slice(offset, offset + 50);
    try {
      const raw = await youtube('videos', {
        part: 'statistics', id: batch.map((item) => item.id).join(','),
        fields: 'items(id,statistics(viewCount,likeCount))',
      }, options, 1);
      const parsed = z.object({
        items: z.array(z.object({
          id: z.string(),
          statistics: z.object({ viewCount: z.string().optional(), likeCount: z.string().optional() }).optional(),
        })),
      }).safeParse(raw);
      if (!parsed.success) throw new ApiError('Video statistics returned an invalid response.', 'invalid');
      const counts = new Map(parsed.data.items.map((item) => [item.id, item.statistics]));
      for (const video of batch) {
        const stats = counts.get(video.id);
        video.viewCount = stats?.viewCount && /^\d+$/.test(stats.viewCount) ? Number(stats.viewCount) : null;
        video.likeCount = stats?.likeCount && /^\d+$/.test(stats.likeCount) ? Number(stats.likeCount) : null;
      }
    } catch {
      warnings.push('Video titles and dates were retrieved, but raw view/like counts could not be loaded. Sorting falls back to available fields.');
      break;
    }
  }
  return { videos: collected, queries, warnings };
}
const modelSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      pricing: z.object({ prompt: z.string(), completion: z.string() }),
    }),
  ),
});
export async function getFreeModels(fetcher: Fetcher = fetch) {
  const parsed = modelSchema.safeParse(
    await requestJson('https://openrouter.ai/api/v1/models', {}, fetcher),
  );
  if (!parsed.success) throw new ApiError('The model list could not be read.', 'invalid');
  return parsed.data.data.filter(
    (m) => Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0,
  );
}
export async function testOpenRouter(key: string) {
  const raw = await requestJson('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!z.object({ data: z.object({}).passthrough() }).safeParse(raw).success)
    throw new ApiError('OpenRouter returned an invalid response.', 'invalid');
}
export function opinionPrompt(topic: string, concept: string, decision: string) {
  const cleanTopic = topic.trim();
  const cleanConcept = concept.trim();
  if (!cleanTopic || cleanTopic.toLowerCase() === 'untitled idea' || !cleanConcept)
    throw new ApiError('Complete the idea title and video concept before requesting an AI second opinion.', 'input');
  return `Give a concise English second opinion on this user-created editorial idea. No YouTube API data or performance statistics are provided. Topic: ${cleanTopic.slice(0, 300)}. Proposed concept: ${cleanConcept.slice(0, 1200)}. Personal decision: ${decision.trim().slice(0, 600) || 'No personal decision supplied yet.'}. Assess the clarity and originality of the concept, useful angles, competition uncertainty, validation steps and practical prioritization. Say insufficient evidence for demand/competition claims. Do not invent trends, scores, probabilities, or percentages. Distinguish subjective judgment from evidence; you may disagree. Do not request or analyze YouTube API data.`;
}
export type YouTubeSampleVideo = {
  id: string;
  title: string;
  description: string;
  channel: string;
  channelId: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number | null;
  likeCount: number | null;
  channelSubscriberCount: number | null;
  channelVideoCount: number | null;
  url: string;
};
export type YouTubeSampleFilters = {
  days?: 0 | 7 | 30 | 90;
  order?: 'date' | 'viewCount' | 'relevance';
  region?: Region;
  language?: string;
  pageToken?: string;
};
const spaceSearchSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z.array(z.object({
    id: z.object({ videoId: z.string().regex(/^[\w-]{11}$/) }),
    snippet: z.object({
      title: z.string(),
      description: z.string(),
      channelTitle: z.string(),
      channelId: z.string(),
      publishedAt: z.string().datetime(),
      thumbnails: z.object({
        high: z.object({ url: z.string().url() }).optional(),
        medium: z.object({ url: z.string().url() }).optional(),
        default: z.object({ url: z.string().url() }).optional(),
      }).optional(),
    }),
  })),
});
const channelStatsSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    statistics: z.object({
      subscriberCount: z.string().optional(),
      videoCount: z.string().optional(),
    }).optional(),
  })),
});
const spaceStatsSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    statistics: z.object({
      viewCount: z.string().optional(),
      likeCount: z.string().optional(),
    }).optional(),
  })),
});

/** One search.list request plus batched video and channel statistics requests. */
export async function searchYouTubeSample(
  topic: string,
  options: YouTubeOptions,
  maxResults = 12,
  filters: YouTubeSampleFilters = {},
): Promise<{ videos: YouTubeSampleVideo[]; warning: string; nextPageToken?: string }> {
  const query = topic.trim().slice(0, 120);
  if (!query) throw new ApiError('Enter a space topic before measuring YouTube competition.', 'input');
  const days = filters.days ?? 30;
  const order = filters.order ?? 'viewCount';
  const searchParams: Record<string, string> = {
    part: 'snippet',
    type: 'video',
    q: query,
    order,
    maxResults: String(Math.min(25, Math.max(1, maxResults))),
    fields: 'nextPageToken,items(id/videoId,snippet(title,description,channelTitle,channelId,publishedAt,thumbnails(high/url,medium/url,default/url)))',
  };
  const regionCodes: Partial<Record<Region, string>> = {
    'United States': 'US',
    Iran: 'IR',
    'United Kingdom': 'GB',
    Germany: 'DE',
  };
  if (filters.region && regionCodes[filters.region]) searchParams.regionCode = regionCodes[filters.region]!;
  if (filters.language) searchParams.relevanceLanguage = filters.language;
  if (days > 0) searchParams.publishedAfter = new Date(Date.now() - days * 86400000).toISOString();
  if (filters.pageToken) searchParams.pageToken = filters.pageToken;
  const raw = await youtube('search', searchParams, options, 100);
  const parsed = spaceSearchSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('YouTube returned an invalid topic sample.', 'invalid');
  const selected = parsed.data.items;
  if (!selected.length) return { videos: [], warning: 'YouTube returned no matching videos in this period.', nextPageToken: parsed.data.nextPageToken };
  const ids = selected.map((item) => item.id.videoId);
  const statsRaw = await youtube('videos', {
    part: 'statistics',
    id: ids.join(','),
    fields: 'items(id,statistics(viewCount,likeCount))',
  }, options, 1);
  const statistics = spaceStatsSchema.safeParse(statsRaw);
  if (!statistics.success) throw new ApiError('YouTube video statistics could not be read.', 'invalid');
  const views = new Map<string, number | null>();
  const likes = new Map<string, number | null>();
  for (const item of statistics.data.items) {
    const viewText = item.statistics?.viewCount;
    const likeText = item.statistics?.likeCount;
    views.set(item.id, viewText && /^\d+$/.test(viewText) ? Number(viewText) : null);
    likes.set(item.id, likeText && /^\d+$/.test(likeText) ? Number(likeText) : null);
  }
  let channelMetrics = new Map<string, { subscribers: number | null; videos: number | null }>();
  let channelWarning = '';
  try {
    const channelIds = [...new Set(selected.map((item) => item.snippet.channelId))];
    const channelRaw = await youtube('channels', {
      part: 'statistics',
      id: channelIds.join(','),
      fields: 'items(id,statistics(subscriberCount,videoCount))',
    }, options, 1);
    const channelParsed = channelStatsSchema.safeParse(channelRaw);
    if (!channelParsed.success) throw new ApiError('Channel statistics returned an invalid response.', 'invalid');
    channelMetrics = new Map(channelParsed.data.items.map((item): [string, { subscribers: number | null; videos: number | null }] => [
      item.id,
      {
        subscribers: item.statistics?.subscriberCount && /^\d+$/.test(item.statistics.subscriberCount)
          ? Number(item.statistics.subscriberCount)
          : null,
        videos: item.statistics?.videoCount && /^\d+$/.test(item.statistics.videoCount)
          ? Number(item.statistics.videoCount)
          : null,
      },
    ]));
  } catch {
    channelWarning = 'Public channel statistics could not be loaded; video statistics remain available.';
  }
  const videos = selected.map((item) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    channel: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? '',
    viewCount: views.get(item.id.videoId) ?? null,
    likeCount: likes.get(item.id.videoId) ?? null,
    channelSubscriberCount: channelMetrics.get(item.snippet.channelId)?.subscribers ?? null,
    channelVideoCount: channelMetrics.get(item.snippet.channelId)?.videos ?? null,
    url: 'https://www.youtube.com/watch?v=' + item.id.videoId,
  }));
  return {
    videos,
    warning: 'Limited YouTube sample. Sorting is applied only within returned results; this is not a complete market census or a growth-rate/saturation score.' + (channelWarning ? ' ' + channelWarning : ''),
    nextPageToken: parsed.data.nextPageToken,
  };
}


export type NewsTranslation = { title: string; summary: string };
const newsTranslationCache = new Map<string, NewsTranslation>();
export async function translateNewsToPersian(
  key: string,
  model: string,
  title: string,
  summary: string,
  fetcher: Fetcher = fetch,
): Promise<NewsTranslation> {
  const cleanTitle = title.trim().slice(0, 500);
  const cleanSummary = summary.trim().slice(0, 1800);
  if (!cleanTitle && !cleanSummary) throw new ApiError('This news item has no text to translate.', 'input');
  const cacheKey = JSON.stringify([model, cleanTitle, cleanSummary]);
  const cached = newsTranslationCache.get(cacheKey);
  if (cached) return cached;
  const raw = await requestJson('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 650,
      messages: [{
        role: 'user',
        content: 'Translate the following news title and RSS summary into clear, natural Persian. Preserve all names, dates, measurements, numbers and scientific uncertainty. Do not add facts. Return only valid JSON with exactly two string properties: title and summary.\nTITLE: ' + cleanTitle + '\nSUMMARY: ' + cleanSummary,
      }],
    }),
  }, fetcher);
  const parsed = z.object({
    choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  }).safeParse(raw);
  if (!parsed.success) throw new ApiError('The Persian translation response could not be read.', 'invalid');
  const responseText = parsed.data.choices[0].message.content.trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\x60{3}$/, '').trim();
  let translated: NewsTranslation;
  try {
    const value = JSON.parse(responseText) as unknown;
    const result = z.object({ title: z.string(), summary: z.string() }).safeParse(value);
    if (!result.success) throw new Error('Invalid translation fields');
    translated = result.data;
  } catch {
    throw new ApiError('The model did not return a valid title and summary translation. Try again.', 'invalid');
  }
  newsTranslationCache.set(cacheKey, translated);
  if (newsTranslationCache.size > 50) {
    const oldest = newsTranslationCache.keys().next().value;
    if (oldest) newsTranslationCache.delete(oldest);
  }
  return translated;
}
export async function getOpinion(key: string, model: string, prompt: string) {
  const raw = await requestJson('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
  });
  const parsed = z
    .object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) })
    .safeParse(raw);
  if (!parsed.success) throw new ApiError('The AI reply could not be read.', 'invalid');
  return parsed.data.choices[0].message.content;
}
