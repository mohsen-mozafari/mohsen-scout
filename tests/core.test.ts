// Regression fixtures keep historical and unmatched evidence visible without treating it as current support.
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
  type Budget,
} from '../lib/types';
import { validateLocal } from '../lib/validation';
import {
  ApiError,
  localDateKey,
  nextBudget,
  nextOpenRouterUsage,
  reserveYoutubeRefreshCycle,
  quotaDay,
  relatedQueries,
  searchYouTube,
  searchYouTubeSample,
  requestJson,
  retryDelayMs,
  getFreeModels,
  getOpenRouterDailyQuota,
  opinionPrompt,
  translateNewsToPersian,
  testYouTube,
  type Fetcher,
} from '../lib/api';
import { buildIdeas, buildInternalResearch, createManualIdea, rankNewsForTopic, topicRelevanceScore } from '../lib/engine';
import { scoreEditorialOpportunity, sortResearchVideos } from '../lib/intelligence';
import { captureYouTubeSnapshots } from '../lib/youtube-growth';
import { EDITORIAL_PRIORITY_CONFIG, getEditorialPriorityBand } from '../lib/editorial-priority';
import { rankDashboardIdeas } from '../lib/dashboard';
import { translateText } from '../lib/i18n';
import { getTopicDossier, rememberTopicDossier, TOPIC_DOSSIER_TTL_MS } from '../lib/topic-dossier';
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
  publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
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
  assert.deepEqual(migrated.preferences.spaceNewsSources, ['nasa', 'jpl', 'cneos', 'esa-space', 'esa-science', 'space-com', 'phys-space', 'universe-today', 'sky-telescope']);
  assert.equal(migrated.preferences.spaceInterestLanguage, 'en');
  assert.equal(migrated.preferences.selectedSpaceNiche, 'all');
  assert.equal(migrated.preferences.customSpaceNiche, '');
  assert.equal(migrated.preferences.defaultResearchDays, 30);
  assert.equal(migrated.preferences.uiLanguage, 'fa');
  const legacyWithoutResearchMemory = Object.fromEntries(
    Object.entries(current).filter(([key]) => key !== 'researchMemory' && key !== 'feedRegistry'),
  );
  assert.deepEqual(validateLocal(legacyWithoutResearchMemory).researchMemory, []);
  assert.deepEqual(validateLocal(legacyWithoutResearchMemory).feedRegistry, []);
});
void test('OpenRouter usage: stable local ISO date keys pass persisted-data validation', () => {
  const day = localDateKey(new Date(2026, 10, 17, 12, 34, 56));
  assert.equal(day, '2026-11-17');
  const usage = nextOpenRouterUsage(undefined, undefined, day);
  const current = defaults();
  const saved = validateLocal({
    ...current,
    preferences: { ...current.preferences, ...usage },
  });
  assert.equal(saved.preferences.openRouterUsageDay, day);
  assert.equal(saved.preferences.openRouterRequestsToday, 1);
  assert.throws(() => validateLocal({
    ...current,
    preferences: {
      ...current.preferences,
      openRouterUsageDay: '11/17/2026',
      openRouterRequestsToday: 1,
    },
  }));
});

void test('OpenRouter usage follows the live free-model daily quota', () => {
  assert.deepEqual(
    nextOpenRouterUsage(undefined, undefined, '2026-11-17', 50, 49),
    { openRouterUsageDay: '2026-11-17', openRouterRequestsToday: 50 },
  );
  assert.deepEqual(
    nextOpenRouterUsage('2026-11-17', 40, '2026-11-17', 50, 3),
    { openRouterUsageDay: '2026-11-17', openRouterRequestsToday: 4 },
  );
  assert.deepEqual(
    nextOpenRouterUsage('2026-11-17', 9999, '2026-11-18'),
    { openRouterUsageDay: '2026-11-18', openRouterRequestsToday: 1 },
  );
  assert.throws(() => nextOpenRouterUsage('2026-11-17', 50, '2026-11-17', 50, 50));
});

