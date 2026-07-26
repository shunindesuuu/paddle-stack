/**
 * Exercises the real repository against Node's built-in SQLite.
 *
 * The repo talks to the SqliteDriver seam, so the only thing swapped out here
 * is the driver - every SQL statement, join and transaction under test is the
 * same code the app runs on device.
 *
 * Run: npm run verify:db
 */

import { DatabaseSync } from 'node:sqlite';
import { applyMigrations, migrations } from '../src/db/ddl';
import { BindValue, RunResult, SqliteDriver, setDriver } from '../src/db/driver';
import {
  buildHistory,
  createPlayer,
  createSession,
  deleteOrArchivePlayer,
  deleteSession,
  endSession,
  getActiveSession,
  getSession,
  getSessionRoster,
  getSetting,
  setSetting,
  linkPlayers,
  listPlayers,
  listSessions,
  loadRounds,
  playerStats,
  saveRound,
  setMatchWinner,
  setSessionRoster,
  unlinkPlayer,
  updatePlayer,
  updateRoundLineups,
  updateSessionSettings,
} from '../src/db/repo';
import { Round } from '../src/domain/types';
import { generateRound, swapSlots } from '../src/pairing/engine';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (!cond) {
    failures++;
    console.log(`FAIL  ${name} ${extra}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

// --- node:sqlite adapter implementing the app's driver interface ------------

function nodeDriver(): SqliteDriver {
  const conn = new DatabaseSync(':memory:');
  conn.exec('PRAGMA foreign_keys = ON;');

  const bind = (params?: BindValue[]) => (params ?? []) as never[];

  return {
    execSync: (sql) => conn.exec(sql),
    runSync: (sql, params): RunResult => {
      const r = conn.prepare(sql).run(...bind(params));
      return {
        lastInsertRowId: Number(r.lastInsertRowid),
        changes: Number(r.changes),
      };
    },
    getAllSync: <T,>(sql: string, params?: BindValue[]): T[] =>
      conn.prepare(sql).all(...bind(params)) as T[],
    getFirstSync: <T,>(sql: string, params?: BindValue[]): T | null =>
      (conn.prepare(sql).get(...bind(params)) as T) ?? null,
    withTransactionSync: (task) => {
      conn.exec('BEGIN;');
      try {
        task();
        conn.exec('COMMIT;');
      } catch (e) {
        conn.exec('ROLLBACK;');
        throw e;
      }
    },
  };
}

const driver = nodeDriver();
setDriver(driver);
applyMigrations(0, (sql) => driver.execSync(sql));

// --- players ----------------------------------------------------------------

const ana = createPlayer('Ana', 'advanced');
const ben = createPlayer('Ben', 'advanced');
const cy = createPlayer('Cy', 'intermediate');
const dee = createPlayer('Dee', 'intermediate');
const eli = createPlayer('Eli', 'intermediate');
const fay = createPlayer('Fay', 'intermediate');
const gus = createPlayer('Gus', 'beginner');
const hal = createPlayer('Hal', 'beginner');
const all = [ana, ben, cy, dee, eli, fay, gus, hal];

check('createPlayer returns real ids', all.every((p) => p.id > 0));
check('ids are unique', new Set(all.map((p) => p.id)).size === 8);
check('listPlayers returns all 8', listPlayers().length === 8);
check('listPlayers sorts by name', listPlayers()[0].name === 'Ana');

updatePlayer(cy.id, 'Cyrus', 'advanced');
const cyrus = listPlayers().find((p) => p.id === cy.id)!;
check('updatePlayer persists name + tier', cyrus.name === 'Cyrus' && cyrus.tier === 'advanced');

// A player with no matches should hard-delete.
const temp = createPlayer('Temp', 'beginner');
check('deletes player with no history', deleteOrArchivePlayer(temp.id) === 'deleted');
check('deleted player is gone', !listPlayers().some((p) => p.id === temp.id));

// --- session ----------------------------------------------------------------

const sessionId = createSession({
  name: 'Tuesday night',
  mode: 'doubles',
  strategy: 'mixed',
  courts: 2,
  playerIds: all.map((p) => p.id),
});

check('createSession returns id', sessionId > 0);
check('getSession round-trips fields', (() => {
  const s = getSession(sessionId);
  return !!s && s.name === 'Tuesday night' && s.mode === 'doubles' && s.courts === 2;
})());
check('getActiveSession finds the open session', getActiveSession()?.id === sessionId);
check('roster has 8 players', getSessionRoster(sessionId).length === 8);

updateSessionSettings(sessionId, { strategy: 'rotation', courts: 3 });
const updated = getSession(sessionId)!;
check('updateSessionSettings persists', updated.strategy === 'rotation' && updated.courts === 3);
updateSessionSettings(sessionId, { courts: 2 });

// --- auto-queue flag --------------------------------------------------------

{
  check('auto-queue defaults to off', getSession(sessionId)?.autoQueue === false);

  updateSessionSettings(sessionId, { autoQueue: true });
  check('auto-queue can be turned on', getSession(sessionId)?.autoQueue === true);

  updateSessionSettings(sessionId, { autoQueue: false });
  check('auto-queue can be turned off again', getSession(sessionId)?.autoQueue === false);

  // Toggling it must not disturb the other session settings.
  const s = getSession(sessionId)!;
  check('auto-queue toggle left other settings alone', s.mode === 'doubles' && s.courts === 2);

  const auto = createSession({
    name: 'Rolling',
    mode: 'doubles',
    strategy: 'mixed',
    courts: 1,
    playerIds: [ana.id, ben.id, dee.id, eli.id],
    autoQueue: true,
  });
  check('auto-queue can be set at creation', getSession(auto)?.autoQueue === true);
  deleteSession(auto);
}

// --- honor_links flag --------------------------------------------------------

{
  check('honor-links defaults to on', getSession(sessionId)?.honorLinks === true);

  updateSessionSettings(sessionId, { honorLinks: false });
  check('honor-links can be turned off', getSession(sessionId)?.honorLinks === false);
  updateSessionSettings(sessionId, { honorLinks: true });
  check('honor-links can be turned back on', getSession(sessionId)?.honorLinks === true);

  const noLinks = createSession({
    name: 'Tournament',
    mode: 'doubles',
    strategy: 'mixed',
    courts: 1,
    playerIds: [ana.id, ben.id, dee.id, eli.id],
    honorLinks: false,
  });
  check('honor-links can be set at creation', getSession(noLinks)?.honorLinks === false);
  deleteSession(noLinks);
}

// --- linked partners ("Link") ------------------------------------------------

{
  check('players start unlinked', listPlayers().every((p) => p.linkedPlayerId === null));

  linkPlayers(fay.id, gus.id);
  const fayL = listPlayers().find((p) => p.id === fay.id)!;
  const gusL = listPlayers().find((p) => p.id === gus.id)!;
  check('link is mutual', fayL.linkedPlayerId === gus.id && gusL.linkedPlayerId === fay.id);

  // Re-linking either player to someone new must break the old link cleanly -
  // nobody should end up linked to a partner who no longer points back.
  linkPlayers(fay.id, hal.id);
  const fay2 = listPlayers().find((p) => p.id === fay.id)!;
  const gus2 = listPlayers().find((p) => p.id === gus.id)!;
  const hal2 = listPlayers().find((p) => p.id === hal.id)!;
  check('re-linking breaks the old partner on both sides', gus2.linkedPlayerId === null);
  check('re-linking sets the new link both ways', fay2.linkedPlayerId === hal.id && hal2.linkedPlayerId === fay.id);

  unlinkPlayer(fay.id);
  const fay3 = listPlayers().find((p) => p.id === fay.id)!;
  const hal3 = listPlayers().find((p) => p.id === hal.id)!;
  check('unlink clears both sides', fay3.linkedPlayerId === null && hal3.linkedPlayerId === null);
}

// --- rounds -----------------------------------------------------------------

const roster = getSessionRoster(sessionId);
const played: Round[] = [];

for (let i = 1; i <= 4; i++) {
  const res = generateRound({
    players: roster,
    courts: 2,
    mode: 'doubles',
    strategy: 'rotation',
    history: buildHistory(sessionId),
    roundNumber: i,
  });
  if (!res.ok) throw new Error(res.reason);
  saveRound(sessionId, res.round);
  played.push(res.round);
}

const loaded = loadRounds(sessionId);
check('4 rounds saved and loaded', loaded.length === 4);
check('rounds come back in order', loaded.map((r) => r.number).join() === '1,2,3,4');
check('each round has 2 matches', loaded.every((r) => r.matches.length === 2));
check(
  'teams survive the round trip',
  loaded.every((r) => r.matches.every((m) => m.teamA.length === 2 && m.teamB.length === 2))
);
check(
  'saved line-ups match what was generated',
  loaded.every((r, i) =>
    r.matches.every(
      (m, j) =>
        m.teamA.join() === played[i].matches[j].teamA.join() &&
        m.teamB.join() === played[i].matches[j].teamB.join()
    )
  )
);
check(
  'no player appears twice in a round',
  loaded.every((r) => {
    const ids = r.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
    return new Set(ids).size === ids.length;
  })
);

// buildHistory must agree with what was actually stored.
const hist = buildHistory(sessionId);
const totalGames = [...hist.gamesPlayed.values()].reduce((a, b) => a + b, 0);
check('buildHistory counts every seat', totalGames === 4 * 2 * 4, `got ${totalGames}`);
check('buildHistory covers whole roster', hist.gamesPlayed.size === 8);
check(
  'rotation spread games evenly',
  Math.max(...hist.gamesPlayed.values()) - Math.min(...hist.gamesPlayed.values()) <= 1
);

// --- manual swap persistence ------------------------------------------------

{
  const round = loadRounds(sessionId)[0];
  const before = round.matches[0].teamA[0];
  const other = round.matches[1].teamB[0];
  const swapped = swapSlots(round,
    { kind: 'court', court: 0, team: 'A', index: 0 },
    { kind: 'court', court: 1, team: 'B', index: 0 });
  updateRoundLineups(round, swapped);

  const after = loadRounds(sessionId)[0];
  check('swap persisted to court 0', after.matches[0].teamA[0] === other);
  check('swap persisted to court 1', after.matches[1].teamB[0] === before);
  const ids = after.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
  check('swap kept 8 distinct players', new Set(ids).size === 8);
}

// --- scores -----------------------------------------------------------------

{
  const rounds = loadRounds(sessionId);
  // Give court 0 of every round to team A, court 1 to team B.
  for (const r of rounds) {
    setMatchWinner(r.matches[0].id, 'A');
    setMatchWinner(r.matches[1].id, 'B');
  }
  const back = loadRounds(sessionId);
  check('winners persist', back.every((r) => r.matches[0].winner === 'A' && r.matches[1].winner === 'B'));

  // Clearing a winner must return the match to "no result".
  setMatchWinner(rounds[0].matches[0].id, null);
  check('winner can be cleared', loadRounds(sessionId)[0].matches[0].winner === null);
  setMatchWinner(rounds[0].matches[0].id, 'A');

  const stats = playerStats();
  check('playerStats covers everyone who played', stats.length === 8);
  const totalWins = stats.reduce((n, s) => n + s.wins, 0);
  const totalLosses = stats.reduce((n, s) => n + s.losses, 0);
  // 8 matches x 2 winners = 16 winning seats, same for losing seats.
  check('wins add up across the session', totalWins === 16, `got ${totalWins}`);
  check('losses add up across the session', totalLosses === 16, `got ${totalLosses}`);
  check(
    'every player has games = wins + losses',
    stats.every((s) => s.games === s.wins + s.losses)
  );

  // An unscored match must count as a game but never as a win or loss.
  const extra = generateRound({
    players: roster, courts: 1, mode: 'doubles', strategy: 'mixed',
    history: buildHistory(sessionId), roundNumber: 5,
  });
  if (extra.ok) saveRound(sessionId, extra.round);
  const after = playerStats();
  const touched = after.filter((s) => s.wins + s.losses < s.games);
  check('match with no winner counts as a game only', touched.length === 4, `${touched.length} players`);
}

// --- archive keeps history --------------------------------------------------

{
  const outcome = deleteOrArchivePlayer(gus.id);
  check('player with history is archived, not deleted', outcome === 'archived');
  check('archived player hidden from default list', !listPlayers().some((p) => p.id === gus.id));
  check('archived player still in full list', listPlayers(true).some((p) => p.id === gus.id));
  check('archived player keeps their results', playerStats().some((s) => s.player.id === gus.id));
  check('archived player still resolves in past rounds',
    loadRounds(sessionId).some((r) => r.matches.some((m) => [...m.teamA, ...m.teamB].includes(gus.id))));
}

// --- roster edits -----------------------------------------------------------

{
  setSessionRoster(sessionId, [ana.id, ben.id, dee.id, eli.id]);
  check('setSessionRoster replaces the roster', getSessionRoster(sessionId).length === 4);
  setSessionRoster(sessionId, all.map((p) => p.id));
  check('setSessionRoster restores', getSessionRoster(sessionId).length === 8);
}

// --- ending & deleting ------------------------------------------------------

{
  endSession(sessionId);
  check('endSession clears the active session', getActiveSession() === null);
  check('ended session still listed', listSessions().some((s) => s.id === sessionId));
  check('endedAt is set', getSession(sessionId)?.endedAt != null);

  const second = createSession({
    name: 'Wednesday', mode: 'singles', strategy: 'balanced', courts: 1,
    playerIds: [ana.id, ben.id],
  });
  check('new session becomes active', getActiveSession()?.id === second);
  check('singles session stores mode', getSession(second)?.mode === 'singles');

  const roundCountBefore = loadRounds(sessionId).length;
  check('session has rounds before delete', roundCountBefore > 0);
  deleteSession(sessionId);
  check('deleteSession removes the session', getSession(sessionId) === null);
  check('cascade removed its rounds', loadRounds(sessionId).length === 0);
  check('cascade removed its matches from stats',
    playerStats().every((s) => s.games === 0) || playerStats().length === 0);
}

// --- settings ---------------------------------------------------------------

{
  check('missing setting reads as null', getSetting('nope') === null);
  setSetting('theme_mode', 'dark');
  check('setting persists', getSetting('theme_mode') === 'dark');
  setSetting('theme_mode', 'light');
  check('setting upserts rather than duplicating', getSetting('theme_mode') === 'light');

  // Preferences must survive the data wipe offered in Settings.
  const rows = driver.getAllSync<{ n: number }>('SELECT COUNT(*) AS n FROM settings;');
  check('only one settings row for the key', rows[0].n === 1);
}

// --- upgrading the whole chain from v1 --------------------------------------

{
  // Build a true v1 database by running only the first migration, so this
  // tests the real upgrade path rather than replaying steps on an
  // already-current schema.
  const legacy = nodeDriver();
  for (const stmt of migrations[0]) legacy.execSync(stmt);

  legacy.runSync("INSERT INTO players (id, name, tier) VALUES (1, 'Legacy', 'beginner');");
  legacy.runSync(
    "INSERT INTO sessions (id, name, mode, strategy, courts) VALUES (1, 'Old', 'doubles', 'mixed', 1);"
  );
  legacy.runSync('INSERT INTO rounds (id, session_id, number) VALUES (1, 1, 1);');
  legacy.runSync(
    "INSERT INTO matches (id, round_id, court, mode, score_a, score_b) VALUES (1,1,0,'doubles',11,4);"
  );

  applyMigrations(1, (sql) => legacy.execSync(sql));

  const kept = legacy.getFirstSync<{ name: string }>('SELECT name FROM players LIMIT 1;');
  check('v1 -> latest keeps existing rows', kept?.name === 'Legacy');

  legacy.runSync("INSERT INTO settings (key, value) VALUES ('k', 'v');");
  const setting = legacy.getFirstSync<{ value: string }>("SELECT value FROM settings WHERE key='k';");
  check('v1 -> latest adds the settings table', setting?.value === 'v');

  const m = legacy.getFirstSync<{ winner: string | null }>('SELECT winner FROM matches WHERE id = 1;');
  check('v1 -> latest converts scores to a winner', m?.winner === 'A');
}

// --- v2 -> v3 migration on a database that already holds real data ----------

{
  // Build a v2-shaped database (scores, no winner column) with rounds and
  // results in it, exactly like the one already installed on a phone, then
  // migrate and assert nothing was lost.
  // Build a true v2 database by running only the first two migrations.
  // Replaying `applyMigrations(0, ...)` would run the chain to the latest
  // version, and re-applying later steps on top of it fails (a second
  // `ADD COLUMN auto_queue` is a duplicate) - so construct the old state
  // exactly rather than upgrading and rewinding.
  const legacy = nodeDriver();
  for (const stmt of [...migrations[0], ...migrations[1]]) legacy.execSync(stmt);

  legacy.runSync("INSERT INTO players (id, name, tier) VALUES (1, 'Edwin', 'intermediate');");
  legacy.runSync("INSERT INTO players (id, name, tier) VALUES (2, 'Paolo', 'beginner');");
  legacy.runSync(
    "INSERT INTO sessions (id, name, mode, strategy, courts) VALUES (1, 'Old night', 'doubles', 'mixed', 1);"
  );
  legacy.runSync('INSERT INTO rounds (id, session_id, number) VALUES (1, 1, 1);');
  // A win for A, a win for B, an unplayed match, and a draw.
  legacy.runSync("INSERT INTO matches (id, round_id, court, mode, score_a, score_b) VALUES (1,1,0,'doubles',11,7);");
  legacy.runSync("INSERT INTO matches (id, round_id, court, mode, score_a, score_b) VALUES (2,1,1,'doubles',5,11);");
  legacy.runSync("INSERT INTO matches (id, round_id, court, mode, score_a, score_b) VALUES (3,1,2,'doubles',NULL,NULL);");
  legacy.runSync("INSERT INTO matches (id, round_id, court, mode, score_a, score_b) VALUES (4,1,3,'doubles',9,9);");
  legacy.runSync("INSERT INTO match_players (match_id, player_id, team, slot) VALUES (1,1,'A',0);");
  legacy.runSync("INSERT INTO match_players (match_id, player_id, team, slot) VALUES (1,2,'B',0);");

  applyMigrations(2, (sql) => legacy.execSync(sql));

  const winners = legacy.getAllSync<{ id: number; winner: string | null }>(
    'SELECT id, winner FROM matches ORDER BY id;'
  );
  check('migration kept all 4 matches', winners.length === 4);
  check('score 11-7 became a win for A', winners[0].winner === 'A');
  check('score 5-11 became a win for B', winners[1].winner === 'B');
  check('unplayed match stays unplayed', winners[2].winner === null);
  check('a draw becomes no result', winners[3].winner === null);

  const cols = legacy.getAllSync<{ name: string }>("PRAGMA table_info('matches');");
  check('score columns are gone', !cols.some((x) => x.name === 'score_a' || x.name === 'score_b'));
  check('winner column exists', cols.some((x) => x.name === 'winner'));

  // The child rows must still resolve after the table swap.
  const kids = legacy.getAllSync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM match_players WHERE match_id = 1;'
  );
  check('match_players survived the table rebuild', kids[0].n === 2);
  check('players survived', legacy.getAllSync('SELECT * FROM players;').length === 2);

  // And foreign keys must be back on, or later cascades silently stop working.
  const fk = legacy.getFirstSync<{ foreign_keys: number }>('PRAGMA foreign_keys;');
  check('foreign keys re-enabled after migration', fk?.foreign_keys === 1);

  // Cascade still works end to end.
  legacy.runSync('DELETE FROM sessions WHERE id = 1;');
  check(
    'cascade still deletes matches after rebuild',
    legacy.getAllSync('SELECT * FROM matches;').length === 0
  );
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
