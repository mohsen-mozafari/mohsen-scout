import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ResearchInput } from './types';
import { uid } from './types';
import { normalizeResearchText } from './intelligence';

const KEY = 'mohsen-scout.autonomous-research-queue.v2';
const LEGACY_KEY = 'mohsen-scout.autonomous-research-queue.v1';
export const AUTONOMOUS_QUEUE_VERSION = 2;
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
  version: 2;
  jobs: AutonomousResearchJob[];
  seenKeys: { key: string; seenAt: number }[];
  lastNicheSeedAt: number;
  /** Last attempted YouTube-first autonomous niche discovery, persisted to avoid quota loops. */
  lastYouTubeDiscoveryAt: number;
};

export type AutonomousResearchCandidate = Omit<AutonomousResearchJob,
  'id' | 'discoveredAt' | 'attempts' | 'status'>;

export function emptyAutonomousQueue(): AutonomousResearchQueue {
  return { version: AUTONOMOUS_QUEUE_VERSION, jobs: [], seenKeys: [], lastNicheSeedAt: 0, lastYouTubeDiscoveryAt: 0 };
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


function isFreshDiscovery(job: AutonomousResearchJob, now: number): boolean {
  if (job.recoveredFromInterruption || job.status === 'failed') return false;
  const age = now - job.discoveredAt;
  if (!Number.isFinite(age) || age < -60 * 60 * 1000 || age > AUTONOMOUS_QUEUE_MAX_AGE_MS) return false;
  if (!job.publishedAt) return true;
  const published = Date.parse(job.publishedAt);
  return Number.isFinite(published) && published <= now + 60 * 60 * 1000 && now - published <= 7 * 24 * 60 * 60 * 1000;
}
function compareJobs(a: AutonomousResearchJob, b: AutonomousResearchJob, now: number): number {
  const freshA = isFreshDiscovery(a, now), freshB = isFreshDiscovery(b, now);
  if (freshA !== freshB) return freshA ? -1 : 1;
  if (freshA) {
    const aDate = a.publishedAt ? Date.parse(a.publishedAt) || 0 : 0;
    const bDate = b.publishedAt ? Date.parse(b.publishedAt) || 0 : 0;
    return b.priority - a.priority || bDate - aDate || b.discoveredAt - a.discoveredAt;
  }
  return (a.retryAt ?? 0) - (b.retryAt ?? 0) || b.priority - a.priority || a.attempts - b.attempts;
}
let queueWrites: Promise<unknown> = Promise.resolve();
function serializeQueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = queueWrites.then(operation, operation);
  queueWrites = next.then(() => undefined, () => undefined);
  return next;
}
let queueLoaded = false;
async function readStoredQueue(): Promise<AutonomousResearchQueue> {
  const current = await AsyncStorage.getItem(KEY);
  let value: unknown;
  if (current) {
    try { value = JSON.parse(current); } catch { /* fall through to legacy */ }
  }
  if (value === undefined) {
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy) {
      try { value = JSON.parse(legacy); } catch { /* invalid queue becomes empty */ }
    }
  }
  const queue = value === undefined
    ? emptyAutonomousQueue()
    : normalizeAutonomousQueue(value, Date.now(), !queueLoaded);
  queueLoaded = true;
  return queue;
}
async function persistQueue(queue: AutonomousResearchQueue): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(normalizeAutonomousQueue(queue, Date.now(), false)));
  await AsyncStorage.removeItem(LEGACY_KEY);
  queueLoaded = true;
}

export function normalizeAutonomousQueue(
  value: unknown,
  now = Date.now(),
  recoverRunning = true,
): AutonomousResearchQueue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyAutonomousQueue();
  const item = value as Record<string, unknown>;
  const rawJobs = Array.isArray(item.jobs) ? item.jobs.filter(validJob) : [];
  const jobs = rawJobs
    .map((job) => recoverRunning && job.status === 'running'
      ? { ...job, status: 'queued' as const, recoveredFromInterruption: true, priority: job.priority }
      : job.status === 'failed'
        ? { ...job, recoveredFromInterruption: true, priority: job.priority }
        : job)
    .filter((job) => job.status === 'completed' || job.recoveredFromInterruption === true ||
      (now - job.discoveredAt >= -60 * 60 * 1000 && now - job.discoveredAt <= AUTONOMOUS_QUEUE_MAX_AGE_MS));
  const uniqueJobs = jobs.filter((job, index, all) => all.findIndex((candidate) => candidate.id === job.id) === index);
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
    version: AUTONOMOUS_QUEUE_VERSION,
    jobs: [
      ...uniqueJobs.filter((job) => job.status !== 'completed').slice(0, AUTONOMOUS_QUEUE_LIMIT),
      ...uniqueJobs.filter((job) => job.status === 'completed').slice(-100),
    ],
    seenKeys,
    lastNicheSeedAt: typeof item.lastNicheSeedAt === 'number' ? item.lastNicheSeedAt : 0,
    lastYouTubeDiscoveryAt: typeof item.lastYouTubeDiscoveryAt === 'number' && Number.isFinite(item.lastYouTubeDiscoveryAt)
      ? item.lastYouTubeDiscoveryAt : 0,
  };
}

