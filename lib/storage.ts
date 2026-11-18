import * as SQLite from 'expo-sqlite';
import { defaults, purgeExpired, type LocalData } from './types';
import { validateLocal, validateLocalEntry } from './validation';
import { changedLocalDataEntries } from './storage-diff';

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
      // Expand the original built-in five-feed list once, but preserve any custom source selection.
      if (migratedPreferences.spaceNewsSourcesVersion !== 2) {
        const legacySources = ['nasa', 'jpl', 'cneos', 'esa-space', 'esa-science'];
        const savedSources = savedPreferences.spaceNewsSources;
        const wasLegacyDefault = !Array.isArray(savedSources) ||
          (savedSources.length === legacySources.length && legacySources.every((source) => savedSources.includes(source)));
        if (wasLegacyDefault) migratedPreferences.spaceNewsSources = [...data.preferences.spaceNewsSources];
        migratedPreferences.spaceNewsSourcesVersion = 2;
      }
      Object.assign(data, { preferences: migratedPreferences });
      Object.assign(persisted, { preferences: savedPreferences });
    } else if (row.key in data) {
      const value: unknown = JSON.parse(row.value);
      Object.assign(data, { [row.key]: value });
      Object.assign(persisted, { [row.key]: value });
    }
  }
  const purged = purgeExpired(data);
  const clean = validateLocal(purged);
  await writeData(purged, persisted);
  return clean;
}
export async function writeData(data: LocalData, previousData?: Partial<Record<keyof LocalData, unknown>>): Promise<void> {
  const changedEntries = changedLocalDataEntries(data, previousData);
  if (!changedEntries.length) return;

  // Validate and serialize only domains changed by an immutable update. A small
  // opinion save must not parse the complete, potentially large video database.
  const validatedEntries = changedEntries.map(({ key, value }) => ({
    key,
    value: validateLocalEntry(key, value),
  }));
  const connection = await db();
  await connection.withExclusiveTransactionAsync(async (tx) => {
    for (const { key, value } of validatedEntries) {
      const table = key === 'videos' || key === 'reports' ? 'youtube' : 'personal';
      await tx.runAsync(`INSERT OR REPLACE INTO ${table} (key,value) VALUES (?,?)`, key, JSON.stringify(value));
    }
  });
  try {
    await connection.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    // A busy checkpoint is deferred; committed data remains safe.
  }
}
}
