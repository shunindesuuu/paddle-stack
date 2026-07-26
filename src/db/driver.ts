/**
 * Thin driver seam over SQLite.
 *
 * The repository talks to this interface rather than to expo-sqlite directly,
 * which lets the data layer be exercised against a plain Node SQLite database
 * in tests. The shape mirrors expo-sqlite's synchronous API, so the production
 * adapter is the expo database object itself.
 */

export type RunResult = { lastInsertRowId: number; changes: number };
export type BindValue = string | number | null;

export interface SqliteDriver {
  execSync(sql: string): void;
  runSync(sql: string, params?: BindValue[]): RunResult;
  getAllSync<T>(sql: string, params?: BindValue[]): T[];
  getFirstSync<T>(sql: string, params?: BindValue[]): T | null;
  withTransactionSync(task: () => void): void;
}

let current: SqliteDriver | null = null;

export function setDriver(driver: SqliteDriver): void {
  current = driver;
}

function active(): SqliteDriver {
  if (!current) {
    throw new Error('SQLite driver not set. Call initDatabase() before querying.');
  }
  return current;
}

/** Stable handle callers import; always forwards to the driver in use. */
export const db: SqliteDriver = {
  execSync: (sql) => active().execSync(sql),
  runSync: (sql, params) => active().runSync(sql, params),
  getAllSync: (sql, params) => active().getAllSync(sql, params),
  getFirstSync: (sql, params) => active().getFirstSync(sql, params),
  withTransactionSync: (task) => active().withTransactionSync(task),
};
