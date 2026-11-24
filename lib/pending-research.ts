import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid, type ResearchDossier, type ResearchInput } from './types';
import { inputSchema, researchDossierSchema } from './validation';

export type PendingResearchEvidence = {
  id: string; title: string; summary: string; url: string; sourceName: string;
  publishedAt?: string | null; category: 'web' | 'news';
};

const KEY = 'mohsen-scout.pending-research.v2';
const LEGACY_KEY = 'mohsen-scout.pending-research.v1';
let pendingWriteQueue: Promise<unknown> = Promise.resolve();

function serializePendingOperation<T>(work: () => Promise<T>): Promise<T> {
  const action = pendingWriteQueue.then(work, work);
  pendingWriteQueue = action.then(() => undefined, () => undefined);
  return action;
}

export type PendingResearch = {
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
  return typeof item.id === 'string' && item.id.length > 0 &&
    inputSchema.safeParse(input).success &&
    (item.researchDossier === undefined || researchDossierSchema.safeParse(item.researchDossier).success) &&
    typeof item.savedAt === 'number' && Number.isFinite(item.savedAt) && item.savedAt >= 0 &&
    (item.evidence === undefined || (Array.isArray(item.evidence) && item.evidence.length <= 48 && item.evidence.every((entry) =>
      Boolean(entry && typeof entry.id === 'string' && typeof entry.title === 'string' && typeof entry.summary === 'string' && typeof entry.url === 'string' && typeof entry.sourceName === 'string')))) &&
    (item.queryHistory === undefined || (Array.isArray(item.queryHistory) && item.queryHistory.length <= 40 && item.queryHistory.every((query) => typeof query === 'string')));
}

async function readRaw(): Promise<PendingResearch[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(valid);
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
        id: 'legacy-' + String(record.savedAt ?? uid()),
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

export async function readPendingResearch(): Promise<PendingResearch[]> {
  return serializePendingOperation(async () => (await readRaw()).sort((a, b) => b.savedAt - a.savedAt));
}

export async function getPendingResearch(id: string): Promise<PendingResearch | undefined> {
  return serializePendingOperation(async () => (await readRaw()).find((item) => item.id === id));
}

export async function savePendingResearch(
  input: ResearchInput,
  id = uid(),
  reportId?: string,
): Promise<void> {
  await serializePendingOperation(async () => {
    const previous = await readRaw();
    const current = previous.find((item) => item.id === id);
    const next: PendingResearch = {
      ...current,
      id,
      input,
      savedAt: current?.savedAt ?? Date.now(),
      ...(reportId ?? current?.reportId ? { reportId: reportId ?? current?.reportId } : {}),
      stage: current?.stage ?? 'queued',
    };
    await AsyncStorage.setItem(KEY, JSON.stringify([
      next,
      ...previous.filter((item) => item.id !== id),
    ]));
  });
}

export async function updatePendingResearch(
  id: string,
  patch: Partial<Pick<PendingResearch, 'reportId' | 'stage' | 'researchDossier' | 'evidence' | 'queryHistory'>>,
): Promise<void> {
  await serializePendingOperation(async () => {
    const previous = await readRaw();
    const next = previous.map((item) => item.id === id ? { ...item, ...patch } : item);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  });
}

export async function clearPendingResearch(id?: string): Promise<void> {
  await serializePendingOperation(async () => {
    if (!id) {
      await AsyncStorage.removeItem(KEY);
      await AsyncStorage.removeItem(LEGACY_KEY);
      return;
    }
    const previous = await readRaw();
    await AsyncStorage.setItem(KEY, JSON.stringify(previous.filter((item) => item.id !== id)));
  });
}
