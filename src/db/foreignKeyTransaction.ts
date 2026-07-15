import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const pathQueues = new Map<string, Promise<void>>();

/**
 * Expo's exclusive helper may create a native connection whose per-connection foreign_keys pragma
 * is off. This wrapper opens the connection explicitly, enables/verifies FK enforcement before
 * BEGIN, serializes writes by database path, and always closes it.
 */
export async function withForeignKeyTransaction<T>(
  db: SQLiteDatabase,
  work: (transaction: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  // Jest/test doubles do not expose native connection metadata. Production SQLiteDatabase always
  // does; retaining this path keeps pure repository tests native-module-free.
  if (!db.databasePath || !db.options) {
    let result!: T;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      result = await work(transaction as SQLiteDatabase);
    });
    return result;
  }

  const key = db.databasePath;
  const previous = pathQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => {}).then(() => gate);
  pathQueues.set(key, tail);
  await previous.catch(() => {});

  const { name, directory } = splitDatabasePath(db.databasePath);
  let connection: SQLiteDatabase | null = null;
  try {
    const opened = await openDatabaseAsync(name, { ...db.options, useNewConnection: true }, directory);
    connection = opened;
    await opened.execAsync('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const foreignKeys = await opened.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys;');
    if (foreignKeys?.foreign_keys !== 1) throw new Error('SQLite foreign key enforcement is unavailable');
    let result!: T;
    await opened.withTransactionAsync(async () => {
      result = await work(opened);
    });
    return result;
  } finally {
    try {
      // A close failure happens after SQLite has already reported COMMIT. Never turn that durable
      // success into an apparent write failure (which could trigger a duplicate retry), and never
      // let it strand the per-path queue.
      if (connection) {
        try {
          await connection.closeAsync();
        } catch {
          // Non-blocking cleanup failure: the transaction outcome above remains authoritative.
        }
      }
    } finally {
      release();
      if (pathQueues.get(key) === tail) pathQueues.delete(key);
    }
  }
}

export function splitDatabasePath(databasePath: string): { name: string; directory: string | undefined } {
  const separator = Math.max(databasePath.lastIndexOf('/'), databasePath.lastIndexOf('\\'));
  if (separator < 0) return { name: databasePath, directory: undefined };
  return {
    name: databasePath.slice(separator + 1),
    directory: databasePath.slice(0, separator),
  };
}
