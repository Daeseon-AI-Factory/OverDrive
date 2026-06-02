import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso } from '../../lib/date';
import { newUuid } from '../uuid';
import { LOCAL_USER_ID, type PowerEventReason } from '../types';

/**
 * Append a JUICE trigger to the PowerEvent log (CP trend + debug). Fire-and-forget on the hot
 * path: the caller does NOT await this (spec §6.4 — logging is never blocked by JUICE).
 */
export async function appendPowerEvent(
  db: SQLiteDatabase,
  input: { tier: number; delta: number; reason: PowerEventReason; sessionId?: string | null; userId?: string },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO power_event (id, client_uuid, user_id, session_id, tier, delta, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [newUuid(), newUuid(), input.userId ?? LOCAL_USER_ID, input.sessionId ?? null, input.tier, input.delta, input.reason, nowIso()],
  );
}
