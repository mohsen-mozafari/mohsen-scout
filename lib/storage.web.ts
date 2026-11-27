import { defaults, purgeExpired, type LocalData } from './types';
import { recordCountsFromData, type StorageHealth } from './storage-records';
import { validateLocal } from './validation';
export async function readData(): Promise<LocalData> {
  const raw = localStorage.getItem('mohsen-scout-personal');
  const personal: unknown = raw ? JSON.parse(raw) : {};
  const apiRaw = localStorage.getItem('mohsen-scout-youtube');
  const api: unknown = apiRaw ? JSON.parse(apiRaw) : {};
  if (!personal || typeof personal !== 'object' || !api || typeof api !== 'object')
    throw new Error('Saved data is unreadable.');
  const clean = purgeExpired(validateLocal({ ...defaults(), ...personal, ...api }));
  await writeData(clean);
  return clean;
}
export async function writeData(data: LocalData): Promise<void> {
  const { videos, reports, ...personal } = purgeExpired(data);
  localStorage.setItem('mohsen-scout-personal', JSON.stringify(personal));
  localStorage.setItem('mohsen-scout-youtube', JSON.stringify({ videos, reports }));
}

export async function inspectStorageHealth(): Promise<StorageHealth> {
  const data = await readData();
  const keys = ['mohsen-scout-personal', 'mohsen-scout-youtube'];
  let databaseBytes = 0;
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value) databaseBytes += value.length * 2;
  }
  return {
    backend: 'localStorage',
    schemaVersion: 0,
    integrityCheck: 'unavailable',
    integrityDetail: 'Browser storage does not expose SQLite quick_check or database page metrics.',
    databaseBytes,
    pageCount: null,
    freePages: null,
    recordCounts: recordCountsFromData(data),
    oldestPersonalRecordAt: null,
    newestPersonalRecordAt: null,
  };
}
