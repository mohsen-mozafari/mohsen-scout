import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportBackup, importBackup, personalLinks } from '../lib/backup';
import {
  defaults,
  RETENTION_MS,
  purgeExpired,
  type Video,
  type Report,
  type ResearchInput,
} from '../lib/types';
import { validateLocal } from '../lib/validation';
import {
  ApiError,
  nextBudget,
  quotaDay,
  relatedQueries,
  searchYouTube,
  requestJson,
  getFreeModels,
  opinionPrompt,
  testYouTube,
  type Fetcher,
} from '../lib/api';
import { buildIdeas } from '../lib/engine';
const input: ResearchInput = {
  topic: 'Small-space home studios',
  region: 'Iran',
  languages: ['en'],
  days: 30,
  duration: 'short',
  category: '27',
  maxResults: 10,
};
const now = Date.now();
const video: Video = {
  id: 'mockvideo01',
  title: 'MOCK: Original فارسی title — a long practical walkthrough for a tiny recording room',
  description: 'MOCK API description',
  channel: 'MOCK channel',
  thumbnail: 'https://example.com/mock.jpg',
  publishedAt: '2026-10-01T12:00:00Z',
  fetchedAt: now,
  query: input.topic,
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetcher =
  (work: (url: string) => Response | Promise<Response>): Fetcher =>
  async (url) =>
    work(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
const mockItem = (id: string) => ({
  id: { videoId: id },
  snippet: {
    title: video.title,
    description: video.description,
    channelTitle: video.channel,
    publishedAt: video.publishedAt,
    thumbnails: { medium: { url: video.thumbnail } },
  },
});
void test('Foundation: defaults belong to Mohsen and have no secrets', () => {
  const d = defaults();
  assert.equal(d.preferences.name, 'Mohsen');
  assert.equal(d.preferences.schedule, 'Manual');
  assert.equal(validateLocal(d).links.length, 0);
  assert.equal(JSON.stringify(d).includes('API_KEY'), false);
});
void test('Storage: malformed persisted data is rejected', () => {
  assert.throws(() => validateLocal({ ...defaults(), notes: 'bad' }));
});
void test('Storage: API metadata expires at 29 days while personal notes and links remain', () => {
  const d = defaults();
  d.videos = [video, { ...video, id: 'old', fetchedAt: now - RETENTION_MS }];
  d.links = [
    {
      id: 'old',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      manualTitle: 'My label',
      topic: 'My topic',
      note: 'My note',
      folder: 'Ideas',
      tags: ['personal'],
      savedAt: 0,
    },
  ];
  const clean = purgeExpired(d, now);
  assert.equal(clean.videos.length, 1);
  assert.equal(clean.links[0].note, 'My note');
});
void test('Backup: round trip preserves personal data and strips all API metadata/opinions/schedules', () => {
  const d = defaults();
  d.videos = [video];
  d.opinions = [
    { id: 'x', ideaId: 'x', text: 'private AI response', model: 'mock', createdAt: now },
  ];
  d.notes = [
    {
      id: 'n',
      title: 'Personal page',
      folder: 'Research',
      tags: ['camera'],
      blocks: [{ id: 'b', type: 'checklist', text: 'Try this', checked: true }],
      updatedAt: now,
    },
  ];
  const raw = exportBackup(d);
  assert(!raw.includes(video.title));
  assert(!raw.includes(video.thumbnail));
  assert(!raw.includes('private AI response'));
  const imported = importBackup(raw);
  assert.equal(imported.notes[0].blocks[0].checked, true);
  assert.equal(imported.videos.length, 0);
  assert.equal(imported.preferences.schedule, 'Manual');
});
void test('Backup: malformed/oversized/wrong version files rejected before mutation', () => {
  assert.throws(() => importBackup('{'));
  assert.throws(() => importBackup(JSON.stringify({ app: 'MOHSEN SCOUT', version: 2 })));
  assert.throws(() => importBackup(' '.repeat(20_000_001)));
});
void test('Backup: injected credential fields are stripped', () => {
  const raw = JSON.parse(exportBackup(defaults()));
  raw.personal.preferences.youtubeKey = 'SECRET';
  raw.personal.apiKey = 'SECRET';
  assert(!JSON.stringify(importBackup(JSON.stringify(raw))).includes('SECRET'));
});
void test('Library: link export only includes personal fields', () => {
  const d = defaults();
  d.videos = [video];
  d.links = [
    {
      id: 'mockvideo01',
      url: 'https://www.youtube.com/watch?v=mockvideo01',
      manualTitle: 'Personal label',
      topic: 'Topic',
      note: 'Remember this',
      folder: '',
      tags: [],
      savedAt: now,
    },
  ];
  const text = personalLinks(d);
  assert(text.includes('Remember this'));
  assert(!text.includes(video.title));
});
void test('Quota: resets on Pacific day, counts retries, rejects exhausted/budget overflow', () => {
  const date = quotaDay();
  const current = { date, units: 100, requests: 1, exhausted: false };
  assert.equal(nextBudget(current, 500, 100).units, 200);
  assert.throws(() => nextBudget(current, 150, 100), ApiError);
  assert.throws(() => nextBudget({ ...current, exhausted: true }, 500, 1), ApiError);
  assert.equal(nextBudget({ ...current, date: 'old', exhausted: true }, 500, 100).units, 100);
});
void test('Research: creates explicit related queries without inventing stats', () => {
  const queries = relatedQueries(input.topic);
  assert.equal(queries.length, 4);
  assert(queries.every((q) => q.includes(input.topic)));
});
void test('YouTube MOCK: official endpoint, independent region/language filters, deduplication', async () => {
  const urls: string[] = [];
  let units = 0;
  const result = await searchYouTube(input, {
    key: 'MOCK_NOT_REAL',
    charge: async (cost) => {
      units += cost;
    },
    fetcher: fetcher((url) => {
      urls.push(url);
      return response({ items: [mockItem('dQw4w9WgXcQ'), mockItem('dQw4w9WgXcQ')] });
    }),
  });
  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].title, video.title);
  assert.equal(units, 500);
  for (const url of urls) {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'www.googleapis.com');
    assert.equal(parsed.searchParams.get('regionCode'), 'IR');
    assert.equal(parsed.searchParams.get('relevanceLanguage'), 'en');
    assert.equal(parsed.searchParams.get('videoDuration'), 'short');
    assert.equal(parsed.searchParams.get('videoCategoryId'), '27');
    assert(!parsed.searchParams.get('part')?.includes('statistics'));
  }
});
void test('YouTube MOCK: pagination bounded to two pages per query', async () => {
  let calls = 0;
  const result = await searchYouTube(input, {
    key: 'MOCK_PAGE',
    charge: async () => {},
    fetcher: fetcher(() => {
      calls++;
      return response({ nextPageToken: 'next', items: [mockItem('dQw4w9WgXcQ')] });
    }),
  });
  assert.equal(calls, 10);
  assert.equal(result.videos.length, 1);
});
void test('YouTube MOCK: quota exhaustion stops without retries and invokes stop hook', async () => {
  let calls = 0;
  let stopped = false;
  await assert.rejects(
    () =>
      searchYouTube(input, {
        key: 'MOCK_QUOTA',
        charge: async () => {},
        onQuota: async () => {
          stopped = true;
        },
        fetcher: fetcher(() => {
          calls++;
          return response({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403);
        }),
      }),
    (e) => e instanceof ApiError && e.code === 'quota',
  );
  assert.equal(calls, 1);
  assert(stopped);
});
void test('YouTube MOCK: budget checked before network', async () => {
  let calls = 0;
  await assert.rejects(() =>
    searchYouTube(input, {
      key: 'MOCK_BUDGET',
      charge: async () => {
        throw new ApiError('budget', 'budget');
      },
      fetcher: fetcher(() => {
        calls++;
        return response({ items: [] });
      }),
    }),
  );
  assert.equal(calls, 0);
});
void test('YouTube MOCK: invalid search response rejected', async () => {
  await assert.rejects(
    () =>
      searchYouTube(input, {
        key: 'MOCK_INVALID',
        charge: async () => {},
        fetcher: fetcher(() => response({ items: [{ broken: true }] })),
      }),
    (e) => e instanceof ApiError && e.code === 'invalid',
  );
});
void test('YouTube MOCK: duplicate simultaneous key tests share a request', async () => {
  let calls = 0;
  const options = {
    key: 'MOCK_DUP',
    charge: async () => {},
    fetcher: fetcher(async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return response({ items: [] });
    }),
  };
  await Promise.all([testYouTube(options), testYouTube(options)]);
  assert.equal(calls, 1);
});
void test('HTTP MOCK: invalid key and disabled API produce safe errors without leaking credentials', async () => {
  for (const status of [401, 403])
    await assert.rejects(
      () =>
        requestJson(
          'https://example.com/?key=SECRET',
          {},
          fetcher(() => response({ error: 'SECRET' }, status)),
        ),
      (e) => e instanceof ApiError && !e.message.includes('SECRET'),
    );
});
void test('HTTP MOCK: transient failures retry with a strict cap', async () => {
  let calls = 0;
  let charged = 0;
  await assert.rejects(() =>
    requestJson(
      'https://example.com',
      {},
      fetcher(() => {
        calls++;
        return response({}, 503);
      }),
      async () => {
        charged++;
      },
    ),
  );
  assert.equal(calls, 3);
  assert.equal(charged, 3);
});
void test('HTTP MOCK: AI POST is never automatically retried', async () => {
  let calls = 0;
  await assert.rejects(() =>
    requestJson(
      'https://example.com',
      { method: 'POST' },
      fetcher(() => {
        calls++;
        return response({}, 429);
      }),
    ),
  );
  assert.equal(calls, 1);
});
void test('HTTP MOCK: offline failure is human-readable', async () => {
  await assert.rejects(
    () =>
      requestJson('https://example.com', { method: 'POST' }, async () => {
        throw new TypeError('network SECRET');
      }),
    (e) => e instanceof ApiError && e.code === 'offline' && !e.message.includes('SECRET'),
  );
});
void test('HTTP MOCK: timeout path is human-readable', async () => {
  await assert.rejects(
    () =>
      requestJson(
        'https://example.com',
        { method: 'POST' },
        async (_url, init) => {
          if (init?.signal instanceof AbortSignal) {
            const signal = init.signal;
            return new Promise<Response>((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(new Error('aborted')));
            });
          }
          throw new Error('Missing signal');
        },
        undefined,
        5,
      ),
    (e) => e instanceof ApiError && e.code === 'timeout',
  );
});
void test('HTTP MOCK: unreadable JSON rejected', async () => {
  await assert.rejects(
    () =>
      requestJson(
        'https://example.com',
        {},
        fetcher(() => new Response('<html/>')),
      ),
    (e) => e instanceof ApiError && e.code === 'invalid',
  );
});
void test('OpenRouter MOCK: free models discovered from price fields, no unavailable hardcoded ID', async () => {
  const models = await getFreeModels(
    fetcher(() =>
      response({
        data: [
          { id: 'available:free', name: 'MOCK free', pricing: { prompt: '0', completion: '0' } },
          { id: 'paid', name: 'MOCK paid', pricing: { prompt: '0.01', completion: '0.02' } },
        ],
      }),
    ),
  );
  assert.deepEqual(
    models.map((m) => m.id),
    ['available:free'],
  );
});
void test('OpenRouter MOCK: unavailable model/rate limit rejected clearly', async () => {
  await assert.rejects(
    () =>
      requestJson(
        'https://example.com',
        { method: 'POST' },
        fetcher(() => response({}, 404)),
      ),
    (e) => e instanceof ApiError && e.code === 'model',
  );
  await assert.rejects(
    () =>
      requestJson(
        'https://example.com',
        { method: 'POST' },
        fetcher(() => response({}, 429)),
      ),
    (e) => e instanceof ApiError && e.code === 'service',
  );
});
void test('AI: prompt contains only user editorial input, not API metadata', () => {
  const prompt = opinionPrompt(input.topic, 'A hands-on concept', 'Try it');
  assert(!prompt.includes(video.title));
  assert(!prompt.includes(video.description));
  assert(!prompt.includes(video.thumbnail));
  assert(prompt.includes('insufficient evidence'));
});
void test('Analysis: ideas are cautious hypotheses, not performance scores', () => {
  const report: Report = {
    id: 'mockreport',
    input,
    videos: [video],
    queries: relatedQueries(input.topic),
    warnings: [],
    createdAt: now,
    analyzed: false,
  };
  const ideas = buildIdeas(report);
  assert.equal(ideas.length, 3);
  assert(ideas.every((i) => i.assessment === 'Uncertain'));
  assert(!JSON.stringify(ideas).includes(video.title));
  assert(!JSON.stringify(ideas).includes('score'));
});
