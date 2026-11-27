import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ResearchDossier, ResearchInput } from './types';

export type PendingResearchEvidence = {
  id: string; title: string; summary: string; url: string; sourceName: string;
  publishedAt?: string | null; category: 'web' | 'news';
};
import { uid } from './types';

const KEY = 'mohsen-scout.pending-research.v2';
export const MAX_PENDING_RESEARCH_TASKS = 250;
const LEGACY_KEY = 'mohsen-scout.pending-research.v1';

// AsyncStorage is a single shared key: serialize read/modify/write operations so
// concurrent research runs cannot overwrite each other's recovery checkpoints.
let pendingQueue: Promise<unknown> = Promise.resolve();
function serializePending<T>(operation: () => Promise<T>): Promise<T> {
  const next = pendingQueue.then(operation);
  pendingQueue = next.then(() => undefined, () => undefined);
  return next;
}

export type PendingResearch = {
  version: 2;
  id: string;
  input: ResearchInput;
  savedAt: number;
  reportId?: string;
  stage?: 'queued' | 'youtube-saved' | 'sources-reviewed' | 'ideas-saved';
  researchDossier?: ResearchDossier;
  evidence?: PendingResearchEvidence[];
  queryHistory?: string[];
};

function valid(value: unknown): value is PendingResearch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const input = item.input as ResearchInput | undefined;
  return (item.version === undefined || item.version === 2) &&
    typeof item.id === 'string' && item.id.length > 0 &&
    Boolean(input && typeof input.topic === 'string' && input.topic.trim() &&
      Array.isArray(input.languages) && input.languages.length > 0) &&
    typeof item.savedAt === 'number' && Number.isFinite(item.savedAt) && item.savedAt >= 0 &&
    (item.stage === undefined || (typeof item.stage === 'string' &&
      ['queued', 'youtube-saved', 'sources-reviewed', 'ideas-saved'].some((stage) => stage === item.stage))) &&
    (item.evidence === undefined || (Array.isArray(item.evidence) && item.evidence.length <= 48 && item.evidence.every((entry) =>
      Boolean(entry && typeof entry.id === 'string' && typeof entry.title === 'string' && typeof entry.summary === 'string' && typeof entry.url === 'string' && typeof entry.sourceName === 'string')))) &&
    (item.queryHistory === undefined || (Array.isArray(item.queryHistory) && item.queryHistory.length <= 40 && item.queryHistory.every((query) => typeof query === 'string')));
}

async function readRaw(): Promise<PendingResearch[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const upgraded = parsed.filter(valid).slice(0, MAX_PENDING_RESEARCH_TASKS)
          .map((item) => ({ ...item, version: 2 as const }));
        const needsRewrite = parsed.length !== upgraded.length || parsed.some((item) =>
          !item || typeof item !== 'object' || Array.isArray(item) || (item as Record<string, unknown>).version !== 2,
        );
        if (needsRewrite) await AsyncStorage.setItem(KEY, JSON.stringify(upgraded));
        return upgraded;
      }
    } catch {
      // Recover from the legacy key below without deleting completed local research.
    }
  }
  const legacy = await AsyncStorage.getItem(LEGACY_KEY);
  if (!legacy) return [];
  try {
    const parsed: unknown = JSON.parse(legacy);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const item = {
        version: 2 as const,
        id: 'legacy-' + (typeof record.savedAt === 'number' && Number.isFinite(record.savedAt) ? String(record.savedAt) : uid()),
        input: record.input,
        savedAt: record.savedAt,
        stage: 'queued' as const,
      };
      if (valid(item)) {
        await AsyncStorage.setItem(KEY, JSON.stringify([item]));
        await AsyncStorage.removeItem(LEGACY_KEY);
        return [item];
      }
    }
  } catch {
    // Invalid recovery metadata is discarded; SQLite research results remain untouched.
  }
  return [];
}

export function readPendingResearch(): Promise<PendingResearch[]> {
  return serializePending(async () => (await readRaw()).sort((a, b) => b.savedAt - a.savedAt));
}

export function getPendingResearch(id: string): Promise<PendingResearch | undefined> {
  return serializePending(async () => (await readRaw()).find((item) => item.id === id));
}

export function savePendingResearch(
  input: ResearchInput,
  id = uid(),
  reportId?: string,
): Promise<void> {
  return serializePending(async () => {
    const previous = await readRaw();
    const current = previous.find((item) => item.id === id);
    const next: PendingResearch = {
      ...current,
      version: 2,
      id,
      input,
      savedAt: current?.savedAt ?? Date.now(),
      ...(reportId ?? current?.reportId ? { reportId: reportId ?? current?.reportId } : {}),
      stage: current?.stage ?? 'queued',
    };
    await AsyncStorage.setItem(KEY, JSON.stringify([
      next,
      ...previous.filter((item) => item.id !== id),
    ].slice(0, MAX_PENDING_RESEARCH_TASKS)));
  });
}

export function updatePendingResearch(
  id: string,
  patch: Partial<Pick<PendingResearch, 'reportId' | 'stage' | 'researchDossier' | 'evidence' | 'queryHistory'>>,
): Promise<void> {
  return serializePending(async () => {
    const previous = await readRaw();
    const next = previous.map((item) => item.id === id ? { ...item, ...patch, version: 2 as const } : item);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  });
}

export function clearPendingResearch(id?: string): Promise<void> {
  return serializePending(async () => {
    if (!id) {
      await AsyncStorage.removeItem(KEY);
      await AsyncStorage.removeItem(LEGACY_KEY);
      return;
    }
    const previous = await readRaw();
    await AsyncStorage.setItem(KEY, JSON.stringify(previous.filter((item) => item.id !== id)));
  });
}
