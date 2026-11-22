import type { LocalData } from './types';

export type LocalDataEntry = { key: keyof LocalData; value: LocalData[keyof LocalData] };
export const LOCAL_DATA_KEYS: (keyof LocalData)[] = [
  'feedRegistry', 'researchActivity', 'researchMemory', 'preferences', 'ideas', 'links', 'notes', 'opinions', 'reports', 'videos', 'budget',
];

/** Compare immutable domain references; never serialize unrelated large data to find a diff. */
export function changedLocalDataEntries(
  data: LocalData,
  previousData?: Partial<Record<keyof LocalData, unknown>>,
): LocalDataEntry[] {
  return LOCAL_DATA_KEYS
    .filter((key) => !previousData || data[key] !== previousData[key])
    .map((key) => ({ key, value: data[key] }));
}
