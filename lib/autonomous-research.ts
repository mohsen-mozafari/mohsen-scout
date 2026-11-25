import { fetchSpaceNews, buildDiscoveryOpportunities, SPACE_NICHES } from './space';
import { useScout } from './store';
import { MAX_CONCURRENT_RESEARCH_RUNS } from './research-concurrency';
import {
  enqueueAutonomousCandidates,
  loadAutonomousQueue,
  nextAutonomousJob,
  saveAutonomousQueue,
  updateAutonomousJob,
  type AutonomousResearchCandidate,
} from './autonomous-queue';
import type { ResearchInput, Video } from './types';

const FOREGROUND_IDLE_MS = 20_000;
const DISCOVERY_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const AUTONOMOUS_QUEUE_MAX_AGE_MS = DISCOVERY_AGE_MS;
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
    .sort((a, b) =>
      (b.growth?.viewsPerHour ?? b.viewCount ?? 0) - (a.growth?.viewsPerHour ?? a.viewCount ?? 0) ||
      Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    )
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

async function discoverFreshTopics(): Promise<void> {
  const state = useScout.getState();
  const preferences = state.data.preferences;
  const now = Date.now();
  let queue = await loadAutonomousQueue();
  try {
    const result = await fetchSpaceNews(preferences.spaceNewsSources);
    if (result.registry.length) {
      await state.commit((data) => ({ ...data, feedRegistry: result.registry }));
    }
    queue = enqueueAutonomousCandidates(queue, buildPublisherCandidates(result.items, preferences, now), now);
  } catch {
    // Keep the last successful feed registry and the already persisted queue.
  }
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
}

async function processNextJob(): Promise<boolean> {
  const state = useScout.getState();
  if (!state.ready || state.activeResearchRuns >= MAX_CONCURRENT_RESEARCH_RUNS) return false;
  let queue = await loadAutonomousQueue();
  const job = nextAutonomousJob(queue);
  if (!job) return false;
  queue = updateAutonomousJob(queue, job.id, {
    status: 'running',
    startedAt: Date.now(),
    attempts: job.attempts + 1,
    lastError: undefined,
  });
  await saveAutonomousQueue(queue);
  const current = useScout.getState();
  const report = await current.research(job.input, 'automatic', true, undefined, job.id);
  queue = await loadAutonomousQueue();
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
    const retryable = job.attempts < 2;
    queue = updateAutonomousJob(queue, job.id, {
      status: retryable ? 'queued' : 'failed',
      retryAt: retryable ? Date.now() + 15 * 60 * 1000 : undefined,
      lastError: useScout.getState().error.slice(0, 300) || 'Research did not produce a completed report.',
    });
  }
  await saveAutonomousQueue(queue);
  return true;
}

async function tick(): Promise<void> {
  if (!active || tickInProgress) return;
  tickInProgress = true;
  try {
    const state = useScout.getState();
    const preferences = state.data.preferences;
    if (!state.ready || preferences.paused) return;
    // Foreground autonomy is independent of the optional background schedule.
    // A missing YouTube key must not block fresh publisher discovery or recovery;
    // YouTube collection itself reports its own missing-key state in the research run.
    await discoverFreshTopics();
    const processed = await processNextJob();
    if (!processed && useScout.getState().activeResearchRuns < MAX_CONCURRENT_RESEARCH_RUNS) {
      // Recovery runs are deliberately lower priority than newly discovered topics.
      const recoveryQueue = await loadAutonomousQueue();
      await useScout.getState().resumePendingResearch({
        maxAgeMs: AUTONOMOUS_QUEUE_MAX_AGE_MS,
        excludeIds: recoveryQueue.jobs.filter((item) => item.status !== 'completed').map((item) => item.id),
      });
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
  void tick();
  return () => stopAutonomousResearch();
}

export function stopAutonomousResearch(): void {
  active = false;
  if (timer) clearTimeout(timer);
  timer = undefined;
}
