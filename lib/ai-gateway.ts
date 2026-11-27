import { parseStructuredSecondOpinion, type StructuredSecondOpinion } from './api';
import { DEFAULT_CLOUDFLARE_FREE_MODEL, type SecondOpinionProvider } from './types';

export type ProviderCredentials = {
  gemini?: string;
  xai?: string;
  cloudflare?: string;
  cloudflareAccountId?: string;
  openrouter?: string;
};

export type ProviderModels = {
  gemini: string;
  xai: string;
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
  xai: 'grok-4.7',
  cloudflare: DEFAULT_CLOUDFLARE_FREE_MODEL,
  openrouter: '',
};

export class SecondOpinionProviderError extends Error {
  constructor(
    message: string,
    public readonly code: ProviderAttempt['status'],
    public readonly retryAfterSeconds?: number,
    public readonly attempts: ProviderAttempt[] = [],
  ) {
    super(message);
    this.name = 'SecondOpinionProviderError';
  }
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

async function readProviderErrorDetail(response: Response, secret?: string): Promise<string> {
  const raw = await response.clone().text().catch(() => '');
  if (!raw.trim()) return '';
  let detail = '';
  try {
    const payload = JSON.parse(raw) as { error?: unknown; message?: unknown; errors?: unknown };
    if (typeof payload.error === 'string') detail = payload.error;
    else if (payload.error && typeof payload.error === 'object') {
      const error = payload.error as { message?: unknown; code?: unknown; type?: unknown };
      detail = [error.message, error.code, error.type].filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).join(' · ');
    }
    if (!detail && typeof payload.message === 'string') detail = payload.message;
    if (!detail && Array.isArray(payload.errors)) {
      detail = payload.errors.map((item) => typeof item === 'string' ? item :
        item && typeof item === 'object' && 'message' in item && typeof item.message === 'string' ? item.message : ''
      ).filter(Boolean).join(' · ');
    }
  } catch { detail = raw; }
  if (!detail) return '';
  if (secret) detail = detail.split(secret).join('[redacted]');
  return detail.replace(/Bearer\s+[^\s"',}]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,})\b/g, '[redacted]')
    .replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}

async function requestOnce(
  url: string,
  init: RequestInit,
  fetcher: Fetcher,
  provider: SecondOpinionProvider,
  timeoutMs = 25000,
  secret?: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
      const retryAfter = parseRetryAfterSeconds(response.headers.get('Retry-After'));
      const detail = await readProviderErrorDetail(response, secret);
      const suffix = detail ? ' Provider detail: ' + detail : '';
      if (response.status === 401) throw new SecondOpinionProviderError(provider + ' rejected the saved key.' + suffix, 'invalid-key');
      if (response.status === 402) throw new SecondOpinionProviderError(provider + ' reports insufficient credits or billing balance.' + suffix, 'credits');
      if (response.status === 403) throw new SecondOpinionProviderError(provider + ' denied this request. Check model access and token permissions.' + suffix, 'permission');
      if (response.status === 404 || response.status === 410) throw new SecondOpinionProviderError(provider + ' model or endpoint is unavailable.' + suffix, 'unavailable');
      if (response.status === 408) throw new SecondOpinionProviderError(provider + ' request timed out.' + suffix, 'timeout', retryAfter);
      if (response.status === 429) throw new SecondOpinionProviderError(
        provider + ' is rate-limited.' + (retryAfter === undefined ? '' : ' Retry-After: ' + retryAfter + 's.') + suffix,
        'rate-limited', retryAfter,
      );
      if (response.status >= 500) throw new SecondOpinionProviderError(provider + ' service is temporarily unavailable.' + suffix, 'unavailable', retryAfter);
      throw new SecondOpinionProviderError(provider + ' rejected the request. Check the selected model and provider configuration.' + suffix, 'invalid-response');
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
  const text = (root.candidates?.[0]?.content?.parts ?? []).map((part) => typeof part.text === 'string' ? part.text : '').filter(Boolean).join('\n').trim();
  if (!text) throw new SecondOpinionProviderError('Gemini returned no readable answer. The response may have been blocked or truncated.', 'invalid-response');
  return text;
}

function readXaiResponseText(raw: unknown): string {
  if (!raw || typeof raw !== 'object') throw new SecondOpinionProviderError('xAI returned an invalid Responses API payload.', 'invalid-response');
  const root = raw as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>; status?: string; incomplete_details?: { reason?: string } };
  const parts = (root.output ?? []).flatMap((item) => item.content ?? []);
  const joined = parts.filter((part) => part.type === 'output_text' || part.type === 'text')
    .map((part) => typeof part.text === 'string' ? part.text : '').filter(Boolean).join('\n');
  const text = (typeof root.output_text === 'string' ? root.output_text : joined).trim();
  if (!text) {
    const reason = root.incomplete_details?.reason;
    throw new SecondOpinionProviderError('xAI Responses API returned no readable text.' + (reason ? ' Response status: ' + root.status + '; reason: ' + reason + '.' : ''), 'invalid-response');
  }
  return text;
}

async function postXaiResponse(config: SecondOpinionProviderConfig, prompt: string, maxOutputTokens: number, temperature: number, fetcher: Fetcher, timeoutMs: number): Promise<string> {
  const raw = await requestOnce('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      input: [{ role: 'user', content: prompt }],
      max_output_tokens: maxOutputTokens,
      temperature,
      store: false,
      text: { format: { type: 'json_object' } },
    }),
  }, fetcher, 'xai', timeoutMs, config.key);
  return readXaiResponseText(raw);
}

