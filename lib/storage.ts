import * as SQLite from 'expo-sqlite';
import { defaults, purgeExpired, RETENTION_MS, type LocalData } from './types';
import { validateLocal, validateLocalEntry, validateLocalRecord } from './validation';
import { changedLocalDataEntries } from './storage-diff';
import { diffRecordCollection, isRecordDomain, recordIdFor, recordTable, recordUpdatedAt, recordExpiresAt, RECORD_DOMAINS, emptyRecordCounts, type RecordDomain, type StorageHealth } from './storage-records';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
let database: Promise<SQLite.SQLiteDatabase> | undefined;

const LEGACY_DOMAINS: Record<'personal' | 'youtube', readonly RecordDomain[]> = {
  personal: ['ideas', 'links', 'notes', 'opinions', 'researchMemory'],
  youtube: ['reports', 'videos'],
};

type LegacyRow = { key: string; value: string };
type StoredRecordRow = { domain: string; id: string; updated_at: number; payload: string };

async function migrateLegacyDomains(connection: SQLite.SQLiteDatabase): Promise<void> {
  const current = await connection.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((current?.user_version ?? 0) >= 2) return;
  await connection.withExclusiveTransactionAsync(async (tx) => {
    for (const table of ['personal', 'youtube'] as const) {
      const rows = await tx.getAllAsync<LegacyRow>('SELECT key,value FROM ' + table);
      const legacyDomains = new Set(LEGACY_DOMAINS[table]);
      for (const row of rows) {
        if (!isRecordDomain(row.key) || !legacyDomains.has(row.key)) continue;
        const raw: unknown = JSON.parse(row.value);
        if (!Array.isArray(raw)) throw new Error('Legacy ' + row.key + ' data is not a valid collection; migration was rolled back.');
        const collection = validateLocalEntry(row.key, raw) as unknown[];
        for (const item of collection) {
          const id = recordIdFor(row.key, item);
          const updatedAt = recordUpdatedAt(row.key, item);
          const payload = JSON.stringify(item);
          if (table === 'youtube') {
            const expiresAt = recordExpiresAt(row.key, item) ?? (updatedAt + RETENTION_MS);
            await tx.runAsync('INSERT OR REPLACE INTO youtube_records (domain,id,updated_at,expires_at,payload) VALUES (?,?,?,?,?)', row.key, id, updatedAt, expiresAt, payload);
          } else {
            await tx.runAsync('INSERT OR REPLACE INTO personal_records (domain,id,updated_at,payload) VALUES (?,?,?,?)', row.key, id, updatedAt, payload);
          }
        }
        await tx.runAsync('DELETE FROM ' + table + ' WHERE key=?', row.key);
      }
    }
  });
  await connection.execAsync('PRAGMA user_version=2');
}
async function db() {
  if (!database)
    database = SQLite.openDatabaseAsync('mohsen-scout.db')
      .then(async (value) => {
        await value.execAsync(
          'PRAGMA journal_mode=WAL;' +
          'CREATE TABLE IF NOT EXISTS personal (key TEXT PRIMARY KEY, value TEXT NOT NULL);' +
          'CREATE TABLE IF NOT EXISTS youtube (key TEXT PRIMARY KEY, value TEXT NOT NULL);' +
          'CREATE TABLE IF NOT EXISTS personal_records (domain TEXT NOT NULL,id TEXT NOT NULL,updated_at INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(domain,id));' +
          'CREATE TABLE IF NOT EXISTS youtube_records (domain TEXT NOT NULL,id TEXT NOT NULL,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(domain,id));' +
          'CREATE INDEX IF NOT EXISTS personal_records_updated ON personal_records(domain,updated_at DESC);' +
          'CREATE INDEX IF NOT EXISTS youtube_records_updated ON youtube_records(domain,updated_at DESC);' +
          'CREATE INDEX IF NOT EXISTS youtube_records_expiry ON youtube_records(expires_at);',
        );
        await migrateLegacyDomains(value);
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
  const rows = await connection.getAllAsync<LegacyRow>(
    'SELECT key,value FROM personal UNION ALL SELECT key,value FROM youtube',
  );
  const data = defaults();
  const persisted: Partial<Record<keyof LocalData, unknown>> = {};
  for (const row of rows) {
    if (isRecordDomain(row.key)) continue;
    if (row.key === 'preferences') {
      const parsedPreferences: unknown = JSON.parse(row.value);
      if (!isRecord(parsedPreferences)) throw new Error('Stored preferences are not a valid object.');
      const savedPreferences = parsedPreferences;
      const migratedPreferences = { ...data.preferences, ...savedPreferences };
      if (!Object.prototype.hasOwnProperty.call(savedPreferences, 'hybridIntelligence') &&
        migratedPreferences.schedule === 'Manual') migratedPreferences.schedule = 'Daily';
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
  const recordQuery =
    'SELECT domain,id,updated_at,payload FROM personal_records ' +
    'UNION ALL SELECT domain,id,updated_at,payload FROM youtube_records ORDER BY updated_at DESC';
  for await (const row of connection.getEachAsync<StoredRecordRow>(recordQuery)) {
    if (!isRecordDomain(row.domain)) continue;
    const value: unknown = JSON.parse(row.payload);
    (data[row.domain] as unknown[]).push(value);
  }
  for (const domain of RECORD_DOMAINS) {
    (persisted as Record<string, unknown>)[domain] = data[domain];
  }
  const purged = purgeExpired(data);
  const clean = validateLocal(purged);
  await writeData(purged, persisted);
  return clean;
}

export async function writeData(
  data: LocalData,
  previousData?: Partial<Record<keyof LocalData, unknown>>,
): Promise<void> {
  const changedEntries = changedLocalDataEntries(data, previousData);
  if (!changedEntries.length) return;

  const recordDeltas = new Map<RecordDomain, ReturnType<typeof diffRecordCollection>>();
  const validatedRecords = new Map<RecordDomain, { id: string; value: unknown }[]>();
  const scalarEntries: { key: keyof LocalData; value: unknown }[] = [];
  for (const entry of changedEntries) {
    if (isRecordDomain(entry.key)) {
      const delta = diffRecordCollection(entry.key, entry.value as unknown[], previousData?.[entry.key] as unknown[] | undefined);
      recordDeltas.set(entry.key, delta);
      validatedRecords.set(entry.key, delta.upserts.map(({ id, value }) => ({
        id,
        value: validateLocalRecord(entry.key, value),
      })));
    } else {
      scalarEntries.push({ key: entry.key, value: validateLocalEntry(entry.key, entry.value) });
    }
  }
  const hasRecordChanges = [...recordDeltas.values()].some((delta) =>
    delta.replaceAll || delta.upserts.length > 0 || delta.deleteIds.length > 0,
  );
  if (!scalarEntries.length && !hasRecordChanges) return;
  const connection = await db();
  await connection.withExclusiveTransactionAsync(async (tx) => {
    for (const [domain, delta] of recordDeltas) {
      const table = recordTable(domain);
      if (delta.replaceAll) await tx.runAsync('DELETE FROM ' + table + ' WHERE domain=?', domain);
      for (const id of delta.deleteIds) await tx.runAsync('DELETE FROM ' + table + ' WHERE domain=? AND id=?', domain, id);
      for (const { id, value } of validatedRecords.get(domain) ?? []) {
        const updatedAt = recordUpdatedAt(domain, value);
        const payload = JSON.stringify(value);
        if (table === 'youtube_records') {
          const expiresAt = recordExpiresAt(domain, value) ?? (updatedAt + RETENTION_MS);
          await tx.runAsync('INSERT OR REPLACE INTO youtube_records (domain,id,updated_at,expires_at,payload) VALUES (?,?,?,?,?)', domain, id, updatedAt, expiresAt, payload);
        } else {
          await tx.runAsync('INSERT OR REPLACE INTO personal_records (domain,id,updated_at,payload) VALUES (?,?,?,?)', domain, id, updatedAt, payload);
        }
      }
    }
    for (const { key, value } of scalarEntries) {
      await tx.runAsync('INSERT OR REPLACE INTO personal (key,value) VALUES (?,?)', key, JSON.stringify(value));
    }
  });
}

export async function inspectStorageHealth(): Promise<StorageHealth> {
  const connection = await db();
  const [version, quickCheck, pageCount, pageSize, freePages, counts, range] = await Promise.all([
    connection.getFirstAsync<{ user_version: number }>('PRAGMA user_version'),
    connection.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check'),
    connection.getFirstAsync<{ page_count: number }>('PRAGMA page_count'),
    connection.getFirstAsync<{ page_size: number }>('PRAGMA page_size'),
    connection.getFirstAsync<{ freelist_count: number }>('PRAGMA freelist_count'),
    connection.getAllAsync<{ domain: string; count: number }>(
      'SELECT domain,COUNT(*) AS count FROM (SELECT domain FROM personal_records UNION ALL SELECT domain FROM youtube_records) GROUP BY domain',
    ),
    connection.getFirstAsync<{ oldest: number | null; newest: number | null }>(
      'SELECT MIN(updated_at) AS oldest,MAX(updated_at) AS newest FROM personal_records',
    ),
  ]);
  const recordCounts = emptyRecordCounts();
  for (const row of counts) if (isRecordDomain(row.domain)) recordCounts[row.domain] = row.count;
  const check = quickCheck?.quick_check ?? 'unavailable';
  return {
    backend: 'sqlite',
    schemaVersion: version?.user_version ?? 0,
    integrityCheck: check === 'ok' ? 'ok' : 'failed',
    integrityDetail: check,
    databaseBytes: (pageCount?.page_count ?? 0) * (pageSize?.page_size ?? 0),
    pageCount: pageCount?.page_count ?? null,
    freePages: freePages?.freelist_count ?? null,
    recordCounts,
    oldestPersonalRecordAt: range?.oldest ?? null,
    newestPersonalRecordAt: range?.newest ?? null,
  };
}
