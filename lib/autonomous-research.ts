import { fetchSpaceNews, buildDiscoveryOpportunities } from './space';
import { useScout } from './store';
import { getKey } from './vault';
import { searchYouTubeSample } from './api';
import { uid } from './types';
import { selectIdeaGenerationVideos } from './idea-generation';
import {
  autonomousPublisherPriority,
  autonomousYouTubePriority,
  autonomousDiscoveryTopics,
  buildAutonomousResearchInput,
  isAutonomousYouTubeDiscoveryDue,
  selectedAutonomousNicheTopic,
  AUTONOMOUS_YOUTUBE_DISCOVERY_INTERVAL_MS,
} from './autonomous-policy';
import { MAX_CONCURRENT_RESEARCH_RUNS } from './research-concurrency';
import {
  enqueueAutonomousCandidates,
  loadAutonomousQueue,
  nextAutonomousJob,
  saveAutonomousQueue,
  updateAutonomousJob,
  type AutonomousResearchCandidate,
} from './autonomous-queue';
import type { Video } from './types';

const INITIAL_FOREGROUND_IDLE_MS = 4_000;
const FOREGROUND_IDLE_MS = 20_000;
const DISCOVERY_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const AUTONOMOUS_QUEUE_MAX_AGE_MS = DISCOVERY_AGE_MS;
const NICHE_YOUTUBE_DISCOVERY_INTERVAL_MS = AUTONOMOUS_YOUTUBE_DISCOVERY_INTERVAL_MS;
let active = false;
let tickInProgress = false;
let timer: ReturnType<typeof setTimeout> | undefined;

const selectedNicheTopic = selectedAutonomousNicheTopic;
const baseInput = buildAutonomousResearchInput;

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
    .map((item) => ({
        topic: item.topic,
        input: { ...baseInput(preferences), topic: item.topic },
        source: 'publisher',
        sourceId: item.id,
        sourceUrl: item.sourceUrl,
        publishedAt: item.publishedAt,
        priority: autonomousPublisherPriority(item.publishedAt, item.sourceCount, now),
      }));
}

function buildYouTubeCandidates(
  videos: readonly Video[],
  preferences: ReturnType<typeof useScout.getState>['data']['preferences'],
  now: number,
  parentTopic: string,
): AutonomousResearchCandidate[] {
  const currentVideos = videos.filter((video) => {
    const published = Date.parse(video.publishedAt);
    return Number.isFinite(published) && published <= now + 60 * 60 * 1000 &&
      now - published <= DISCOVERY_AGE_MS;
  });
  const relevantVideos = selectIdeaGenerationVideos(parentTopic, currentVideos.map((video) => ({
    id: video.id,
    title: video.title,
    description: video.description,
    channel: video.channel,
    publishedAt: video.publishedAt,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    growth: video.growth,
    thumbnailUrl: video.thumbnail,
  })));
  return [...relevantVideos]
    .filter((video) => video.title.trim() && video.title.trim().toLowerCase() !== parentTopic.trim().toLowerCase())
    .sort((a, b) => {
      const aRate = a.growth?.status === 'measured' ? a.growth.viewsPerHour ?? -1 : -1;
      const bRate = b.growth?.status === 'measured' ? b.growth.viewsPerHour ?? -1 : -1;
      const aOutlier = a.growth?.status === 'measured' ? a.growth.channelOutlierRatio ?? -1 : -1;
      const bOutlier = b.growth?.status === 'measured' ? b.growth.channelOutlierRatio ?? -1 : -1;
      return bRate - aRate || bOutlier - aOutlier ||
        (b.viewCount ?? -1) - (a.viewCount ?? -1) ||
        Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? '');
    })
    .slice(0, 5)
    .map((video) => ({
      topic: video.title,
      input: { ...baseInput(preferences), topic: video.title },
      source: 'youtube',
      sourceId: video.id + ':' + Math.floor((video.growth?.measuredAt ?? now) / NICHE_YOUTUBE_DISCOVERY_INTERVAL_MS),
      sourceUrl: 'https://www.youtube.com/watch?v=' + video.id,
      publishedAt: video.publishedAt,
      priority: autonomousYouTubePriority(video),
    }));
}