const CLOUDFLARE_JSON_MODE_MODELS = new Set([
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3-8b-instruct',
  '@cf/meta/llama-3.1-8b-instruct',
  '@hf/nousresearch/hermes-2-pro-mistral-7b',
  '@thebloke/deepseek-coder-6.7b-instruct-awq',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
]);

async function postCloudflareChatCompletion(
  config: SecondOpinionProviderConfig,
  prompt: string,
  maxTokens: number,
  temperature: number,
  fetcher: Fetcher,
): Promise<string> {
  const accountId = config.accountId?.trim() ?? '';
  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new SecondOpinionProviderError('Cloudflare Account ID is missing or invalid.', 'disabled');
  }
  if (!/^@cf\/[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(config.model)) {
    throw new SecondOpinionProviderError('Cloudflare model ID must use the @cf/author/model format.', 'unavailable');
  }
  const raw = await requestOnce(
    'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
        ...(CLOUDFLARE_JSON_MODE_MODELS.has(config.model)
          ? { response_format: { type: 'json_object' } }
          : {}),
      }),
    },
    fetcher,
    'cloudflare',
    maxTokens > 1000 ? 90000 : 60000,
    config.key,
  );
  return readOpenAICompatibleText(raw, 'cloudflare');
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
      }, fetcher, provider, 60000, key,
    );
    content = readGeminiText(raw);
  } else if (provider === 'xai') {
    content = await postXaiResponse(config, prompt, 900, 0.2, fetcher, 90000);
  } else if (provider === 'openrouter') {
    raw = await requestOnce('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 900, temperature: 0.2, messages: [{ role: 'user', content: prompt }] }),
    }, fetcher, provider, 60000, key);
    content = readOpenAICompatibleText(raw, provider);
  } else {
    content = await postCloudflareChatCompletion(config, prompt, 900, 0.2, fetcher);
  }

  try {
    return parseStructuredSecondOpinion(content);
  } catch {
    throw new SecondOpinionProviderError(provider + ' returned an answer that did not match the required structured second-opinion format.', 'invalid-response');
  }
}

/** One user action may try distinct configured models, including several free OpenRouter models, then fall back across providers. */
export async function requestSecondOpinionWithFallback(
  configs: readonly SecondOpinionProviderConfig[],
  prompt: string,
  fetcher: Fetcher = fetch,
  beforeProviderRequest?: (config: SecondOpinionProviderConfig) => Promise<void>,
): Promise<SecondOpinionResult> {
  if (!prompt.trim()) throw new SecondOpinionProviderError('The approved topic and candidate concept are required.', 'invalid-response');
  const attempts: ProviderAttempt[] = [];
  const seen = new Set<string>();
  for (const config of configs) {
    const candidateKey = config.provider + ':' + config.model.trim();
    if (seen.has(candidateKey)) continue;
    seen.add(candidateKey);
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
  const activeAttempts = attempts.filter((attempt) => attempt.status !== 'disabled');
  const detail = activeAttempts.map((attempt) => attempt.provider + ': ' + attempt.status).join(' · ');
  throw new SecondOpinionProviderError(
    activeAttempts.length
      ? 'All configured second-opinion providers failed or returned an invalid response. ' + detail
      : 'No second-opinion provider has a saved key. Add a provider key in Settings.',
    activeAttempts[activeAttempts.length - 1]?.status ?? 'disabled',
    undefined,
    attempts,
  );
}


export type ResearchAgentTextResult = {
  provider: SecondOpinionProvider;
  model: string;
  content: string;
  attempts: ProviderAttempt[];
};

async function postResearchPrompt(
  config: SecondOpinionProviderConfig,
  prompt: string,
  fetcher: Fetcher,
): Promise<string> {
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
          generationConfig: { maxOutputTokens: 4200, temperature: 0.15, responseMimeType: 'application/json' },
        }),
      }, fetcher, provider, 90000, key,
    );
    content = readGeminiText(raw);
  } else if (provider === 'xai') {
    content = await postXaiResponse(config, prompt, 4200, 0.15, fetcher, 120000);
  } else if (provider === 'openrouter') {
    raw = await requestOnce('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 4200, temperature: 0.15,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    }, fetcher, provider, 90000, key);
    content = readOpenAICompatibleText(raw, provider);
  } else {
    content = await postCloudflareChatCompletion(config, prompt, 4200, 0.15, fetcher);
  }
  if (!content.trim()) throw new SecondOpinionProviderError(provider + ' returned an empty research response.', 'invalid-response');
  return content.trim();
}

