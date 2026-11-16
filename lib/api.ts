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
      if (response.status === 402)
        throw new ApiError('The service requires additional account credits.', 'credits');
      if (response.status === 429 || response.status === 408 || response.status >= 500) {
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
            : response.status === 408
              ? 'The service request timed out. Try again.'
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
  topic.trim() + ' beginner guide',
  topic.trim() + ' common mistakes',
  topic.trim() + ' comparison',
];

const MAX_SEARCH_ATTEMPTS = 12;
export type SearchTask = {
  language: string;
  query: string;
  order: 'relevance' | 'viewCount';
  popularity?: boolean;
};

/** Build a relevance-first query plan with balanced coverage across languages. */
export function buildSearchPlan(topic: string, languages: string[]): SearchTask[] {
  const cleanTopic = topic.trim().replace(/\s+/g, ' ');
  const uniqueLanguages = [...new Set(languages.map((language) => language.trim()).filter(Boolean))]
    .slice(0, MAX_SEARCH_ATTEMPTS);
  if (!cleanTopic || !uniqueLanguages.length) return [];
  const variants = relatedQueries(cleanTopic);
  const perLanguage = uniqueLanguages.map((language) => [
    ...variants.map((query) => ({ language, query, order: 'relevance' as const })),
    { language, query: cleanTopic, order: 'viewCount' as const, popularity: true },
  ]);
  const perLanguageLimit = Math.max(1, Math.floor(MAX_SEARCH_ATTEMPTS / perLanguage.length));
  const plan: SearchTask[] = [];
  // Round-robin by query angle so languages receive comparable coverage.
  for (let angle = 0; angle < perLanguageLimit && plan.length < MAX_SEARCH_ATTEMPTS; angle++) {
    for (const tasks of perLanguage) {
      const task = tasks[angle];
      if (task) plan.push(task);
      if (plan.length >= MAX_SEARCH_ATTEMPTS) break;
    }
  }
  return plan;
}
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
  const topic = input.topic.trim().replace(/\s+/g, ' ');
  const languages = [...new Set(input.languages.map((language) => language.trim()).filter(Boolean))];
  if (!topic || !languages.length)
    throw new ApiError('Enter a topic and choose at least one language.', 'input');
  const searches = buildSearchPlan(topic, languages);
  if (!searches.length)
    throw new ApiError('No valid search combinations were selected.', 'input');

  const maximum = Number.isFinite(input.maxResults)
    ? Math.min(100, Math.max(1, Math.floor(input.maxResults)))
    : 50;
  const pageSize = Math.min(50, Math.max(1, Math.ceil(maximum / searches.length)));
  const videos = new Map<string, Video>();
  const warnings: string[] = [];
  const pendingPages: Array<{ task: SearchTask; token: string }> = [];
  const queries = [...new Set(searches.map((task) => task.query))];
  let attempts = 0;
  let successfulRequests = 0;
  let lastError: unknown;
  let stopped = false;
  let skippedWork = false;

  if (languages.length > 12)
    warnings.push('Only the first 12 selected languages fit within the search safety cap.');
  if (searches.length < languages.length * 5)
    warnings.push('The 12-attempt safety cap omits some optional query angles or popularity samples.');

  // This guard runs before every actual request, including GET retries.
  const attemptOptions: YouTubeOptions = {
    ...options,
    charge: async (units) => {
      if (attempts >= MAX_SEARCH_ATTEMPTS)
        throw new ApiError('Stopped at the 12-network-attempt safety cap.', 'cap');
      await options.charge(units);
      attempts++;
    },
  };

  const fetchPage = async (task: SearchTask, pageToken = '') => {
    const params: Record<string, string> = {
      part: 'snippet',
      type: 'video',
      q: task.query,
      order: task.order,
      relevanceLanguage: task.language,
      maxResults: String(pageSize),
      videoDuration: input.duration,
      fields:
        'nextPageToken,items(id/videoId,snippet(title,description,channelTitle,publishedAt,thumbnails))',
    };
    if (input.region !== 'Worldwide')
      params.regionCode = input.region === 'Iran' ? 'IR' : 'US';
    if (input.category) params.videoCategoryId = input.category;
    if (input.days > 0)
      params.publishedAfter = new Date(Date.now() - input.days * 86400000).toISOString();
    if (pageToken) params.pageToken = pageToken;

    const raw = await youtube('search', params, attemptOptions, 100);
    const parsed = searchSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiError('YouTube returned an invalid search response.', 'invalid');
    successfulRequests++;
    for (const item of parsed.data.items) {
      if (!videos.has(item.id.videoId) && videos.size < maximum) {
        videos.set(item.id.videoId, {
          id: item.id.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          channel: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          thumbnail:
            item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? '',
          fetchedAt: Date.now(),
          query: task.popularity ? 'YouTube popularity order' : task.query,
        });
      }
    }
    return parsed.data.nextPageToken ?? '';
  };

  const handleFailure = (task: SearchTask, error: unknown) => {
    const message = error instanceof Error ? error.message : 'A search request failed.';
    warnings.push(task.query + ' · ' + task.language + ': ' + message);
    if (!lastError || !(error instanceof ApiError && error.code === 'cap')) lastError = error;
    if (
      error instanceof ApiError &&
      ['budget', 'quota', 'permission', 'key', 'cap'].includes(error.code)
    )
      stopped = true;
  };

  // Cover planned first pages before spending request budget on page two.
  for (const task of searches) {
    if (stopped) break;
    if (attempts >= MAX_SEARCH_ATTEMPTS) {
      skippedWork = true;
      break;
    }
    onProgress?.('Searching ' + task.query + ' · ' + task.language + ' · ' + task.order);
    try {
      const token = await fetchPage(task);
      if (token) pendingPages.push({ task, token });
    } catch (error) {
      handleFailure(task, error);
    }
  }

  for (const page of pendingPages) {
    if (stopped || videos.size >= maximum) break;
    if (attempts >= MAX_SEARCH_ATTEMPTS) {
      skippedWork = true;
      break;
    }
    onProgress?.('Loading another page · ' + page.task.language);
    try {
      await fetchPage(page.task, page.token);
    } catch (error) {
      handleFailure(page.task, error);
    }
  }

  if (skippedWork || (attempts >= MAX_SEARCH_ATTEMPTS && pendingPages.length > 0))
    warnings.push('Stopped at the 12-network-attempt safety cap; some pages or query angles were not checked.');
  if (!successfulRequests && lastError) throw lastError;
  return { videos: [...videos.values()], queries, warnings: [...new Set(warnings)] };
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

