import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ResearchInput } from './types';

const KEY = 'mohsen-scout.pending-research.v1';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type PendingResearch = {
  input: ResearchInput;
  savedAt: number;
};

export async function savePendingResearch(input: ResearchInput): Promise<void> {
  const pending: PendingResearch = { input, savedAt: Date.now() };
  await AsyncStorage.setItem(KEY, JSON.stringify(pending));
}

export async function readPendingResearch(): Promise<PendingResearch | undefined> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    const input = record.input as ResearchInput | undefined;
    const savedAt = record.savedAt;
    if (!input || typeof input.topic !== 'string' || !input.topic.trim() ||
      !Array.isArray(input.languages) || typeof savedAt !== 'number' ||
      !Number.isFinite(savedAt) || Date.now() - savedAt > MAX_AGE_MS) {
      await AsyncStorage.removeItem(KEY);
      return undefined;
    }
    return { input, savedAt };
  } catch {
    await AsyncStorage.removeItem(KEY);
    return undefined;
  }
}

export async function clearPendingResearch(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
