import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso } from '../lib/date';
import { DEFAULT_SETTINGS } from '../lib/settings';
import {
  DATABASE_VERSION,
  MIGRATION_003,
  MIGRATION_004,
  MIGRATION_005,
  MIGRATION_006,
  MIGRATION_007,
  SCHEMA_V1,
} from './schema';
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

  if (version === 1) {
    // Builder directive: profile language is English. Flip the stale pre-i18n 'ko' default once.
    // (Language changes made after this run persist normally — this block won't re-run.)
    await db.runAsync(`UPDATE user SET locale = 'en' WHERE id = ?`, [LOCAL_USER_ID]);
    version = 2;
  }

  if (version !== DATABASE_VERSION) {
    // Defensive: keep stored version in lockstep with the constant.
    version = DATABASE_VERSION;
  }
  await db.execAsync(`PRAGMA user_version = ${version};`);

  // Additive tables: CREATE IF NOT EXISTS every boot (cheap, idempotent). This is version-INDEPENDENT
  // so it self-heals a DB whose user_version ran ahead of the table — e.g. a dev hot-reload remounted
  // SQLiteProvider after the version bump but before the table-creating migration block existed.
  await db.execAsync(MIGRATION_003);
  await db.execAsync(MIGRATION_004);
  await db.execAsync(MIGRATION_005);
  await db.execAsync(MIGRATION_006);
  await ensureFoodLogV7(db);
  // Seed runs every boot (INSERT OR IGNORE, idempotent) so new catalog exercises land in
  // already-migrated databases.
  await seedExercises(db);
}

/**
 * Widen food_log.source and add a real meal-batch key once. The schema read makes the otherwise
 * destructive SQLite table rebuild idempotent, including a DB whose user_version was bumped just
 * before an interrupted migration attempt.
 */
async function ensureFoodLogV7(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ sql: string | null }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'food_log'`,
  );
  const sql = row?.sql ?? '';
  if (sql.includes('batch_id') && sql.includes("'manual'")) return;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.execAsync(MIGRATION_007);
  });
}

/** Single local user for Phase 1. Idempotent. */
async function ensureLocalUser(db: SQLiteDatabase): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    `INSERT OR IGNORE INTO user (id, locale, settings, created_at, updated_at)
     VALUES (?, 'en', ?, ?, ?)`,
    [LOCAL_USER_ID, JSON.stringify(DEFAULT_SETTINGS), now, now],
  );
}
