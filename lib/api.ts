import { z } from 'zod';
import { type Budget, type ResearchInput, type Video } from './types';
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
      } catch {
        throw new ApiError('The service returned an unreadable response.', 'invalid');
      }
      if (response.ok) return body;
      const serialized = JSON.stringify(body);
      if (/quotaExceeded|dailyLimitExceeded/.test(serialized))
        throw new ApiError(
          'YouTube quota is exhausted. Check Google Cloud before trying again.',
          'quota',
        );
      if (response.status === 401 || /keyInvalid|API_KEY_INVALID/.test(serialized))
        throw new ApiError('The API key is invalid. Replace it in Settings.', 'key');
      if (response.status === 403)
        throw new ApiError(
          'Access denied. Enable the API and check key restrictions in Google Cloud.',
          'permission',
        );
      if (response.status === 404)
        throw new ApiError(
          'That model or endpoint is unavailable. Refresh the model list.',
          'model',
        );
      if (response.status === 429 || response.status >= 500) {
        if (attempt < attempts - 1) {
          await wait(backoffBaseMs * 2 ** attempt);
          continue;
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
      warnings.push(
        'Stopped at the 12-search safety cap. Not all query and language combinations were sampled.',
      );
      break;
    }
    onProgress?.(`Searching ${search.query} · ${search.language}`);
    let pageToken = '';
    let page = 0;
    do {
      const params: Record<string, string> = {
        part: 'snippet',
        type: 'video',
        q: search.query,
        order: search.order,
        relevanceLanguage: search.language,
        maxResults: String(
          Math.min(50, Math.max(1, Math.ceil(input.maxResults / searches.length))),
        ),
        videoDuration: input.duration,
        fields:
          'nextPageToken,items(id/videoId,snippet(title,description,channelTitle,publishedAt,thumbnails))',
      };
      if (input.region !== 'Worldwide') params.regionCode = input.region === 'Iran' ? 'IR' : 'US';
      if (input.category) params.videoCategoryId = input.category;
      if (input.days)
        params.publishedAfter = new Date(Date.now() - input.days * 86400000).toISOString();
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
      if (!parsed.success)
        throw new ApiError('YouTube returned an invalid search response.', 'invalid');
      for (const item of parsed.data.items) {
        if (!videos.has(item.id.videoId) && videos.size < input.maxResults)
          videos.set(item.id.videoId, {
            id: item.id.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            channel: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
            thumbnail:
              item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? '',
            fetchedAt: Date.now(),
            query: search.order === 'viewCount' ? 'YouTube popularity order' : search.query,
          });
      }
      pageToken = parsed.data.nextPageToken ?? '';
      page++;
    } while (pageToken && page < 2 && calls < 12 && videos.size < input.maxResults);
  }
  return { videos: [...videos.values()], queries, warnings };
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
  return `Give a concise English second opinion on this user-created editorial idea. No YouTube API data or performance statistics are provided. Topic: ${topic.slice(0, 300)}. Proposed concept: ${concept.slice(0, 1200)}. Personal decision: ${decision.slice(0, 600)}. Assess useful angles, competition uncertainty, video concepts, and prioritization. Say insufficient evidence for demand/competition claims. Do not invent trends, scores, probabilities, or percentages. Distinguish subjective judgment from evidence; you may disagree. Do not request or analyze YouTube API data.`;
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
