import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getOpinion, selectFreeModel } from '../lib/api';
import {
  chooseBestIdea,
  collectEngineVideoEvidence,
  engineReviewCacheKey,
  findCachedEngineReview,
  rankDashboardIdeas,
  selectDashboardFeaturedIdeas,
  selectDashboardIdeas,
  runSingleFlight,
  selectDashboardVideos,
} from '../lib/dashboard';
import { type Idea, type Opinion, type Video } from '../lib/types';

const now = Date.UTC(2026, 10, 17, 12, 0, 0);

function idea(id: string, assessment: Idea['assessment'], overrides: Partial<Idea> = {}): Idea {
  return {
    id,
    topic: id,
    concept: 'A testable video concept.',
    note: '',
    status: 'New Discoveries',
    decision: '',
    videoIds: [],
    createdAt: now,
    archived: false,
    assessment,
    region: 'United States',
    languages: ['en'],
    ...overrides,
  };
}

function video(id: string, title: string, viewCount: number | null, fetchedAt = now): Video {
  return {
    id,
    title,
    description: 'Original sample description.',
    channel: 'Test channel',
    thumbnail: 'https://example.com/' + id + '.jpg',
    publishedAt: '2026-11-16T12:00:00Z',
    fetchedAt,
    query: title,
    viewCount,
    likeCount: null,
  };
}

void test('dashboard chooses the strongest active idea and excludes archived, rejected and completed items', () => {
  const completed = idea('completed', 'Strong Opportunity', { status: 'Completed Research' });
  const rejected = idea('rejected', 'Strong Opportunity', { status: 'Rejected Ideas' });
  const archived = idea('archived', 'Strong Opportunity', { archived: true });
  const promising = idea('promising', 'Promising', { videoIds: ['video-1'] });
  const strong = idea('strong', 'Strong Opportunity', { reportId: 'report-1', createdAt: now - 1000 });
  const newestStrong = idea('newest-strong', 'Strong Opportunity', { sourceUrl: 'https://example.com/source', createdAt: now });
  assert.equal(chooseBestIdea([completed, rejected, archived, promising, strong, newestStrong])?.id, 'newest-strong');
  assert.deepEqual(rankDashboardIdeas([completed, rejected, archived]).map((item) => item.id), []);
});

void test('dashboard featured idea uses the same active scored priority pool as the Ideas page', () => {
  const top = idea('global-top', 'Strong Opportunity', {
    engineGenerated: true, engineScore: 94,
  });
  const next = idea('next', 'Promising', {
    engineGenerated: true, engineScore: 82,
  });
  const unscored = idea('unscored', 'Uncertain', { engineGenerated: true });
  const archived = idea('archived-high', 'Strong Opportunity', {
    engineGenerated: true, engineScore: 100, archived: true,
  });
  const completed = idea('completed-high', 'Strong Opportunity', {
    engineGenerated: true, engineScore: 99, status: 'Completed Research',
  });
  const placeholder = idea('placeholder', 'Uncertain', {
    topic: 'Untitled Idea', concept: '', engineGenerated: true, engineScore: 98,
  });

  assert.deepEqual(selectDashboardFeaturedIdeas(
    [next, unscored, archived, completed, placeholder, top], 5,
  ).map((item) => item.id), ['global-top', 'next']);
});

void test('dashboard selects source-linked radar ideas without a report ID', () => {
  const radarIdea = idea('radar-idea', 'Strong Opportunity', {
    engineGenerated: true,
    sourceUrl: 'https://example.com/publisher-story',
    engineScore: 91,
  });
  const reportIdea = idea('report-idea', 'Promising', {
    engineGenerated: true, reportId: 'report-2', videoIds: ['video-2'], engineScore: 74,
  });
  const manual = idea('manual-idea', 'Strong Opportunity', { engineScore: 99 });
  assert.deepEqual(selectDashboardIdeas([manual, radarIdea], {
    sourceUrls: new Set(['https://example.com/publisher-story']), topic: 'Mars exploration',
  }).map((item) => item.id), ['radar-idea']);
  assert.deepEqual(selectDashboardIdeas([radarIdea, reportIdea], {
    reportId: 'report-2', videoIds: new Set(['video-2']), topic: 'Mars',
  }).map((item) => item.id), ['report-idea']);
  assert.deepEqual(selectDashboardIdeas([manual], { topic: 'Mars' }), []);
});

void test('internal engine evidence merges retained report and global videos, deduplicates and bounds only the analysis sample', () => {
  const olderCopy = video('shared', 'Older title', 10, now - 2_000);
  const newestCopy = video('shared', 'Newest title', 25, now - 1_000);
  const reportOnly = video('report-only', 'Report-only sample', 100, now - 3_000);
  const historical = video('historical', 'Historically stored metadata', 999, now - 120 * 86400000);
  const future = video('future', 'Future fetched record', 999, now + 1);
  const collected = collectEngineVideoEvidence(
    [{ videos: [olderCopy, reportOnly, historical] }],
    [newestCopy, historical, future],
    now,
  );
  assert.deepEqual(collected.map((item) => item.id), ['shared', 'report-only', 'historical']);
  assert.equal(collected[0].title, 'Newest title');
  assert.equal(collected[0].viewCount, 25);
  const many = Array.from({ length: 320 }, (_, index) =>
    video('sample-' + index, 'Sample ' + index, index, now - index),
  );
  assert.equal(collectEngineVideoEvidence([], many, now).length, 300);
  assert.equal(collectEngineVideoEvidence([], many, now, 10).length, 10);
});