async function discoverYouTubeTopics(): Promise<void> {
  const initial = useScout.getState();
  if (!initial.ready) return;
  const preferences = initial.data.preferences;
  const now = Date.now();
  let queue = await loadAutonomousQueue();
  if (!isAutonomousYouTubeDiscoveryDue(queue.lastYouTubeDiscoveryAt, now)) return;

  // Persist before networking. A failed run is moved to a short, bounded retry
  // window below; successful discovery keeps the six-hour cadence.
  queue = { ...queue, lastYouTubeDiscoveryAt: now };
  await saveAutonomousQueue(queue);

  const input = baseInput(preferences);
  const startedAt = Date.now();
  const videosById = new Map<string, Video>();
  let candidateCount = 0;
  const warnings: string[] = [];
  let missingKey = false;
  try {
    const key = await getKey('youtube').catch(() => undefined);
    if (!key) {
      missingKey = true;
      warnings.push('Autonomous YouTube discovery needs a saved YouTube Data API key. The durable research queue is preserved and discovery will retry after the key is configured.');
    } else {
      // Three search intents are rotated every six hours: the selected niche plus
      // two broad categories. Each intent samples YouTube's official views,
      // newest-first and relevance lanes; it is not a complete trending census.
      for (const discoveryTopic of autonomousDiscoveryTopics(preferences, now)) {
        try {
          const sample = await searchYouTubeSample(discoveryTopic, {
            key,
            origin: 'automatic',
            charge: (units, kind = 'other') => useScout.getState().charge(units, kind, 'automatic'),
            onQuota: (kind) => useScout.getState().commit((data) => ({
              ...data,
              budget: {
                ...data.budget,
                ...(kind === 'search' ? { searchExhausted: true } : { otherExhausted: true }),
              },
            })),
          }, 12, {
            days: 7,
            order: 'discovery',
            region: input.region,
            language: input.languages[0] ?? 'en',
          });
          if (sample.warning) warnings.push(discoveryTopic + ': ' + sample.warning);
          if (!sample.videos.length) continue;
          const fetchedAt = Date.now();
          const persisted = await useScout.getState().saveYouTubeSample(sample.videos.map((video) => ({
            id: video.id,
            title: video.title,
            description: video.description,
            channel: video.channel,
            thumbnail: video.thumbnailUrl,
            publishedAt: video.publishedAt,
            fetchedAt,
            query: discoveryTopic,
            viewCount: video.viewCount,
            likeCount: video.likeCount,
            commentCount: null,
            channelId: video.channelId,
          })));
          for (const video of persisted) videosById.set(video.id, video);
          const candidates = buildYouTubeCandidates(persisted, preferences, Date.now(), discoveryTopic);
          candidateCount += candidates.length;
          queue = await loadAutonomousQueue();
          queue = enqueueAutonomousCandidates(queue, candidates, Date.now());
          await saveAutonomousQueue(queue);
        } catch (error) {
          warnings.push(discoveryTopic + ': ' + (error instanceof Error ? error.message : 'YouTube discovery failed.'));
          if (error instanceof Error && /quota|allowance|budget/i.test(error.message)) break;
        }
      }
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'Autonomous YouTube discovery failed.');
  }

  const videos = [...videosById.values()];
  const warning = warnings.join(' · ');
  const completedAt = Date.now();
  if (!videos.length && warning) {
    const retryDelay = missingKey ? 60 * 60 * 1000 : /quota|allowance|budget/i.test(warning)
      ? AUTONOMOUS_YOUTUBE_DISCOVERY_INTERVAL_MS
      : 15 * 60 * 1000;
    queue = await loadAutonomousQueue();
    await saveAutonomousQueue({
      ...queue,
      // Preserve six-hour successful cadence while retrying recoverable failures sooner.
      lastYouTubeDiscoveryAt: now - AUTONOMOUS_YOUTUBE_DISCOVERY_INTERVAL_MS + retryDelay,
    });
  }
  await useScout.getState().recordResearchActivity({
    id: uid(),
    engine: 'YouTube Data API',
    query: 'Autonomous multi-topic YouTube discovery · ' + autonomousDiscoveryTopics(preferences, now).join(' / ') + ' · last 7 days · discovery mix',
    topic: input.topic,
    niche: preferences.selectedSpaceNiche === 'custom'
      ? preferences.customSpaceNiche.trim() || input.topic
      : preferences.selectedSpaceNiche,
    startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - startedAt),
    status: videos.length ? (warning ? 'partial' : 'success') : warning ? 'skipped' : 'empty',
    resultCount: videos.length,
    analyzedCount: candidateCount,
    results: [],
    warnings: warning ? [warning.slice(0, 700)] : [],
  }).catch(() => undefined);
}