void test('OpenRouter daily quota reads the official account-key endpoint', async () => {
  let endpoint = '';
  let authorization = '';
  const quota = await getOpenRouterDailyQuota('MOCK_OPENROUTER_KEY', async (url, init) => {
    endpoint = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    authorization = new Headers(init?.headers).get('Authorization') ?? '';
    return response({ data: { free_model_daily_requests: { used: 17, limit: 50, remaining: 33 } } });
  });
  assert.equal(endpoint, 'https://openrouter.ai/api/v1/key');
  assert.equal(authorization, 'Bearer MOCK_OPENROUTER_KEY');
  assert.deepEqual(quota, { used: 17, limit: 50, remaining: 33 });
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
  assert.equal(charges, 3);
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

void test('YouTube likes sample merges relevance and view-count pools and uses actual public counts', async () => {
  let charges = 0;
  const orders: string[] = [];
  const result = await searchYouTubeSample('Mars discoveries', {
    key: 'MOCK_LIKES_KEY',
    charge: async (units) => { charges += units; },
    fetcher: async (url) => {
      const parsed = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
      if (parsed.pathname.endsWith('/search')) {
        const order = parsed.searchParams.get('order') ?? '';
        orders.push(order);
        assert.equal(parsed.searchParams.get('maxResults'), '25');
        const ids = order === 'relevance'
          ? ['dQw4w9WgXcQ', 'M7lc1UVf-VE']
          : ['M7lc1UVf-VE', 'VYOjWnS4cMY'];
        return response({
          nextPageToken: order === 'relevance' ? 'rel-next' : 'views-next',
          items: ids.map((id) => ({
            id: { videoId: id },
            snippet: {
              title: 'MOCK: ' + id,
              description: 'MOCK description',
              channelTitle: 'MOCK channel',
              channelId: 'UCmockchannel',
              publishedAt: '2026-11-10T12:00:00Z',
              thumbnails: { high: { url: 'https://example.com/' + id + '.jpg' } },
            },
          })),
        });
      }
      if (parsed.pathname.endsWith('/videos')) {
        const id = parsed.searchParams.get('id') ?? '';
        assert.equal(id.split(',').length, 3);
        return response({ items: [
          { id: 'dQw4w9WgXcQ', statistics: { viewCount: '1000', likeCount: '25' } },
          { id: 'M7lc1UVf-VE', statistics: { viewCount: '2000', likeCount: '90' } },
          { id: 'VYOjWnS4cMY', statistics: { viewCount: '3000', likeCount: '60' } },
        ] });
      }
      if (parsed.pathname.endsWith('/channels')) return response({ items: [{ id: 'UCmockchannel', statistics: { subscriberCount: '5000', videoCount: '80' } }] });
      throw new Error('Unexpected endpoint: ' + parsed.pathname);
    },
  }, 50, { order: 'relevance', days: 0 });
  assert.deepEqual(orders, ['relevance', 'viewCount']);
  assert.equal(result.videos.length, 3);
  assert.equal(result.videos.find((item) => item.id === 'M7lc1UVf-VE')?.likeCount, 90);
  assert.equal(result.videos.find((item) => item.id === 'VYOjWnS4cMY')?.viewCount, 3000);
  assert.equal(charges, 4);
  assert.match(result.nextPageToken ?? '', /^mohsen-scout-likes-v1:/);
  assert.match(result.warning, /not a global like-count ranking/i);
});

void test('YouTube likes cursor advances both discovery pools independently', async () => {
  let searchNumber = 0;
  const seen: { order: string; token: string }[] = [];
  const mockVideo = (id: string) => ({
    id: { videoId: id },
    snippet: {
      title: 'MOCK cursor video',
      description: '',
      channelTitle: 'MOCK channel',
      channelId: 'UCmockchannel',
      publishedAt: '2026-11-10T12:00:00Z',
      thumbnails: {},
    },
  });
  const options = {
    key: 'MOCK_CURSOR_KEY',
    charge: async () => {},
    fetcher: async (url: string | URL | Request) => {
      const parsed = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
      if (parsed.pathname.endsWith('/search')) {
        searchNumber++;
        const order = parsed.searchParams.get('order') ?? '';
        const token = parsed.searchParams.get('pageToken') ?? '';
        seen.push({ order, token });
        if (searchNumber === 1) return response({ nextPageToken: 'rel-next', items: [mockVideo('dQw4w9WgXcQ')] });
        if (searchNumber === 2) return response({ nextPageToken: 'views-next', items: [mockVideo('M7lc1UVf-VE')] });
        if (searchNumber === 3) {
          assert.equal(token, 'rel-next');
          return response({ items: [mockVideo('VYOjWnS4cMY')] });
        }
        assert.equal(token, 'views-next');
        return response({ nextPageToken: 'views-next-2', items: [mockVideo('3JZ_D3ELwOQ')] });
      }
      if (parsed.pathname.endsWith('/videos')) return response({ items: [] });
      if (parsed.pathname.endsWith('/channels')) return response({ items: [] });
      throw new Error('Unexpected endpoint: ' + parsed.pathname);
    },
  };
  const first = await searchYouTubeSample('JWST', options, 20, { order: 'relevance', days: 0 });
  assert.ok(first.nextPageToken);
  const second = await searchYouTubeSample('JWST', options, 20, { order: 'relevance', days: 0, pageToken: first.nextPageToken });
  assert.deepEqual(seen, [
    { order: 'relevance', token: '' },
    { order: 'viewCount', token: '' },
    { order: 'relevance', token: 'rel-next' },
    { order: 'viewCount', token: 'views-next' },
  ]);
  assert.ok(second.nextPageToken);
});

void test('YouTube Discovery Mix samples view-count, recent and relevance lanes and interleaves unique results', async () => {
  const orders: string[] = [];
  let charged = 0;
  const makeVideo = (id: string) => ({
    id: { videoId: id },
    snippet: {
      title: 'MOCK discovery video ' + id,
      description: 'MOCK independent test fixture',
      channelTitle: 'MOCK channel',
      channelId: 'UCmockchannel',
      publishedAt: '2026-11-10T12:00:00Z',
      thumbnails: { high: { url: 'https://example.com/' + id + '.jpg' } },
    },
  });
  const result = await searchYouTubeSample('Mars discoveries', {
    key: 'MOCK_DISCOVERY_KEY',
    charge: async (units) => { charged += units; },
    fetcher: async (url) => {
      const parsed = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
      if (parsed.pathname.endsWith('/search')) {
        const order = parsed.searchParams.get('order') ?? '';
        orders.push(order);
        assert.equal(parsed.searchParams.get('maxResults'), '2');
        const ids = order === 'viewCount'
          ? ['dQw4w9WgXcQ', 'M7lc1UVf-VE']
          : order === 'date'
            ? ['VYOjWnS4cMY', 'M7lc1UVf-VE']
            : ['3JZ_D3ELwOQ', 'dQw4w9WgXcQ'];
        return response({
          nextPageToken: order + '-next',
          items: ids.map(makeVideo),
        });
      }
      if (parsed.pathname.endsWith('/videos')) return response({ items: [] });
      if (parsed.pathname.endsWith('/channels')) return response({ items: [] });
      throw new Error('Unexpected endpoint: ' + parsed.pathname);
    },
  }, 6, { order: 'discovery', days: 0 });
  assert.deepEqual(orders, ['viewCount', 'date', 'relevance']);
  assert.deepEqual(result.videos.map((item) => item.id), [
    'dQw4w9WgXcQ', 'VYOjWnS4cMY', '3JZ_D3ELwOQ', 'M7lc1UVf-VE',
  ]);
  assert.equal(charged, 5);
  assert.match(result.nextPageToken ?? '', /^mohsen-scout-discovery-v1:/);
  assert.match(result.warning, /no growth or market score/i);
});

void test('YouTube Discovery Mix advances each official search lane with its own page token', async () => {
  const seen: { order: string; token: string }[] = [];
  const makeVideo = (id: string) => ({
    id: { videoId: id },
    snippet: {
      title: 'MOCK cursor discovery video',
      description: '',
      channelTitle: 'MOCK channel',
      channelId: 'UCmockchannel',
      publishedAt: '2026-11-10T12:00:00Z',
      thumbnails: {},
    },
  });
  const options = {
    key: 'MOCK_DISCOVERY_CURSOR_KEY',
    charge: async () => {},
    fetcher: async (url: string | URL | Request) => {
      const parsed = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
      if (parsed.pathname.endsWith('/search')) {
        const order = parsed.searchParams.get('order') ?? '';
        const token = parsed.searchParams.get('pageToken') ?? '';
        seen.push({ order, token });
        return response({
          nextPageToken: token ? undefined : order + '-next',
          items: [makeVideo(order === 'viewCount' ? 'dQw4w9WgXcQ' : order === 'date' ? 'M7lc1UVf-VE' : 'VYOjWnS4cMY')],
        });
      }
      if (parsed.pathname.endsWith('/videos')) return response({ items: [] });
      if (parsed.pathname.endsWith('/channels')) return response({ items: [] });
      throw new Error('Unexpected endpoint: ' + parsed.pathname);
    },
  };
  const first = await searchYouTubeSample('JWST', options, 9, { order: 'discovery', days: 0 });
  assert.ok(first.nextPageToken);
  await searchYouTubeSample('JWST', options, 9, { order: 'discovery', days: 0, pageToken: first.nextPageToken });
  assert.deepEqual(seen, [
    { order: 'viewCount', token: '' },
    { order: 'date', token: '' },
    { order: 'relevance', token: '' },
    { order: 'viewCount', token: 'viewCount-next' },
    { order: 'date', token: 'date-next' },
    { order: 'relevance', token: 'relevance-next' },
  ]);
});

void test('YouTube likes sample rejects a malformed versioned cursor before making requests', async () => {
  let calls = 0;
  await assert.rejects(
    () => searchYouTubeSample('Mars', {
      key: 'MOCK_BAD_CURSOR',
      charge: async () => {},
      fetcher: async () => { calls++; return response({ items: [] }); },
    }, 10, { order: 'relevance', pageToken: 'mohsen-scout-likes-v1:not%valid' }),
    (error) => error instanceof ApiError && error.code === 'invalid',
  );
  assert.equal(calls, 0);
});

void test('Topic dossier merges local evidence, normalizes topic keys and expires stale samples', () => {
  const dossierNow = Date.now();
  const news = [{
    id: 'nasa:https://example.com/mars',
    sourceId: 'nasa' as const,
    sourceName: 'NASA',
    title: 'MOCK: Mars sample return',
    summary: 'MOCK source evidence',
    url: 'https://example.com/mars',
    publishedAt: '2026-11-10T12:00:00.000Z',
  }];
  const videos = [{
    id: 'dQw4w9WgXcQ',
    title: 'MOCK: Mars observation',
    description: 'MOCK',
    channel: 'MOCK channel',
    channelId: 'UCmockchannel',
    publishedAt: '2026-11-10T12:00:00.000Z',
    thumbnailUrl: 'https://example.com/mock.jpg',
    viewCount: 120,
    likeCount: 8,
    channelSubscriberCount: 500,
    channelVideoCount: 20,
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  }];
  rememberTopicDossier('  Mars   sample return ', { news }, dossierNow);
  rememberTopicDossier('mars sample return', {
    videos,
    videoCriteria: { days: 30, region: 'United States', language: 'en', order: 'viewCount' },
  }, dossierNow + 1000);
  const dossier = getTopicDossier('MARS SAMPLE RETURN', dossierNow + 2000);
  assert.equal(dossier?.news.length, 1);
  assert.equal(dossier?.videos[0].id, 'dQw4w9WgXcQ');
  assert.equal(dossier?.videoCriteria?.order, 'viewCount');
  assert.ok(dossier?.internalAnalysis);
  assert.equal(getTopicDossier('mars sample return', dossierNow + TOPIC_DOSSIER_TTL_MS + 2000), undefined);
});

void test('UI language: Persian is the safe default and existing English preferences migrate', () => {
  const current = defaults();
  assert.equal(current.preferences.uiLanguage, 'fa');
  const raw = JSON.parse(JSON.stringify(current));
  delete raw.preferences.uiLanguage;
  assert.equal(validateLocal(raw).preferences.uiLanguage, 'fa');
  raw.preferences.uiLanguage = 'en';
  assert.equal(validateLocal(raw).preferences.uiLanguage, 'en');
});

void test('UI language: translate known interface copy but preserve unknown source headlines', () => {
  assert.equal(translateText('Settings', 'fa'), 'تنظیمات');
  assert.equal(translateText('Settings', 'en'), 'Settings');
  assert.equal(translateText('Your reference shelf.', 'fa'), 'قفسه منابع و پیوندهای شما.');
  assert.equal(translateText('A fresh observation of a distant exoplanet', 'fa'), 'A fresh observation of a distant exoplanet');
});

void test('Backup compatibility: version-1 backups without Space preferences still import', () => {
  const backup: unknown = JSON.parse(exportBackup(defaults()));
  assert.ok(backup && typeof backup === 'object' && 'personal' in backup);
  const personal = backup.personal;
  assert.ok(personal && typeof personal === 'object' && 'preferences' in personal);
  const preferences = personal.preferences;
  assert.ok(preferences && typeof preferences === 'object' && !Array.isArray(preferences));
  Reflect.deleteProperty(preferences, 'spaceNewsSources');
  Reflect.deleteProperty(preferences, 'spaceNewsSourcesVersion');
  Reflect.deleteProperty(preferences, 'spaceInterestLanguage');
  Reflect.deleteProperty(preferences, 'selectedSpaceNiche');
  Reflect.deleteProperty(preferences, 'customSpaceNiche');
  Reflect.deleteProperty(preferences, 'defaultResearchDays');
  const restored = importBackup(JSON.stringify(backup));
  assert.deepEqual(restored.preferences.spaceNewsSources, ['nasa', 'jpl', 'cneos', 'esa-space', 'esa-science', 'space-com', 'phys-space', 'universe-today', 'sky-telescope']);
  assert.equal(restored.preferences.spaceInterestLanguage, 'en');
  assert.equal(restored.preferences.selectedSpaceNiche, 'all');
  assert.equal(restored.preferences.customSpaceNiche, '');
  assert.equal(restored.preferences.defaultResearchDays, 30);
});
void test('Foundation: defaults belong to Mohsen and have no secrets', () => {
  const d = defaults();
  assert.equal(d.preferences.name, 'Mohsen');
  assert.equal(d.preferences.schedule, 'Daily');
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
  d.preferences.hybridIntelligence = false;
  d.researchMemory = [{
    topic: 'Exoplanet atmospheres',
    updatedAt: now,
    sources: [{
      sourceId: 'nasa',
      sourceName: 'NASA',
      title: 'Exoplanet atmosphere observed at 40 km',
      sourceUrl: 'https://www.nasa.gov/mock-memory',
      publishedAt: '2026-11-15T10:00:00.000Z',
    }],
    keyFindings: ['A saved source finding.'],
    unresolvedQuestions: ['Which method was used?'],
    contradictions: [],
    confidence: 'moderate',
  }];
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
  assert.equal(imported.preferences.hybridIntelligence, false);
  assert.equal(imported.researchMemory.length, 1);
  assert.equal(imported.researchMemory[0].sources[0].title, 'Exoplanet atmosphere observed at 40 km');
  d.researchActivity = [{ id: 'unbacked', engine: 'YouTube Data API', query: 'sample', topic: 'topic', niche: 'niche', startedAt: now, status: 'success', resultCount: 1, analyzedCount: 0, results: [], warnings: [], reportId: 'temporary-report' }];
  assert.equal(importBackup(exportBackup(d)).researchActivity[0].reportId, undefined);
  assert.deepEqual(imported.preferences.spaceNewsSources, defaults().preferences.spaceNewsSources);
  assert.equal(imported.preferences.spaceNewsSourcesVersion, 2);
});
void test('Backup preserves bounded research activity without exporting raw YouTube video metadata', () => {
  const data = defaults();
  data.videos = [{
    id: 'raw-video-1',
    title: 'RAW YOUTUBE VIDEO TITLE MUST NOT BE EXPORTED',
    description: 'Temporary YouTube API metadata',
    channel: 'Temporary channel',
    thumbnail: 'https://img.example/raw-thumbnail.jpg',
    publishedAt: new Date(1000).toISOString(),
    fetchedAt: 1000,
    query: 'exact temporary query',
    viewCount: 12345,
    likeCount: 678,
  }];
  data.researchActivity = [{
    id: 'activity-1',
    engine: 'YouTube Data API',
    query: 'latest space telescope discoveries · recent · en',
    topic: 'space telescope discoveries',
    niche: 'astronomy',
    startedAt: 1000,
    completedAt: 2000,
    durationMs: 1000,
    status: 'success',
    resultCount: 24,
    analyzedCount: 0,
    results: [],
    warnings: [],
    reportId: 'report-1',
  }];
  const raw = exportBackup(data);
  assert(!raw.includes('RAW YOUTUBE VIDEO TITLE MUST NOT BE EXPORTED'));
  const restored = importBackup(raw);
  assert.equal(restored.researchActivity[0].query, data.researchActivity[0].query);
  assert.equal(restored.researchActivity[0].reportId, undefined);
  assert.equal(restored.videos.length, 0);

  const legacy = JSON.parse(raw);
  delete legacy.personal.researchActivity;
  assert.deepEqual(importBackup(JSON.stringify(legacy)).researchActivity, []);
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
void test('Quota: resets on Pacific day and keeps Search independent from non-search quota', () => {
  const date = quotaDay();
  const current = { date, units: 100, requests: 1, exhausted: false, otherManualUnits: 100 };
  assert.equal(nextBudget(current, 500, 100).units, 200);
  assert.throws(() => nextBudget(current, 150, 100), ApiError);
  assert.throws(() => nextBudget({ ...current, otherExhausted: true }, 500, 1), ApiError);
  const searchStillWorks = nextBudget({ ...current, otherExhausted: true }, 500, 1, new Date(), 'search');
  assert.equal(searchStillWorks.searchManualRequests, 1);
  assert.equal(nextBudget({ ...current, date: 'old', otherExhausted: true }, 500, 100).units, 100);
});
void test('Research: creates explicit related queries without inventing stats', () => {
  const queries = relatedQueries(input.topic);
  assert.deepEqual(queries, [input.topic, input.topic + ' explained', 'YouTube popularity order', 'YouTube recent results']);
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
  assert.equal(units, 5);
  const searchUrls = urls.filter((url) => new URL(url).pathname.endsWith('/search'));
  assert.equal(searchUrls.length, 4);
  assert.deepEqual(new Set(searchUrls.map((url) => new URL(url).searchParams.get('order'))), new Set(['relevance', 'viewCount', 'date']));
  for (const url of searchUrls) {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'www.googleapis.com');
    assert.equal(parsed.searchParams.get('videoDuration'), 'short');
    assert.equal(parsed.searchParams.get('videoCategoryId'), '27');
    assert.equal(parsed.searchParams.get('maxResults'), '50');
    assert.equal(parsed.searchParams.get('part'), 'snippet');
    if (parsed.searchParams.get('order') === 'viewCount') {
      assert.equal(parsed.searchParams.has('regionCode'), false);
      assert.equal(parsed.searchParams.has('relevanceLanguage'), false);
    } else {
      assert.equal(parsed.searchParams.get('regionCode'), 'IR');
      assert.equal(parsed.searchParams.get('relevanceLanguage'), 'en');
    }
  }
});

void test('YouTube sample keeps relevance, high-view, recent and explainer buckets in the final result', async () => {
  const result = await searchYouTube({ ...input, maxResults: 10 }, {
    key: 'MOCK_BUCKETS',
    charge: async () => {},
    fetcher: fetcher((url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/videos')) {
        const ids = parsed.searchParams.get('id')?.split(',') ?? [];
        return response({ items: ids.map((id) => ({
          id,
          statistics: { viewCount: '1000', likeCount: '50' },
        })) });
      }
      const order = parsed.searchParams.get('order');
      const query = parsed.searchParams.get('q') ?? '';
      const prefix = order === 'viewCount' ? 'pop'
        : order === 'date' ? 'new'
        : query.endsWith(' explained') ? 'exp'
        : 'rel';
      return response({ items: Array.from({ length: 50 }, (_, index) =>
        mockItem(prefix + String(index).padStart(8, '0'))) });
    }),
  });
  assert.equal(result.videos.length, 10);
  const counts = result.videos.reduce<Record<string, number>>((all, item) => {
    all[item.query] = (all[item.query] ?? 0) + 1;
    return all;
  }, {});
  assert.equal(counts[input.topic], 3);
  assert.equal(counts['YouTube popularity order'], 5);
  assert.equal(counts['YouTube recent results'], 2);
  assert.equal(counts[input.topic + ' explained'] ?? 0, 0);
});

void test('YouTube MOCK: extra pages stop at the 12-search safety cap and video statistics remain a separate request', async () => {
  let searchCalls = 0;
  let statisticsCalls = 0;
  const result = await searchYouTube(input, {
    key: 'MOCK_PAGE',
    charge: async () => {},
    fetcher: fetcher((url) => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/search')) searchCalls++;
      else if (pathname.endsWith('/videos')) statisticsCalls++;
      return response({ nextPageToken: 'next', items: [mockItem('dQw4w9WgXcQ')] });
    }),
  });
  assert.equal(searchCalls, 12);
  assert.equal(statisticsCalls, 1);
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
  assert.deepEqual(ideas, []);
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
const regressionIdea = createManualIdea(input.topic, 'A user-authored concept used only for persistence regression tests.', '', 'Iran', ['en']);
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

void test('Retention: activity report links are pruned when nested YouTube metadata expires', () => {
  const data = defaults();
  data.reports = [
    {
      ...regressionReport,
      videos: [{ ...video, fetchedAt: now - RETENTION_MS }],
    },
    {
      ...regressionReport,
      id: 'live-retention-report',
      videos: [{ ...video, id: 'live-video', fetchedAt: now }],
    },
  ];
  const activity = {
    engine: 'YouTube Data API' as const,
    query: 'recent topic sample',
    topic: 'recent topic',
    niche: 'astronomy',
    startedAt: now - 1000,
    completedAt: now,
    durationMs: 1000,
    status: 'success' as const,
    resultCount: 12,
    analyzedCount: 0,
    results: [],
    warnings: [],
  };
  data.researchActivity = [
    { ...activity, id: 'expired-video-link', reportId: 'retention-report' },
    { ...activity, id: 'live-video-link', reportId: 'live-retention-report' },
    { ...activity, id: 'orphan-video-link', reportId: 'missing-report' },
  ];
  const clean = purgeExpired(data, now);
  assert.deepEqual(clean.reports.find((report) => report.id === 'retention-report')?.videos, []);
  assert.equal(clean.researchActivity.find((event) => event.id === 'expired-video-link')?.reportId, undefined);
  assert.equal(clean.researchActivity.find((event) => event.id === 'orphan-video-link')?.reportId, undefined);
  assert.equal(clean.researchActivity.find((event) => event.id === 'live-video-link')?.reportId, 'live-retention-report');
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

void test('Internal research engine combines publisher, Wikimedia and YouTube platform observations', () => {
  const result = buildInternalResearch({
    topic: 'Exoplanet atmospheres',
    news: [
      {
        title: 'New exoplanet atmosphere observation',
        summary: 'A source-reported observation for testing.',
        sourceName: 'NASA',
        sourceUrl: 'https://www.nasa.gov/mock-report',
        sourceId: 'nasa',
        publishedAt: '2026-11-14T12:00:00.000Z',
      },
      {
        title: 'New exoplanet atmosphere observation',
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
      title: 'Exoplanet atmosphere discovery explained',
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
  assert.equal(result.intelligence.selfEvaluation.youtubeSampleCount, 1);
  assert.equal(result.intelligence.selfEvaluation.videoViewCountsAvailable, 1);
  assert.match(JSON.stringify(result), /Exoplanet atmosphere discovery explained|MOCK science channel/);
  assert.equal(result.intelligence.sourceQuality.feedsRepresented, 2);
  assert.equal(result.intelligence.sourceQuality.independentPublishers, 1);
  assert.equal(result.intelligence.sourceQuality.duplicateStoriesMerged, 1);
  assert.equal(result.verificationQuestions.length, 4);
  assert(!JSON.stringify(result).toLowerCase().includes('viral score'));
});

void test('Internal engine evaluates YouTube metadata in recent and all-time sample metrics', () => {
  const fixedNow = Date.parse('2026-11-18T12:00:00.000Z');
  const result = buildInternalResearch({
    topic: 'Exoplanet atmospheres',
    now: fixedNow,
    videoWindowDays: 30,
    news: [
      { title: 'James Webb reveals an exoplanet atmosphere', summary: 'A new spectral observation.', sourceName: 'NASA', sourceUrl: 'https://www.nasa.gov/mock-exoplanet', sourceId: 'nasa', publishedAt: '2026-11-17T10:00:00.000Z' },
      { title: 'Artemis lunar test flight update', summary: 'A crewed lunar mission update.', sourceName: 'NASA JPL', sourceUrl: 'https://www.jpl.nasa.gov/mock-artemis', sourceId: 'jpl', publishedAt: '2026-11-17T11:00:00.000Z' },
    ],
    videos: [
      { id: 'dQw4w9WgXcQ', title: 'James Webb observes an exoplanet atmosphere', channel: 'Science One', publishedAt: '2026-11-17T09:00:00.000Z', viewCount: 800, likeCount: 40 },
      { id: 'M7lc1UVf-VE', title: 'Artemis lunar mission update', channel: 'Space Two', publishedAt: '2026-11-17T08:00:00.000Z', viewCount: 5000, likeCount: 200 },
      { id: '9bZkp7q19f0', title: 'Exoplanet atmosphere discoveries in 2025', channel: 'Old Science', publishedAt: '2026-10-01T09:00:00.000Z', viewCount: 9000, likeCount: 400 },
      { id: 'aqz-KE-bpKQ', title: 'Exoplanet atmosphere announced for the future', channel: 'Future Science', publishedAt: '2026-12-01T09:00:00.000Z', viewCount: 12000, likeCount: 500 },
    ],
  });
  const audit = result.intelligence.selfEvaluation;
  assert.equal(audit.topicMatchedNewsCount, 1);
  assert.equal(audit.unmatchedNewsCount, 1);
  assert.equal(audit.youtubeSampleCount, 4);
  assert.equal(audit.recentVideoCandidateCount, 2);
  assert.equal(audit.matchedVideoCount, 1);
  assert.equal(audit.allTimeMatchedVideoCount, 2);
  assert.equal(audit.recentMatchedVideoCount, 1);
  assert.equal(audit.outsideVideoWindowCount, 2);
  assert.equal(audit.futureDatedVideoCount, 1);
  assert.equal(audit.excludedVideoCount, 2);
  assert.equal(audit.videoViewCountsAvailable, 2);
  assert.ok(result.evidence.some((item) => item.id === 'youtube-sample' && item.detail.includes('returned video example')));
  const allTime = buildInternalResearch({
    topic: 'Exoplanet atmospheres', now: fixedNow, videoWindowDays: 0,
    videos: [
      { id: 'dQw4w9WgXcQ', title: 'James Webb observes an exoplanet atmosphere', channel: 'Science One', publishedAt: '2026-11-17T09:00:00.000Z', viewCount: 800, likeCount: 40 },
      { id: '9bZkp7q19f0', title: 'Exoplanet atmosphere discoveries in 2025', channel: 'Old Science', publishedAt: '2026-10-01T09:00:00.000Z', viewCount: 9000, likeCount: 400 },
      { id: 'aqz-KE-bpKQ', title: 'Exoplanet atmosphere announced for the future', channel: 'Future Science', publishedAt: '2026-12-01T09:00:00.000Z', viewCount: 12000, likeCount: 500 },
    ],
  }).intelligence.selfEvaluation;
  assert.equal(allTime.youtubeSampleCount, 3);
  assert.equal(allTime.recentVideoCandidateCount, 2);
  assert.equal(allTime.recentMatchedVideoCount, 1);
  assert.equal(allTime.outsideVideoWindowCount, 1);
  assert.ok(result.evidence.some((item) => item.id === 'retrieved-news-headlines' && item.detail.includes('Artemis')), 'unmatched publisher records remain visible in the contextual evidence audit');
  assert.ok(result.evidence.some((item) => item.id === 'youtube-sample' && item.detail.includes('returned video example')));
});

void test('Topic relevance ranks a direct publisher match above unrelated feed context', () => {
  const items = [
    { title: 'Artemis lunar mission update', summary: 'Crewed lunar exploration.', publishedAt: '2026-11-15T10:00:00Z' },
    { title: 'Webb observes an exoplanet atmosphere', summary: 'Spectral evidence from an extrasolar planet.', publishedAt: '2026-11-14T10:00:00Z' },
  ];
  assert.ok(topicRelevanceScore('exoplanet atmospheres', items[1].title, items[1].summary) > 0);
  assert.deepEqual(rankNewsForTopic('exoplanet atmospheres', items, 2), [items[1]]);
});

void test('Internal research engine without source evidence marks output as exploratory', () => {
  const result = buildInternalResearch({ topic: 'Black holes' });
  assert.match(result.summary, /no source evidence/i);
  assert.ok(result.limitations.some((item) => item.includes('starting questions only')));
  assert.ok(result.evidence.every((item) => !item.sourceUrl));
});


void test('Internal research compares new numeric source claims with saved topic memory', () => {
  const result = buildInternalResearch({
    topic: 'Exoplanet atmosphere',
    priorMemory: {
      topic: 'Exoplanet atmosphere',
      updatedAt: now,
      sources: [{
        sourceId: 'nasa',
        sourceName: 'NASA',
        title: 'Exoplanet atmosphere observed at 40 km',
        sourceUrl: 'https://www.nasa.gov/old-report',
        publishedAt: '2026-11-10T10:00:00.000Z',
      }],
      keyFindings: [],
      unresolvedQuestions: [],
      contradictions: [],
      confidence: 'moderate',
    },
    news: [{
      title: 'Exoplanet atmosphere measured at 35 km',
      summary: 'A source reports a measurement for testing.',
      sourceName: 'NASA JPL',
      sourceId: 'jpl',
      sourceUrl: 'https://www.jpl.nasa.gov/new-report',
      publishedAt: '2026-11-15T10:00:00.000Z',
    }],
  });
  assert.ok(result.intelligence.potentialContradictions.some((item) => /saved research memory/i.test(item)));
});

void test('Internal research creates Persian analysis when the selected UI language is Persian', () => {
  const result = buildInternalResearch({ topic: 'سیاره‌های فراخورشیدی', language: 'fa' });
  assert.match(result.summary, /هیچ شاهد منبعی/);
  assert.match(result.angles[0].hook, /برای تبدیل/);
  assert.match(result.verificationQuestions[0], /منبع اولیه/);
});


void test('Second Opinion prompt follows the selected UI language', () => {
  const persianPrompt = opinionPrompt('James Webb', 'Explain a verified observation.', '', 'fa');
  const englishPrompt = opinionPrompt('James Webb', 'Explain a verified observation.', '', 'en');
  assert.match(persianPrompt, /به زبان فارسی/);
  assert.match(englishPrompt, /concise English second opinion/);
});

void test('legacy report helper does not derive ideas from raw YouTube samples', () => {
  const report: Report = {
    id: 'language-idea-test',
    input: { ...input, topic: 'James Webb discoveries' },
    videos: [video],
    queries: [input.topic],
    warnings: [],
    createdAt: now,
    analyzed: false,
  };
  const persianIdeas = buildIdeas(report, 'fa');
  assert.deepEqual(persianIdeas, []);
});


void test('Internal engine self-evaluation reports measured inputs, deduplication and evidence gaps', () => {
  const result = buildInternalResearch({
    topic: 'Exoplanet atmospheres',
    news: [
      { title: 'New exoplanet atmosphere observation', summary: 'Source report.', sourceName: 'NASA', sourceUrl: 'https://www.nasa.gov/mock-a', sourceId: 'nasa', publishedAt: '2026-11-14T12:00:00.000Z' },
      { title: 'New exoplanet atmosphere observation', summary: 'Same syndicated report.', sourceName: 'NASA JPL', sourceUrl: 'https://www.jpl.nasa.gov/mock-a', sourceId: 'jpl', publishedAt: '2026-11-14T13:00:00.000Z' },
    ],
    videos: [{ id: 'dQw4w9WgXcQ', title: 'Exoplanet atmospheres explained by the Webb telescope', channel: 'MOCK channel', publishedAt: '2026-11-13T12:00:00.000Z', viewCount: 1000, likeCount: 50 }],
  });
  const audit = result.intelligence.selfEvaluation;
  assert.equal(audit.inputNewsCount, 2);
  assert.equal(audit.uniqueNewsCount, 1);
  assert.equal(audit.duplicateNewsMerged, 1);
  assert.equal(audit.youtubeSampleCount, 1);
  assert.equal(audit.wikimediaMonthlyObservations, 0);
  assert.equal(audit.entityCandidateCount, result.entityCandidates.length);
  assert.equal(audit.coMentionRelationCount, result.entityRelations.length);
  assert.ok(audit.processingMs >= 0);
  assert.ok(audit.openResearchQuestionCount > 0);
});

void test('AI second opinion requests a single structured multi-pass critique without external evidence', () => {
  const prompt = opinionPrompt('James Webb', 'Explain a verified observation.', 'Explore a beginner-friendly angle.', 'en');
  assert.match(prompt, /silently perform four quality passes/i);
  assert.match(prompt, /Do not reveal private reasoning/i);
  assert.match(prompt, /Do not request, infer or analyze YouTube API data/i);
});

void test('Manual YouTube result sorting changes order for date, views, likes and title in both directions', () => {
  const sample = [
    { id: 'a', title: 'Zebra telescope', publishedAt: '2026-10-01T00:00:00.000Z', viewCount: 100, likeCount: 10 },
    { id: 'b', title: 'Alpha galaxy', publishedAt: '2026-11-01T00:00:00.000Z', viewCount: 50, likeCount: 40 },
    { id: 'c', title: 'Orbit mission', publishedAt: '2026-09-01T00:00:00.000Z', viewCount: 200, likeCount: 25 },
    { id: 'd', title: 'Missing statistics', publishedAt: '2026-08-01T00:00:00.000Z', viewCount: null, likeCount: null },
  ];
  assert.deepEqual(sortResearchVideos(sample, 'Newest').map((item) => item.id), ['b', 'a', 'c', 'd']);
  assert.deepEqual(sortResearchVideos(sample, 'Oldest').map((item) => item.id), ['d', 'c', 'a', 'b']);
  assert.deepEqual(sortResearchVideos(sample, 'Most Views').map((item) => item.id), ['c', 'a', 'b', 'd']);
  assert.deepEqual(sortResearchVideos(sample, 'Least Views').map((item) => item.id), ['b', 'a', 'c', 'd']);
  assert.deepEqual(sortResearchVideos(sample, 'Most Likes').map((item) => item.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(sortResearchVideos(sample, 'Least Likes').map((item) => item.id), ['a', 'c', 'b', 'd']);
  assert.deepEqual(sortResearchVideos(sample, 'A-Z').map((item) => item.id), ['b', 'd', 'c', 'a']);
  assert.deepEqual(sortResearchVideos(sample, 'Z-A').map((item) => item.id), ['a', 'c', 'd', 'b']);
});

void test('YouTube Search and other API quotas are independent and use their correct daily units', () => {
  const fixedNow = new Date('2026-11-16T12:00:00.000Z');
  const date = quotaDay(fixedNow);
  let other: Budget = { date, units: 0, requests: 0, exhausted: false };
  other = nextBudget(other, 10000, 10000, fixedNow, 'other', 'manual');
  assert.equal(other.units, 10000);
  assert.throws(() => nextBudget(other, 10000, 1, fixedNow, 'other', 'manual'), /non-search allowance/);

  let search: Budget = { ...other, searchManualRequests: 0, searchAutomaticRequests: 0, searchReserveRequests: 0 };
  for (let index = 0; index < 100; index += 1)
    search = nextBudget(search, 10000, 1, fixedNow, 'search', 'manual');
  assert.equal(search.searchManualRequests, 100);
  assert.equal(search.units, 10000);
  assert.throws(() => nextBudget(search, 10000, 1, fixedNow, 'search', 'manual'), /100 calls/);

  const freshSearch = nextBudget(other, 10000, 1, fixedNow, 'search', 'manual');
  assert.equal(freshSearch.searchManualRequests, 1);
});

void test('YouTube full-refresh helper no longer blocks after three cycles', () => {
  const refreshTestTime = Date.UTC(2026, 10, 16, 12, 0, 0);
  const threeRecent = [refreshTestTime - 23 * 60 * 60 * 1000, refreshTestTime - 12 * 60 * 60 * 1000, refreshTestTime - 60_000];
  const next = reserveYoutubeRefreshCycle(threeRecent, refreshTestTime);
  assert.ok(next.includes(refreshTestTime));
  assert.equal(next.length, 3);
  assert.doesNotThrow(() => reserveYoutubeRefreshCycle(next, refreshTestTime + 1));
});


void test('Editorial priority bands use the centralized, evidence-only thresholds', () => {
  assert.equal(
    EDITORIAL_PRIORITY_CONFIG.weights.relevance +
      EDITORIAL_PRIORITY_CONFIG.weights.evidenceBreadth +
      EDITORIAL_PRIORITY_CONFIG.weights.freshness +
      EDITORIAL_PRIORITY_CONFIG.weights.differentiation,
    1,
  );
  assert.equal(getEditorialPriorityBand(85), 'strong');
  assert.equal(getEditorialPriorityBand(65), 'moderate');
  assert.equal(getEditorialPriorityBand(64), 'weak');
  assert.equal(getEditorialPriorityBand(100), 'strong');
  assert.equal(getEditorialPriorityBand(0), 'weak');
});

function makeEditorialPriorityTestIdea(topic: string, engineScore?: number) {
  return {
    id: topic,
    topic,
    concept: 'Evidence-backed editorial question',
    note: '',
    status: 'New Discoveries' as const,
    decision: '',
    videoIds: [],
    createdAt: 1,
    archived: false,
    assessment: 'Worth Exploring' as const,
    region: 'Iran' as const,
    languages: ['en'],
    ...(engineScore === undefined ? {} : { engineScore }),
  };
}

void test('Dashboard ranking keeps every eligible idea and places scored ideas first', () => {
  const ranked = rankDashboardIdeas([
    makeEditorialPriorityTestIdea('unscored'),
    makeEditorialPriorityTestIdea('medium', 70),
    makeEditorialPriorityTestIdea('strong', 88),
    makeEditorialPriorityTestIdea('weak', 42),
  ]);
  assert.deepEqual(ranked.map((idea) => idea.topic), ['strong', 'medium', 'weak', 'unscored']);
  assert.equal(ranked.length, 4);
});


void test('Editorial priority does not fabricate freshness when all matched evidence is undated', () => {
  const result = scoreEditorialOpportunity({
    topic: 'Mars sample return',
    anchor: 'Mars sample return',
    news: [{
      title: 'Mars sample return mission',
      summary: 'Mars sample return mission planning',
      sourceName: 'NASA',
      sourceId: 'nasa',
      sourceUrl: 'https://example.com/mars',
      publishedAt: null,
    }],
    historicalNews: [],
    context: [],
    videos: [],
    now: Date.UTC(2026, 10, 20),
  });
  assert.equal(result.components.freshness, 0);
});

void test('Editorial scoring is identical with or without raw YouTube API samples', () => {
  const base = {
    topic: 'Mars sample return',
    anchor: 'Mars sample return technical review',
    news: [
      { title: 'NASA Mars sample return mission architecture', summary: 'The sample retrieval and transfer plan needs technical review.', sourceName: 'NASA', sourceId: 'nasa', sourceUrl: 'https://nasa.gov/mars', publishedAt: '2026-11-18T00:00:00Z' },
      { title: 'ESA Mars sample return collaboration', summary: 'The mission update describes sample handling and independent review.', sourceName: 'ESA', sourceId: 'esa', sourceUrl: 'https://esa.int/mars', publishedAt: '2026-11-17T00:00:00Z' },
    ],
    historicalNews: [],
    context: [],
    now: Date.UTC(2026, 10, 20),
  };
  const withoutVideoSamples = scoreEditorialOpportunity({ ...base, videos: [] });
  const withVideoSamples = scoreEditorialOpportunity({
    ...base,
    videos: [
      { title: 'MOCK Mars sample return views', channel: 'MOCK channel A', publishedAt: '2026-11-19T00:00:00Z', viewCount: 9000000 },
      { title: 'MOCK Mars sample return high engagement', channel: 'MOCK channel B', publishedAt: '2026-11-18T00:00:00Z', viewCount: 8000000 },
      { title: 'MOCK Mars sample return breakthrough', channel: 'MOCK channel C', publishedAt: '2026-11-17T00:00:00Z', viewCount: 7000000 },
    ],
  });
  assert.deepEqual(withVideoSamples, withoutVideoSamples);
});

void test('YouTube growth requires two snapshots and computes elapsed-time velocity', () => {
  const first: Video = { ...video, id: 'growth-video', channel: 'Growth channel', viewCount: 1000, likeCount: 20 };
  const initial = captureYouTubeSnapshots([first], [], now);
  assert.equal(initial.videos[0].growth?.status, 'insufficient-history');
  assert.equal(initial.videos[0].growth?.viewsPerDay, null);
  const second = captureYouTubeSnapshots([{ ...first, viewCount: 1600 }], initial.snapshots, now + 2 * 86400000);
  assert.equal(second.videos[0].growth?.status, 'measured');
  assert.equal(second.videos[0].growth?.deltaViews, 600);
  assert.equal(second.videos[0].growth?.viewsPerDay, 300);
  assert.equal(second.snapshots[0].viewCount, 1600);
});

void test('YouTube growth does not invent velocity for zero or too-short intervals', () => {
  const first: Video = { ...video, id: 'fast-video', viewCount: 1000 };
  const initial = captureYouTubeSnapshots([first], [], now);
  const second = captureYouTubeSnapshots([{ ...first, viewCount: 1500 }], initial.snapshots, now + 5 * 60000);
  assert.equal(second.videos[0].growth?.status, 'insufficient-history');
  assert.equal(second.videos[0].growth?.viewsPerHour, null);
});
