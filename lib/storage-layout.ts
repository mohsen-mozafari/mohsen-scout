import { defaults, type LocalData, type Opinion } from './types';

export type StorageRow = { key: string; value: string };
export type EncodedStorageRow = StorageRow & { table: 'personal' | 'youtube' };
const OPINION_PREFIX = 'opinion:';

function addOpinion(target: Map<string, Opinion>, value: unknown) {
  if (!value || typeof value !== 'object' || !('id' in value)) return;
  const opinion = value as Opinion;
  if (typeof opinion.id === 'string' && opinion.id) target.set(opinion.id, opinion);
}

/** Reads both the legacy single opinions JSON row and the newer one-row-per-opinion layout. */
export function decodeStorageRows(rows: readonly StorageRow[]): LocalData {
  const data = defaults();
  const opinions = new Map<string, Opinion>();
  for (const row of rows) {
    let value: unknown;
    try {
      value = JSON.parse(row.value);
    } catch {
      throw new Error('Saved data is unreadable. Import a valid personal backup.');
    }
    if (row.key === 'preferences' && value && typeof value === 'object') {
      Object.assign(data, { preferences: { ...data.preferences, ...value } });
    } else if (row.key === 'opinions') {
      if (Array.isArray(value)) value.forEach((item) => addOpinion(opinions, item));
    } else if (row.key.startsWith(OPINION_PREFIX)) {
      addOpinion(opinions, value);
    } else if (row.key in data) {
      Object.assign(data, { [row.key]: value });
    }
  }
  data.opinions = [...opinions.values()];
  return data;
}

/** Opinions are stored independently so a growing history cannot overflow one JSON record. */
export function encodeStorageRows(data: LocalData): EncodedStorageRow[] {
  const rows: EncodedStorageRow[] = Object.entries(data)
    .filter(([key]) => key !== 'opinions')
    .map(([key, value]): EncodedStorageRow => ({
      key,
      value: JSON.stringify(value),
      table: key === 'videos' || key === 'reports' ? 'youtube' : 'personal',
    }));
  for (const opinion of data.opinions) {
    rows.push({ key: OPINION_PREFIX + opinion.id, value: JSON.stringify(opinion), table: 'personal' });
  }
  return rows;
}
