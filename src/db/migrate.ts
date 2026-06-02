import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso } from '../lib/date';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { DATABASE_VERSION, SCHEMA_V1 } from './schema';
import { seedExercises } from './seed';
import { LOCAL_USER_ID } from './types';

/**
 * Run on every DB open via <SQLiteProvider onInit={migrateDbIfNeeded}>.
 *
 * NOTE: `PRAGMA foreign_keys` is per-connection and NOT persisted — it must be re-issued every
 * open or ON DELETE CASCADE silently no-ops. `journal_mode = WAL` IS persisted (set once).
 *
 * Migration rule: bump DATABASE_VERSION and add a new `if (version === N)` block. NEVER edit a
 * shipped migration — always add the next one. All statements are IF NOT EXISTS / INSERT OR IGNORE
 * so re-running is safe.
 */
export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;

  if (version === 0) {
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync(SCHEMA_V1);
    await ensureLocalUser(db);
    version = 1;
  }

  // Future migrations:
  // if (version === 1) { await db.execAsync(MIGRATION_002); version = 2; }

  if (version !== DATABASE_VERSION) {
    // Defensive: keep stored version in lockstep with the constant.
    version = DATABASE_VERSION;
  }
  await db.execAsync(`PRAGMA user_version = ${version};`);

  // Seed runs every boot (INSERT OR IGNORE, idempotent) so new catalog exercises land in
  // already-migrated databases without needing a schema version bump.
  await seedExercises(db);
}

/** Single local user for Phase 1. Idempotent. */
async function ensureLocalUser(db: SQLiteDatabase): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    `INSERT OR IGNORE INTO user (id, locale, settings, created_at, updated_at)
     VALUES (?, 'ko', ?, ?, ?)`,
    [LOCAL_USER_ID, JSON.stringify(DEFAULT_SETTINGS), now, now],
  );
}