void test('dashboard video feed filters strictly to the selected niche and sorts by raw views', () => {
  const items = [
    video('relevant-low', 'JWST publishes an early galaxy image', 120),
    video('irrelevant-high', 'Mars rover explores a crater', 900000),
    video('relevant-high', 'Space telescope detects an exoplanet', 5200),
    video('relevant-no-count', 'New JWST observation', null),
  ];
  const result = selectDashboardVideos(items, 'space telescope', ['JWST', 'space telescope'], now, 5);
  assert.deepEqual(result.map((item) => item.id), ['relevant-high', 'relevant-low', 'relevant-no-count']);
});

void test('dashboard video feed retains old-fetched metadata but excludes stale publications', () => {
  const fresh = video('fresh', 'JWST observation', 100);
  const olderStored = video('older-stored', 'JWST observation retained locally', 5000, now - 120 * 86400000);
  const stalePublished = { ...video('stale-publication', 'JWST archived observation', 9000), publishedAt: '2026-08-01T12:00:00Z' };
  assert.deepEqual(selectDashboardVideos([stalePublished, olderStored, fresh], 'JWST', ['JWST'], now, 5).map((item) => item.id), ['older-stored', 'fresh']);
  assert.deepEqual(selectDashboardVideos([fresh], 'Mars', ['Mars'], now, 5), []);
  assert.deepEqual(selectDashboardVideos([], 'JWST', ['JWST'], now, 5), []);
});

void test('live free-model selection falls back from a stale saved model and preserves a live choice', () => {
  const models = [{ id: 'provider/current-free' }, { id: 'provider/second-free' }];
  assert.equal(selectFreeModel(models, 'provider/removed-model'), 'provider/current-free');
  assert.equal(selectFreeModel(models, 'provider/second-free'), 'provider/second-free');
  assert.equal(selectFreeModel([], 'provider/removed-model'), '');
});

void test('persisted second-opinion cache is reused only for the exact model and evidence fingerprint', () => {
  const model = 'provider/current-free';
  const prompt = 'Processed editorial topic and evidence aggregates';
  const fingerprint = 'evidence-abc';
  const cached: Opinion = {
    id: 'opinion-1',
    ideaId: engineReviewCacheKey(model, prompt, fingerprint),
    text: 'Cached review',
    model,
    createdAt: now,
  };
  assert.equal(findCachedEngineReview([cached], model, prompt, fingerprint)?.text, 'Cached review');
  assert.equal(findCachedEngineReview([cached], 'provider/other-free', prompt, fingerprint), undefined);
  assert.equal(findCachedEngineReview([cached], model, prompt, 'evidence-new'), undefined);
});


void test('OpenRouter serializes generation and releases its lock after a failed preflight', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'A single mocked review.' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const first = getOpinion('test-key', 'provider/free-model', 'approved aggregate prompt', async () => {
    await gate;
  }, fetcher);
  await assert.rejects(
    getOpinion('test-key', 'provider/free-model', 'duplicate prompt', undefined, fetcher),
    /Another OpenRouter analysis is already running/,
  );
  release();
  assert.equal(await first, 'A single mocked review.');
  assert.equal(calls, 1);

  await assert.rejects(
    getOpinion('test-key', 'provider/free-model', 'preflight failure', async () => {
      throw new Error('mock quota preflight failure');
    }, fetcher),
    /mock quota preflight failure/,
  );
  assert.equal(await getOpinion('test-key', 'provider/free-model', 'retry after failure', undefined, fetcher), 'A single mocked review.');
  assert.equal(calls, 2);
});


void test('Space Radar shares one in-flight refresh and unlocks the next attempt after failure', async () => {
  const slot: { current: Promise<string> | null } = { current: null };
  let release!: (value: string) => void;
  const gate = new Promise<string>((resolve) => { release = resolve; });
  let calls = 0;
  const refresh = async () => {
    calls += 1;
    return gate;
  };

  const first = runSingleFlight(slot, refresh);
  const concurrent = runSingleFlight(slot, refresh);
  assert.strictEqual(concurrent, first);
  await Promise.resolve();
  assert.equal(calls, 1);
  release('scan complete');
  assert.equal(await first, 'scan complete');
  assert.equal(slot.current, null);

  await assert.rejects(
    runSingleFlight(slot, async () => { throw new Error('mock feed failure'); }),
    /mock feed failure/,
  );
  assert.equal(slot.current, null);
});
