import { z } from 'zod';
import { type Budget, type ResearchInput, type Video, type Region } from './types';
import { matchesStrongResearchTopic, scoreResearchText } from './intelligence';
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
      if (isOpenRouter && response.status === 402)
        throw new ApiError('OpenRouter reports insufficient provider credits or account balance. Check the OpenRouter account and selected provider.', 'credits');
      if (isOpenRouter && response.status === 408)
        throw new ApiError('The OpenRouter provider timed out. Try again later.', 'timeout');
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
      if (response.status === 408 || response.status === 429 || response.status >= 500) {
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
        const timedOut = response.status === 408;
        const rateLimited = response.status === 429;
        throw new ApiError(
          timedOut
            ? 'The request timed out. Try again.'
            : rateLimited
              ? (isOpenRouter ? 'OpenRouter rate limit reached. Wait before requesting another AI response.' : 'The service is rate limited. Try again later.')
              : (isOpenRouter ? 'The OpenRouter provider is temporarily unavailable. Try again later.' : 'The service is unavailable. Try again later.'),
          timedOut ? 'timeout' : rateLimited && isOpenRouter ? 'rate' : 'service',
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
export type YouTubeQuotaKind = 'search' | 'other';
export type YouTubeQuotaOrigin = 'manual' | 'automatic' | 'reserve';

export const YOUTUBE_DAILY_SEARCH_LIMIT = 100;
export const YOUTUBE_DAILY_OTHER_UNIT_LIMIT = 10000;

export function nextBudget(
  old: Budget,
  limit: number,
  units: number,
  now = new Date(),
  kind: YouTubeQuotaKind = 'other',
  origin: YouTubeQuotaOrigin = 'manual',
): Budget {
  const date = quotaDay(now);
  const current: Budget = old.date === date ? old : {
    date, units: 0, requests: 0, exhausted: false,
    searchExhausted: false, otherExhausted: false,
    searchManualRequests: 0, searchAutomaticRequests: 0, searchReserveRequests: 0,
    otherManualUnits: 0, otherAutomaticUnits: 0, otherReserveUnits: 0,
  };
  if (!Number.isFinite(units) || units <= 0 || !Number.isFinite(limit) || limit <= 0)
    throw new ApiError('The local YouTube quota request is invalid.', 'budget');

  const next: Budget = { ...current, exhausted: false };
  if (kind === 'search') {
    if (current.searchExhausted)
      throw new ApiError('YouTube reported that the daily search.list quota is exhausted. Check Google Cloud quota status.', 'quota');
    const field = origin === 'manual' ? 'searchManualRequests' : origin === 'automatic' ? 'searchAutomaticRequests' : 'searchReserveRequests';
    const used = (current.searchManualRequests ?? 0) +
      (current.searchAutomaticRequests ?? 0) +
      (current.searchReserveRequests ?? 0);
    if (used + 1 > YOUTUBE_DAILY_SEARCH_LIMIT)
      throw new ApiError('The daily YouTube search.list allowance of 100 calls has been reached. It resets at midnight Pacific Time.', 'budget');
    next[field] = (current[field] ?? 0) + 1;
  } else {
    if (current.otherExhausted)
      throw new ApiError('YouTube reported that the daily non-search quota is exhausted. Check Google Cloud quota status.', 'quota');
    const field = origin === 'manual' ? 'otherManualUnits' : origin === 'automatic' ? 'otherAutomaticUnits' : 'otherReserveUnits';
    const used = (current.otherManualUnits ?? 0) +
      (current.otherAutomaticUnits ?? 0) +
      (current.otherReserveUnits ?? 0);
    const ceiling = Math.min(limit, YOUTUBE_DAILY_OTHER_UNIT_LIMIT);
    if (used + units > ceiling)
      throw new ApiError('The daily YouTube non-search allowance is reached. Increase the Settings budget or wait for the Pacific-time reset.', 'budget');
    next[field] = (current[field] ?? 0) + units;
  }
  return {
    ...next,
    units: current.units + (kind === 'other' ? units : 0),
    requests: current.requests + 1,
  };
}

/** Backward-compatible storage helper; full research cycles are not locally capped. */
export const YOUTUBE_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
export function reserveYoutubeRefreshCycle(previous: readonly number[] | undefined, now = Date.now()): number[] {
  const recent = (previous ?? [])
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp <= now && now - timestamp < YOUTUBE_REFRESH_WINDOW_MS)
    .sort((a, b) => a - b);
  return [...recent.slice(-2), now];
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
  charge: (units: number, kind?: YouTubeQuotaKind, origin?: YouTubeQuotaOrigin) => Promise<void>;
  origin?: YouTubeQuotaOrigin;
  fetcher?: Fetcher;
  onQuota?: (kind: YouTubeQuotaKind) => Promise<void>;
  /** Shared by one research run; counts actual search HTTP attempts, including retries. */
  searchAttemptBudget?: { used: number; limit: number };
};
async function youtube(endpoint: string, params: Record<string, string>, options: YouTubeOptions, units: number) {
  const query = new URLSearchParams({ ...params, key: options.key });
  const url = `https://www.googleapis.com/youtube/v3/${endpoint}?${query}`;
  const existing = inflight.get(url);
  if (existing) return existing;
  const kind: YouTubeQuotaKind = endpoint === 'search' ? 'search' : 'other';
  const promise = requestJson(url, {}, options.fetcher, async () => {
    const budget = kind === 'search' ? options.searchAttemptBudget : undefined;
    if (budget && budget.used >= budget.limit)
      throw new ApiError('The 12-attempt YouTube search safety limit was reached, including retries.', 'attempt-limit');
    await options.charge(units, kind, options.origin ?? 'manual');
    if (budget) budget.used += 1;
  });
  inflight.set(url, promise);
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'quota') await options.onQuota?.(kind);
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
const YOUTUBE_SEARCH_REQUEST_LIMIT = 12;
const SEARCH_BUCKET_LABELS: Record<SearchBucket, (topic: string) => string> = {
  relevance: (topic) => topic,
  popularity: () => 'YouTube popularity order',
  recent: () => 'YouTube recent results',
  explainer: (topic) => topic + ' explained',
};
const SEARCH_BUCKET_ORDERS: Record<SearchBucket, 'relevance' | 'viewCount' | 'date'> = {
  relevance: 'relevance', popularity: 'viewCount', recent: 'date', explainer: 'relevance',
};
export type YouTubeSearchTask = {
  language: string;
  query: string;
  order: 'relevance' | 'viewCount' | 'date';
  bucket: SearchBucket;
};

/** Distributes the capped search budget across languages before adding extra query angles. */
export function buildYouTubeSearchPlan(topic: string, languages: readonly string[], maxRequests = YOUTUBE_SEARCH_REQUEST_LIMIT): YouTubeSearchTask[] {
  const cleanTopic = topic.trim();
  const uniqueLanguages = [...new Set(languages.map((language) => language.trim().toLowerCase()).filter(Boolean))];
  const limit = Number.isFinite(maxRequests)
    ? Math.max(0, Math.min(YOUTUBE_SEARCH_REQUEST_LIMIT, Math.floor(maxRequests)))
    : YOUTUBE_SEARCH_REQUEST_LIMIT;
  if (!cleanTopic || !uniqueLanguages.length || !limit) return [];

  // Reserve one language- and region-independent popularity request first.
  // YouTube orders this result by public view count; local text ranking must not
  // reorder the popularity lane.
  const tasks: YouTubeSearchTask[] = [
    { language: '', query: cleanTopic, order: 'viewCount', bucket: 'popularity' },
  ];
  const secondaryBuckets: SearchBucket[] = ['relevance', 'recent', 'explainer'];
  for (const bucket of secondaryBuckets) {
    for (const language of uniqueLanguages) {
      tasks.push({
        language,
        query: bucket === 'explainer' ? cleanTopic + ' explained' : cleanTopic,
        order: SEARCH_BUCKET_ORDERS[bucket],
        bucket,
      });
      if (tasks.length >= limit) return tasks;
    }
  }
  return tasks.slice(0, limit);
}

export function isWithinYouTubeResearchWindow(publishedAt: string, days: number, now = Date.now()): boolean {
  const published = Date.parse(publishedAt);
  if (!Number.isFinite(published) || published > now) return false;
  const normalizedDays = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 30;
  return normalizedDays === 0 || published >= now - normalizedDays * 86400000;
}

/**
 * Uses direct topic concepts for multi-word topics. A known acronym such as JWST
 * cannot qualify a long topic on its own, while a one-term acronym query still
 * supports its explicit semantic aliases.
 */
/** Rejects acronym-only matches for multi-concept topics before idea generation. */
export function filterYouTubeSearchResults<T extends { title: string; description?: string }>(topic: string, videos: readonly T[]): T[] {
  return videos.filter((video) => matchesStrongResearchTopic(video.title + ' ' + (video.description ?? ''), topic));
}

/** Ranks a bounded YouTube sample by transparent title-first textual relevance. */
export function rankYouTubeSearchResults<T extends { title: string; description?: string }>(topic: string, videos: readonly T[]): T[] {
  return videos.map((video, index) => ({
    video, index, score: scoreResearchText(topic, video.title, video.description ?? ''),
  })).sort((a, b) => b.score - a.score || a.index - b.index).map((entry) => entry.video);
}

export async function searchYouTube(input: ResearchInput, options: YouTubeOptions, onProgress?: (text: string) => void) {
  const topic = input.topic.trim();
  if (!topic) throw new ApiError('Enter a topic before starting research.', 'input');
  const resultLimit = Math.max(1, Math.min(100, Math.floor(input.maxResults) || 25));
  const searches = buildYouTubeSearchPlan(topic, input.languages);
  if (!searches.length) throw new ApiError('Select at least one research language before starting YouTube search.', 'input');
  const warnings: string[] = [];
  const searchNow = Date.now();
  const languageCount = new Set(input.languages.map((language) => language.trim().toLowerCase()).filter(Boolean)).size;
  if (searches.length < 1 + languageCount * 3) {
    warnings.push('The 12-search safety cap covers a global popularity sample and primary language searches first; some secondary query angles are omitted.');
  }
  if (input.days === 0) {
    warnings.push('The popularity sample is all-time and global by country/language. YouTube still returns a limited search sample, not a complete index of every matching video.');
  }
  const candidates = new Map<string, Video>();
  const bucketIds: Record<SearchBucket, string[]> = { relevance: [], popularity: [], recent: [], explainer: [] };
  const researchOptions: YouTubeOptions = {
    ...options,
    searchAttemptBudget: { used: 0, limit: YOUTUBE_SEARCH_REQUEST_LIMIT },
  };
  let lastError: unknown;
  for (const search of searches) {
    onProgress?.(`Sampling ${SEARCH_BUCKET_LABELS[search.bucket](topic)} · ${search.language || 'global'} · ${search.order}`);
    const params: Record<string, string> = {
      part: 'snippet', type: 'video', q: search.query, order: search.order,
      maxResults: '50', videoDuration: input.duration,
      fields: 'nextPageToken,items(id/videoId,snippet(title,description,channelTitle,publishedAt,thumbnails))',
    };
    const regionCodes: Partial<Record<Region, string>> = {
      'United States': 'US', Iran: 'IR', 'United Kingdom': 'GB', Germany: 'DE',
    };
    // Do not narrow the highest-viewed lane by region or relevance language.
    if (search.language) params.relevanceLanguage = search.language;
    if (search.bucket !== 'popularity' && regionCodes[input.region]) params.regionCode = regionCodes[input.region]!;
    if (input.category) params.videoCategoryId = input.category;
    // Apply the exact user-selected window locally for date/view-count ordered searches.
    if (search.order === 'relevance' && input.days > 0)
      params.publishedAfter = new Date(searchNow - input.days * 86400000).toISOString();
    try {
      const raw = await youtube('search', params, researchOptions, 1);
      const parsed = searchSchema.safeParse(raw);
      if (!parsed.success) throw new ApiError('YouTube returned an invalid search response.', 'invalid');
      for (const item of parsed.data.items) {
        if (!isWithinYouTubeResearchWindow(item.snippet.publishedAt, input.days, searchNow)) continue;
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
      if (error instanceof ApiError && ['quota', 'budget', 'key', 'permission', 'invalid', 'offline', 'timeout', 'attempt-limit'].includes(error.code)) break;
    }
  }
  if (!candidates.size && lastError) throw lastError;

  const rankedBucketIds: Record<SearchBucket, string[]> = { relevance: [], popularity: [], recent: [], explainer: [] };
  for (const bucket of SEARCH_BUCKET_ORDER) {
    const bucketVideos = [...new Set(bucketIds[bucket])]
      .map((id) => candidates.get(id))
      .filter((video): video is Video => Boolean(video));
    rankedBucketIds[bucket] = bucket === 'popularity'
      ? bucketVideos.map((video) => video.id)
      : rankYouTubeSearchResults(topic, bucketVideos).map((video) => video.id);
  }
  const bestMatchScore = Math.max(0, ...[...candidates.values()].map((video) => scoreResearchText(topic, video.title, video.description)));
  if (bestMatchScore === 0) {
    warnings.push('No returned video met the required topic match in its title or description. Try a more specific topic or another language.');
  }

  const targets: Record<SearchBucket, number> = {
    relevance: Math.ceil(resultLimit * 0.25),
    popularity: Math.ceil(resultLimit * 0.5),
    recent: Math.ceil(resultLimit * 0.15),
    explainer: 0,
  };
  targets.explainer = Math.max(0, resultLimit - targets.relevance - targets.popularity - targets.recent);
  const selected = new Map<string, Video>();
  for (const bucket of SEARCH_BUCKET_ORDER) {
    if (selected.size >= resultLimit) break;
    let added = 0;
    for (const id of rankedBucketIds[bucket]) {
      if (selected.size >= resultLimit) break;
      if (selected.has(id) || !candidates.has(id)) continue;
      selected.set(id, { ...candidates.get(id)!, query: SEARCH_BUCKET_LABELS[bucket](topic) });
      added++;
      if (added >= targets[bucket]) break;
    }
  }
  for (const bucket of SEARCH_BUCKET_ORDER) {
    for (const id of rankedBucketIds[bucket]) {
      if (selected.size >= resultLimit) break;
      if (!selected.has(id) && candidates.has(id)) {
        selected.set(id, { ...candidates.get(id)!, query: SEARCH_BUCKET_LABELS[bucket](topic) });
      }
    }
    if (selected.size >= resultLimit) break;
  }
  const collected = [...selected.values()];
  let statisticsBatchWarnings = 0;
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
    } catch (error) {
      // One failed statistics batch must not discard the remaining batches.
      // Keep the warning typed, bounded and counted; stop only on a hard
      // quota/budget/key failure so the existing request budget is respected.
      const detail = error instanceof Error ? error.message : 'unknown error';
      if (statisticsBatchWarnings < 3) {
        warnings.push(('Video statistics batch ' + (Math.floor(offset / 50) + 1) +
          ' could not be loaded: ' + detail).slice(0, 220));
        statisticsBatchWarnings += 1;
      }
      if (error instanceof ApiError && ['quota', 'budget', 'key', 'permission'].includes(error.code)) break;
      continue;
    }
  }
  return {
    videos: collected,
    queries: searches.map((search) => [search.query, search.bucket, search.language || 'global'].join(' · ')),
    warnings: [...new Set(warnings)],
  };
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
    (m) =>
      Boolean(m.id.trim()) &&
      m.id.trim().toLowerCase().endsWith(':free') &&
      Number(m.pricing.prompt) === 0 &&
      Number(m.pricing.completion) === 0,
  );
}