async function discoverFreshTopics(): Promise<void> {
  const state = useScout.getState();
  const preferences = state.data.preferences;
  const now = Date.now();
  await discoverYouTubeTopics();
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
    const failedAttempts = job.attempts + 1;
    const retryDelay = Math.min(6 * 60 * 60 * 1000, 15 * 60 * 1000 * 2 ** Math.min(5, failedAttempts - 1));
    queue = updateAutonomousJob(queue, job.id, {
      // Failed items remain retryable indefinitely with capped exponential backoff.
      status: failedAttempts >= 8 ? 'failed' : 'queued',
      retryAt: Date.now() + retryDelay,
      lastError: useScout.getState().error.slice(0, 300) || 'Research did not produce a completed report.',
    });
  }
  await saveAutonomousQueue(queue);
  return Boolean(report);
}

export async function runAutonomousResearchCycle(maxJobs = 1): Promise<number> {
  if (tickInProgress) return 0;
  tickInProgress = true;
  let processedCount = 0;
  try {
    const state = useScout.getState();
    const preferences = state.data.preferences;
    if (!state.ready || preferences.paused) return 0;

    // Source precedence is intentional: fresh YouTube discovery is always first.
    await discoverFreshTopics();
    const maximum = Math.max(1, Math.min(2, Math.floor(maxJobs) || 1));
    while (processedCount < maximum && useScout.getState().activeResearchRuns < MAX_CONCURRENT_RESEARCH_RUNS) {
      if (!(await processNextJob())) break;
      processedCount += 1;
    }
    if (!processedCount && useScout.getState().activeResearchRuns < MAX_CONCURRENT_RESEARCH_RUNS) {
      const recoveryQueue = await loadAutonomousQueue();
      await useScout.getState().resumePendingResearch({
        maxAgeMs: AUTONOMOUS_QUEUE_MAX_AGE_MS,
        excludeIds: recoveryQueue.jobs.filter((item) => item.status !== 'completed').map((item) => item.id),
      });
    }
    return processedCount;
  } finally {
    tickInProgress = false;
  }
}

async function tick(): Promise<void> {
  if (!active) return;
  try {
    await runAutonomousResearchCycle(1);
  } catch {
    // The next foreground cycle retries from its durable queue/checkpoint state.
  } finally {
    if (active) timer = setTimeout(() => void tick(), FOREGROUND_IDLE_MS);
  }
}

export function startAutonomousResearch(): () => void {
  if (timer) clearTimeout(timer);
  active = true;
  // Let the first screen paint and accept input before starting network discovery
  // and snapshot persistence. Foreground autonomy remains continuous afterwards.
  timer = setTimeout(() => {
    if (active) void tick();
  }, INITIAL_FOREGROUND_IDLE_MS);
  return () => stopAutonomousResearch();
}

export function stopAutonomousResearch(): void {
  active = false;
  if (timer) clearTimeout(timer);
  timer = undefined;
}