/**
 * Uses the same configured personal AI providers as the app's second-opinion feature,
 * but returns bounded structured research JSON for the local validator to inspect.
 * Each provider/model pair is attempted at most once; failed models do not block the next candidate.
 */
export async function requestResearchAgentWithFallback(
  configs: readonly SecondOpinionProviderConfig[],
  prompt: string,
  fetcher: Fetcher = fetch,
  beforeProviderRequest?: (config: SecondOpinionProviderConfig) => Promise<void>,
): Promise<ResearchAgentTextResult> {
  if (!prompt.trim()) throw new SecondOpinionProviderError('The research topic and evidence are required.', 'invalid-response');
  const attempts: ProviderAttempt[] = [];
  const seen = new Set<string>();
  for (const config of configs) {
    const candidateKey = config.provider + ':' + config.model.trim();
    if (seen.has(candidateKey)) continue;
    seen.add(candidateKey);
    if (!config.key.trim()) {
      attempts.push({ provider: config.provider, model: config.model, status: 'disabled', message: 'No key is saved.' });
      continue;
    }
    try {
      await beforeProviderRequest?.(config);
      const content = await postResearchPrompt(config, prompt, fetcher);
      attempts.push({ provider: config.provider, model: config.model, status: 'success', message: 'Research JSON returned; local schema validation is still required.' });
      return { provider: config.provider, model: config.model, content, attempts };
    } catch (error) {
      const failure = error instanceof SecondOpinionProviderError
        ? error
        : new SecondOpinionProviderError(config.provider + ' research request failed safely.', 'unavailable');
      attempts.push({ provider: config.provider, model: config.model, status: failure.code, message: failure.message });
    }
  }
  const activeAttempts = attempts.filter((attempt) => attempt.status !== 'disabled');
  const detail = activeAttempts.map((attempt) => attempt.provider + ': ' + attempt.status).join(' · ');
  throw new SecondOpinionProviderError(
    activeAttempts.length
      ? 'All configured research providers failed or returned unusable responses. ' + detail
      : 'No research AI provider key is saved. Add a personal Gemini, Grok (xAI), Cloudflare or OpenRouter key in Settings.',
    activeAttempts[activeAttempts.length - 1]?.status ?? 'disabled',
    undefined,
    attempts,
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
    }, fetcher, provider, 25000, credentials.key);
    const data = raw as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> };
    return (data.models ?? [])
      .filter((model) => model.name && model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => ({ id: model.name!.replace(/^models\//, ''), name: model.displayName || model.name! }));
  }
  if (provider === 'xai') {
    raw = await requestOnce('https://api.x.ai/v1/models', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + credentials.key },
    }, fetcher, provider, 25000, credentials.key);
    const data = raw as { data?: Array<{ id?: string; owned_by?: string }> };
    return (data.data ?? []).filter((model) => model.id).map((model) => ({ id: model.id!, name: model.id! + (model.owned_by ? ' · ' + model.owned_by : '') }));
  }
  if (provider === 'cloudflare') {
    const accountId = credentials.accountId?.trim() ?? '';
    if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new SecondOpinionProviderError('Cloudflare Account ID is missing or invalid.', 'disabled');
    raw = await requestOnce('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/models/search?task=text-generation&hide_experimental=true&per_page=100', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + credentials.key },
    }, fetcher, provider, 25000, credentials.key);
    const data = raw as { success?: boolean; result?: Array<{ name?: string; id?: string; description?: string; task?: { name?: string } }> };
    const discovered = (data.result ?? [])
      .filter((model) => model.name || model.id)
      .map((model) => {
        const id = model.name || model.id!;
        return { id, name: id + (model.description ? ' · ' + model.description.slice(0, 80) : '') };
      });
    return [
      { id: DEFAULT_CLOUDFLARE_FREE_MODEL, name: DEFAULT_CLOUDFLARE_FREE_MODEL + ' · Free plan' },
      ...discovered.filter((model) => model.id !== DEFAULT_CLOUDFLARE_FREE_MODEL),
    ];
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
