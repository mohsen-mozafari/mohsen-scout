import { fetchSpaceNews, buildDiscoveryOpportunities, SPACE_NICHES } from './space';
import { getKey } from './vault';
import { useScout } from './store';
import { availableResearchRunSlots } from './research-concurrency';
import {
  enqueueAutonomousCandidates,
  loadAutonomousQueue,
  nextAutonomousJob,
  saveAutonomousQueue,
  updateAutonomousJob,
  type AutonomousResearchCandidate,
  type AutonomousResearchJob,
} from './autonomous-queue';
import type { ResearchInput, Video } from './types';

const FOREGROUND_IDLE_MS = 20_000;
const DISCOVERY_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const NICHE_YOUTUBE_DISCOVERY_INTERVAL_MS = 6 * 60 * 60 * 1000;
let active = false;
let tickInProgress = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function selectedNicheTopic(preferences: ReturnType<typeof useScout.getState>['data']['preferences']): string {
  if (preferences.selectedSpaceNiche === 'custom') return preferences.customSpaceNiche.trim();
  const niche = SPACE_NICHES.find((item) => item.id === preferences.selectedSpaceNiche);
  if (niche) return niche.topic;
  return preferences.lastInput?.topic ?? 'space science and exploration';
}

function baseInput(preferences: ReturnType<typeof useScout.getState>['data']['preferences']): ResearchInput {
  const topic = selectedNicheTopic(preferences) || preferences.lastInput?.topic || 'space science and exploration';
  return {
    ...(preferences.lastInput ?? {
      topic,
      region: preferences.region,
      languages: [...preferences.languages],
      days: 7,
      duration: 'any' as const,
      category: '',
      maxResults: 25,
    }),
    topic,
    region: preferences.region,
    languages: [...preferences.languages],
    days: 7,
    maxResults: 25,
  };
}

function buildPublisherCandidates(
  items: Awaited<ReturnType<typeof fetchSpaceNews>>['items'],
  preferences: ReturnType<typeof useScout.getState>['data']['preferences'],
  now: number,
): AutonomousResearchCandidate[] {
  const nicheId = preferences.selectedSpaceNiche === 'custom' ? 'custom' :
    preferences.selectedSpaceNiche === 'all' ? 'all' : preferences.selectedSpaceNiche;
  const opportunities = buildDiscoveryOpportunities(items, nicheId, now, preferences.customSpaceNiche);
  return opportunities
    .filter((item) => {
      if (!item.publishedAt) return false;
      const publishedAt = Date.parse(item.publishedAt);
      return Number.isFinite(publishedAt) && publishedAt <= now + 60 * 60 * 1000 &&
        now - publishedAt <= DISCOVERY_AGE_MS;
    })
    .sort((a, b) => (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0))
    .slice(0, 12)
    .map((item) => {
      const ageHours = Math.max(0, (now - (Date.parse(item.publishedAt ?? '') || now)) / 3600000);
      return {
        topic: item.topic,
        input: { ...baseInput(preferences), topic: item.topic },
        source: 'publisher',
        sourceId: item.id,
        sourceUrl: item.sourceUrl,
        publishedAt: item.publishedAt,
        priority: Math.max(0, 100 - ageHours * 2) + (item.sourceCount > 1 ? 5 : 0),
      };
    });
}

function buildYouTubeCandidates(
  videos: readonly Video[],
  preferences: ReturnType<typeof useScout.getState>['data']['preferences'],
  now: number,
  parentTopic: string,
): AutonomousResearchCandidate[] {
  return videos
    .filter((video) => {
      const published = Date.parse(video.publishedAt);
      return Number.isFinite(published) && published <= now + 60 * 60 * 1000 &&
        now - published <= DISCOVERY_AGE_MS;
    })
    .sort((a, b) => {
      const publicationOrder = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      if (publicationOrder !== 0) return publicationOrder;
      const aRate = a.growth?.status === 'measured' ? a.growth.viewsPerHour : null;
      const bRate = b.growth?.status === 'measured' ? b.growth.viewsPerHour : null;
      if (aRate !== null && bRate !== null) return (bRate ?? 0) - (aRate ?? 0);
      if (aRate !== null) return -1;
      if (bRate !== null) return 1;
      return (b.viewCount ?? 0) - (a.viewCount ?? 0);
    })
    .slice(0, 5)
    .filter((video) => video.title.trim() && video.title.trim().toLowerCase() !== parentTopic.trim().toLowerCase())
    .map((video) => ({
      topic: video.title,
      input: { ...baseInput(preferences), topic: video.title },
      source: 'youtube',
      sourceId: video.id + ':' + Math.floor((video.growth?.measuredAt ?? now) / NICHE_YOUTUBE_DISCOVERY_INTERVAL_MS),
      sourceUrl: 'https://www.youtube.com/watch?v=' + video.id,
      publishedAt: video.publishedAt,
      priority: 45 + Math.min(50, Math.log10(1 + Math.max(0, video.growth?.viewsPerHour ?? 0)) * 16),
    }));
}

let queueMutationQueue = Promise.resolve();
const inFlightJobIds = new Set<string>();

function withQueueMutation<T>(work: () => Promise<T>): Promise<T> {
  const action = queueMutationQueue.then(work, work);
  queueMutationQueue = action.then(() => undefined, () => undefined);
  return action;
}

