import { test } from 'node:test';
import assert from 'node:assert/strict';
import { structuredSecondOpinionPrompt } from '../lib/api';
import {
  discoverSecondOpinionModels,
  SecondOpinionProviderError,
  requestSecondOpinionWithFallback,
  requestResearchAgentWithFallback,
  type SecondOpinionProviderConfig,
} from '../lib/ai-gateway';

const validOpinion = JSON.stringify({
  decision: 'gather_more_evidence',
  strengths: ['The question is focused.'],
  risks: ['The comparison sample may be incomplete.'],
  missingData: ['Independent historical outcomes.'],
  validationSteps: ['Check primary sources.'],
  nextAction: 'Collect comparable examples.',
});

function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestBody(init?: RequestInit): string {
  const body = init?.body;
  if (typeof body !== 'string') throw new Error('Expected a JSON string request body.');
  return body;
}

function requestHeader(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

void test('Gemini adapter uses the API-key header and sends only the approved editorial prompt', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const prompt = structuredSecondOpinionPrompt('Mars exploration', 'A focused Mars sample-return explainer', 'en');
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = requestUrl(input);
    capturedInit = init;
    return jsonResponse({ candidates: [{ content: { parts: [{ text: validOpinion }] } }] });
  };
  const result = await requestSecondOpinionWithFallback([
    { provider: 'gemini', key: 'gemini-secret', model: 'gemini-3.8-flash' },
  ], prompt, fetcher);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.opinion.decision, 'gather_more_evidence');
  assert.match(capturedUrl, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent/);
  assert.equal(requestHeader(capturedInit, 'x-goog-api-key'), 'gemini-secret');
  assert.equal(capturedUrl.includes('gemini-secret'), false);
  const body = JSON.parse(requestBody(capturedInit));
  assert.equal(body.contents[0].parts[0].text, prompt);
  assert.equal(body.generationConfig.maxOutputTokens, 900);
  assert.doesNotMatch(JSON.stringify(body), /nasa\.gov|youtube\.com|private video description|local score 94/i);
});

void test('Grok (xAI) adapter uses its OpenAI-compatible chat-completions contract', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = requestUrl(input);
    capturedInit = init;
    return jsonResponse({ choices: [{ message: { content: validOpinion } }] });
  };
  const result = await requestSecondOpinionWithFallback([
    { provider: 'xai', key: 'xai-secret', model: 'grok-4.7' },
  ], 'topic and candidate only', fetcher);
  assert.equal(result.provider, 'xai');
  assert.equal(capturedUrl, 'https://api.x.ai/v1/chat/completions');
  assert.equal(requestHeader(capturedInit, 'Authorization'), 'Bearer xai-secret');
  const body = JSON.parse(requestBody(capturedInit));
  assert.equal(body.model, 'grok-4.7');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'topic and candidate only' }]);
});

void test('Cloudflare adapter uses the account-scoped Workers AI route and requires a valid account ID', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = requestUrl(input);
    capturedInit = init;
    return jsonResponse({ success: true, result: { response: validOpinion } });
  };
  const result = await requestSecondOpinionWithFallback([
    {
      provider: 'cloudflare',
      key: 'cloudflare-secret',
      accountId: '023e105f4ecef8ad9ca31a8372d0c353',
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    },
  ], 'only approved text', fetcher);
  assert.equal(result.provider, 'cloudflare');
  assert.match(capturedUrl, /accounts\/023e105f4ecef8ad9ca31a8372d0c353\/ai\/run\/@cf\/meta\/llama-3\.3-70b-instruct-fp8-fast/);
  assert.equal(requestHeader(capturedInit, 'Authorization'), 'Bearer cloudflare-secret');
  assert.deepEqual(JSON.parse(requestBody(capturedInit)), {
    prompt: 'only approved text', max_tokens: 900, temperature: 0.2,
  });
  let calls = 0;
  await assert.rejects(() => requestSecondOpinionWithFallback([
    { provider: 'cloudflare', key: 'cloudflare-secret', accountId: 'bad-id', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
  ], 'prompt', async () => {
    calls += 1;
    return jsonResponse({ success: true, result: { response: validOpinion } });
  }));
  assert.equal(calls, 0);
});

