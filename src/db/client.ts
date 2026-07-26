/**
 * Production SQLite connection.
 *
 * Tables are created with idempotent `CREATE TABLE IF NOT EXISTS` rather than
 * a migration pipeline: the app is fully offline with no server, so a single
 * bootstrap is all it needs. The applied version lives in SQLite's own
 * `user_version` pragma - see ddl.ts to evolve the schema.
 */

import * as SQLite from 'expo-sqlite';
import { SCHEMA_VERSION, applyMigrations } from './ddl';
import { setDriver } from './driver';

export const DB_NAME = 'paddlestack.db';

export const sqlite = SQLite.openDatabaseSync(DB_NAME);

let initialised = false;

/** Idempotent; safe to call on every app start. */
export function initDatabase(): void {
  if (initialised) return;

  // expo-sqlite's synchronous API matches SqliteDriver apart from requiring an
  // explicit params argument, so default it here.
  setDriver({
    execSync: (sql) => sqlite.execSync(sql),
    runSync: (sql, params = []) => sqlite.runSync(sql, params),
    getAllSync: (sql, params = []) => sqlite.getAllSync(sql, params),
    getFirstSync: (sql, params = []) => sqlite.getFirstSync(sql, params),
    withTransactionSync: (task) => sqlite.withTransactionSync(task),
  });

  sqlite.execSync('PRAGMA journal_mode = WAL;');
  sqlite.execSync('PRAGMA foreign_keys = ON;');

  const row = sqlite.getFirstSync<{ user_version: number }>('PRAGMA user_version;');
  const applied = applyMigrations(row?.user_version ?? 0, (sql) => sqlite.execSync(sql));

  // PRAGMA cannot take bound parameters; the version is a compile-time
  // constant so the interpolation is safe.
  sqlite.execSync(`PRAGMA user_version = ${applied};`);
  initialised = true;
}

export { SCHEMA_VERSION };

/** Wipes all data. Backs a "reset everything" action. */
export function resetDatabase(): void {
  sqlite.execSync(`
    DELETE FROM round_rests;
    DELETE FROM match_players;
    DELETE FROM matches;
    DELETE FROM rounds;
    DELETE FROM session_players;
    DELETE FROM sessions;
    DELETE FROM players;
  `);
}
