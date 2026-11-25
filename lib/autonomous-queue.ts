import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ResearchInput } from './types';
import { uid } from './types';
import { normalizeResearchText } from './intelligence';

const KEY = 'mohsen-scout.autonomous-research-queue.v1';
export const AUTONOMOUS_QUEUE_LIMIT = 250;
export const AUTONOMOUS_QUEUE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
export const AUTONOMOUS_SEEN_LIMIT = 5000;

export type AutonomousResearchSource = 'publisher' | 'youtube' | 'niche-seed' | 'recovery';
export type AutonomousResearchStatus = 'queued' | 'running' | 'completed' | 'failed';
export type AutonomousResearchJob = {
  id: string;
  topic: string;
  input: ResearchInput;
  source: AutonomousResearchSource;
  sourceId: string;
  sourceUrl?: string;
  publishedAt?: string | null;
  discoveredAt: number;
  priority: number;
  attempts: number;
  status: AutonomousResearchStatus;
  startedAt?: number;
  completedAt?: number;
  retryAt?: number;
  lastError?: string;
  /** Persisted marker for work interrupted by process death or app suspension. */
  recoveredFromInterruption?: boolean;
};
export type AutonomousResearchQueue = {
  version: 1;
  jobs: AutonomousResearchJob[];
  seenKeys: { key: string; seenAt: number }[];
  lastNicheSeedAt: number;
  /** Last attempted YouTube-first autonomous niche discovery, persisted to avoid quota loops. */
  lastYouTubeDiscoveryAt: number;
};

export type AutonomousResearchCandidate = Omit<AutonomousResearchJob,
  'id' | 'discoveredAt' | 'attempts' | 'status'>;

export function emptyAutonomousQueue(): AutonomousResearchQueue {
  return { version: 1, jobs: [], seenKeys: [], lastNicheSeedAt: 0, lastYouTubeDiscoveryAt: 0 };
}

function validInput(value: unknown): value is ResearchInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.topic === 'string' && Boolean(item.topic.trim()) &&
    typeof item.region === 'string' && Array.isArray(item.languages) &&
    item.languages.length > 0 && typeof item.days === 'number' &&
    typeof item.duration === 'string' && typeof item.category === 'string' &&
    typeof item.maxResults === 'number';
}

function validJob(value: unknown): value is AutonomousResearchJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && Boolean(item.id) &&
    typeof item.topic === 'string' && Boolean(item.topic.trim()) &&
    validInput(item.input) &&
    ['publisher', 'youtube', 'niche-seed', 'recovery'].includes(String(item.source)) &&
    typeof item.sourceId === 'string' && typeof item.discoveredAt === 'number' &&
    Number.isFinite(item.discoveredAt) && typeof item.priority === 'number' &&
    Number.isFinite(item.priority) && typeof item.attempts === 'number' &&
    ['queued', 'running', 'completed', 'failed'].includes(String(item.status)) &&
    (item.recoveredFromInterruption === undefined || typeof item.recoveredFromInterruption === 'boolean');
}

function sourceKey(candidate: Pick<AutonomousResearchCandidate, 'source' | 'sourceId' | 'topic'>): string {
  const identity = candidate.sourceId.trim() || normalizeResearchText(candidate.topic);
  return candidate.source + ':' + identity;
}

export function normalizeAutonomousQueue(
  value: unknown,
  now = Date.now(),
): AutonomousResearchQueue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyAutonomousQueue();
  const item = value as Record<string, unknown>;
  const rawJobs = Array.isArray(item.jobs) ? item.jobs.filter(validJob) : [];
  const jobs = rawJobs
    .map((job) => job.status === 'running'
      ? { ...job, status: 'queued' as const, recoveredFromInterruption: true, priority: Math.max(180, job.priority) }
      : job.status === 'failed'
        ? { ...job, recoveredFromInterruption: true, priority: Math.max(160, job.priority) }
        : job)
    .filter((job) => job.status === 'completed' || job.recoveredFromInterruption === true || now - job.discoveredAt <= AUTONOMOUS_QUEUE_MAX_AGE_MS);
  const seenKeys = Array.isArray(item.seenKeys)
    ? item.seenKeys.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const candidate = entry as Record<string, unknown>;
      return typeof candidate.key === 'string' && typeof candidate.seenAt === 'number'
        ? [{ key: candidate.key, seenAt: candidate.seenAt }]
        : [];
    }).slice(-AUTONOMOUS_SEEN_LIMIT)
    : [];
  return {
    version: 1,
    jobs: [
      ...jobs.filter((job) => job.status !== 'completed').slice(0, AUTONOMOUS_QUEUE_LIMIT),
      ...jobs.filter((job) => job.status === 'completed').slice(-100),
    ],
    seenKeys,
    lastNicheSeedAt: typeof item.lastNicheSeedAt === 'number' ? item.lastNicheSeedAt : 0,
    lastYouTubeDiscoveryAt: typeof item.lastYouTubeDiscoveryAt === 'number' && Number.isFinite(item.lastYouTubeDiscoveryAt)
      ? item.lastYouTubeDiscoveryAt : 0,
  };
}

