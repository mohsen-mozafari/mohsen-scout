import { parseStructuredSecondOpinion, type StructuredSecondOpinion } from './api';
import type { SecondOpinionProvider } from './types';

export type ProviderCredentials = {
  gemini?: string;
  groq?: string;
  cloudflare?: string;
  cloudflareAccountId?: string;
  openrouter?: string;
};

export type ProviderModels = {
  gemini: string;
  groq: string;
  cloudflare: string;
  openrouter: string;
};

export type ProviderAttempt = {
  provider: SecondOpinionProvider;
  model: string;
  status: 'success' | 'invalid-key' | 'rate-limited' | 'unavailable' | 'invalid-response' | 'permission' | 'credits' | 'timeout' | 'disabled';
  message: string;
};

export type SecondOpinionResult = {
  provider: SecondOpinionProvider;
  model: string;
  opinion: StructuredSecondOpinion;
  attempts: ProviderAttempt[];
};

export type SecondOpinionProviderConfig = {
  provider: SecondOpinionProvider;
  key: string;
  model: string;
  accountId?: string;
};

export type Fetcher = typeof fetch;

export const DEFAULT_SECOND_OPINION_MODELS: ProviderModels = {
  gemini: 'gemini-3.8-flash',
  groq: 'openai/gpt-oss-120b',
  cloudflare: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  openrouter: '',
};

export class SecondOpinionProviderError extends Error {
  constructor(
    message: string,
    public readonly code: ProviderAttempt['status'],
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'SecondOpinionProviderError';
  }
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

async function requestOnce(
  url: string,
  init: RequestInit,
  fetcher: Fetcher,
  provider: SecondOpinionProvider,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    let response: Response;
    try {
      response = await fetcher(url, { ...init, signal: controller.signal });
    } catch {
      throw new SecondOpinionProviderError(
        provider + ' is unavailable or the network connection failed.',
        controller.signal.aborted ? 'timeout' : 'unavailable',
      );
    }
    if (!response.ok) {
      const retryAfter = retryAfterSeconds(response.headers.get('Retry-After'));
      if (response.status === 401) throw new SecondOpinionProviderError(provider + ' rejected the saved key.', 'invalid-key');
      if (response.status === 402) throw new SecondOpinionProviderError(provider + ' reports insufficient credits or billing balance.', 'credits');
      if (response.status === 403) throw new SecondOpinionProviderError(provider + ' denied this request. Check model access and token permissions.', 'permission');
      if (response.status === 404 || response.status === 410) throw new SecondOpinionProviderError(provider + ' model or endpoint is unavailable.', 'unavailable');
      if (response.status === 408) throw new SecondOpinionProviderError(provider + ' request timed out.', 'timeout', retryAfter);
      if (response.status === 429) throw new SecondOpinionProviderError(
        provider + ' is rate-limited.' + (retryAfter === undefined ? '' : ' Retry-After: ' + retryAfter + 's.'),
        'rate-limited',
        retryAfter,
      );
      if (response.status >= 500) throw new SecondOpinionProviderError(provider + ' service is temporarily unavailable.', 'unavailable', retryAfter);
      throw new SecondOpinionProviderError(provider + ' rejected the request. Check the selected model and provider configuration.', 'invalid-response');
    }
    try {
      return await response.json() as unknown;
    } catch {
      throw new SecondOpinionProviderError(provider + ' returned unreadable JSON.', 'invalid-response');
    }
  } finally {
    clearTimeout(timer);
  }
}

function readOpenAICompatibleText(raw: unknown, provider: SecondOpinionProvider): string {
  if (!raw || typeof raw !== 'object') {
    throw new SecondOpinionProviderError(provider + ' returned an invalid response.', 'invalid-response');
  }
  const root = raw as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = root.choices?.[0]?.message?.content;
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((part) => part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '').join('\n')
      : '';
  if (!text.trim()) throw new SecondOpinionProviderError(provider + ' returned no readable text.', 'invalid-response');
  return text.trim();
}

function readGeminiText(raw: unknown): string {
  if (!raw || typeof raw !== 'object') throw new SecondOpinionProviderError('Gemini returned an invalid response.', 'invalid-response');
  const root = raw as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> }; finishReason?: string }> };
  const text = (root.candidates?.[0]?.content?.parts ?? [])
    .map((part) => typeof part.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) throw new SecondOpinionProviderError('Gemini returned no readable answer. The response may have been blocked or truncated.', 'invalid-response');
  return text;
}

function readCloudflareText(raw: unknown): string {
  if (!raw || typeof raw !== 'object') throw new SecondOpinionProviderError('Cloudflare Workers AI returned an invalid response.', 'invalid-response');
  const root = raw as { success?: boolean; result?: { response?: unknown; text?: unknown }; errors?: unknown[] };
  const text = typeof root.result?.response === 'string'
    ? root.result.response
    : typeof root.result?.text === 'string' ? root.result.text : '';
  if (root.success === false || !text.trim()) {
    throw new SecondOpinionProviderError('Cloudflare Workers AI returned no readable answer. Check model support and token permissions.', 'invalid-response');
  }
  return text.trim();
}