/** Keeps a saved model when it is still free; otherwise chooses the first live free model. */
export function selectFreeModel(models: readonly { id: string }[], preferred = ''): string {
  const available = models.map((model) => model.id.trim()).filter(Boolean);
  const selected = preferred.trim();
  return selected && available.includes(selected) ? selected : available[0] ?? '';
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
        const raw = await youtube('search', params, options, 1);
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
      const raw = await youtube('search', params, options, 1);
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
/** Stable, non-cryptographic cache key for local prompt content; never use for credentials. */
export function fingerprintText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export type InternalEngineReviewInput = {
  topic: string;
  summary: string;
  evidence: readonly { label: string; detail: string }[];
  confidence: { level: string; reason: string };
  gaps?: readonly string[];
  discrepancies?: readonly string[];
  recommendation?: { topic: string; concept: string };
  language?: 'fa' | 'en';
};

/** Privacy-bounded critique of processed local-engine output only. */
export function internalEngineReviewPrompt(input: InternalEngineReviewInput): string {
  const fa = input.language === 'fa';
  const evidence = input.evidence.slice(0, 24).map((item, index) =>
    `${index + 1}. ${item.label.slice(0, 100)}: ${item.detail.slice(0, 320)}`,
  );
  const gaps = (input.gaps ?? []).slice(0, 6).map((item) => item.slice(0, 220));
  const discrepancies = (input.discrepancies ?? []).slice(0, 6).map((item) => item.slice(0, 220));
  const payload = [
    'Topic: ' + input.topic.trim().slice(0, 180),
    ...(input.recommendation?.topic.trim() && input.recommendation.concept.trim()
      ? ['Candidate idea to assess independently (not an endorsed verdict): ' +
          input.recommendation.topic.trim().slice(0, 180) + '\nConcept: ' +
          input.recommendation.concept.trim().slice(0, 1000)]
      : []),
    'Local engine summary: ' + input.summary.trim().slice(0, 1200),
    'Processed evidence signals:\n' + (evidence.join('\n') || 'No evidence signals supplied.'),
    'Local confidence: ' + input.confidence.level + ' — ' + input.confidence.reason.slice(0, 400),
    'Research gaps:\n' + (gaps.join('\n') || 'Not reported.'),
    'Potential discrepancies:\n' + (discrepancies.join('\n') || 'Not reported.'),
  ].join('\n\n');
  const instruction = fa
    ? 'این یک بازبینی تصمیم‌محور برای سازنده محتواست، نه گزارش خبری عمومی. فقط موضوع تحریری و شاخص‌های تجمیعی موتور محلی در اختیار تو قرار دارد؛ تیتر خام، عنوان و توضیح ویدئو، پیوند و آمار تک‌تک موارد عمداً ارسال نشده‌اند. وانمود نکن که منبع یا ویدئوی منفرد را دیده‌ای. ایده پیشنهادی را مستقل نقد کن و صرفاً تصمیم موتور داخلی را تأیید نکن. ابتدا فقط یکی از این تصمیم‌ها را انتخاب کن: «توسعه ایده»، «جمع‌آوری شواهد بیشتر» یا «بازتعریف موضوع». وضوح، اصالت، امکان تولید و فرض‌های تناسب با مخاطب را ارزیابی کن. فقط وقتی بازه‌ای از احتمال موفقیت ارائه کن که شواهد ورودی شامل نتایج تاریخیِ کافی و واقعاً قابل‌مقایسه و زمینه عملکرد معنادار باشد؛ آن را مشروط بدان و فرض‌ها را روشن کن. در غیر این صورت صریحاً بگو از داده‌های موجود درصد قابل‌اتکا قابل محاسبه نیست و داده‌های لازم را نام ببر. برای پرکردن جای خالی هرگز عدد نساز. دلیل را با شمارنده‌های واقعی توضیح بده، نه امتیاز ساختگی. سپس حداکثر دو یافته کاربردی، یک نقد مخالف یا سوگیری نمونه‌گیری، یک اقدام دستی مشخص برای جست‌وجو یا راستی‌آزمایی و مهم‌ترین داده مفقود را بیان کن. واقعیت، استنباط و مجهول را جدا نگه دار. بازدید خام را از رشد، تقاضا و عملکرد آینده جدا بدان؛ هیچ نرخ رشد، رقابت بازار یا پیش‌بینی وایرال‌شدن نساز. هیچ منبع، آمار، تقاضا یا رابطه علّی بیرونی جعل نکن. پاسخ کوتاه و بدون تعریف عمومی از YouTube یا خبرخوانی باشد. فقط این بخش‌ها را بنویس: «تصمیم»، «یافته‌های مفید»، «نقد مخالف»، «اقدام بعدی»، «داده مفقود»؛ هر بخش حداکثر دو جمله.'
    : 'This is a decision review for a creator, not a general news digest. You receive only the editorial topic and aggregate local-engine indicators; raw headlines, video titles, descriptions, links and per-item statistics are intentionally excluded. Do not pretend to have seen individual sources or videos. Independently critique the proposed idea rather than endorsing the local engine\'s decision. First choose exactly one action: Develop the concept, Gather more evidence, or Reframe the topic. Assess clarity, originality, production feasibility and assumptions about audience fit. Estimate a success-probability range only if the supplied evidence includes enough comparable historical outcomes and meaningful performance context; label it as conditional and state its assumptions. Otherwise say explicitly that no reliable percentage can be calculated from the available evidence and name the missing data. Never invent a number to fill the gap. Justify the decision using the supplied counts, never an invented score. Then give at most two useful findings, one important counterargument or sampling bias, one specific manual search or verification action, and the most important missing data. Separate facts, inferences and unknowns. Raw views are not growth, demand or future performance; do not infer growth rates, market competition or virality. Never invent sources, metrics, demand or causal links. Be concise and avoid generic explanations of YouTube or news feeds. Return only these sections: Decision, Useful Findings, Adversarial Check, Next Action, Missing Data; no more than two sentences per section.';
  return (instruction + '\n\n' + payload).slice(0, 10500);
}

/** Stable YYYY-MM-DD key for the device's local calendar day; independent of locale formatting. */
export function localDateKey(date = new Date()): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError('A valid date is required.');
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type OpenRouterDailyQuota = { used: number; limit: number; remaining: number };
const openRouterQuotaSchema = z.object({
  data: z.object({
    free_model_daily_requests: z.object({
      used: z.number().int().nonnegative(),
      limit: z.number().int().positive(),
      remaining: z.number().int().nonnegative(),
    }),
  }),
});

/** Reads the official free-model daily request counter for the supplied API key. */
export async function getOpenRouterDailyQuota(
  key: string,
  fetcher: Fetcher = fetch,
): Promise<OpenRouterDailyQuota | undefined> {
  if (!key.trim()) throw new ApiError('Save your OpenRouter key in Settings first.', 'key');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: 'Bearer ' + key },
      signal: controller.signal,
    });
    if (!response.ok) {
      const code = response.status === 429 ? 'rate' : response.status === 401 ? 'key' : 'provider';
      throw new ApiError(
        response.status === 429
          ? 'OpenRouter quota status is rate-limited. Try refreshing it later.'
          : response.status === 401
            ? 'The OpenRouter key was rejected. Check or replace it in Settings.'
            : 'OpenRouter quota status could not be refreshed.',
        code,
      );
    }
    const raw: unknown = await response.json();
    const parsed = openRouterQuotaSchema.safeParse(raw);
    return parsed.success ? parsed.data.data.free_model_daily_requests : undefined;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError('OpenRouter quota status request timed out.', 'timeout');
    throw new ApiError('Could not refresh OpenRouter quota status.', 'offline');
  } finally {
    clearTimeout(timeout);
  }
}

