export const MAX_CONCURRENT_RESEARCH_RUNS = 2;

export type ResearchPriority = 'manual' | 'automatic';

type QueuedResearchWork<T> = {
  priority: ResearchPriority;
  sequence: number;
  work: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

let manualResearchLeases = 0;
let queueSequence = 0;
let queueRunning = false;
const providerQueue: QueuedResearchWork<unknown>[] = [];

/** A manual run holds this lease for its full lifetime, pausing autonomous discovery. */
export function acquireManualResearchLease(): () => void {
  manualResearchLeases += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    manualResearchLeases = Math.max(0, manualResearchLeases - 1);
  };
}

export function isManualResearchActive(): boolean {
  return manualResearchLeases > 0;
}

export async function withManualResearchLease<T>(work: () => Promise<T>): Promise<T> {
  const release = acquireManualResearchLease();
  try {
    return await work();
  } finally {
    release();
  }
}

/**
 * Serializes model-provider work while allowing queued manual requests to pass
 * autonomous work. An in-flight request is never interrupted.
 */
export function runWithResearchPriorityQueue<T>(
  work: () => Promise<T>,
  priority: ResearchPriority = 'manual',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    providerQueue.push({
      priority,
      sequence: queueSequence++,
      work,
      resolve: resolve as (value: unknown) => void,
      reject,
    } as QueuedResearchWork<unknown>);
    drainProviderQueue();
  });
}

function drainProviderQueue(): void {
  if (queueRunning || !providerQueue.length) return;
  providerQueue.sort((left, right) =>
    (left.priority === right.priority ? left.sequence - right.sequence : left.priority === 'manual' ? -1 : 1),
  );
  const next = providerQueue.shift();
  if (!next) return;
  queueRunning = true;
  void Promise.resolve()
    .then(next.work)
    .then(next.resolve, next.reject)
    .finally(() => {
      queueRunning = false;
      drainProviderQueue();
    });
}

/** Maps a batch with a hard concurrency ceiling and stable result ordering. */
export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  maximumConcurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!values.length) return [];
  const limit = Math.max(1, Math.min(values.length, Math.floor(maximumConcurrency) || 1));
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

export function availableResearchRunSlots(activeRuns: number): number {
  if (!Number.isFinite(activeRuns)) return MAX_CONCURRENT_RESEARCH_RUNS;
  return Math.max(0, MAX_CONCURRENT_RESEARCH_RUNS - Math.max(0, Math.floor(activeRuns)));
}

export function canStartResearchRun(activeRuns: number): boolean {
  return availableResearchRunSlots(activeRuns) > 0;
}
