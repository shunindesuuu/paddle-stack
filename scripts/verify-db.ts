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
  getDuprSettings,
  getSession,
  getSessionRoster,
  getSetting,
  setSetting,
  setDuprSettings,
  linkPlayers,
  listPlayers,
  listSessions,
  loadRounds,
  playerStats,
  removePlayerFromSession,
  saveRound,
  sessionStandings,
  setMatchScore,
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
  check('winner column exists', cols.some((x) => x.name === 'winner'));

  // Migration 2->3 drops the original score columns; 6->7 introduces new ones
  // for the points feature. Both run here, so the columns exist again - but
  // the legacy values must NOT come back with them, or a 2019 score would
  // reappear as if someone had just typed it in.
  check('score columns exist again after 6->7', cols.some((x) => x.name === 'score_a'));
  const legacyScores = legacy.getAllSync<{ score_a: number | null; score_b: number | null }>(
    'SELECT score_a, score_b FROM matches;'
  );
  check(
    'legacy scores did not survive the rebuild',
    legacyScores.every((m) => m.score_a === null && m.score_b === null)
  );

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

// --- DUPR ---------------------------------------------------------------

{
  check('DUPR mode is off by default', getDuprSettings().useDupr === false);

  const rated = createPlayer('Ivy', 'beginner', 3.5);
  const unrated = createPlayer('Jax', 'beginner');

  check(
    'with DUPR mode off, a rated player still uses their manual tier',
    listPlayers().find((p) => p.id === rated.id)?.tier === 'beginner'
  );

  setDuprSettings({ useDupr: true }); // defaults: beginner < 3.0, advanced >= 4.0
  const ivyOn = listPlayers().find((p) => p.id === rated.id)!;
  check('3.5 DUPR lands in the default intermediate bracket', ivyOn.tier === 'intermediate');
  check('manual tier is preserved underneath the derived one', ivyOn.manualTier === 'beginner');

  const jaxOn = listPlayers().find((p) => p.id === unrated.id)!;
  check('a player with no DUPR rating still falls back to their manual tier', jaxOn.tier === 'beginner');

  setDuprSettings({ beginnerMax: 2, intermediateMax: 3 });
  const ivyShifted = listPlayers().find((p) => p.id === rated.id)!;
  check('moving the brackets re-derives the tier', ivyShifted.tier === 'advanced');

  updatePlayer(rated.id, 'Ivy', 'advanced'); // no dupr arg: rating must survive
  const ivyAfterTierOnlyUpdate = listPlayers().find((p) => p.id === rated.id)!;
  check('updatePlayer without a dupr arg leaves the rating untouched', ivyAfterTierOnlyUpdate.dupr === 3.5);

  updatePlayer(rated.id, 'Ivy', 'advanced', null);
  const ivyCleared = listPlayers().find((p) => p.id === rated.id)!;
  check('updatePlayer(..., null) clears the rating', ivyCleared.dupr === null);
  check('once cleared, the manual tier takes back over', ivyCleared.tier === 'advanced');

  setDuprSettings({ useDupr: false, beginnerMax: 3.0, intermediateMax: 4.0 });
}

// --- session standings ------------------------------------------------------