void test('provider fallback advances after a rate limit and sends at most one generation request per provider', async () => {
  const calls: string[] = [];
  const configs: SecondOpinionProviderConfig[] = [
    { provider: 'gemini', key: 'gemini-key', model: 'gemini-3.8-flash' },
    { provider: 'xai', key: 'xai-key', model: 'grok-4.7' },
    { provider: 'cloudflare', key: 'cf-key', accountId: '023e105f4ecef8ad9ca31a8372d0c353', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
  ];
  const fetcher: typeof fetch = async (input) => {
    const url = requestUrl(input);
    calls.push(url);
    if (url.includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ error: { message: 'redacted' } }), {
        status: 429,
        headers: { 'Retry-After': '120', 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('api.x.ai')) return jsonResponse({ choices: [{ message: { content: validOpinion } }] });
    return jsonResponse({ success: true, result: { response: validOpinion } });
  };
  const result = await requestSecondOpinionWithFallback(configs, 'approved prompt', fetcher);
  assert.equal(result.provider, 'xai');
  assert.equal(calls.length, 2);
  assert.equal(calls.filter((url) => url.includes('generativelanguage')).length, 1);
  assert.equal(calls.filter((url) => url.includes('api.x.ai')).length, 1);
  assert.deepEqual(result.attempts.map((attempt) => attempt.status), ['rate-limited', 'success']);
});

void test('an invalid structured answer is rejected and falls back to the next provider', async () => {
  const calls: string[] = [];
  const result = await requestSecondOpinionWithFallback([
    { provider: 'gemini', key: 'g-key', model: 'gemini-3.8-flash' },
    { provider: 'xai', key: 'r-key', model: 'grok-4.7' },
  ], 'approved prompt', async (input) => {
    const url = requestUrl(input);
    calls.push(url);
    if (url.includes('generativelanguage')) return jsonResponse({ candidates: [{ content: { parts: [{ text: '{"decision":"invented"}' }] } }] });
    return jsonResponse({ choices: [{ message: { content: validOpinion } }] });
  });
  assert.equal(result.provider, 'xai');
  assert.deepEqual(result.attempts.map((attempt) => attempt.status), ['invalid-response', 'success']);
  assert.equal(calls.length, 2);
});

void test('missing credentials are skipped and duplicate providers never receive duplicate requests', async () => {
  let calls = 0;
  const result = await requestSecondOpinionWithFallback([
    { provider: 'gemini', key: '', model: 'gemini-3.8-flash' },
    { provider: 'xai', key: 'g-key', model: 'grok-4.7' },
    { provider: 'xai', key: 'another-key', model: 'grok-4.7' },
  ], 'prompt', async () => {
    calls += 1;
    return jsonResponse({ choices: [{ message: { content: validOpinion } }] });
  });
  assert.equal(result.provider, 'xai');
  assert.equal(calls, 1);
  assert.deepEqual(result.attempts.map((attempt) => attempt.status), ['disabled', 'success']);
});

void test('model discovery reads active Gemini, Grok (xAI) and Cloudflare model catalog entries', async () => {
  const gemini = await discoverSecondOpinionModels('gemini', { key: 'g-key' }, async (_input, init) => {
    assert.equal(requestHeader(init, 'x-goog-api-key'), 'g-key');
    return jsonResponse({ models: [
      { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-embedding', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
    ] });
  });
  assert.deepEqual(gemini, [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }]);

  const xai = await discoverSecondOpinionModels('xai', { key: 'r-key' }, async (_input, init) => {
    assert.equal(requestHeader(init, 'Authorization'), 'Bearer r-key');
    assert.equal(requestUrl(_input), 'https://api.x.ai/v1/models');
    return jsonResponse({ data: [{ id: 'grok-4.7', owned_by: 'xAI' }] });
  });
  assert.equal(xai[0].id, 'grok-4.7');

  const cloudflare = await discoverSecondOpinionModels('cloudflare', {
    key: 'cf-key', accountId: '023e105f4ecef8ad9ca31a8372d0c353',
  }, async (input, init) => {
    assert.match(requestUrl(input), /ai\/models\/search/);
    assert.equal(requestHeader(init, 'Authorization'), 'Bearer cf-key');
    return jsonResponse({ success: true, result: [{ name: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', description: 'Hosted text model' }] });
  });
  assert.equal(cloudflare[0].id, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
});

void test('all-provider failure preserves a redacted audit trail for the Research Activity panel', async () => {
  let calls = 0;
  await assert.rejects(
    () => requestSecondOpinionWithFallback([
      { provider: 'gemini', key: 'never-log-this-key', model: 'gemini-3.8-flash' },
      { provider: 'xai', key: 'also-secret', model: 'grok-4.7' },
    ], 'approved editorial prompt', async (input) => {
      calls += 1;
      const url = requestUrl(input);
      if (url.includes('generativelanguage')) {
        return jsonResponse({ error: { message: 'redacted' } }, 401);
      }
      return jsonResponse({ error: { message: 'temporarily unavailable' } }, 503);
    }),
    (error: unknown) => {
      assert.ok(error instanceof SecondOpinionProviderError);
      assert.deepEqual(error.attempts.map((attempt) => ({
        provider: attempt.provider,
        status: attempt.status,
      })), [
        { provider: 'gemini', status: 'invalid-key' },
        { provider: 'xai', status: 'unavailable' },
      ]);
      assert.doesNotMatch(JSON.stringify(error.attempts), /never-log-this-key|also-secret/);
      return true;
    },
  );
  assert.equal(calls, 2);
});


void test('a rate-limited OpenRouter free model falls through to another model from the same provider', async () => {
  const attemptedModels: string[] = [];
  const result = await requestSecondOpinionWithFallback([
    { provider: 'openrouter', key: 'router-key', model: 'free/model-a:free' },
    { provider: 'openrouter', key: 'router-key', model: 'free/model-b:free' },
    { provider: 'xai', key: 'xai-key', model: 'grok-4.7' },
  ], 'approved prompt', async (_input, init) => {
    const body = JSON.parse(requestBody(init));
    attemptedModels.push(body.model);
    if (body.model === 'free/model-a:free') {
      return jsonResponse({ error: { message: 'rate limited' } }, 429, { 'Retry-After': '120' });
    }
    return jsonResponse({ choices: [{ message: { content: validOpinion } }] });
  });
  assert.equal(result.provider, 'openrouter');
  assert.equal(result.model, 'free/model-b:free');
  assert.deepEqual(attemptedModels, ['free/model-a:free', 'free/model-b:free']);
  assert.deepEqual(result.attempts.map((attempt) => attempt.status), ['rate-limited', 'success']);
});

 
void test('research agent falls through multiple OpenRouter models before switching providers', async () => {
  const attemptedModels: string[] = [];
  const result = await requestResearchAgentWithFallback([
    { provider: 'openrouter', key: 'router-key', model: 'free/research-a:free' },
    { provider: 'openrouter', key: 'router-key', model: 'free/research-b:free' },
    { provider: 'xai', key: 'xai-key', model: 'grok-4.7' },
  ], 'approved research prompt', async (_input, init) => {
    const request = JSON.parse(requestBody(init));
    attemptedModels.push(request.model);
    if (request.model === 'free/research-a:free') {
      return jsonResponse({ error: { message: 'rate limited' } }, 429, { 'Retry-After': '30' });
    }
    return jsonResponse({ choices: [{ message: { content: '{"hypotheses":[]}' } }] });
  });
  assert.equal(result.provider, 'openrouter');
  assert.equal(result.model, 'free/research-b:free');
  assert.deepEqual(attemptedModels, ['free/research-a:free', 'free/research-b:free']);
  assert.deepEqual(result.attempts.map((attempt) => attempt.status), ['rate-limited', 'success']);
});
