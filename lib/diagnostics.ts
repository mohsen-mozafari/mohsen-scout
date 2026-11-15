import { defaults, purgeExpired, RETENTION_MS, type ResearchInput, type Video } from './types';
import { exportBackup, importBackup, personalLinks } from './backup';
import { validateLocal } from './validation';
import {
  ApiError,
  nextBudget,
  quotaDay,
  relatedQueries,
  searchYouTube,
  testYouTube,
  getFreeModels,
  requestJson,
  opinionPrompt,
  type Fetcher,
} from './api';
import { buildIdeas } from './engine';
export type TestResult = { name: string; passed: boolean; detail?: string };
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
const mock = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
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
    publishedAt: '2026-10-01T12:00:00Z',
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
  const cases: Array<[string, () => void | Promise<void>]> = [
    [
      'Defaults & local-only profile',
      () => {
        check(defaults().preferences.name === 'Mohsen');
        check(defaults().preferences.schedule === 'Manual');
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
      'Expire API metadata at 29 days',
      () => {
        const data = defaults();
        data.videos = [video, { ...video, fetchedAt: now - RETENTION_MS }];
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
        const budget = { date: quotaDay(), units: 100, requests: 1, exhausted: false };
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
      'MOCK official endpoint & region/language',
      async () => {
        let calls = 0;
        const data = await searchYouTube(input, {
          key: 'MOCK_BROWSER',
          charge: async () => {},
          fetcher: fetcher((url) => {
            calls++;
            check(url.hostname === 'www.googleapis.com');
            check(url.searchParams.get('regionCode') === 'IR');
            check(url.searchParams.get('relevanceLanguage') === 'en');
            check(url.searchParams.get('videoDuration') === 'short');
            return mock({ items: [item, item] });
          }),
        });
        check(data.videos.length === 1);
        check(data.videos[0].title === video.title);
        check(calls === 5);
      },
    ],
    [
      'MOCK pagination cap',
      async () => {
        let calls = 0;
        await searchYouTube(input, {
          key: 'MOCK_PAGINATION',
          charge: async () => {},
          fetcher: fetcher(() => {
            calls++;
            return mock({ items: [item], nextPageToken: 'next' });
          }),
        });
        check(calls === 10);
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
              'https://example.com',
              {},
              fetcher(() => mock({}, 401)),
            ),
          'key',
        );
        await rejects(
          () =>
            requestJson(
              'https://example.com',
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
      'No API metadata in AI prompt or ideas',
      () => {
        const prompt = opinionPrompt(input.topic, 'My concept', 'My decision');
        check(!prompt.includes(video.title));
        const ideas = buildIdeas({
          id: 'r',
          input,
          videos: [video],
          queries: relatedQueries(input.topic),
          warnings: [],
          createdAt: now,
          analyzed: false,
        });
        check(ideas.length === 3);
        check(ideas.every((i) => i.assessment === 'Uncertain'));
        check(!JSON.stringify(ideas).includes(video.title));
      },
    ],
  ];
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
