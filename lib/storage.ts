import * as SQLite from 'expo-sqlite';
import { defaults, purgeExpired, type LocalData } from './types';
import { validateLocal } from './validation';

const LOCAL_DATA_KEYS: (keyof LocalData)[] = [
  'feedRegistry', 'researchMemory', 'preferences', 'ideas', 'links', 'notes', 'opinions', 'reports', 'videos', 'budget',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
let database: Promise<SQLite.SQLiteDatabase> | undefined;
async function db() {
  if (!database)
    database = SQLite.openDatabaseAsync('mohsen-scout.db')
      .then(async (value) => {
        await value.execAsync(
          'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS personal (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS youtube (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
        );
        return value;
      })
      .catch((error: unknown) => {
        database = undefined;
        throw error;
      });
  return database;
}
export async function readData(): Promise<LocalData> {
  const connection = await db();
  const rows = await connection.getAllAsync<{ key: string; value: string }>(
    'SELECT key,value FROM personal UNION ALL SELECT key,value FROM youtube',
  );
  const data = defaults();
  const persisted: Partial<Record<keyof LocalData, unknown>> = {};
  for (const row of rows) {
    if (row.key === 'preferences') {
      const parsedPreferences: unknown = JSON.parse(row.value);
      if (!isRecord(parsedPreferences)) throw new Error('Stored preferences are not a valid object.');
      const savedPreferences = parsedPreferences;
      const migratedPreferences = { ...data.preferences, ...savedPreferences };
      if (!Object.prototype.hasOwnProperty.call(savedPreferences, 'hybridIntelligence') &&
        migratedPreferences.schedule === 'Manual') {
        migratedPreferences.schedule = 'Daily';
      }
      Object.assign(data, { preferences: migratedPreferences });
      Object.assign(persisted, { preferences: savedPreferences });
    } else if (row.key in data) {
      const value: unknown = JSON.parse(row.value);
      Object.assign(data, { [row.key]: value });
      Object.assign(persisted, { [row.key]: value });
    }
  }
  const clean = purgeExpired(validateLocal(data));
  // Persist only migrated/expired domains. This avoids rewriting large tables at every cold start.
  await writeData(clean, persisted);
  return clean;
}
export async function writeData(data: LocalData, previousData?: Partial<Record<keyof LocalData, unknown>>): Promise<void> {
  const connection = await db();
  const clean = purgeExpired(validateLocal(data));
  const changedEntries = LOCAL_DATA_KEYS
    .filter((key) => {
      if (!previousData) return true;
      const value = clean[key];
      const previousValue = previousData[key];
      return value !== previousValue && JSON.stringify(value) !== JSON.stringify(previousValue);
    })
    .map((key) => ({ key, value: clean[key] }));
  if (!changedEntries.length) return;
  await connection.withExclusiveTransactionAsync(async (tx) => {
    for (const { key, value } of changedEntries) {
      const table = key === 'videos' || key === 'reports' ? 'youtube' : 'personal';
      await tx.runAsync(
        `INSERT OR REPLACE INTO ${table} (key,value) VALUES (?,?)`,
        key,
        JSON.stringify(value),
      );
    }
  });
  try {
    await connection.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    // A busy checkpoint is deferred; committed data remains safe.
  }
}
