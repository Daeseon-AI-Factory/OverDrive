import type { SQLiteDatabase } from 'expo-sqlite';
import { withForeignKeyTransaction } from '../foreignKeyTransaction';
import type { UserSettings } from '@/lib/settings';
import { nowIso } from '../../lib/date';
import { type BodyCompositionRow, LOCAL_USER_ID } from '../types';
import { newUuid } from '../uuid';

export interface BodyCompositionInput {
  weightKg: number;
  bodyFatFraction: number;
}

function validate(input: BodyCompositionInput): void {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) throw new Error('invalid_body_weight');
  if (
    !Number.isFinite(input.bodyFatFraction) ||
    input.bodyFatFraction < 0 ||
    input.bodyFatFraction > 1
  ) {
    throw new Error('invalid_body_fat');
  }
}

/**
 * Append one measured body-composition pair and update the profile weight in the same SQLite
 * transaction. The caller updates its in-memory settings only after this resolves.
 */
export async function saveBodyCompositionEntry(
  db: SQLiteDatabase,
  input: BodyCompositionInput,
  settings: UserSettings,
  userId: string = LOCAL_USER_ID,
): Promise<BodyCompositionRow> {
  validate(input);
  const measuredAt = nowIso();
  const id = newUuid();
  const row: BodyCompositionRow = {
    id,
    client_uuid: id,
    user_id: userId,
    weight_kg: input.weightKg,
    body_fat_fraction: input.bodyFatFraction,
    measured_at: measuredAt,
  };

  await withForeignKeyTransaction(db, async (tx) => {
    await tx.runAsync(
      `INSERT INTO body_composition_log
         (id, client_uuid, user_id, weight_kg, body_fat_fraction, measured_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, id, userId, input.weightKg, input.bodyFatFraction, measuredAt],
    );
    const updated = await tx.runAsync('UPDATE user SET settings = ?, updated_at = ? WHERE id = ?', [
      JSON.stringify(settings),
      measuredAt,
      userId,
    ]);
    if (updated.changes !== 1) throw new Error('body_composition_user_not_found');
  });

  return row;
}

export async function getLatestBodyCompositionEntry(
  db: SQLiteDatabase,
  userId: string = LOCAL_USER_ID,
): Promise<BodyCompositionRow | null> {
  return db.getFirstAsync<BodyCompositionRow>(
    `SELECT * FROM body_composition_log
     WHERE user_id = ?
     ORDER BY measured_at DESC, id DESC
     LIMIT 1`,
    [userId],
  );
}
