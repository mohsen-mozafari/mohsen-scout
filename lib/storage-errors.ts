/** Maps SQLite failures to actionable, non-sensitive messages without exposing raw driver details. */
export function describeStorageError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/SQLITE_FULL|database or disk is full|no space left on device|disk is full/i.test(message)) {
    return 'Device storage is full. Free some space, then retry. Your existing saved data has not been intentionally cleared.';
  }
  if (/SQLITE_BUSY|database is locked|database table is locked|\bBUSY\b/i.test(message)) {
    return 'The local database is busy. Close other app activity, wait a moment, and retry.';
  }
  if (/SQLITE_READONLY|readonly database|attempt to write a readonly database/i.test(message)) {
    return 'The local database is read-only. Restart the app and retry; do not clear app data.';
  }
  if (/SQLITE_CORRUPT|SQLITE_NOTADB|database disk image is malformed|not a database/i.test(message)) {
    return 'The local database may be damaged. Do not uninstall or clear app data before exporting a backup.';
  }
  if (/Saved data is unreadable|validation|invalid input/i.test(message)) {
    return 'Saved data failed validation. No replacement data was written; export a backup before attempting recovery.';
  }
  return 'The local database write failed for an unidentified reason. Your previous saved data was left in place; retry and keep a backup before troubleshooting.';
}
