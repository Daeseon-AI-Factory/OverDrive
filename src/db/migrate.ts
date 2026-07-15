import type { SQLiteDatabase } from 'expo-sqlite';
import { withForeignKeyTransaction } from './foreignKeyTransaction';
import { nowIso } from '../lib/date';
import { DEFAULT_SETTINGS } from '../lib/settings';
import {
  DATABASE_VERSION,
  MIGRATION_003,
  MIGRATION_004,
  MIGRATION_005,
  MIGRATION_006,
  MIGRATION_007,
  MIGRATION_008,
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
  // The catalog refresher writes through a short-lived second connection. Give foreground writes
  // on SQLiteProvider's long-lived connection a bounded wait instead of failing immediately while
  // that atomic activation is committing.
  await db.execAsync('PRAGMA busy_timeout = 5000;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;
  if (version > DATABASE_VERSION) {
    throw new Error(`database version ${version} is newer than supported ${DATABASE_VERSION}`);
  }

  if (version === 0) {
    await db.execAsync('PRAGMA journal_mode = WAL;');
  }

  // Schema work and version advancement share one transaction. A failed v8 DDL statement leaves
  // the previous user_version intact, so the next launch retries instead of believing a partial
  // cache schema is complete. Idempotent earlier DDL also self-heals interrupted dev databases.
  await withForeignKeyTransaction(db, async (tx) => {
    if (version === 0) {
      await tx.execAsync(SCHEMA_V1);
      await ensureLocalUser(tx);
      version = 1;
    }
    if (version === 1) {
      // Builder directive: profile language is English. Flip the stale pre-i18n 'ko' default once.
      await tx.runAsync(`UPDATE user SET locale = 'en' WHERE id = ?`, [LOCAL_USER_ID]);
      version = 2;
    }
    await tx.execAsync(MIGRATION_003);
    await tx.execAsync(MIGRATION_004);
    await tx.execAsync(MIGRATION_005);
    await tx.execAsync(MIGRATION_006);
    await ensureFoodLogV7(tx);
    await tx.execAsync(MIGRATION_008);
    await tx.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
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
  await db.execAsync(MIGRATION_007);
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
