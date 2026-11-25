import { defaults, purgeExpired, type ResearchInput, type Video } from './types';
import { exportBackup, importBackup, personalLinks, restorePersonalData } from './backup';
import { moveNoteBlock } from './utils';
import { validateLocal } from './validation';
import {
  ApiError,
  nextBudget,
  quotaDay,
  relatedQueries,
  searchYouTube,
  searchYouTubeSample,
  testYouTube,
  getFreeModels,
  requestJson,
  retryDelayMs,
  opinionPrompt,
  type Fetcher,
} from './api';
import { buildIdeas, createManualIdea } from './engine';
import { scheduleChecks } from '../tests/schedule.cases';
export type TestResult = { name: string; passed: boolean; detail?: string };

export function formatDiagnosticReport(results: readonly TestResult[], failuresOnly = false): string {
  if (!results.length) {
    return 'MOHSEN SCOUT — MOCK REGRESSION REPORT\nNo mock tests have been run.';
  }
  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const selected = failuresOnly ? results.filter((result) => !result.passed) : results;
  const lines = [
    'MOHSEN SCOUT — MOCK REGRESSION REPORT',
    `Summary: ${passed} passed · ${failed} failed · ${results.length} total`,
    failuresOnly ? 'View: failed checks only' : 'View: all checks',
    '',
    ...selected.flatMap((result) => [
      `${result.passed ? 'PASS' : 'FAIL'} | ${result.name}`,
      ...(result.detail ? [`  ${result.detail}`] : []),
    ]),
  ];
  if (failuresOnly && failed === 0) lines.push('No failed checks.');
  return lines.join('\n');
}
const check = (value: unknown, message = 'Assertion failed') => {
  if (!value) throw new Error(message);
};
const rejects = async (fn: () => Promise<unknown>, code?: string) => {
  try {
    await fn();
  } catch (error) {
    check(!code || (error instanceof ApiError && error.code === code));
    return;
  }
  throw new Error('Expected rejection');
};
const throws = (fn: () => unknown) => {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error('Expected rejection');
};
const mockResponse = (body: unknown, status = 200, headers: Record<string, string> = {}): Response => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null } as unknown as Headers,
  json: async () => body,
} as unknown as Response);
const mock = (body: unknown, status = 200) => mockResponse(body, status);
const mockText = (text: string, status = 200, headers: Record<string, string> = {}): Response => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null } as unknown as Headers,
  json: async () => { throw new SyntaxError('Invalid synthetic JSON: ' + text.slice(0, 40)); },
} as unknown as Response);
const fetcher =
  (fn: (url: URL) => Response | Promise<Response>): Fetcher =>
  async (url) =>
    fn(new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url));
