import type { SQLiteDatabase } from 'expo-sqlite';
import { splitDatabasePath, withForeignKeyTransaction } from './foreignKeyTransaction';

const mockOpenDatabaseAsync = jest.fn();
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: (...args: unknown[]) => mockOpenDatabaseAsync(...args),
}));

describe('foreign-key transaction wrapper', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['/data/app/reploom.db', { name: 'reploom.db', directory: '/data/app' }],
    ['C:\\AppData\\reploom.db', { name: 'reploom.db', directory: 'C:\\AppData' }],
    ['reploom.db', { name: 'reploom.db', directory: undefined }],
  ])('splits portable database path %s', (path, expected) => {
    expect(splitDatabasePath(path)).toEqual(expected);
  });

  it('enables and verifies foreign keys before beginning work on the same connection', async () => {
    const events: string[] = [];
    const connection = {
      execAsync: jest.fn(async () => { events.push('pragma'); }),
      getFirstAsync: jest.fn(async () => { events.push('verify'); return { foreign_keys: 1 }; }),
      withTransactionAsync: jest.fn(async (task: () => Promise<void>) => { events.push('begin'); await task(); events.push('commit'); }),
      closeAsync: jest.fn(async () => { events.push('close'); }),
    } as unknown as SQLiteDatabase;
    mockOpenDatabaseAsync.mockResolvedValue(connection);
    const db = { databasePath: '/data/reploom.db', options: { enableChangeListener: true } } as SQLiteDatabase;

    await expect(withForeignKeyTransaction(db, async (transaction) => {
      expect(transaction).toBe(connection);
      events.push('work');
      return 7;
    })).resolves.toBe(7);

    expect(mockOpenDatabaseAsync).toHaveBeenCalledWith(
      'reploom.db',
      { enableChangeListener: true, useNewConnection: true },
      '/data',
    );
    expect(events).toEqual(['pragma', 'verify', 'begin', 'work', 'commit', 'close']);
  });

  it('fails closed and closes when the connection cannot enable FK enforcement', async () => {
    const connection = {
      execAsync: jest.fn(),
      getFirstAsync: jest.fn().mockResolvedValue({ foreign_keys: 0 }),
      withTransactionAsync: jest.fn(),
      closeAsync: jest.fn(),
    } as unknown as SQLiteDatabase;
    mockOpenDatabaseAsync.mockResolvedValue(connection);
    const db = { databasePath: '/data/reploom.db', options: {} } as SQLiteDatabase;

    await expect(withForeignKeyTransaction(db, async () => undefined)).rejects.toThrow('foreign key');
    expect(connection.withTransactionAsync).not.toHaveBeenCalled();
    expect(connection.closeAsync).toHaveBeenCalled();
  });

  it('preserves a committed result and releases the queue when close fails', async () => {
    const connection = (closeFails: boolean) => ({
      execAsync: jest.fn(),
      getFirstAsync: jest.fn().mockResolvedValue({ foreign_keys: 1 }),
      withTransactionAsync: jest.fn(async (task: () => Promise<void>) => { await task(); }),
      closeAsync: closeFails
        ? jest.fn().mockRejectedValue(new Error('native close failed'))
        : jest.fn().mockResolvedValue(undefined),
    } as unknown as SQLiteDatabase);
    const first = connection(true);
    const second = connection(false);
    mockOpenDatabaseAsync.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const db = { databasePath: '/data/reploom.db', options: {} } as SQLiteDatabase;

    await expect(withForeignKeyTransaction(db, async () => 'committed')).resolves.toBe('committed');
    await expect(withForeignKeyTransaction(db, async () => 'next')).resolves.toBe('next');

    expect(first.closeAsync).toHaveBeenCalledTimes(1);
    expect(second.withTransactionAsync).toHaveBeenCalledTimes(1);
  });
});
