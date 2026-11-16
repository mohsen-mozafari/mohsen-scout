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
          : 'The requested data endpoint was not found.', 'model');
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
  `${topic.trim()} explained`,
  'YouTube popularity order',
  'YouTube recent results',
];
const inflight = new Map<string, Promise<unknown>>();
export type YouTubeOptions = {
  key: string;
  charge: (units: number) => Promise<void>;
  fetcher?: Fetcher;
  onQuota?: () => Promise<void>;
};
async function youtube(endpoint: string, params: Record<string, string>, options: YouTubeOptions, units: number) {
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
  const raw = await youtube('videos', { part: 'id', id: 'dQw4w9WgXcQ', fields: 'items(id)' }, options, 1);
  if (!z.object({ items: z.array(z.object({ id: z.string() })) }).safeParse(raw).success)
    throw new ApiError('YouTube returned an invalid response.', 'invalid');
}
type SearchBucket = 'relevance' | 'popularity' | 'recent' | 'explainer';
const SEARCH_BUCKET_ORDER: SearchBucket[] = ['relevance', 'popularity', 'recent', 'explainer'];
const SEARCH_BUCKET_LABELS: Record<SearchBucket, (topic: string) => string> = {
  relevance: (topic) => topic,
  popularity: () => 'YouTube popularity order',
  recent: () => 'YouTube recent results',
  explainer: (topic) => topic + ' explained',
};

