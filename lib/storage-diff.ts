import type { LocalData } from './types';

export type LocalDataEntry = { key: keyof LocalData; value: LocalData[keyof LocalData] };
export const LOCAL_DATA_KEYS: (keyof LocalData)[] = [
  'feedRegistry', 'researchMemory', 'preferences', 'ideas', 'links', 'notes', 'opinions', 'reports', 'videos', 'budget',
];

/** Select only the persisted domains whose values actually changed. */
export function changedLocalDataEntries(
  clean: LocalData,
  previousData?: Partial<Record<keyof LocalData, unknown>>,
): LocalDataEntry[] {
  return LOCAL_DATA_KEYS
    .filter((key) => {
      if (!previousData) return true;
      const value = clean[key];
      const previousValue = previousData[key];
      return value !== previousValue && JSON.stringify(value) !== JSON.stringify(previousValue);
    })
    .map((key) => ({ key, value: clean[key] }));
}