async function postOpinion(
  config: SecondOpinionProviderConfig,
  prompt: string,
  fetcher: Fetcher,
): Promise<StructuredSecondOpinion> {
  const { provider, key, model } = config;
  if (!key.trim()) throw new SecondOpinionProviderError(provider + ' is disabled because no key is saved.', 'disabled');
  if (!model.trim()) throw new SecondOpinionProviderError(provider + ' has no selected model.', 'unavailable');

  let raw: unknown;
  let content = '';
  if (provider === 'gemini') {
    raw = await requestOnce(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 900, temperature: 0.2, responseMimeType: 'application/json' },
        }),
      },
      fetcher,
      provider,
    );
    content = readGeminiText(raw);
  } else if (provider === 'groq' || provider === 'openrouter') {
    const url = provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';
    raw = await requestOnce(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
    }, fetcher, provider);
    content = readOpenAICompatibleText(raw, provider);
  } else {
    const accountId = config.accountId?.trim() ?? '';
    if (!/^[a-f0-9]{32}$/i.test(accountId)) {
      throw new SecondOpinionProviderError('Cloudflare Account ID is missing or invalid.', 'disabled');
    }
    raw = await requestOnce(
      'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/' + encodeURIComponent(model),
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, max_tokens: 900, temperature: 0.2 }),
      },
      fetcher,
      provider,
    );
    content = readCloudflareText(raw);
  }

  try {
    return parseStructuredSecondOpinion(content);
  } catch {
    throw new SecondOpinionProviderError(provider + ' returned an answer that did not match the required structured second-opinion format.', 'invalid-response');
  }
}

/** One user action may fall back across providers; no individual generation POST is retried. */
export async function requestSecondOpinionWithFallback(
  configs: readonly SecondOpinionProviderConfig[],
  prompt: string,
  fetcher: Fetcher = fetch,
  beforeProviderRequest?: (config: SecondOpinionProviderConfig) => Promise<void>,
): Promise<SecondOpinionResult> {
  if (!prompt.trim()) throw new SecondOpinionProviderError('The approved topic and candidate concept are required.', 'invalid-response');
  const attempts: ProviderAttempt[] = [];
  const seen = new Set<SecondOpinionProvider>();
  for (const config of configs) {
    if (seen.has(config.provider)) continue;
    seen.add(config.provider);
    if (!config.key.trim()) {
      attempts.push({ provider: config.provider, model: config.model, status: 'disabled', message: 'No key is saved.' });
      continue;
    }
    try {
      await beforeProviderRequest?.(config);
      const opinion = await postOpinion(config, prompt, fetcher);
      attempts.push({ provider: config.provider, model: config.model, status: 'success', message: 'Structured response validated.' });
      return { provider: config.provider, model: config.model, opinion, attempts };
    } catch (error) {
      const failure = error instanceof SecondOpinionProviderError
        ? error
        : new SecondOpinionProviderError(config.provider + ' failed safely.', 'unavailable');
      attempts.push({ provider: config.provider, model: config.model, status: failure.code, message: failure.message });
    }
  }
  throw new AggregateError(
    attempts.filter((attempt) => attempt.status !== 'disabled').map((attempt) => new Error(attempt.message)),
    attempts.some((attempt) => attempt.status !== 'disabled')
      ? 'All configured second-opinion providers failed or returned an invalid response.'
      : 'No second-opinion provider has a saved key. Add a provider key in Settings.',
  );
}

export type DiscoveredProviderModel = { id: string; name: string };

export async function discoverSecondOpinionModels(
  provider: SecondOpinionProvider,
  credentials: { key: string; accountId?: string },
  fetcher: Fetcher = fetch,
): Promise<DiscoveredProviderModel[]> {
  if (!credentials.key.trim()) throw new SecondOpinionProviderError(provider + ' key is not saved.', 'disabled');
  let raw: unknown;
  if (provider === 'gemini') {
    raw = await requestOnce('https://generativelanguage.googleapis.com/v1beta/models', {
      method: 'GET',
      headers: { 'x-goog-api-key': credentials.key },
    }, fetcher, provider);
    const data = raw as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> };
    return (data.models ?? [])
      .filter((model) => model.name && model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => ({ id: model.name!.replace(/^models\//, ''), name: model.displayName || model.name! }));
  }
  if (provider === 'groq') {
    raw = await requestOnce('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + credentials.key },
    }, fetcher, provider);
    const data = raw as { data?: Array<{ id?: string; owned_by?: string }> };
    return (data.data ?? []).filter((model) => model.id).map((model) => ({ id: model.id!, name: model.id! + (model.owned_by ? ' · ' + model.owned_by : '') }));
  }
  if (provider === 'cloudflare') {
    const accountId = credentials.accountId?.trim() ?? '';
    if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new SecondOpinionProviderError('Cloudflare Account ID is missing or invalid.', 'disabled');
    raw = await requestOnce('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/models/search?task=text-generation&hide_experimental=true&per_page=100', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + credentials.key },
    }, fetcher, provider);
    const data = raw as { success?: boolean; result?: Array<{ name?: string; id?: string; description?: string; task?: { name?: string } }> };
    return (data.result ?? [])
      .filter((model) => model.name || model.id)
      .map((model) => {
        const id = model.name || model.id!;
        return { id, name: id + (model.description ? ' · ' + model.description.slice(0, 80) : '') };
      });
  }
  const { getFreeModels } = await import('./api');
  return getFreeModels(fetcher);
}

export async function testSecondOpinionCredential(
  provider: SecondOpinionProvider,
  credentials: { key: string; accountId?: string },
  fetcher: Fetcher = fetch,
): Promise<void> {
  const models = await discoverSecondOpinionModels(provider, credentials, fetcher);
  if (!models.length) throw new SecondOpinionProviderError(provider + ' did not return any supported text-generation models.', 'unavailable');
}
