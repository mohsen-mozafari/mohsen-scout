import { defaults, purgeExpired, type LocalData } from './types';
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