{
  // Two sessions with hand-picked winners, so every number below is exact.
  // Both are created within the same second, which is precisely the case the
  // "prior form" query's id tiebreak has to resolve.
  const p1 = createPlayer('Standing One', 'intermediate');
  const p2 = createPlayer('Standing Two', 'intermediate');
  const p3 = createPlayer('Standing Three', 'intermediate');
  const p4 = createPlayer('Standing Four', 'intermediate');
  const ids = [p1.id, p2.id, p3.id, p4.id];

  const playTwo = (sid: number, winner: 'A' | 'B') => {
    for (const number of [1, 2]) {
      const stored = saveRound(sid, {
        number,
        matches: [
          { court: 0, mode: 'doubles', teamA: [p1.id, p2.id], teamB: [p3.id, p4.id], winner: null, scoreA: null, scoreB: null },
        ],
        resting: [],
      });
      setMatchWinner(stored.matches[0].id, winner);
    }
  };

  const earlier = createSession({
    name: 'Earlier night', mode: 'doubles', strategy: 'mixed', courts: 1, playerIds: ids,
  });
  playTwo(earlier, 'B'); // p3+p4 sweep, so p1/p2 arrive at the next session on 0%
  endSession(earlier);

  const later = createSession({
    name: 'Later night', mode: 'doubles', strategy: 'mixed', courts: 1, playerIds: ids,
  });
  playTwo(later, 'A'); // the result flips

  const table = sessionStandings(later);
  check('standings cover everyone who played the session', table.length === 4);

  const one = table.find((s) => s.player.id === p1.id)!;
  const three = table.find((s) => s.player.id === p3.id)!;

  check('session record is scoped to that session', one.wins === 2 && one.losses === 0);
  check('session win rate ignores other sessions', one.winRate === 1);
  check('prior form is read from earlier sessions only', one.priorWinRate === 0);
  check('improving shows as a positive delta', one.deltaPct === 100, `got ${one.deltaPct}`);
  check('falling off shows as a negative delta', three.deltaPct === -100, `got ${three.deltaPct}`);
  check('winners are ranked above losers', table[0].wins > table[table.length - 1].wins);

  const earlierTable = sessionStandings(earlier);
  check(
    'an earlier session is unaffected by later results',
    earlierTable.find((s) => s.player.id === p1.id)?.wins === 0
  );
  check(
    'a first session has no prior form to compare against',
    earlierTable.every((s) => s.priorWinRate === null && s.deltaPct === null)
  );

  // An unscored match is a game played, but must not move the win rate.
  saveRound(later, {
    number: 3,
    matches: [
      { court: 0, mode: 'doubles', teamA: [p1.id, p2.id], teamB: [p3.id, p4.id], winner: null, scoreA: null, scoreB: null },
    ],
    resting: [],
  });
  const undecided = sessionStandings(later).find((s) => s.player.id === p1.id)!;
  check('an undecided match still counts as a game', undecided.games === 3);
  check('an undecided match leaves the win rate alone', undecided.winRate === 1);

  check('standings for a missing session come back empty', sessionStandings(999999).length === 0);
}

// --- match scores -----------------------------------------------------------