export async function runDiagnostics(): Promise<TestResult[]> {
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
    id: 'dQw4w9WgXcQ',
    title: 'MOCK: Original فارسی title',
    description: 'MOCK description',
    channel: 'MOCK channel',
    thumbnail: 'https://example.com/mock.jpg',
    publishedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    fetchedAt: now,
    query: input.topic,
  };
  const item = {
    id: { videoId: video.id },
    snippet: {
      title: video.title,
      description: video.description,
      channelTitle: video.channel,
      publishedAt: video.publishedAt,
      thumbnails: { medium: { url: video.thumbnail } },
    },
  };
  const report = {
    id: 'MOCK-report',
    input,
    videos: [video],
    queries: relatedQueries(input.topic),
    warnings: [],
    createdAt: now,
    analyzed: false,
  };
  const idea = createManualIdea(input.topic, 'A user-authored concept used only for storage regression coverage.', '', 'Iran', ['en']);
  const savedLink = {
    id: video.id,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    manualTitle: 'Personal label',
    topic: input.topic,
    note: 'My note',
    folder: '',
    tags: [],
    savedAt: now,
  };
  const cases: Array<[string, () => void | Promise<void>]> = [
    [
      'YouTube metadata remains retained beyond 29 days; saved links remain separate',
      () => {
        const data = defaults();
        data.links = [savedLink];
        data.videos = [{ ...video, fetchedAt: now - 120 * 86400000 }];
        data.reports = [{ ...report, createdAt: now - 120 * 86400000 }];
        data.ideas = [{ ...idea, reportId: report.id, videoIds: [video.id, 'unsaved'] }];
        const clean = purgeExpired(data, now);
        check(clean.ideas[0].reportId === report.id);
        check(clean.ideas[0].videoIds.join() === video.id);
        check(clean.ideas[0].concept === idea.concept);
      },
    ],
    [
      'Clearing metadata removes automated references',
      () => {
        const data = defaults();
        data.ideas = [{ ...idea, videoIds: [video.id], reportId: report.id }];
        const clean = purgeExpired(data, now);
        check(clean.ideas[0].videoIds.length === 0 && !clean.ideas[0].reportId);
      },
    ],
    [
      'Nested report videos remain retained indefinitely',
      () => {
        const data = defaults();
        data.reports = [{ ...report, videos: [{ ...video, fetchedAt: now - 120 * 86400000 }] }];
        check(purgeExpired(data, now).reports[0].videos.length === 1);
      },
    ],
    [
      'Restore preserves device research and quota',
      () => {
        const current = defaults();
        current.videos = [video];
        current.reports = [report];
        current.budget = { date: quotaDay(), requests: 9, units: 900, exhausted: true };
        const restored = defaults();
        restored.preferences.name = 'Restored owner';
        const merged = restorePersonalData(current, restored);
        check(merged.videos === current.videos && merged.reports === current.reports);
        check(merged.budget === current.budget && merged.preferences.name === 'Restored owner');
        check(merged.preferences.schedule === 'Manual' && !merged.preferences.lastInput);
      },
    ],
    [
      'Restore keeps opinions only for unchanged editorial prompts',
      () => {
        const current = defaults();
        current.ideas = [idea];
        current.opinions = [
          { id: 'op', ideaId: idea.id, text: 'MOCK opinion', model: 'MOCK', createdAt: now },
        ];
        const restored = defaults();
        restored.ideas = [{ ...idea }];
        check(restorePersonalData(current, restored).opinions.length === 1);
        restored.ideas = [{ ...idea, concept: 'Different concept' }];
        check(restorePersonalData(current, restored).opinions.length === 0);
        restored.ideas = [];
        check(restorePersonalData(current, restored).opinions.length === 0);
      },
    ],
    [
      'Import rejects unsaved automatic video references',
      () => {
        const data = defaults();
        data.links = [savedLink];
        data.ideas = [idea];
        const raw = JSON.parse(exportBackup(data));
        raw.personal.ideas[0].videoIds = [video.id, 'unsaved'];
        check(importBackup(JSON.stringify(raw)).ideas[0].videoIds.join() === video.id);
      },
    ],
    [
      'Note block reordering preserves content and boundaries',
      () => {
        const blocks = [
          { id: 'a', type: 'paragraph' as const, text: 'Keep me' },
          { id: 'b', type: 'checklist' as const, text: 'Done', checked: true },
        ];
        check(moveNoteBlock(blocks, 'b', -1)[0].checked === true);
        check(blocks[0].id === 'a');
        check(moveNoteBlock(blocks, 'a', -1) === blocks);
        check(moveNoteBlock(blocks, 'b', 1) === blocks);
      },
    ],
    [
      'Retry-After parsing and bounded server delay',
      () => {
        check(retryDelayMs('2', 500, now) === 2000);
        check(retryDelayMs(new Date(now + 5000).toUTCString(), 500, now) !== null);
        check(retryDelayMs('invalid', 500, now) === 500);
        check(retryDelayMs('60', 500, now) === null);
      },
    ],
    [
      'MOCK non-JSON transient HTTP responses retry',
      async () => {
        let calls = 0;
        const result = await requestJson(
          'https://example.com',
          {},
          async () => {
            calls++;
            return calls === 1
              ? mockText('MOCK unavailable', 503)
              : mock({ ok: true });
          },
          undefined,
          15000,
          1,
        );
        check(calls === 2 && typeof result === 'object');
      },
    ],
    [
      'MOCK long Retry-After stops instead of retrying early',
      async () => {
        let calls = 0;
        await rejects(
          () =>
            requestJson(
              'https://example.com',
              {},
              async () => {
                calls++;
                return mockText('MOCK rate limit', 429, { 'Retry-After': '60' });
              },
              undefined,
              15000,
              1,
            ),
          'service',
        );
        check(calls === 1);
      },
    ],
    [
      'Defaults & local-only profile',
      () => {
        check(defaults().preferences.name === 'Mohsen');
        check(defaults().preferences.schedule === 'Daily');
      },
    ],
    [
      'Validate persisted local data',
      () => {
        check(validateLocal(defaults()).notes.length === 0);
        throws(() => validateLocal({ ...defaults(), notes: 'broken' }));
      },
    ],
    [
      'Retain API metadata beyond 29 days',
      () => {
        const data = defaults();
        data.videos = [video, { ...video, fetchedAt: now - 120 * 86400000 }];
        check(purgeExpired(data, now).videos.length === 1);
      },
    ],
    [
      'Preserve personal bookmarks',
      () => {
        const data = defaults();
        data.links = [
          {
            id: video.id,
            url: `https://www.youtube.com/watch?v=${video.id}`,
            manualTitle: 'My label',
            topic: 'My topic',
            note: 'Personal note',
            folder: 'Ideas',
            tags: ['mine'],
            savedAt: now,
          },
        ];
        check(purgeExpired(data).links.length === 1);
        check(personalLinks(data).includes('Personal note'));
      },
    ],
    [
      'Backup round trip',
      () => {
        const data = defaults();
        data.notes = [
          {
            id: 'n',
            title: 'My note',
            folder: 'Ideas',
            tags: ['mine'],
            blocks: [{ id: 'b', type: 'checklist', text: 'Try it', checked: true }],
            updatedAt: now,
          },
        ];
        check(importBackup(exportBackup(data)).notes[0].blocks[0].checked === true);
      },
    ],
    [
      'Backups exclude API data & AI replies',
      () => {
        const data = defaults();
        data.videos = [video];
        data.opinions = [
          { id: 'o', ideaId: 'i', model: 'MOCK', text: 'MOCK opinion', createdAt: now },
        ];
        const raw = exportBackup(data);
        check(!raw.includes(video.title));
        check(!raw.includes(video.thumbnail));
        check(!raw.includes('MOCK opinion'));
      },
    ],
    [
      'Invalid backup rejected',
      () => {
        throws(() => importBackup('{'));
        throws(() => importBackup('{"app":"MOHSEN SCOUT","version":2}'));
      },
    ],
    [
      'Injected keys are stripped',
      () => {
        const raw = JSON.parse(exportBackup(defaults()));
        raw.personal.preferences.youtubeKey = 'MOCK_SECRET';
        check(!JSON.stringify(importBackup(JSON.stringify(raw))).includes('MOCK_SECRET'));
      },
    ],
    [
      'Local quota budget enforced',
      () => {
        const budget = { date: quotaDay(), units: 100, requests: 1, exhausted: false, otherManualUnits: 100 };
        check(nextBudget(budget, 500, 100).units === 200);
        throws(() => nextBudget(budget, 150, 100));
      },
    ],
    [
      'Pacific-day quota reset',
      () => {
        check(
          nextBudget({ date: 'old', units: 999, requests: 9, exhausted: true }, 500, 100).units ===
            100,
        );
      },
    ],
    [
      'Related query generation',
      () => {
        check(relatedQueries(input.topic).length === 4);
      },
    ],
    [
      'MOCK official endpoint & scoped global/local search settings',
      async () => {
        let calls = 0;
        const searchUrls: URL[] = [];
        const data = await searchYouTube(input, {
          key: 'MOCK_BROWSER',
          charge: async () => {},
          fetcher: fetcher((url) => {
            calls++;
            check(url.hostname === 'www.googleapis.com');
            if (url.pathname.endsWith('/search')) {
              searchUrls.push(url);
              return mock({ items: [item, item] });
            }
            if (url.pathname.endsWith('/videos')) {
              return mock({ items: [{ id: video.id, statistics: { viewCount: '101', likeCount: '6' } }] });
            }
            return mock({ items: [] });
          }),
        });
        check(data.videos.length === 1);
        check(data.videos[0].title === video.title);
        check(calls === 5 && searchUrls.length === 4);
        check(searchUrls[0].searchParams.get('order') === 'viewCount');
        check(!searchUrls[0].searchParams.has('regionCode'));
        check(!searchUrls[0].searchParams.has('relevanceLanguage'));
        for (const url of searchUrls.slice(1)) {
          check(url.searchParams.get('regionCode') === 'IR');
          check(url.searchParams.get('relevanceLanguage') === 'en');
          check(url.searchParams.get('videoDuration') === 'short');
        }
      },
    ],
    [
      'MOCK search-attempt cap across language buckets',
      async () => {
        let searchCalls = 0;
        await searchYouTube({ ...input, languages: ['en', 'fa', 'es', 'de', 'fr'] }, {
          key: 'MOCK_PAGINATION',
          charge: async () => {},
          fetcher: fetcher((url) => {
            if (url.pathname.endsWith('/search')) searchCalls++;
            return mock({ items: [] });
          }),
        });
        check(searchCalls === 12);
      },
    ],
    [
      'MOCK quota exhaustion stops',
      async () => {
        let calls = 0;
        let stopped = false;
        await rejects(
          () =>
            searchYouTube(input, {
              key: 'MOCK_QUOTA',
              charge: async () => {},
              onQuota: async () => {
                stopped = true;
              },
              fetcher: fetcher(() => {
                calls++;
                return mock({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403);
              }),
            }),
          'quota',
        );
        check(calls === 1 && stopped);
      },
    ],
    [
      'MOCK budget checked before request',
      async () => {
        let calls = 0;
        await rejects(
          () =>
            searchYouTube(input, {
              key: 'MOCK_BUDGET',
              charge: async () => {
                throw new ApiError('budget', 'budget');
              },
              fetcher: fetcher(() => {
                calls++;
                return mock({ items: [] });
              }),
            }),
          'budget',
        );
        check(calls === 0);
      },
    ],
    [
      'MOCK invalid response rejected',
      async () => {
        await rejects(
          () =>
            searchYouTube(input, {
              key: 'MOCK_INVALID',
              charge: async () => {},
              fetcher: fetcher(() => mock({ items: [{ broken: true }] })),
            }),
          'invalid',
        );
      },
    ],
    [
      'MOCK concurrent request dedup',
      async () => {
        let calls = 0;
        const options = {
          key: 'MOCK_DUP',
          charge: async () => {},
          fetcher: fetcher(async () => {
            calls++;
            await new Promise((resolve) => setTimeout(resolve, 5));
            return mock({ items: [] });
          }),
        };
        await Promise.all([testYouTube(options), testYouTube(options)]);
        check(calls === 1);
      },
    ],
    [
      'MOCK invalid key & disabled API',
      async () => {
        await rejects(
          () =>
            requestJson(
              'https://www.googleapis.com/youtube/v3/videos',
              {},
              fetcher(() => mock({}, 401)),
            ),
          'key',
        );
        await rejects(
          () =>
            requestJson(
              'https://www.googleapis.com/youtube/v3/videos',
              {},
              fetcher(() => mock({}, 403)),
            ),
          'permission',
        );
      },
    ],
    [
      'MOCK transient retry cap',
      async () => {
        let calls = 0;
        let charges = 0;
        await rejects(() =>
          requestJson(
            'https://example.com',
            {},
            fetcher(() => {
              calls++;
              return mock({}, 503);
            }),
            async () => {
              charges++;
            },
            15000,
            1,
          ),
        );
        check(calls === 3 && charges === 3);
      },
    ],
    [
      'MOCK AI POST not retried',
      async () => {
        let calls = 0;
        await rejects(
          () =>
            requestJson(
              'https://example.com',
              { method: 'POST' },
              fetcher(() => {
                calls++;
                return mock({}, 429);
              }),
            ),
          'service',
        );
        check(calls === 1);
      },
    ],
    [
      'MOCK offline error',
      async () => {
        await rejects(
          () =>
            requestJson('https://example.com', { method: 'POST' }, async () => {
              throw new TypeError('MOCK offline');
            }),
          'offline',
        );
      },
    ],
    [
      'MOCK timeout aborts request',
      async () => {
        await rejects(
          () =>
            requestJson(
              'https://example.com',
              { method: 'POST' },
              async (_url, init) =>
                new Promise<Response>((_resolve, reject) => {
                  init?.signal?.addEventListener('abort', () => reject(new Error('MOCK timeout')));
                }),
              undefined,
              5,
            ),
          'timeout',
        );
      },
    ],
    [
      'MOCK available free models',
      async () => {
        const models = await getFreeModels(
          fetcher(() =>
            mock({
              data: [
                { id: 'MOCK:free', name: 'MOCK free', pricing: { prompt: '0', completion: '0' } },
                { id: 'MOCK:paid', name: 'MOCK paid', pricing: { prompt: '1', completion: '1' } },
              ],
            }),
          ),
        );
        check(models.length === 1 && models[0].id === 'MOCK:free');
      },
    ],
    [
      'MOCK unavailable AI model',
      async () => {
        await rejects(
          () =>
            requestJson(
              'https://example.com',
              { method: 'POST' },
              fetcher(() => mock({}, 404)),
            ),
          'model',
        );
      },
    ],
    [
      'MOCK raw API metadata stays out of AI prompts and generated idea text',
      () => {
        const prompt = opinionPrompt(input.topic, 'My concept', 'My decision');
        check(!prompt.includes(video.title));
        check(!prompt.includes(video.description));
        const ideas = buildIdeas({
          id: 'r',
          input,
          videos: [video],
          queries: relatedQueries(input.topic),
          warnings: [],
          createdAt: now,
          analyzed: false,
        });
        check(ideas.length === 0);
        check(!JSON.stringify(ideas).includes(video.title));
        check(!JSON.stringify(ideas).includes(video.description));
      },
    ],
  ];
  cases.push(
    [
      'MOCK report formatter includes totals and failure details',
      () => {
        const allReport = formatDiagnosticReport([
          { name: 'Synthetic success', passed: true },
          { name: 'Synthetic failure', passed: false, detail: 'Controlled mismatch' },
        ]);
        check(allReport.includes('1 passed · 1 failed · 2 total'));
        check(allReport.includes('PASS | Synthetic success'));
        check(allReport.includes('FAIL | Synthetic failure'));
        check(allReport.includes('Controlled mismatch'));
      },
    ],
    [
      'MOCK failure report contains only failed checks',
      () => {
        const failureReport = formatDiagnosticReport([
          { name: 'Synthetic success', passed: true },
          { name: 'Synthetic failure', passed: false, detail: 'Controlled mismatch' },
        ], true);
        check(failureReport.includes('Synthetic failure'));
        check(!failureReport.includes('Synthetic success'));
        check(failureReport.includes('failed checks only'));
      },
    ],
    [
      'MOCK empty report clearly reports that no checks were run',
      () => {
        const emptyReport = formatDiagnosticReport([]);
        check(emptyReport.includes('No mock tests have been run'));
      },
    ],
    [
      'MOCK unreadable successful JSON is rejected as an invalid response',
      async () => {
        await rejects(
          () => requestJson('https://example.com/mock', {}, async () => mockText('not-json', 200)),
          'invalid',
        );
      },
    ],
    [
      'MOCK empty YouTube sample returns an explicit empty state',
      async () => {
        let calls = 0;
        const result = await searchYouTubeSample('Synthetic space topic', {
          key: 'MOCK_EMPTY',
          charge: async () => {},
          fetcher: fetcher((url) => {
            calls++;
            check(url.pathname.endsWith('/search'));
            return mock({ items: [] });
          }),
        }, 10, { order: 'date', days: 30, region: 'Iran', language: 'en' });
        check(result.videos.length === 0);
        check(result.warning.toLowerCase().includes('no matching videos'));
        check(calls === 1);
      },
    ],
    [
      'MOCK dual YouTube discovery pools deduplicate repeated video IDs',
      async () => {
        const sampleItem = {
          id: { videoId: 'AbCdEfGhI12' },
          snippet: {
            title: 'MOCK exoplanet atmosphere sample',
            description: 'Synthetic test description',
            channelTitle: 'MOCK research channel',
            channelId: 'MOCK_CHANNEL_01',
            publishedAt: '2026-11-15T12:00:00Z',
            thumbnails: { medium: { url: 'https://example.com/mock.jpg' } },
          },
        };
        let searchCalls = 0;
        const result = await searchYouTubeSample('exoplanet atmosphere', {
          key: 'MOCK_DUAL_POOL',
          charge: async () => {},
          fetcher: fetcher((url) => {
            if (url.pathname.endsWith('/search')) {
              searchCalls++;
              return mock({ items: [sampleItem, sampleItem], nextPageToken: 'MOCK_NEXT_' + url.searchParams.get('order') });
            }
            if (url.pathname.endsWith('/videos')) {
              return mock({ items: [{ id: 'AbCdEfGhI12', statistics: { viewCount: '1234', likeCount: '56' } }] });
            }
            if (url.pathname.endsWith('/channels')) {
              return mock({ items: [{ id: 'MOCK_CHANNEL_01', statistics: { subscriberCount: '789', videoCount: '42' } }] });
            }
            throw new Error('Unexpected synthetic endpoint');
          }),
        }, 10, { order: 'relevance', days: 30, region: 'Iran', language: 'en' });
        check(searchCalls === 2);
        check(result.videos.length === 1);
        check(result.videos[0].id === 'AbCdEfGhI12');
        check(result.videos[0].viewCount === 1234 && result.videos[0].likeCount === 56);
        check(result.videos[0].channelSubscriberCount === 789 && result.videos[0].channelVideoCount === 42);
        check(Boolean(result.nextPageToken));
      },
    ],
    [
      'MOCK malformed saved sample cursor is rejected before network access',
      async () => {
        let calls = 0;
        await rejects(
          () => searchYouTubeSample('Synthetic topic', {
            key: 'MOCK_BAD_CURSOR',
            charge: async () => {},
            fetcher: fetcher(() => {
              calls++;
              return mock({ items: [] });
            }),
          }, 10, { order: 'relevance', pageToken: 'mohsen-scout-likes-v1:%zz' }),
          'invalid',
        );
        check(calls === 0);
      },
    ],
    [
      'MOCK unavailable YouTube statistics stay null instead of being estimated',
      async () => {
        const sampleItem = {
          id: { videoId: 'AbCdEfGhI12' },
          snippet: {
            title: 'MOCK video with unavailable counters',
            description: 'Synthetic description',
            channelTitle: 'MOCK channel',
            channelId: 'MOCK_CHANNEL_02',
            publishedAt: '2026-11-15T12:00:00Z',
            thumbnails: { default: { url: 'https://example.com/mock.jpg' } },
          },
        };
        const result = await searchYouTubeSample('Synthetic topic', {
          key: 'MOCK_MISSING_STATS',
          charge: async () => {},
          fetcher: fetcher((url) => {
            if (url.pathname.endsWith('/search')) return mock({ items: [sampleItem] });
            if (url.pathname.endsWith('/videos') || url.pathname.endsWith('/channels')) return mock({ items: [] });
            throw new Error('Unexpected synthetic endpoint');
          }),
        }, 5, { order: 'date', days: 30 });
        check(result.videos.length === 1);
        check(result.videos[0].viewCount === null && result.videos[0].likeCount === null);
        check(result.videos[0].channelSubscriberCount === null && result.videos[0].channelVideoCount === null);
      },
    ],
    [
      'MOCK rejected YouTube keys never appear in error text',
      async () => {
        const secret = 'MOCK_PRIVATE_KEY_NEVER_EXPOSE';
        let message = '';
        try {
          await requestJson(
            'https://www.googleapis.com/youtube/v3/videos?key=' + secret,
            {},
            fetcher(() => mock({}, 401)),
          );
        } catch (error) {
          check(error instanceof ApiError && error.code === 'key');
          message = error instanceof Error ? error.message : String(error);
        }
        check(Boolean(message) && !message.includes(secret));
      },
    ],
  );
  cases.push(...scheduleChecks);
  return Promise.all(
    cases.map(async ([name, run]) => {
      try {
        await run();
        return { name, passed: true };
      } catch (error) {
        return { name, passed: false, detail: error instanceof Error ? error.message : 'Failed' };
      }
    }),
  );
}
