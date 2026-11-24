export const AUTONOMOUS_QUEUE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type AutonomousPriorityRecord = {
  status: 'queued' | 'running' | 'completed' | 'failed';
  publishedAt?: string | null;
  priority: number;
  discoveredAt: number;
};

function publicationTime(value: string | null | undefined): number {
  return value ? Date.parse(value) || 0 : 0;
}

/** Fresh publication time dominates numeric priority; completed work always sorts last. */
export function compareAutonomousPriority(
  a: AutonomousPriorityRecord,
  b: AutonomousPriorityRecord,
): number {
  if (a.status === 'completed' && b.status !== 'completed') return 1;
  if (b.status === 'completed' && a.status !== 'completed') return -1;
  return publicationTime(b.publishedAt) - publicationTime(a.publishedAt) ||
    b.priority - a.priority ||
    b.discoveredAt - a.discoveredAt;
}

export function sortAutonomousPriority<T extends AutonomousPriorityRecord>(items: readonly T[]): T[] {
  return [...items].sort(compareAutonomousPriority);
}

export function isAutonomousDiscoveryFresh(discoveredAt: number, now = Date.now()): boolean {
  return Number.isFinite(discoveredAt) && discoveredAt <= now &&
    now - discoveredAt <= AUTONOMOUS_QUEUE_MAX_AGE_MS;
}
