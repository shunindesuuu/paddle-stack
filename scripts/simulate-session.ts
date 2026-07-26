/**
 * Simulates a full open-play night against the real database and the real
 * pairing engine, then reports whether it was actually fair.
 *
 * Defaults to the awkward case: 25 players on 4 courts. 25 doesn't divide by
 * 4, so 9 people sit out every round and the rest-fairness rule is doing real
 * work - if it's wrong, someone plays several games fewer than everyone else.
 *
 * Run: npm run simulate  [players] [courts] [rounds]
 */

import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '../src/db/ddl';
import { BindValue, RunResult, SqliteDriver, setDriver } from '../src/db/driver';
import {
  buildHistory,
  createPlayer,
  createSession,
  getSessionRoster,
  loadRounds,
  saveRound,
  setMatchWinner,
  playerStats,
} from '../src/db/repo';
import { Tier, TIER_WEIGHT } from '../src/domain/types';
import { generateRound } from '../src/pairing/engine';

const PLAYERS = Number(process.argv[2] ?? 25);
const COURTS = Number(process.argv[3] ?? 4);
const ROUNDS = Number(process.argv[4] ?? 15);

function nodeDriver(): SqliteDriver {
  const conn = new DatabaseSync(':memory:');
  conn.exec('PRAGMA foreign_keys = ON;');
  const bind = (p?: BindValue[]) => (p ?? []) as never[];
  return {
    execSync: (sql) => conn.exec(sql),
    runSync: (sql, p): RunResult => {
      const r = conn.prepare(sql).run(...bind(p));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getAllSync: <T,>(sql: string, p?: BindValue[]): T[] => conn.prepare(sql).all(...bind(p)) as T[],
    getFirstSync: <T,>(sql: string, p?: BindValue[]): T | null =>
      (conn.prepare(sql).get(...bind(p)) as T) ?? null,
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

// A realistic club spread: mostly intermediate, a few strong, a few new.
const NAMES = [
  'Ana','Ben','Cy','Dee','Eli','Fay','Gus','Hal','Ivy','Jo','Kit','Lou','Max','Nia','Om',
  'Pia','Quin','Rae','Sam','Tess','Uma','Vic','Wes','Xan','Yuri','Zed','Abe','Bea','Cam','Dax',
];
const tierFor = (i: number): Tier =>
  i % 7 === 0 ? 'advanced' : i % 3 === 0 ? 'beginner' : 'intermediate';

const roster = Array.from({ length: PLAYERS }, (_, i) =>
  createPlayer(NAMES[i % NAMES.length] + (i >= NAMES.length ? `-${i}` : ''), tierFor(i))
);

const sessionId = createSession({
  name: 'Simulated night',
  mode: 'doubles',
  strategy: 'mixed',
  courts: COURTS,
  playerIds: roster.map((p) => p.id),
  autoQueue: true,
});

const players = getSessionRoster(sessionId);
const byId = new Map(players.map((p) => [p.id, p]));
const weight = (id: number) => TIER_WEIGHT[byId.get(id)!.tier];

console.log(`\n=== ${PLAYERS} players · ${COURTS} courts · ${ROUNDS} rounds (auto-queue) ===`);
console.log(`${COURTS * 4} play each round, ${PLAYERS - COURTS * 4} sit out\n`);

let maxGapSeen = 0;
const waitStreak = new Map<number, number>();
const worstStreak = new Map<number, number>();

for (let n = 1; n <= ROUNDS; n++) {
  const res = generateRound({
    players,
    courts: COURTS,
    mode: 'doubles',
    strategy: 'mixed',
    history: buildHistory(sessionId),
    roundNumber: n,
  });
  if (!res.ok) throw new Error(`round ${n}: ${res.reason}`);

  const stored = saveRound(sessionId, res.round);

  // Auto-queue's trigger is every court having a winner, so record one for
  // each court exactly as the app would.
  for (const m of stored.matches) {
    setMatchWinner(m.id, Math.random() < 0.5 ? 'A' : 'B');
  }

  // Track how long anyone has been stuck on the bench.
  const playing = new Set(res.round.matches.flatMap((m) => [...m.teamA, ...m.teamB]));
  for (const p of players) {
    const streak = playing.has(p.id) ? 0 : (waitStreak.get(p.id) ?? 0) + 1;
    waitStreak.set(p.id, streak);
    worstStreak.set(p.id, Math.max(worstStreak.get(p.id) ?? 0, streak));
  }

  const gaps = res.round.matches.map((m) => {
    const sum = (ids: number[]) => ids.reduce((n2, id) => n2 + weight(id), 0);
    return Math.abs(sum(m.teamA) - sum(m.teamB));
  });
  maxGapSeen = Math.max(maxGapSeen, ...gaps);

  if (n <= 3 || n === ROUNDS) {
    console.log(
      `Round ${String(n).padStart(2)}  ` +
        res.round.matches
          .map(
            (m) =>
              `[${m.teamA.map((i) => byId.get(i)!.name).join('+')} v ${m.teamB
                .map((i) => byId.get(i)!.name)
                .join('+')}]`
          )
          .join(' ') +
        `  rest:${res.round.resting.length}`
    );
  }
}

// --- fairness report --------------------------------------------------------

const hist = buildHistory(sessionId);
const games = players.map((p) => hist.gamesPlayed.get(p.id) ?? 0);
const minG = Math.min(...games);
const maxG = Math.max(...games);
const expected = (ROUNDS * COURTS * 4) / PLAYERS;

const partnerCounts = [...hist.partnerCount.values()];
const repeatPartners = partnerCounts.filter((n) => n > 1).length;
const maxPartnerRepeat = partnerCounts.length ? Math.max(...partnerCounts) : 0;
const possiblePairs = (PLAYERS * (PLAYERS - 1)) / 2;

const longestWait = Math.max(...[...worstStreak.values()]);

console.log('\n--- fairness ---');
console.log(`games played      min ${minG}  max ${maxG}  spread ${maxG - minG}  (ideal ${expected.toFixed(1)})`);
console.log(`longest bench run ${longestWait} round(s) in a row`);
console.log(`distinct partnerships ${hist.partnerCount.size} of ${possiblePairs} possible`);
console.log(`repeat partnerships   ${repeatPartners}  (worst pair played together ${maxPartnerRepeat}x)`);
console.log(`widest tier gap on any court  ${maxGapSeen}`);

const stats = playerStats();
const totalW = stats.reduce((n, s) => n + s.wins, 0);
const totalL = stats.reduce((n, s) => n + s.losses, 0);
console.log(`recorded results  ${totalW} wins / ${totalL} losses across ${stats.length} players`);

// --- assertions -------------------------------------------------------------

let bad = 0;
const assert = (name: string, cond: boolean, detail = '') => {
  if (!cond) {
    bad++;
    console.log(`FAIL  ${name} ${detail}`);
  } else console.log(`ok    ${name}`);
};

console.log('\n--- checks ---');
assert('every round filled every court', loadRounds(sessionId).every((r) => r.matches.length === COURTS));
assert('nobody played twice in one round', loadRounds(sessionId).every((r) => {
  const ids = r.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
  return new Set(ids).size === ids.length;
}));
assert('bench + court accounts for everyone', loadRounds(sessionId).every((r) => {
  const ids = [...r.matches.flatMap((m) => [...m.teamA, ...m.teamB]), ...r.resting];
  return new Set(ids).size === PLAYERS;
}));
assert('games played spread <= 1', maxG - minG <= 1, `spread ${maxG - minG}`);

// How long anyone waits is bounded by the seat ratio, not by the algorithm:
// 25 players on 1 court means only 4 of 25 seats exist per round, so long
// benches are arithmetic, not unfairness. Allow 3x the expected wait to catch
// a genuinely stuck player while tolerating normal variance.
const seats = COURTS * 4;
const expectedWait = PLAYERS / seats;
const waitBound = Math.max(2, Math.ceil(expectedWait * 3));
assert(
  `nobody stuck on the bench (<= ${waitBound} rounds running)`,
  longestWait <= waitBound,
  `${longestWait}`
);
assert('every result recorded', totalW + totalL === ROUNDS * COURTS * 4, `${totalW + totalL}`);
assert('tier gap never exceeds 2', maxGapSeen <= 2, `${maxGapSeen}`);

console.log(bad === 0 ? '\nSIMULATION PASS' : `\n${bad} PROBLEM(S)`);
process.exit(bad === 0 ? 0 : 1);
