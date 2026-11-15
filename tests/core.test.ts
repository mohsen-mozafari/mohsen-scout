import { test } from 'node:test';
import { scheduleChecks } from './schedule.cases';
for (const [name, run] of scheduleChecks) void test(name, run);
import assert from 'node:assert/strict';
import { exportBackup, importBackup, personalLinks, restorePersonalData } from '../lib/backup';
import { moveNoteBlock } from '../lib/utils';
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
  searchYouTubeSample,
  requestJson,
  retryDelayMs,
  getFreeModels,
  opinionPrompt,
  translateNewsToPersian,
  testYouTube,
  type Fetcher,
} from '../lib/api';
import { buildIdeas, buildInternalResearch, createManualIdea } from '../lib/engine';
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
void test('Migration: older saved preferences receive safe Space defaults', () => {
  const current = defaults();
  const legacy = { ...current, preferences: {
    name: 'Mohsen', email: '', region: 'United States' as const, languages: ['en'],
    budget: 1500, model: '', schedule: 'Manual' as const, paused: false,
  } };
  const migrated = validateLocal(legacy);
  assert.deepEqual(migrated.preferences.spaceNewsSources, ['nasa', 'jpl', 'esa-space', 'esa-science']);
  assert.equal(migrated.preferences.spaceInterestLanguage, 'en');
  assert.equal(migrated.preferences.selectedSpaceNiche, 'all');
  assert.equal(migrated.preferences.customSpaceNiche, '');
  assert.equal(migrated.preferences.defaultResearchDays, 30);
});
void test('YouTube trend sample uses official search and video statistics endpoints with bounded quota', async () => {
  let charges = 0;
  let searchCalls = 0;
  let statisticsCalls = 0;
  const result = await searchYouTubeSample('Mars discoveries', {
    key: 'MOCK_SPACE_KEY',
    charge: async (units) => { charges += units; },
    fetcher: async (url) => {
      const parsed = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
      assert.equal(parsed.hostname, 'www.googleapis.com');
      if (parsed.pathname.endsWith('/search')) {
        searchCalls++;
        assert.equal(parsed.searchParams.get('order'), 'viewCount');
        assert.equal(parsed.searchParams.has('videoCategoryId'), false);
        return response({ nextPageToken: 'MOCK_NEXT_PAGE', items: [{
          id: { videoId: 'dQw4w9WgXcQ' },
          snippet: {
            title: 'MOCK: Mars science video',
            description: 'MOCK description',
            channelTitle: 'MOCK astronomy channel',
            channelId: 'UCmockchannel',
            publishedAt: '2026-11-01T12:00:00Z',
            thumbnails: { high: { url: 'https://example.com/high.jpg' } },
          },
        }] });
      }
      if (parsed.pathname.endsWith('/videos')) {
        statisticsCalls++;
        assert.equal(parsed.searchParams.get('part'), 'statistics');
        return response({ items: [{ id: 'dQw4w9WgXcQ', statistics: { viewCount: '125000', likeCount: '2500' } }] });
      }
      if (parsed.pathname.endsWith('/channels')) {
        assert.equal(parsed.searchParams.get('part'), 'statistics');
        return response({ items: [{ id: 'UCmockchannel', statistics: { subscriberCount: '500000', videoCount: '200' } }] });
      }
      throw new Error('Unexpected mocked YouTube endpoint: ' + parsed.pathname);
    },
  }, 12);
  assert.equal(searchCalls, 1);
  assert.equal(statisticsCalls, 1);
  assert.equal(charges, 102);
  assert.equal(result.videos[0].viewCount, 125000);
  assert.equal(result.videos[0].likeCount, 2500);
  assert.equal(result.videos[0].thumbnailUrl, 'https://example.com/high.jpg');
  assert.equal(result.videos[0].channelSubscriberCount, 500000);
  assert.equal(result.videos[0].channelVideoCount, 200);
  assert.equal(result.nextPageToken, 'MOCK_NEXT_PAGE');
  assert.equal(result.videos[0].url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});

void test('YouTube sample forwards the supplied next-page token and returns the next token', async () => {
  let seenToken = '';
  const result = await searchYouTubeSample('JWST exoplanets', {
    key: 'MOCK_PAGE_TOKEN',
    charge: async () => {},
    fetcher: async (url) => {
      const parsed = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
      if (parsed.pathname.endsWith('/search')) {
        seenToken = parsed.searchParams.get('pageToken') ?? '';
        return response({ nextPageToken: 'next-page-token', items: [{
          id: { videoId: 'dQw4w9WgXcQ' },
          snippet: {
            title: 'MOCK: Webb exoplanet observations',
            description: 'MOCK description',
            channelTitle: 'MOCK space channel',
            channelId: 'UCmockchannel',
            publishedAt: '2026-11-01T12:00:00Z',
            thumbnails: { high: { url: 'https://example.com/high.jpg' } },
          },
        }] });
      }
      if (parsed.pathname.endsWith('/videos')) return response({ items: [{ id: 'dQw4w9WgXcQ', statistics: { viewCount: '3000', likeCount: '80' } }] });
      if (parsed.pathname.endsWith('/channels')) return response({ items: [{ id: 'UCmockchannel', statistics: { subscriberCount: '1000', videoCount: '20' } }] });
      throw new Error('Unexpected endpoint: ' + parsed.pathname);
    },
  }, 25, { pageToken: 'existing-page-token' });
  assert.equal(seenToken, 'existing-page-token');
  assert.equal(result.nextPageToken, 'next-page-token');
});

void test('Backup compatibility: version-1 backups without Space preferences still import', () => {
  const backup: unknown = JSON.parse(exportBackup(defaults()));
  assert.ok(backup && typeof backup === 'object' && 'personal' in backup);
  const personal = backup.personal;
  assert.ok(personal && typeof personal === 'object' && 'preferences' in personal);
  const preferences = personal.preferences;
  assert.ok(preferences && typeof preferences === 'object' && !Array.isArray(preferences));
  Reflect.deleteProperty(preferences, 'spaceNewsSources');
  Reflect.deleteProperty(preferences, 'spaceInterestLanguage');
  Reflect.deleteProperty(preferences, 'selectedSpaceNiche');
  Reflect.deleteProperty(preferences, 'customSpaceNiche');
  Reflect.deleteProperty(preferences, 'defaultResearchDays');
  const restored = importBackup(JSON.stringify(backup));
  assert.deepEqual(restored.preferences.spaceNewsSources, ['nasa', 'jpl', 'esa-space', 'esa-science']);
  assert.equal(restored.preferences.spaceInterestLanguage, 'en');
  assert.equal(restored.preferences.selectedSpaceNiche, 'all');
  assert.equal(restored.preferences.customSpaceNiche, '');
  assert.equal(restored.preferences.defaultResearchDays, 30);
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
  d.preferences.customSpaceNiche = 'JWST, NIRSpec';
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
  assert.equal(imported.preferences.customSpaceNiche, 'JWST, NIRSpec');
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
void test('YouTube MOCK: official endpoint, independent region/language filters, deduplication and raw counts', async () => {
  const urls: string[] = [];
  let units = 0;
  const result = await searchYouTube(input, {
    key: 'MOCK_NOT_REAL',
    charge: async (cost) => { units += cost; },
    fetcher: fetcher((url) => {
      urls.push(url);
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/videos'))
        return response({ items: [{ id: 'dQw4w9WgXcQ', statistics: { viewCount: '1234', likeCount: '56' } }] });
      return response({ items: [mockItem('dQw4w9WgXcQ'), mockItem('dQw4w9WgXcQ')] });
    }),
  });
  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].title, video.title);
  assert.equal(result.videos[0].viewCount, 1234);
  assert.equal(result.videos[0].likeCount, 56);
  assert.equal(units, 501);
  const searchUrls = urls.filter((url) => new URL(url).pathname.endsWith('/search'));
  assert.ok(searchUrls.length > 0);
  for (const url of searchUrls) {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'www.googleapis.com');
    assert.equal(parsed.searchParams.get('regionCode'), 'IR');
    assert.equal(parsed.searchParams.get('relevanceLanguage'), 'en');
    assert.equal(parsed.searchParams.get('videoDuration'), 'short');
    assert.equal(parsed.searchParams.get('videoCategoryId'), '27');
    assert.equal(parsed.searchParams.get('part'), 'snippet');
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
  assert.equal(calls, 11);
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
void test('Manual Ideas: reject untitled and empty concepts before they reach storage', () => {
  assert.throws(() => createManualIdea('', 'A useful explanation', '', 'Germany', ['en']));
  assert.throws(() => createManualIdea('Untitled idea', 'A useful explanation', '', 'Germany', ['en']));
  assert.throws(() => createManualIdea('James Webb observations', '', '', 'Germany', ['en']));
  const idea = createManualIdea(
    'James Webb observations',
    'Explain one verified observation and its uncertainty.',
    'Check the paper first.',
    'Germany',
    ['en'],
  );
  assert.equal(idea.topic, 'James Webb observations');
  assert.ok(idea.concept.length > 10);
  assert.equal(idea.decision, 'Check the paper first.');
  assert.equal(idea.status, 'New Discoveries');
});

void test('News translation sends only the selected RSS title and summary on explicit request and caches it', async () => {
  let calls = 0;
  let requestBody: unknown;
  let authorization = '';
  const translationFetcher: Fetcher = async (url, init) => {
    calls++;
    assert.equal(typeof url === 'string' ? new URL(url).hostname : '', 'openrouter.ai');
    assert.equal(init?.method, 'POST');
    const headers = new Headers(init?.headers);
    authorization = headers.get('Authorization') ?? '';
    const bodyText = typeof init?.body === 'string' ? init.body : '';
    requestBody = JSON.parse(bodyText);
    return response({ choices: [{ message: { content: JSON.stringify({
      title: 'کشف تازه تلسکوپ وب',
      summary: 'این رصد تازه، شواهدی مقدماتی درباره جو سیاره ارائه می‌کند.',
    }) } }] });
  };
  const translated = await translateNewsToPersian(
    'MOCK_TRANSLATION_KEY',
    'mock/free-model',
    'New Webb observation',
    'The observation provides preliminary evidence about an exoplanet atmosphere.',
    translationFetcher,
  );
  assert.equal(translated.title, 'کشف تازه تلسکوپ وب');
  assert.match(translated.summary, /شواهدی مقدماتی/);
  assert.equal(authorization, 'Bearer MOCK_TRANSLATION_KEY');
  const serialized = JSON.stringify(requestBody);
  assert(serialized.includes('New Webb observation'));
  assert(serialized.includes('preliminary evidence'));
  assert(!serialized.includes('MOCK API description'));
  assert(!serialized.includes('thumbnail'));
  await translateNewsToPersian(
    'MOCK_TRANSLATION_KEY',
    'mock/free-model',
    'New Webb observation',
    'The observation provides preliminary evidence about an exoplanet atmosphere.',
    translationFetcher,
  );
  assert.equal(calls, 1);
});

void test('AI: prompt contains only user editorial input, not API metadata', () => {
  const prompt = opinionPrompt(input.topic, 'A hands-on concept', 'Try it');
  assert(!prompt.includes(video.title));
  assert(!prompt.includes(video.description));
  assert(!prompt.includes(video.thumbnail));
  assert(prompt.includes('insufficient evidence'));
  assert.throws(() => opinionPrompt('Untitled idea', '', ''));
  assert.throws(() => opinionPrompt('James Webb', '', 'Decision only'));
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
  assert.equal(ideas.length, 4);
  assert.equal(ideas[0].assessment, 'Worth Exploring');
  assert.deepEqual(ideas[0].videoIds, [video.id]);
  assert.equal(ideas[0].imageUrl, video.thumbnail);
  assert.equal(ideas[1].assessment, 'Uncertain');
  assert(!JSON.stringify(ideas).includes(video.title));
  assert(!JSON.stringify(ideas).includes(video.description));
  assert(!JSON.stringify(ideas).includes('score'));
});

const regressionReport: Report = {
  id: 'retention-report',
  input,
  videos: [video],
  queries: relatedQueries(input.topic),
  warnings: [],
  createdAt: now,
  analyzed: false,
};
const regressionIdea = buildIdeas(regressionReport)[0];
const regressionLink = {
  id: video.id,
  url: `https://www.youtube.com/watch?v=${video.id}`,
  manualTitle: 'Personal label',
  topic: input.topic,
  note: 'My note',
  folder: '',
  tags: [],
  savedAt: now,
};
void test('Retention: expired reports lose references but personal bookmarked URLs remain', () => {
  const data = defaults();
  data.links = [regressionLink];
  data.videos = [{ ...video, fetchedAt: now - RETENTION_MS }];
  data.reports = [{ ...regressionReport, createdAt: now - RETENTION_MS }];
  data.ideas = [{ ...regressionIdea, videoIds: [video.id, 'unsaved'] }];
  const clean = purgeExpired(data, now);
  assert.equal(clean.ideas[0].reportId, undefined);
  assert.deepEqual(clean.ideas[0].videoIds, [video.id]);
  assert.equal(clean.ideas[0].concept, regressionIdea.concept);
});
void test('Retention: metadata clearing removes automated report and video references', () => {
  const data = defaults();
  data.ideas = [{ ...regressionIdea, videoIds: [video.id] }];
  const clean = purgeExpired(data, now);
  assert.equal(clean.ideas[0].reportId, undefined);
  assert.deepEqual(clean.ideas[0].videoIds, []);
});
void test('Retention: nested video metadata expires independently of a current report', () => {
  const data = defaults();
  data.reports = [{ ...regressionReport, videos: [{ ...video, fetchedAt: now - RETENTION_MS }] }];
  assert.deepEqual(purgeExpired(data, now).reports[0].videos, []);
});
void test('Restore: replaces personal data without resetting research/quota, disables scheduling', () => {
  const current = defaults();
  current.videos = [video];
  current.reports = [regressionReport];
  current.budget = { date: quotaDay(), units: 900, requests: 9, exhausted: true };
  current.preferences.schedule = 'Daily';
  current.preferences.lastInput = input;
  const restored = defaults();
  restored.preferences.name = 'Restored owner';
  const result = restorePersonalData(current, restored);
  assert.equal(result.videos, current.videos);
  assert.equal(result.reports, current.reports);
  assert.equal(result.budget, current.budget);
  assert.equal(result.preferences.name, 'Restored owner');
  assert.equal(result.preferences.schedule, 'Manual');
  assert.equal(result.preferences.lastInput, undefined);
});
void test('Restore: matching ID cannot attach an old AI opinion to different editorial content', () => {
  const current = defaults();
  current.ideas = [regressionIdea];
  current.opinions = [
    { id: 'op', ideaId: regressionIdea.id, text: 'MOCK opinion', model: 'MOCK', createdAt: now },
  ];
  const restored = defaults();
  restored.ideas = [{ ...regressionIdea }];
  assert.equal(restorePersonalData(current, restored).opinions.length, 1);
  restored.ideas = [{ ...regressionIdea, decision: 'Changed decision' }];
  assert.equal(restorePersonalData(current, restored).opinions.length, 0);
  restored.ideas = [];
  assert.equal(restorePersonalData(current, restored).opinions.length, 0);
});
void test('Import: only personal saved-video references may enter a backup', () => {
  const data = defaults();
  data.links = [regressionLink];
  data.ideas = [regressionIdea];
  const raw = JSON.parse(exportBackup(data));
  raw.personal.ideas[0].videoIds = [video.id, 'unsaved'];
  assert.deepEqual(importBackup(JSON.stringify(raw)).ideas[0].videoIds, [video.id]);
});
void test('Notes: ordering is immutable and keeps checklist content and boundaries', () => {
  const blocks = [
    { id: 'a', type: 'paragraph' as const, text: 'Keep me' },
    { id: 'b', type: 'checklist' as const, text: 'Done', checked: true },
  ];
  assert.equal(moveNoteBlock(blocks, 'b', -1)[0].checked, true);
  assert.equal(blocks[0].id, 'a');
  assert.equal(moveNoteBlock(blocks, 'a', -1), blocks);
  assert.equal(moveNoteBlock(blocks, 'b', 1), blocks);
});
void test('HTTP: Retry-After seconds/dates are respected and long waits stop retries', () => {
  const date = Date.parse('2026-11-15T12:00:00Z');
  assert.equal(retryDelayMs('2', 500, date), 2000);
  assert.equal(retryDelayMs(new Date(date + 5000).toUTCString(), 500, date), 5000);
  assert.equal(retryDelayMs('invalid', 500, date), 500);
  assert.equal(retryDelayMs('60', 500, date), null);
});
void test('HTTP MOCK: non-JSON transient failures use bounded retries', async () => {
  let calls = 0;
  const result = await requestJson(
    'https://example.com',
    {},
    async () => {
      calls++;
      return calls === 1
        ? new Response('MOCK unavailable', { status: 503 })
        : response({ ok: true });
    },
    undefined,
    15000,
    1,
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});
void test('HTTP MOCK: long Retry-After stops requests instead of retrying before allowed', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      requestJson(
        'https://example.com',
        {},
        async () => {
          calls++;
          return new Response('MOCK rate limit', { status: 429, headers: { 'Retry-After': '60' } });
        },
        undefined,
        15000,
        1,
      ),
    (error) => error instanceof ApiError && error.code === 'service',
  );
  assert.equal(calls, 1);
});

void test('YouTube trend sample applies All Time, publication order, region and language filters', async () => {
  let searchSeen = false;
  await searchYouTubeSample('Mars discoveries', {
    key: 'MOCK_FILTERS',
    charge: async () => {},
    fetcher: async (url) => {
      const parsed = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
      if (parsed.pathname.endsWith('/search')) {
        searchSeen = true;
        assert.equal(parsed.searchParams.get('order'), 'date');
        assert.equal(parsed.searchParams.get('regionCode'), 'DE');
        assert.equal(parsed.searchParams.get('relevanceLanguage'), 'de');
        assert.equal(parsed.searchParams.has('publishedAfter'), false);
        return response({ items: [{
          id: { videoId: 'dQw4w9WgXcQ' },
          snippet: {
            title: 'MOCK newest Mars video',
            description: 'MOCK description',
            channelTitle: 'MOCK channel',
            channelId: 'UCmockchannel',
            publishedAt: '2026-11-14T12:00:00Z',
            thumbnails: { medium: { url: 'https://example.com/thumb.jpg' } },
          },
        }] });
      }
      if (parsed.pathname.endsWith('/videos'))
        return response({ items: [{ id: 'dQw4w9WgXcQ', statistics: { viewCount: '100', likeCount: '9' } }] });
      if (parsed.pathname.endsWith('/channels'))
        return response({ items: [{ id: 'UCmockchannel', statistics: { subscriberCount: '20', videoCount: '4' } }] });
      throw new Error('Unexpected endpoint ' + parsed.pathname);
    },
  }, 12, { days: 0, order: 'date', region: 'Germany', language: 'de' });
  assert.equal(searchSeen, true);
});

void test('OpenRouter news translation parses and caches a Persian title and summary', async () => {
  let calls = 0;
  const translated = await translateNewsToPersian(
    'MOCK_TRANSLATION_KEY',
    'mock:free',
    'New exoplanet observed',
    'Scientists reported a new atmosphere measurement.',
    fetcher(() => {
      calls++;
      return response({ choices: [{ message: { content: JSON.stringify({
        title: 'سیاره فراخورشیدی جدید رصد شد',
        summary: 'دانشمندان اندازه‌گیری تازه‌ای از جو گزارش کردند.',
      }) } }] });
    }),
  );
  assert.match(translated.title, /سیاره/);
  assert.match(translated.summary, /دانشمندان/);
  await translateNewsToPersian(
    'MOCK_TRANSLATION_KEY',
    'mock:free',
    'New exoplanet observed',
    'Scientists reported a new atmosphere measurement.',
    fetcher(() => { calls++; return response({ choices: [] }); }),
  );
  assert.equal(calls, 1);
});

void test('Internal research engine joins publisher, Wikimedia and YouTube evidence without a composite score', () => {
  const result = buildInternalResearch({
    topic: 'Exoplanet atmospheres',
    news: [
      {
        title: 'New atmosphere observation',
        summary: 'A source-reported observation for testing.',
        sourceName: 'NASA',
        sourceUrl: 'https://www.nasa.gov/mock-report',
        sourceId: 'nasa',
        publishedAt: '2026-11-14T12:00:00.000Z',
      },
      {
        title: 'New atmosphere observation',
        summary: 'A matching report from another selected feed.',
        sourceName: 'NASA JPL',
        sourceUrl: 'https://www.jpl.nasa.gov/mock-report',
        sourceId: 'jpl',
        publishedAt: '2026-11-14T13:00:00.000Z',
      },
    ],
    wiki: {
      articleTitle: 'Exoplanet',
      language: 'en',
      monthlyViews: [{ month: '2026-10', views: 1250 }],
    },
    videos: [{
      id: 'dQw4w9WgXcQ',
      title: 'MOCK video evidence',
      channel: 'MOCK science channel',
      publishedAt: '2026-11-13T12:00:00.000Z',
      viewCount: 1000,
      likeCount: 50,
    }],
  });
  assert.equal(result.angles.length, 3);
  assert.ok(result.evidence.some((item) => item.id === 'publisher-news' && item.detail.includes('2 selected feed source(s)')));
  assert.ok(result.evidence.some((item) => item.id === 'wikimedia' && item.detail.includes('not search volume')));
  assert.ok(result.evidence.some((item) => item.id === 'youtube-sample' && item.detail.includes('1 returned video example')));
  assert.equal(result.verificationQuestions.length, 4);
  assert(!JSON.stringify(result).toLowerCase().includes('viral score'));
});

void test('Internal research engine without source evidence marks output as exploratory', () => {
  const result = buildInternalResearch({ topic: 'Black holes' });
  assert.match(result.summary, /no source evidence/i);
  assert.ok(result.limitations.some((item) => item.includes('starting questions only')));
  assert.ok(result.evidence.every((item) => !item.sourceUrl));
});