{
  const a1 = createPlayer('Score A1', 'intermediate');
  const a2 = createPlayer('Score A2', 'intermediate');
  const b1 = createPlayer('Score B1', 'intermediate');
  const b2 = createPlayer('Score B2', 'intermediate');
  const sid = createSession({
    name: 'Scored night', mode: 'doubles', strategy: 'mixed', courts: 1,
    playerIds: [a1.id, a2.id, b1.id, b2.id],
  });

  const play = (number: number) =>
    saveRound(sid, {
      number,
      matches: [
        { court: 0, mode: 'doubles', teamA: [a1.id, a2.id], teamB: [b1.id, b2.id], winner: null, scoreA: null, scoreB: null },
      ],
      resting: [],
    });

  const first = play(1);
  check('a new match starts with no score', first.matches[0].scoreA === null);

  setMatchScore(first.matches[0].id, 11, 8);
  const scored = loadRounds(sid)[0].matches[0];
  check('scores round-trip through the database', scored.scoreA === 11 && scored.scoreB === 8);
  check('the winner is derived from the score', scored.winner === 'A');

  // Half a score is a legitimate intermediate state while typing.
  setMatchScore(first.matches[0].id, 11, null);
  const half = loadRounds(sid)[0].matches[0];
  check('a half-entered score decides nothing', half.winner === null && half.scoreA === 11);

  // A tie is recorded but settles nothing.
  setMatchScore(first.matches[0].id, 9, 9);
  check('a tied score leaves the match undecided', loadRounds(sid)[0].matches[0].winner === null);

  setMatchScore(first.matches[0].id, 7, 11);
  check('the lower score loses', loadRounds(sid)[0].matches[0].winner === 'B');

  // Tapping the cup after a score must not leave the two disagreeing.
  setMatchWinner(first.matches[0].id, 'A');
  const cleared = loadRounds(sid)[0].matches[0];
  check(
    'recording a bare win clears any stored score',
    cleared.winner === 'A' && cleared.scoreA === null && cleared.scoreB === null
  );

  // Points feed the standings.
  setMatchScore(first.matches[0].id, 11, 8);
  const table = sessionStandings(sid);
  const winner = table.find((s) => s.player.id === a1.id)!;
  const loser = table.find((s) => s.player.id === b1.id)!;
  check('points for/against follow the player\'s side', winner.pointsFor === 11 && winner.pointsAgainst === 8);
  check('the losing side sees the mirror image', loser.pointsFor === 8 && loser.pointsAgainst === 11);
  check('point difference is signed', winner.pointDiff === 3 && loser.pointDiff === -3);
  check('scoredGames counts only matches carrying a score', winner.scoredGames === 1);

  // A bare win contributes no phantom 0-0.
  const second = play(2);
  setMatchWinner(second.matches[0].id, 'A');
  const afterBare = sessionStandings(sid).find((s) => s.player.id === a1.id)!;
  check('a bare win adds no points', afterBare.pointsFor === 11 && afterBare.pointsAgainst === 8);
  check('but it still counts as a game and a win', afterBare.games === 2 && afterBare.wins === 2);
  check('scoredGames ignores the unscored win', afterBare.scoredGames === 1);

  // Equal wins must be separated by point difference, which is the whole
  // reason scores exist.
  const third = play(3);
  setMatchScore(third.matches[0].id, 11, 2);
  const ranked = sessionStandings(sid);
  check('everyone on this court has the same games played', ranked.every((s) => s.games === 3));
  check(
    'wins rank first, point difference breaks the tie',
    ranked[0].pointDiff >= ranked[1].pointDiff && ranked[0].wins >= ranked[ranked.length - 1].wins
  );
  const winners = ranked.filter((s) => s.wins === 3);
  check('both winners are ahead of both losers', winners.length === 2 && ranked.slice(0, 2).every((s) => s.wins === 3));

  const allTime = playerStats().find((s) => s.player.id === a1.id)!;
  check('the all-time table carries points too', allTime.pointsFor === 22 && allTime.pointsAgainst === 10);

  deleteSession(sid);
}

// --- removing a player mid-session ------------------------------------------

{
  const keep1 = createPlayer('Stay One', 'intermediate');
  const keep2 = createPlayer('Stay Two', 'intermediate');
  const keep3 = createPlayer('Stay Three', 'intermediate');
  const leaver = createPlayer('Leaver', 'intermediate');
  const sid = createSession({
    name: 'Someone leaves', mode: 'doubles', strategy: 'mixed', courts: 1,
    playerIds: [keep1.id, keep2.id, keep3.id, leaver.id],
  });

  const round = saveRound(sid, {
    number: 1,
    matches: [
      { court: 0, mode: 'doubles', teamA: [keep1.id, leaver.id], teamB: [keep2.id, keep3.id], winner: null, scoreA: null, scoreB: null },
    ],
    resting: [],
  });
  setMatchScore(round.matches[0].id, 11, 6);

  check('roster starts at 4', getSessionRoster(sid).length === 4);

  removePlayerFromSession(sid, leaver.id);
  check('the removed player leaves the rotation', getSessionRoster(sid).length === 3);
  check('and is not on the roster', !getSessionRoster(sid).some((p) => p.id === leaver.id));
  check('everyone else stays', getSessionRoster(sid).some((p) => p.id === keep1.id));

  // Their finished game has to survive, or the standings would silently
  // rewrite results that already happened.
  const stillThere = loadRounds(sid)[0].matches[0];
  check('the match they already played is untouched', stillThere.teamA.includes(leaver.id));
  const standing = sessionStandings(sid).find((s) => s.player.id === leaver.id);
  check('they keep their result in the standings', standing?.wins === 1 && standing?.pointsFor === 11);

  // Removing someone twice, or removing a stranger, must be a no-op.
  removePlayerFromSession(sid, leaver.id);
  check('removing twice is harmless', getSessionRoster(sid).length === 3);
  removePlayerFromSession(sid, 999999);
  check('removing an unknown player is harmless', getSessionRoster(sid).length === 3);

  deleteSession(sid);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
