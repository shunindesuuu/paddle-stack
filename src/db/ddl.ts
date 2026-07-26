/**
 * Schema definition, kept free of imports so both the app and the test
 * harness can create an identical database.
 *
 * To evolve the schema: bump SCHEMA_VERSION and append a new array of
 * statements. Entry N upgrades a database from version N to N+1.
 */

export const SCHEMA_VERSION = 6;

export const migrations: string[][] = [
  // 0 -> 1 : initial schema
  [
    `CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tier TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      mode TEXT NOT NULL,
      strategy TEXT NOT NULL,
      courts INTEGER NOT NULL,
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      ended_at INTEGER
    );`,
    `CREATE TABLE IF NOT EXISTS session_players (
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      PRIMARY KEY (session_id, player_id)
    );`,
    `CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      number INTEGER NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS rounds_session_idx ON rounds(session_id);`,
    `CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      court INTEGER NOT NULL,
      mode TEXT NOT NULL,
      score_a INTEGER,
      score_b INTEGER
    );`,
    `CREATE INDEX IF NOT EXISTS matches_round_idx ON matches(round_id);`,
    `CREATE TABLE IF NOT EXISTS match_players (
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      team TEXT NOT NULL,
      slot INTEGER NOT NULL,
      PRIMARY KEY (match_id, player_id)
    );`,
    `CREATE INDEX IF NOT EXISTS match_players_match_idx ON match_players(match_id);`,
    `CREATE TABLE IF NOT EXISTS round_rests (
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      PRIMARY KEY (round_id, player_id)
    );`,
  ],
  // 1 -> 2 : app preferences (theme choice, and anything else small later)
  [
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );`,
  ],
  // 2 -> 3 : record the winning side instead of two scores.
  //
  // Done as a table rebuild rather than `ALTER TABLE ... DROP COLUMN`, which
  // needs SQLite 3.35+ and would leave databases on older engines broken.
  // Foreign keys are suspended for the swap because match_players references
  // matches(id); row ids are carried over unchanged, so those rows stay valid.
  [
    `PRAGMA foreign_keys = OFF;`,
    `CREATE TABLE matches_v3 (
      id INTEGER PRIMARY KEY,
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      court INTEGER NOT NULL,
      mode TEXT NOT NULL,
      winner TEXT
    );`,
    // A recorded draw becomes "unplayed": the new model has no way to say
    // "played but nobody won", and a draw never counted as a win regardless.
    `INSERT INTO matches_v3 (id, round_id, court, mode, winner)
     SELECT id, round_id, court, mode,
            CASE
              WHEN score_a IS NULL OR score_b IS NULL THEN NULL
              WHEN score_a > score_b THEN 'A'
              WHEN score_b > score_a THEN 'B'
              ELSE NULL
            END
     FROM matches;`,
    `DROP TABLE matches;`,
    `ALTER TABLE matches_v3 RENAME TO matches;`,
    `CREATE INDEX IF NOT EXISTS matches_round_idx ON matches(round_id);`,
    `PRAGMA foreign_keys = ON;`,
  ],
  // 3 -> 4 : continuous play. When on, finishing every court in a round starts
  // the next one automatically, so a rented-court session needs no taps beyond
  // recording who won.
  [`ALTER TABLE sessions ADD COLUMN auto_queue INTEGER NOT NULL DEFAULT 0;`],
  // 4 -> 5 : fixed doubles partners ("Link"). A link is mutual and lives on
  // the player, so it carries over between sessions the way tier does;
  // `honor_links` lets a single session opt out (e.g. a tournament night)
  // without breaking the standing link.
  [
    `ALTER TABLE players ADD COLUMN linked_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL;`,
    `ALTER TABLE sessions ADD COLUMN honor_links INTEGER NOT NULL DEFAULT 1;`,
  ],
  // 5 -> 6 : optional DUPR rating per player. When DUPR mode is on (a global
  // setting, see settings keys `use_dupr`/`dupr_beginner_max`/
  // `dupr_intermediate_max`) it's mapped through the configured brackets to
  // derive an effective tier, so a player without a rating keeps working off
  // their manually set tier.
  [`ALTER TABLE players ADD COLUMN dupr REAL;`],
];

/** Applies any migrations the database hasn't seen yet. */
export function applyMigrations(
  currentVersion: number,
  exec: (sql: string) => void
): number {
  for (let v = currentVersion; v < SCHEMA_VERSION; v++) {
    for (const stmt of migrations[v] ?? []) exec(stmt);
  }
  return SCHEMA_VERSION;
}