export async function loadAutonomousQueue(): Promise<AutonomousResearchQueue> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyAutonomousQueue();
    const normalized = normalizeAutonomousQueue(JSON.parse(raw));
    await saveAutonomousQueue(normalized);
    return normalized;
  } catch {
    return emptyAutonomousQueue();
  }
}

export async function saveAutonomousQueue(queue: AutonomousResearchQueue): Promise<void> {
  const normalized = normalizeAutonomousQueue(queue);
  await AsyncStorage.setItem(KEY, JSON.stringify(normalized));
}

export function enqueueAutonomousCandidates(
  queue: AutonomousResearchQueue,
  candidates: readonly AutonomousResearchCandidate[],
  now = Date.now(),
): AutonomousResearchQueue {
  const seen = new Set(queue.seenKeys.map((item) => item.key));
  const topicKeys = new Set(queue.jobs
    .filter((item) => item.status !== 'completed' && item.status !== 'failed')
    .map((item) => normalizeResearchText(item.topic)));
  const jobs = [...queue.jobs];
  const seenKeys = [...queue.seenKeys];
  for (const candidate of candidates) {
    const topic = candidate.topic.trim().replace(/\s+/g, ' ').slice(0, 180);
    const key = sourceKey({ ...candidate, topic });
    const topicKey = normalizeResearchText(topic);
    if (!topicKey || seen.has(key) || topicKeys.has(topicKey)) continue;
    const job: AutonomousResearchJob = {
      ...candidate,
      topic,
      id: uid(),
      discoveredAt: now,
      attempts: 0,
      status: 'queued',
      ...(candidate.publishedAt ? { publishedAt: candidate.publishedAt } : {}),
    };
    jobs.push(job);
    seen.add(key);
    topicKeys.add(topicKey);
    seenKeys.push({ key, seenAt: now });
  }
  return {
    ...queue,
    jobs: jobs
      .filter((job) => job.status === 'completed' || job.recoveredFromInterruption === true || now - job.discoveredAt <= AUTONOMOUS_QUEUE_MAX_AGE_MS)
      .sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (b.status === 'completed' && a.status !== 'completed') return -1;
        const recovered = Number(Boolean(b.recoveredFromInterruption)) - Number(Boolean(a.recoveredFromInterruption));
        if (recovered) return recovered;
        const aDate = a.publishedAt ? Date.parse(a.publishedAt) || 0 : 0;
        const bDate = b.publishedAt ? Date.parse(b.publishedAt) || 0 : 0;
        return b.priority - a.priority || bDate - aDate || b.discoveredAt - a.discoveredAt;
      })
      .slice(0, AUTONOMOUS_QUEUE_LIMIT + 100),
    seenKeys: seenKeys.slice(-AUTONOMOUS_SEEN_LIMIT),
  };
}

export function updateAutonomousJob(
  queue: AutonomousResearchQueue,
  id: string,
  patch: Partial<Pick<AutonomousResearchJob,
    'status' | 'attempts' | 'startedAt' | 'completedAt' | 'retryAt' | 'lastError'>>,
): AutonomousResearchQueue {
  return {
    ...queue,
    jobs: queue.jobs.map((job) => job.id === id ? { ...job, ...patch } : job),
  };
}

export function nextAutonomousJob(
  queue: AutonomousResearchQueue,
  now = Date.now(),
): AutonomousResearchJob | undefined {
  return queue.jobs
    .filter((job) => (job.status === 'queued' || job.status === 'failed') && (!job.retryAt || job.retryAt <= now))
    .filter((job) => job.recoveredFromInterruption === true || now - job.discoveredAt <= AUTONOMOUS_QUEUE_MAX_AGE_MS)
    .sort((a, b) => {
      const recovered = Number(Boolean(b.recoveredFromInterruption)) - Number(Boolean(a.recoveredFromInterruption));
      if (recovered) return recovered;
      const aDate = a.publishedAt ? Date.parse(a.publishedAt) || 0 : 0;
      const bDate = b.publishedAt ? Date.parse(b.publishedAt) || 0 : 0;
      return b.priority - a.priority || bDate - aDate || b.discoveredAt - a.discoveredAt;
    })[0];
}