export async function searchYouTube(input: ResearchInput, options: YouTubeOptions, onProgress?: (text: string) => void) {
  const topic = input.topic.trim();
  if (!topic) throw new ApiError('Enter a topic before starting research.', 'input');
  const resultLimit = Math.max(1, Math.min(50, Math.floor(input.maxResults) || 25));
  const searches = input.languages.flatMap((language) => [
    { language, query: topic, order: 'relevance', bucket: 'relevance' as const },
    { language, query: topic, order: 'viewCount', bucket: 'popularity' as const },
    { language, query: topic, order: 'date', bucket: 'recent' as const },
    { language, query: topic + ' explained', order: 'relevance', bucket: 'explainer' as const },
  ]).slice(0, 12);
  const warnings: string[] = [];
  if (searches.length < input.languages.length * 4) {
    warnings.push('The 12-search safety cap limited language coverage. Not every selected language was sampled.');
  }
  const candidates = new Map<string, Video>();
  const bucketIds: Record<SearchBucket, string[]> = { relevance: [], popularity: [], recent: [], explainer: [] };
  let lastError: unknown;
  for (const search of searches) {
    onProgress?.(`Sampling ${SEARCH_BUCKET_LABELS[search.bucket](topic)} · ${search.language} · ${search.order}`);
    const params: Record<string, string> = {
      part: 'snippet', type: 'video', q: search.query, order: search.order,
      relevanceLanguage: search.language, maxResults: '50', videoDuration: input.duration,
      fields: 'nextPageToken,items(id/videoId,snippet(title,description,channelTitle,publishedAt,thumbnails))',
    };
    const regionCodes: Partial<Record<Region, string>> = {
      'United States': 'US', Iran: 'IR', 'United Kingdom': 'GB', Germany: 'DE',
    };
    if (regionCodes[input.region]) params.regionCode = regionCodes[input.region]!;
    if (input.category) params.videoCategoryId = input.category;
    if (input.days) params.publishedAfter = new Date(Date.now() - input.days * 86400000).toISOString();
    try {
      const raw = await youtube('search', params, options, 100);
      const parsed = searchSchema.safeParse(raw);
      if (!parsed.success) throw new ApiError('YouTube returned an invalid search response.', 'invalid');
      for (const item of parsed.data.items) {
        const id = item.id.videoId;
        if (!candidates.has(id)) {
          candidates.set(id, {
            id, title: item.snippet.title, description: item.snippet.description,
            channel: item.snippet.channelTitle, publishedAt: item.snippet.publishedAt,
            thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? '',
            fetchedAt: Date.now(), query: SEARCH_BUCKET_LABELS[search.bucket](topic),
          });
        }
        bucketIds[search.bucket].push(id);
      }
    } catch (error) {
      lastError = error;
      warnings.push((error instanceof Error ? error.message : 'A YouTube search failed.') + ' Another result bucket may still be available.');
      if (error instanceof ApiError && ['quota', 'budget', 'key', 'permission', 'invalid', 'offline', 'timeout'].includes(error.code)) break;
    }
  }
  if (!candidates.size && lastError) throw lastError;

  const targets: Record<SearchBucket, number> = {
    relevance: Math.ceil(resultLimit * 0.4),
    popularity: Math.ceil(resultLimit * 0.3),
    recent: Math.ceil(resultLimit * 0.2),
    explainer: 0,
  };
  targets.explainer = Math.max(0, resultLimit - targets.relevance - targets.popularity - targets.recent);
  const selected = new Map<string, Video>();
  for (const bucket of SEARCH_BUCKET_ORDER) {
    if (selected.size >= resultLimit) break;
    let added = 0;
    for (const id of bucketIds[bucket]) {
      if (selected.size >= resultLimit) break;
      if (selected.has(id) || !candidates.has(id)) continue;
      selected.set(id, { ...candidates.get(id)!, query: SEARCH_BUCKET_LABELS[bucket](topic) });
      added++;
      if (added >= targets[bucket]) break;
    }
  }
  for (const bucket of SEARCH_BUCKET_ORDER) {
    for (const id of bucketIds[bucket]) {
      if (selected.size >= resultLimit) break;
      if (!selected.has(id) && candidates.has(id)) {
        selected.set(id, { ...candidates.get(id)!, query: SEARCH_BUCKET_LABELS[bucket](topic) });
      }
    }
    if (selected.size >= resultLimit) break;
  }
  const collected = [...selected.values()];
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
  return { videos: collected, queries: relatedQueries(topic), warnings: [...new Set(warnings)] };
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
export function opinionPrompt(topic: string, concept: string, decision: string, language: 'fa' | 'en' = 'en') {
  const cleanTopic = topic.trim();
  const cleanConcept = concept.trim();
  if (!cleanTopic || cleanTopic.toLowerCase() === 'untitled idea' || !cleanConcept)
    throw new ApiError('Complete the idea title and video concept before requesting an AI second opinion.', 'input');
  const instruction = language === 'fa'
    ? 'به زبان فارسی روان و طبیعی پاسخ بده. نظر دوم باید کوتاه، کاربردی و دقیق باشد. داده یا آمار یوتیوب در اختیار تو نیست. تقاضا، رقابت، روند، امتیاز، احتمال یا درصد ساختگی ارائه نکن. قضاوت شخصی را از اطلاعاتی که کاربر داده جدا کن و در صورت ناکافی بودن اطلاعات صریحاً بگو. قبل از پاسخ نهایی، بی‌صدا چهار بررسی انجام بده: ارزیابی اولیه وضوح و اصالت ایده؛ نقد مخالف برای یافتن فرض‌های پنهان، ابهام‌ها و ضعف‌ها؛ بازبینی نتیجه با توجه به همان نقد؛ و انتخاب عملی‌ترین گام بعدی. زنجیره استدلال خصوصی را نمایش نده. خروجی نهایی را در بخش‌های «جمع‌بندی»، «نقاط قوت»، «ابهام‌ها و ریسک‌ها»، «روش راستی‌آزمایی» و «گام بعدی» تنظیم کن. فقط درباره موضوع، مفهوم پیشنهادی و تصمیم شخصی ارسال‌شده نظر بده.'
    : 'Give a concise English second opinion. No YouTube API data or performance statistics are provided. Do not invent demand, competition, trends, scores, probabilities, or percentages. Separate user-provided information from subjective judgment and explicitly state insufficient evidence whenever support is not adequate. Before answering, silently perform four quality passes: assess clarity and originality; challenge hidden assumptions, ambiguity and weak points; revise the assessment in light of that critique; and select the most useful next action. Do not reveal private reasoning. Return only the final result under: Verdict, Strengths, Unknowns and Risks, Validation Steps, and Next Action. Assess only the supplied topic, concept and personal decision.';
  return `${instruction} Topic: ${cleanTopic.slice(0, 300)}. Proposed concept: ${cleanConcept.slice(0, 1200)}. Personal decision: ${decision.trim().slice(0, 600) || 'No personal decision supplied yet.'}. Do not request, infer or analyze YouTube API data, external research or performance statistics.`;
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

const LIKE_SAMPLE_CURSOR_PREFIX = 'mohsen-scout-likes-v1:';
const likeSampleCursorSchema = z.object({
  version: z.literal(1),
  relevance: z.string().optional().default(''),
  views: z.string().optional().default(''),
});
function decodeLikeSampleCursor(token?: string) {
  if (!token) return { relevance: '', views: '' };
  // Accept one legacy Google page token as the relevance stream for existing saved sessions.
  if (!token.startsWith(LIKE_SAMPLE_CURSOR_PREFIX)) return { relevance: token, views: '' };
  try {
    const raw = JSON.parse(decodeURIComponent(token.slice(LIKE_SAMPLE_CURSOR_PREFIX.length)));
    const parsed = likeSampleCursorSchema.safeParse(raw);
    if (!parsed.success) throw new Error('Invalid cursor shape');
    return { relevance: parsed.data.relevance, views: parsed.data.views };
  } catch {
    throw new ApiError('The saved YouTube sample cursor is invalid. Start a new sample.', 'invalid');
  }
}
function encodeLikeSampleCursor(relevance: string, views: string) {
  if (!relevance && !views) return undefined;
  return LIKE_SAMPLE_CURSOR_PREFIX + encodeURIComponent(JSON.stringify({
    version: 1,
    relevance,
    views,
  }));
}

/** Search once for a normal sort, or sample two discovery pools for raw-like sorting.
 *  The likes mode remains a bounded sample, never a global ranking.
 */
export async function searchYouTubeSample(
  topic: string,
  options: YouTubeOptions,
  maxResults = 12,
  filters: YouTubeSampleFilters = {},
): Promise<{ videos: YouTubeSampleVideo[]; warning: string; nextPageToken?: string }> {
  const query = topic.trim().slice(0, 120);
  if (!query) throw new ApiError('Enter a space topic before measuring YouTube competition.', 'input');
  const resultLimit = Math.min(50, Math.max(1, Math.trunc(maxResults) || 1));
  const days = filters.days ?? 30;
  const order = filters.order ?? 'viewCount';
  const regionCodes: Partial<Record<Region, string>> = {
    'United States': 'US',
    Iran: 'IR',
    'United Kingdom': 'GB',
    Germany: 'DE',
  };
  const commonParams: Record<string, string> = {
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: String(resultLimit),
    fields: 'nextPageToken,items(id/videoId,snippet(title,description,channelTitle,channelId,publishedAt,thumbnails(high/url,medium/url,default/url)))',
  };
  if (filters.region && regionCodes[filters.region]) commonParams.regionCode = regionCodes[filters.region]!;
  if (filters.language) commonParams.relevanceLanguage = filters.language;
  if (days > 0) commonParams.publishedAfter = new Date(Date.now() - days * 86400000).toISOString();

  const selectedById = new Map<string, z.infer<typeof spaceSearchSchema>['items'][number]>();
  const warnings: string[] = [];
  let nextPageToken: string | undefined;
  let lastSearchError: unknown;

  if (order === 'relevance') {
    const cursor = decodeLikeSampleCursor(filters.pageToken);
    const isFirstPage = !filters.pageToken;
    const poolSize = Math.max(1, Math.ceil(resultLimit / 2));
    let relevanceNext = '';
    let viewsNext = '';
    const pools = [
      { name: 'relevance' as const, order: 'relevance', token: cursor.relevance },
      { name: 'views' as const, order: 'viewCount', token: cursor.views },
    ];
    for (const pool of pools) {
      if (!isFirstPage && !pool.token) continue;
      try {
        const params: Record<string, string> = { ...commonParams, order: pool.order, maxResults: String(poolSize) };
        if (pool.token) params.pageToken = pool.token;
        const raw = await youtube('search', params, options, 100);
        const parsed = spaceSearchSchema.safeParse(raw);
        if (!parsed.success) throw new ApiError('YouTube returned an invalid topic sample.', 'invalid');
        if (pool.name === 'relevance') relevanceNext = parsed.data.nextPageToken ?? '';
        else viewsNext = parsed.data.nextPageToken ?? '';
        for (const item of parsed.data.items) {
          if (!selectedById.has(item.id.videoId)) selectedById.set(item.id.videoId, item);
        }
      } catch (error) {
        lastSearchError = error;
        warnings.push((error instanceof Error ? error.message : 'A YouTube discovery pool failed.') + ' Results from another completed pool may still be shown.');
        if (error instanceof ApiError && ['quota', 'budget', 'key', 'permission', 'offline', 'timeout'].includes(error.code)) break;
      }
    }
    nextPageToken = encodeLikeSampleCursor(relevanceNext, viewsNext);
  } else {
    if (filters.pageToken?.startsWith(LIKE_SAMPLE_CURSOR_PREFIX)) {
      throw new ApiError('This YouTube sample cursor belongs to a different sort. Start a new sample.', 'invalid');
    }
    try {
      const params: Record<string, string> = { ...commonParams, order };
      if (filters.pageToken) params.pageToken = filters.pageToken;
      const raw = await youtube('search', params, options, 100);
      const parsed = spaceSearchSchema.safeParse(raw);
      if (!parsed.success) throw new ApiError('YouTube returned an invalid topic sample.', 'invalid');
      for (const item of parsed.data.items) selectedById.set(item.id.videoId, item);
      nextPageToken = parsed.data.nextPageToken;
    } catch (error) {
      lastSearchError = error;
      throw error;
    }
  }

  if (!selectedById.size && lastSearchError) throw lastSearchError;
  const selected = [...selectedById.values()].slice(0, resultLimit);
  if (!selected.length) {
    return {
      videos: [],
      warning: 'YouTube returned no matching videos in this period.',
      nextPageToken,
    };
  }

  const ids = selected.map((item) => item.id.videoId);
  const views = new Map<string, number | null>();
  const likes = new Map<string, number | null>();
  let statisticsWarning = '';
  try {
    const statsRaw = await youtube('videos', {
      part: 'statistics',
      id: ids.join(','),
      fields: 'items(id,statistics(viewCount,likeCount))',
    }, options, 1);
    const statistics = spaceStatsSchema.safeParse(statsRaw);
    if (!statistics.success) throw new ApiError('YouTube video statistics returned an invalid response.', 'invalid');
    for (const item of statistics.data.items) {
      const viewText = item.statistics?.viewCount;
      const likeText = item.statistics?.likeCount;
      views.set(item.id, viewText && /^\d+$/.test(viewText) ? Number(viewText) : null);
      likes.set(item.id, likeText && /^\d+$/.test(likeText) ? Number(likeText) : null);
    }
  } catch {
    statisticsWarning = 'Video titles and dates were retrieved, but raw view/like counts could not be loaded. Counts remain unavailable rather than estimated.';
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
  const scopeWarning = order === 'relevance'
    ? 'Most Likes combines relevance-ordered and view-count-ordered discovery pools, then compares actual public like counts within the returned sample. It is not a global like-count ranking.'
    : 'Sorting is applied to the returned sample using publication dates or actual public view counts. This is not a complete market census or a growth-rate/saturation score.';
  return {
    videos,
    warning: ['Limited YouTube sample. ' + scopeWarning, ...warnings, statisticsWarning, channelWarning].filter(Boolean).join(' '),
    nextPageToken,
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