export function selectFreeModel(
  models: ReadonlyArray<{ id: string }>,
  preferred?: string | null,
): string | undefined {
  if (preferred && models.some((model) => model.id === preferred)) return preferred;
  return models.find((model) => model.id.trim())?.id;
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
function openRouterErrorMessage(code: number): string {
  const messages: Record<number, string> = {
    400: 'OpenRouter rejected the request. Refresh the free-model list and check the selected model.',
    401: 'The OpenRouter API key is invalid or revoked. Replace it in Settings.',
    402: 'OpenRouter reports insufficient account or key credits. Check account balance and model access.',
    403: 'OpenRouter denied access to this model or request. Check key permissions and provider restrictions.',
    404: 'The selected model is no longer available. Refresh free models and try again.',
    408: 'The AI provider timed out. Try another available free model.',
    429: 'The selected free-model provider is rate limited. Wait or choose another free model.',
    502: 'The selected model provider is temporarily unavailable. Choose another free model or try later.',
    503: 'The selected model provider is temporarily unavailable. Choose another free model or try later.',
  };
  return messages[code] ?? 'OpenRouter could not complete the request. Refresh free models and try again.';
}

function rethrowOpenRouterError(error: unknown): never {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      key: openRouterErrorMessage(401),
      permission: openRouterErrorMessage(403),
      credits: openRouterErrorMessage(402),
      model: openRouterErrorMessage(404),
      request: openRouterErrorMessage(400),
      timeout: openRouterErrorMessage(408),
      offline: 'Could not connect to OpenRouter. Check the internet connection and try again.',
    };
    throw new ApiError(messages[error.code] ?? error.message, error.code);
  }
  throw error;
}

export async function getOpinion(
  key: string,
  model: string,
  prompt: string,
  fetcher: Fetcher = fetch,
) {
  let raw: unknown;
  try {
    raw = await requestJson(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          max_tokens: 700,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
      fetcher,
    );
  } catch (error) {
    return rethrowOpenRouterError(error);
  }

  // OpenRouter can return an error envelope even when the HTTP status is 200.
  const providerError = z
    .object({
      error: z.object({ code: z.union([z.number(), z.string()]).optional() }).passthrough(),
    })
    .safeParse(raw);
  if (providerError.success)
    throw new ApiError(openRouterErrorMessage(Number(providerError.data.error.code)), 'provider');

  const parsed = z
    .object({
      choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
    })
    .safeParse(raw);
  if (!parsed.success || !parsed.data.choices[0].message.content.trim())
    throw new ApiError(
      'OpenRouter returned an empty or unreadable AI reply. Try another free model.',
      'invalid',
    );
  return parsed.data.choices[0].message.content.trim();
}