export function nextOpenRouterUsage(
  storedDay: string | undefined,
  storedCount: number | undefined,
  today: string,
  dailyLimit = 10000,
  serverUsed?: number,
): { openRouterUsageDay: string; openRouterRequestsToday: number } {
  const localCount = storedDay === today ? Math.max(0, Math.trunc(storedCount ?? 0)) : 0;
  const used = Number.isFinite(serverUsed) && serverUsed! >= 0 ? Math.floor(serverUsed!) : localCount;
  const limit = Number.isFinite(dailyLimit) && dailyLimit > 0 ? Math.floor(dailyLimit) : 10000;
  if (used >= limit)
    throw new ApiError('OpenRouter daily request limit is exhausted (' + used + '/' + limit + ' UTC).', 'budget');
  return { openRouterUsageDay: today, openRouterRequestsToday: used + 1 };
}

function openRouterProviderError(raw: unknown): ApiError | undefined {
  const parsed = z.object({
    error: z.object({
      code: z.union([z.number(), z.string()]).optional(),
      type: z.string().optional(),
    }).passthrough(),
  }).passthrough().safeParse(raw);
  if (!parsed.success) return undefined;
  const rawCode = parsed.data.error.code;
  const descriptor = [rawCode, parsed.data.error.type].filter(Boolean).join(' ').toLowerCase();
  const numericCode = typeof rawCode === 'number' ? rawCode : /^\d+$/.test(String(rawCode ?? '')) ? Number(rawCode) : 0;
  if (numericCode === 401 || /invalid.*key|unauthor/i.test(descriptor))
    return new ApiError('The OpenRouter key was rejected. Check or replace it in Settings.', 'key');
  if (numericCode === 402 || /credit|fund|billing|payment/i.test(descriptor))
    return new ApiError('OpenRouter reports insufficient provider credits or account balance. Check the OpenRouter account and selected provider.', 'credits');
  if (numericCode === 403)
    return new ApiError('OpenRouter refused this request. Check model access and provider restrictions.', 'permission');
  if (numericCode === 404 || /model.*(missing|unavailable|not found)/i.test(descriptor))
    return new ApiError('The selected OpenRouter model is unavailable. Refresh the free model list and select another model.', 'model');
  if (numericCode === 408 || /timeout|timed out/i.test(descriptor))
    return new ApiError('The OpenRouter provider timed out. Try again later.', 'timeout');
  if (numericCode === 429 || /rate.?limit|too many requests/i.test(descriptor))
    return new ApiError('OpenRouter rate limit reached. Wait before requesting another AI response.', 'rate');
  return new ApiError('OpenRouter returned a provider error. Refresh free models or choose another available model.', 'provider');
}

let opinionRequestInFlight = false;
export async function getOpinion(
  key: string,
  model: string,
  prompt: string,
  beforeRequest?: (quota?: OpenRouterDailyQuota) => Promise<void>,
  fetcher: Fetcher = fetch,
) {
  if (opinionRequestInFlight) throw new ApiError('Another OpenRouter analysis is already running. Wait for it to finish.', 'busy');
  if (!key.trim() || !model.trim() || !prompt.trim())
    throw new ApiError('The OpenRouter key, selected model and idea prompt are required.', 'input');
  opinionRequestInFlight = true;
  try {
    await beforeRequest?.();
    const raw = await requestJson('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
    }, fetcher);
    const providerError = openRouterProviderError(raw);
    if (providerError) throw providerError;
    const parsed = z
      .object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) })
      .safeParse(raw);
    if (!parsed.success || !parsed.data.choices[0].message.content.trim())
      throw new ApiError('The AI reply was empty or could not be read. Try another free model.', 'invalid');
    return parsed.data.choices[0].message.content.trim();
  } finally {
    opinionRequestInFlight = false;
  }
}
