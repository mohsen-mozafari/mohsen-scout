import * as SQLite from 'expo-sqlite';
import { defaults, purgeExpired, type LocalData } from './types';
import { validateLocal } from './validation';
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
  for (const row of rows) {
    if (row.key in data) Object.assign(data, { [row.key]: JSON.parse(row.value) });
  }
  const clean = purgeExpired(validateLocal(data));
  await writeData(clean);
  return clean;
}
export async function writeData(data: LocalData): Promise<void> {
  const connection = await db();
  const clean = purgeExpired(validateLocal(data));
  await connection.withExclusiveTransactionAsync(async (tx) => {
    for (const [key, value] of Object.entries(clean)) {
      const table = key === 'videos' || key === 'reports' ? 'youtube' : 'personal';
      await tx.runAsync(
        `INSERT OR REPLACE INTO ${table} (key,value) VALUES (?,?)`,
        key,
        JSON.stringify(value),
      );
    }
  });
}