export function loadAutonomousQueue(): Promise<AutonomousResearchQueue> {
  return serializeQueue(async () => {
    const current = await readStoredQueue();
    await persistQueue(current);
    return current;
  });
}
export function saveAutonomousQueue(queue: AutonomousResearchQueue): Promise<void> {
  return serializeQueue(() => persistQueue(queue));
}
export function updateAutonomousQueue(change: (current: AutonomousResearchQueue) => AutonomousResearchQueue): Promise<AutonomousResearchQueue> {
  return serializeQueue(async () => {
    const current = await readStoredQueue();
    const next = normalizeAutonomousQueue(change(current));
    await persistQueue(next);
    return next;
  });
}

export function enqueueAutonomousCandidates(
  queue: AutonomousResearchQueue,
  candidates: readonly AutonomousResearchCandidate[],
  now = Date.now(),
): AutonomousResearchQueue {
  const seen = new Set(queue.seenKeys.map((item) => item.key));
  const jobs = [...queue.jobs];
  const seenKeys = [...queue.seenKeys];
  for (const candidate of candidates) {
    const topic = candidate.topic.trim().replace(/\s+/g, ' ').slice(0, 180);
    const topicKey = normalizeResearchText(topic);
    if (!topicKey) continue;
    const key = sourceKey({ ...candidate, topic });
    const existingIndex = jobs.findIndex((item) => item.status !== 'completed' && normalizeResearchText(item.topic) === topicKey);
    if (existingIndex >= 0) {
      const existing = jobs[existingIndex]!;
      if (existing.status !== 'running' && (existing.recoveredFromInterruption || existing.status === 'failed' || !isFreshDiscovery(existing, now))) {
        jobs[existingIndex] = { ...existing, ...candidate, topic, id: existing.id, discoveredAt: now, attempts: 0, status: 'queued',
          startedAt: undefined, completedAt: undefined, retryAt: undefined, lastError: undefined, recoveredFromInterruption: false };
        seen.add(key);
        seenKeys.push({ key, seenAt: now });
      }
      continue;
    }
    if (seen.has(key)) continue;
    jobs.push({ ...candidate, topic, id: uid(), discoveredAt: now, attempts: 0, status: 'queued' });
    seen.add(key);
    seenKeys.push({ key, seenAt: now });
  }
  const retained = jobs.filter((job) => job.status === 'completed' || job.recoveredFromInterruption === true ||
      (now - job.discoveredAt >= -60 * 60 * 1000 && now - job.discoveredAt <= AUTONOMOUS_QUEUE_MAX_AGE_MS))
    .sort((a, b) => compareJobs(a, b, now))
    .filter((job, index, all) => all.findIndex((candidate) => candidate.id === job.id) === index);
  return {
    ...queue,
    jobs: [...retained.filter((job) => job.status !== 'completed').slice(0, AUTONOMOUS_QUEUE_LIMIT),
      ...retained.filter((job) => job.status === 'completed').slice(-100)],
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
    .filter((job) => job.recoveredFromInterruption === true ||
      (now - job.discoveredAt >= -60 * 60 * 1000 && now - job.discoveredAt <= AUTONOMOUS_QUEUE_MAX_AGE_MS))
    .sort((a, b) => compareJobs(a, b, now))[0];
}

/** Atomically claim one job before networking to prevent duplicate autonomous starts. */
export function claimNextAutonomousJob(now = Date.now()): Promise<AutonomousResearchJob | undefined> {
  return serializeQueue(async () => {
    const current = await readStoredQueue();
    const next = nextAutonomousJob(current, now);
    if (!next) return undefined;
    const claimed: AutonomousResearchJob = { ...next, status: 'running', startedAt: now, attempts: next.attempts + 1,
      retryAt: undefined, lastError: undefined, recoveredFromInterruption: false };
    await persistQueue({ ...current, jobs: current.jobs.map((job) => job.id === next.id ? claimed : job) });
    return claimed;
  });
}