async function discoverFreshTopics(): Promise<void> {
  const state = useScout.getState();
  const preferences = state.data.preferences;
  const now = Date.now();
  let candidates: AutonomousResearchCandidate[] = [];
  try {
    const result = await fetchSpaceNews(preferences.spaceNewsSources);
    if (result.registry.length) {
      await state.commit((data) => ({ ...data, feedRegistry: result.registry }));
    }
    candidates = buildPublisherCandidates(result.items, preferences, now);
  } catch {
    // Keep the last successful feed registry and the already persisted queue.
  }

  await withQueueMutation(async () => {
    let queue = await loadAutonomousQueue();
    queue = enqueueAutonomousCandidates(queue, candidates, now);
    if (now - queue.lastNicheSeedAt >= NICHE_YOUTUBE_DISCOVERY_INTERVAL_MS) {
      const topic = selectedNicheTopic(preferences);
      if (topic) {
        const seed: AutonomousResearchCandidate = {
          topic,
          input: { ...baseInput(preferences), topic },
          source: 'niche-seed',
          sourceId: 'niche:' + (preferences.selectedSpaceNiche || topic) + ':' + Math.floor(now / NICHE_YOUTUBE_DISCOVERY_INTERVAL_MS),
          priority: -10,
        };
        queue = enqueueAutonomousCandidates(queue, [seed], now);
        queue = { ...queue, lastNicheSeedAt: now };
      }
    }
    await saveAutonomousQueue(queue);
  });
}

async function settleAutonomousJob(
  job: AutonomousResearchJob,
  report: Awaited<ReturnType<ReturnType<typeof useScout.getState>['research']>>,
  failure?: unknown,
): Promise<void> {
  await withQueueMutation(async () => {
    let queue = await loadAutonomousQueue();
    if (report) {
      queue = updateAutonomousJob(queue, job.id, {
        status: 'completed',
        completedAt: Date.now(),
        lastError: undefined,
      });
      const candidates = buildYouTubeCandidates(
        report.videos,
        useScout.getState().data.preferences,
        Date.now(),
        job.topic,
      );
      queue = enqueueAutonomousCandidates(queue, candidates);
    } else {
      const attempt = job.attempts + 1;
      const retryDelayMs = Math.min(6 * 60 * 60 * 1000, 15 * 60 * 1000 * (2 ** Math.min(attempt, 4)));
      const errorText = failure instanceof Error
        ? failure.message
        : useScout.getState().error || 'Research did not produce a completed report.';
      queue = updateAutonomousJob(queue, job.id, {
        status: 'queued',
        retryAt: Date.now() + retryDelayMs,
        lastError: errorText.slice(0, 300),
      });
    }
    await saveAutonomousQueue(queue);
  });
}

/** Launches one independent job and returns immediately; the foreground loop keeps discovering. */
async function processNextJob(): Promise<boolean> {
  if (availableResearchRunSlots(useScout.getState().activeResearchRuns) <= 0) return false;
  const job = await withQueueMutation(async () => {
    let queue = await loadAutonomousQueue();
    const next = nextAutonomousJob(queue);
    if (!next) return undefined;
    queue = updateAutonomousJob(queue, next.id, {
      status: 'running',
      startedAt: Date.now(),
      attempts: next.attempts + 1,
      lastError: undefined,
    });
    await saveAutonomousQueue(queue);
    return next;
  });
  if (!job) return false;

  inFlightJobIds.add(job.id);
  const researchPromise = useScout.getState().research(job.input, 'automatic', true, undefined, job.id);
  void researchPromise
    .then((report) => settleAutonomousJob(job, report))
    .catch((error: unknown) => settleAutonomousJob(job, undefined, error))
    .finally(() => inFlightJobIds.delete(job.id));
  return true;
}

async function recoverInterruptedAutonomousJobs(): Promise<void> {
  await withQueueMutation(async () => {
    const queue = await loadAutonomousQueue();
    const recovered = {
      ...queue,
      jobs: queue.jobs.map((job) =>
        job.status === 'running' && !inFlightJobIds.has(job.id)
          ? { ...job, status: 'queued' as const, startedAt: undefined }
          : job,
      ),
    };
    await saveAutonomousQueue(recovered);
  });
}

async function tick(): Promise<void> {
  if (!active || tickInProgress) return;
  tickInProgress = true;
  try {
    const state = useScout.getState();
    const preferences = state.data.preferences;
    if (!state.ready || preferences.paused) return;
    const youtubeKey = await getKey('youtube').catch(() => undefined);
    if (!youtubeKey) return;
    await discoverFreshTopics();
    const launched = await processNextJob();
    if (!launched && availableResearchRunSlots(useScout.getState().activeResearchRuns) > 0) {
      // Fresh discovery always runs first. Recent interrupted tasks are resumed only when no new topic is ready.
      const recoveryQueue = await withQueueMutation(() => loadAutonomousQueue());
      void useScout.getState().resumePendingResearch({
        maxAgeMs: AUTONOMOUS_QUEUE_MAX_AGE_MS,
        excludeIds: recoveryQueue.jobs.filter((item) => item.status !== 'completed').map((item) => item.id),
      }).catch(() => {});
    }
  } catch {
    // The next foreground cycle retries from its durable queue/checkpoint state.
  } finally {
    tickInProgress = false;
    if (active) timer = setTimeout(() => void tick(), FOREGROUND_IDLE_MS);
  }
}

export function startAutonomousResearch(): () => void {
  if (timer) clearTimeout(timer);
  active = true;
  void recoverInterruptedAutonomousJobs().then(() => {
    if (active) void tick();
  }).catch(() => {
    if (active) void tick();
  });
  return () => stopAutonomousResearch();
}

export function stopAutonomousResearch(): void {
  active = false;
  if (timer) clearTimeout(timer);
  timer = undefined;
}
