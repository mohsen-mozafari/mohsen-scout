import type { LocalData } from './types';

export const RECORD_DOMAINS = [
  'ideas', 'links', 'notes', 'opinions', 'researchMemory', 'researchActivity', 'reports', 'videos', 'youtubeSnapshots',
] as const;
export type RecordDomain = (typeof RECORD_DOMAINS)[number];
export type RecordCounts = Record<RecordDomain, number>;
export type StorageHealth = {
  backend: 'sqlite' | 'localStorage';
  schemaVersion: number;
  integrityCheck: 'ok' | 'failed' | 'unavailable';
  integrityDetail: string;
  databaseBytes: number | null;
  pageCount: number | null;
  freePages: number | null;
  recordCounts: RecordCounts;
  oldestPersonalRecordAt: number | null;
  newestPersonalRecordAt: number | null;
};

export type RecordUpsert = { id: string; value: unknown };
export type RecordCollectionDelta = {
  replaceAll: boolean;
  upserts: RecordUpsert[];
  deleteIds: string[];
};

export function isRecordDomain(value: string): value is RecordDomain {
  return (RECORD_DOMAINS as readonly string[]).includes(value);
}

export function recordTable(domain: RecordDomain): 'personal_records' | 'youtube_records' {
  return domain === 'reports' || domain === 'videos' || domain === 'youtubeSnapshots' ? 'youtube_records' : 'personal_records';
}

export function recordIdFor(domain: RecordDomain, value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Cannot persist an invalid ' + domain + ' record.');
  }
  const record = value as Record<string, unknown>;
  const topic = typeof record.topic === 'string' ? record.topic : '';
  const recordId = typeof record.id === 'string' ? record.id : '';
  const id = domain === 'researchMemory'
    ? 'topic:' + topic.trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
    : recordId;
  if (!id || id === 'topic:') throw new Error('A stable identifier is required for ' + domain + '.');
  return id;
}

export function recordUpdatedAt(domain: RecordDomain, value: unknown, now = Date.now()): number {
  const record = value as Record<string, unknown>;
  const candidate = domain === 'links' ? record.savedAt
    : domain === 'notes' ? record.updatedAt
      : domain === 'researchMemory' ? record.updatedAt
        : domain === 'researchActivity' ? record.startedAt
          : domain === 'videos' ? record.fetchedAt
            : domain === 'youtubeSnapshots' ? record.capturedAt
          : domain === 'reports' ? record.createdAt
            : record.createdAt;
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 ? candidate : now;
}

export const NO_EXPIRY = Number.MAX_SAFE_INTEGER;

export function recordExpiresAt(domain: RecordDomain, _value: unknown): number | null {
  if (domain === 'reports' || domain === 'videos' || domain === 'youtubeSnapshots') return NO_EXPIRY;
  return null;
}

export function diffRecordCollection(
  domain: RecordDomain,
  next: readonly unknown[],
  previous?: readonly unknown[],
): RecordCollectionDelta {
  const previousById = new Map<string, unknown>();
  for (const item of previous ?? []) {
    const id = recordIdFor(domain, item);
    if (previousById.has(id)) throw new Error('Duplicate ' + domain + ' identifier: ' + id);
    previousById.set(id, item);
  }
  const nextIds = new Set<string>();
  const upserts: RecordUpsert[] = [];
  for (const item of next) {
    const id = recordIdFor(domain, item);
    if (nextIds.has(id)) throw new Error('Duplicate ' + domain + ' identifier: ' + id);
    nextIds.add(id);
    if (!previousById.has(id) || previousById.get(id) !== item) upserts.push({ id, value: item });
  }
  const deleteIds = [...previousById.keys()].filter((id) => !nextIds.has(id));
  return { replaceAll: previous === undefined, upserts, deleteIds };
}

export function emptyRecordCounts(): RecordCounts {
  return {
    ideas: 0, links: 0, notes: 0, opinions: 0,
    researchMemory: 0, researchActivity: 0, reports: 0, videos: 0, youtubeSnapshots: 0,
  };
}

export function recordCountsFromData(data: Pick<LocalData, RecordDomain>): RecordCounts {
  return Object.fromEntries(RECORD_DOMAINS.map((domain) => [domain, data[domain].length])) as RecordCounts;
}

export function personalRecordTimestampRange(counts: readonly { updated_at: number }[]): {
  oldest: number | null; newest: number | null;
} {
  if (!counts.length) return { oldest: null, newest: null };
  let oldest = Number.POSITIVE_INFINITY;
  let newest = 0;
  for (const row of counts) {
    if (Number.isFinite(row.updated_at)) {
      oldest = Math.min(oldest, row.updated_at);
      newest = Math.max(newest, row.updated_at);
    }
  }
  return Number.isFinite(oldest) ? { oldest, newest } : { oldest: null, newest: null };
}
