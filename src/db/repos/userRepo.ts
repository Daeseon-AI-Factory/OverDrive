import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso } from '../../lib/date';
import { DEFAULT_SETTINGS, parseSettings, type UserSettings } from '../../lib/settings';
import { LOCAL_USER_ID, type UserRow } from '../types';

export async function getUser(db: SQLiteDatabase, id: string = LOCAL_USER_ID): Promise<UserRow | null> {
  return db.getFirstAsync<UserRow>('SELECT * FROM user WHERE id = ?', [id]);
}

export async function getSettings(db: SQLiteDatabase, id: string = LOCAL_USER_ID): Promise<UserSettings> {
  const user = await getUser(db, id);
  return user ? parseSettings(user.settings) : { ...DEFAULT_SETTINGS };
}

export async function updateSettings(
  db: SQLiteDatabase,
  settings: UserSettings,
  id: string = LOCAL_USER_ID,
): Promise<void> {
  await db.runAsync('UPDATE user SET settings = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify(settings),
    nowIso(),
    id,
  ]);
}
