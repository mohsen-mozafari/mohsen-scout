import { test } from 'node:test';
import assert from 'node:assert/strict';
import { structuredSecondOpinionPrompt } from '../lib/api';
import {
  discoverSecondOpinionModels,
  requestSecondOpinionWithFallback,
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

void test('Groq adapter uses its OpenAI-compatible chat-completions contract', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = requestUrl(input);
    capturedInit = init;
    return jsonResponse({ choices: [{ message: { content: validOpinion } }] });
  };
  const result = await requestSecondOpinionWithFallback([
    { provider: 'groq', key: 'groq-secret', model: 'openai/gpt-oss-120b' },
  ], 'topic and candidate only', fetcher);
  assert.equal(result.provider, 'groq');
  assert.equal(capturedUrl, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(requestHeader(capturedInit, 'Authorization'), 'Bearer groq-secret');
  const body = JSON.parse(requestBody(capturedInit));
  assert.equal(body.model, 'openai/gpt-oss-120b');
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
    { provider: 'groq', key: 'groq-key', model: 'openai/gpt-oss-120b' },
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
    if (url.includes('api.groq.com')) return jsonResponse({ choices: [{ message: { content: validOpinion } }] });
    return jsonResponse({ success: true, result: { response: validOpinion } });
  };
  const result = await requestSecondOpinionWithFallback(configs, 'approved prompt', fetcher);
  assert.equal(result.provider, 'groq');
  assert.equal(calls.length, 2);
  assert.equal(calls.filter((url) => url.includes('generativelanguage')).length, 1);
  assert.equal(calls.filter((url) => url.includes('api.groq.com')).length, 1);
  assert.deepEqual(result.attempts.map((attempt) => attempt.status), ['rate-limited', 'success']);
});

void test('an invalid structured answer is rejected and falls back to the next provider', async () => {
  const calls: string[] = [];
  const result = await requestSecondOpinionWithFallback([
    { provider: 'gemini', key: 'g-key', model: 'gemini-3.8-flash' },
    { provider: 'groq', key: 'r-key', model: 'openai/gpt-oss-120b' },
  ], 'approved prompt', async (input) => {
    const url = requestUrl(input);
    calls.push(url);
    if (url.includes('generativelanguage')) return jsonResponse({ candidates: [{ content: { parts: [{ text: '{"decision":"invented"}' }] } }] });
    return jsonResponse({ choices: [{ message: { content: validOpinion } }] });
  });
  assert.equal(result.provider, 'groq');
  assert.deepEqual(result.attempts.map((attempt) => attempt.status), ['invalid-response', 'success']);
  assert.equal(calls.length, 2);
});

void test('missing credentials are skipped and duplicate providers never receive duplicate requests', async () => {
  let calls = 0;
  const result = await requestSecondOpinionWithFallback([
    { provider: 'gemini', key: '', model: 'gemini-3.8-flash' },
    { provider: 'groq', key: 'g-key', model: 'openai/gpt-oss-120b' },
    { provider: 'groq', key: 'another-key', model: 'openai/gpt-oss-120b' },
  ], 'prompt', async () => {
    calls += 1;
    return jsonResponse({ choices: [{ message: { content: validOpinion } }] });
  });
  assert.equal(result.provider, 'groq');
  assert.equal(calls, 1);
  assert.deepEqual(result.attempts.map((attempt) => attempt.status), ['disabled', 'success']);
});

void test('model discovery reads active Gemini, Groq and Cloudflare model catalog entries', async () => {
  const gemini = await discoverSecondOpinionModels('gemini', { key: 'g-key' }, async (_input, init) => {
    assert.equal(requestHeader(init, 'x-goog-api-key'), 'g-key');
    return jsonResponse({ models: [
      { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-embedding', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
    ] });
  });
  assert.deepEqual(gemini, [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }]);

  const groq = await discoverSecondOpinionModels('groq', { key: 'r-key' }, async (_input, init) => {
    assert.equal(requestHeader(init, 'Authorization'), 'Bearer r-key');
    return jsonResponse({ data: [{ id: 'openai/gpt-oss-120b', owned_by: 'OpenAI' }] });
  });
  assert.equal(groq[0].id, 'openai/gpt-oss-120b');

  const cloudflare = await discoverSecondOpinionModels('cloudflare', {
    key: 'cf-key', accountId: '023e105f4ecef8ad9ca31a8372d0c353',
  }, async (input, init) => {
    assert.match(requestUrl(input), /ai\/models\/search/);
    assert.equal(requestHeader(init, 'Authorization'), 'Bearer cf-key');
    return jsonResponse({ success: true, result: [{ name: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', description: 'Hosted text model' }] });
  });
  assert.equal(cloudflare[0].id, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
});
