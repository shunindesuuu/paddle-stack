/**
 * All SQL lives here. Screens call these functions and never touch `sqlite`
 * directly, so the storage layer stays swappable and the queries stay in one
 * reviewable place.
 */

import {
  Match,
  MatchMode,
  PlayHistory,
  Player,
  Round,
  Team,
  Tier,
  emptyHistory,
  pairKey,
} from '../domain/types';
import { Strategy } from '../pairing/engine';
import { db } from './driver';

// --- row shapes as they come back from SQLite -------------------------------

type PlayerRow = {
  id: number;
  name: string;
  tier: Tier;
  archived: number;
  created_at: number;
  linked_player_id: number | null;
};

type SessionRow = {
  id: number;
  name: string;
  mode: MatchMode;
  strategy: Strategy;
  courts: number;
  started_at: number;
  ended_at: number | null;
  auto_queue: number;
  honor_links: number;
};

export type Session = {
  id: number;
  name: string;
  mode: MatchMode;
  strategy: Strategy;
  courts: number;
  startedAt: number;
  endedAt: number | null;
  /** Start the next round automatically once every court has a result. */
  autoQueue: boolean;
  /** Seat linked partners together. Off lets a session ignore standing links. */
  honorLinks: boolean;
};

function toPlayer(r: PlayerRow): Player {
  return {
    id: r.id,
    name: r.name,
    tier: r.tier,
    archived: r.archived === 1,
    linkedPlayerId: r.linked_player_id,
  };
}

function toSession(r: SessionRow): Session {
  return {
    id: r.id,
    name: r.name,
    mode: r.mode,
    strategy: r.strategy,
    courts: r.courts,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    autoQueue: r.auto_queue === 1,
    honorLinks: r.honor_links === 1,
  };
}

// --- settings ---------------------------------------------------------------

export function getSetting(key: string): string | null {
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?;', [key]);
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
    [key, value]
  );
}

// --- players ----------------------------------------------------------------

export function listPlayers(includeArchived = false): Player[] {
  const rows = includeArchived
    ? db.getAllSync<PlayerRow>('SELECT * FROM players ORDER BY name COLLATE NOCASE;')
    : db.getAllSync<PlayerRow>(
        'SELECT * FROM players WHERE archived = 0 ORDER BY name COLLATE NOCASE;'
      );
  return rows.map(toPlayer);
}

export function createPlayer(name: string, tier: Tier): Player {
  const res = db.runSync('INSERT INTO players (name, tier) VALUES (?, ?);', [
    name.trim(),
    tier,
  ]);
  return { id: res.lastInsertRowId, name: name.trim(), tier, archived: false, linkedPlayerId: null };
}

export function updatePlayer(id: number, name: string, tier: Tier): void {
  db.runSync('UPDATE players SET name = ?, tier = ? WHERE id = ?;', [name.trim(), tier, id]);
}

export function setPlayerArchived(id: number, archived: boolean): void {
  db.runSync('UPDATE players SET archived = ? WHERE id = ?;', [archived ? 1 : 0, id]);
}

/**
 * Sets a's fixed partner to b (and b's to a). A player can only have one
 * standing partner, so each is unlinked from whoever they were linked to
 * first - this can never leave a dangling one-sided link.
 */
export function linkPlayers(a: number, b: number): void {
  if (a === b) return;
  db.withTransactionSync(() => {
    unlinkPlayer(a);
    unlinkPlayer(b);
    db.runSync('UPDATE players SET linked_player_id = ? WHERE id = ?;', [b, a]);
    db.runSync('UPDATE players SET linked_player_id = ? WHERE id = ?;', [a, b]);
  });
}

/** Clears a player's link, and their former partner's link back to them. */
export function unlinkPlayer(id: number): void {
  db.runSync('UPDATE players SET linked_player_id = NULL WHERE linked_player_id = ?;', [id]);
  db.runSync('UPDATE players SET linked_player_id = NULL WHERE id = ?;', [id]);
}

/** True when the player has never appeared in a match, so a hard delete is safe. */
export function playerHasHistory(id: number): boolean {
  const row = db.getFirstSync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM match_players WHERE player_id = ?;',
    [id]
  );
  return (row?.n ?? 0) > 0;
}

/**
 * Removes a player outright when they have no recorded matches, otherwise
 * archives them so historical results keep resolving a name.
 * Returns what it actually did, so the UI can tell the user.
 */
export function deleteOrArchivePlayer(id: number): 'deleted' | 'archived' {
  if (playerHasHistory(id)) {
    setPlayerArchived(id, true);
    return 'archived';
  }
  db.runSync('DELETE FROM players WHERE id = ?;', [id]);
  return 'deleted';
}

// --- sessions ---------------------------------------------------------------

export function createSession(input: {
  name: string;
  mode: MatchMode;
  strategy: Strategy;
  courts: number;
  playerIds: number[];
  autoQueue?: boolean;
  honorLinks?: boolean;
}): number {
  let sessionId = 0;
  db.withTransactionSync(() => {
    const res = db.runSync(
      'INSERT INTO sessions (name, mode, strategy, courts, auto_queue, honor_links) VALUES (?, ?, ?, ?, ?, ?);',
      [
        input.name.trim(),
        input.mode,
        input.strategy,
        input.courts,
        input.autoQueue ? 1 : 0,
        input.honorLinks === false ? 0 : 1,
      ]
    );
    sessionId = res.lastInsertRowId;
    for (const pid of input.playerIds) {
      db.runSync('INSERT INTO session_players (session_id, player_id) VALUES (?, ?);', [
        sessionId,
        pid,
      ]);
    }
  });
  return sessionId;
}

export function getSession(id: number): Session | null {
  const row = db.getFirstSync<SessionRow>('SELECT * FROM sessions WHERE id = ?;', [id]);
  return row ? toSession(row) : null;
}

/** The most recent session that hasn't been ended, if any. */
export function getActiveSession(): Session | null {
  const row = db.getFirstSync<SessionRow>(
    'SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1;'
  );
  return row ? toSession(row) : null;
}

export function listSessions(): Session[] {
  return db
    .getAllSync<SessionRow>('SELECT * FROM sessions ORDER BY started_at DESC;')
    .map(toSession);
}

export function endSession(id: number): void {
  db.runSync('UPDATE sessions SET ended_at = unixepoch() WHERE id = ? AND ended_at IS NULL;', [
    id,
  ]);
}

export function deleteSession(id: number): void {
  // ON DELETE CASCADE clears rounds/matches, but only with foreign_keys ON,
  // which initDatabase sets for every connection.
  db.runSync('DELETE FROM sessions WHERE id = ?;', [id]);
}

export function updateSessionSettings(
  id: number,
  patch: {
    strategy?: Strategy;
    courts?: number;
    mode?: MatchMode;
    autoQueue?: boolean;
    honorLinks?: boolean;
  }
): void {
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (patch.strategy !== undefined) {
    sets.push('strategy = ?');
    args.push(patch.strategy);
  }
  if (patch.courts !== undefined) {
    sets.push('courts = ?');
    args.push(patch.courts);
  }
  if (patch.mode !== undefined) {
    sets.push('mode = ?');
    args.push(patch.mode);
  }
  if (patch.autoQueue !== undefined) {
    sets.push('auto_queue = ?');
    args.push(patch.autoQueue ? 1 : 0);
  }
  if (patch.honorLinks !== undefined) {
    sets.push('honor_links = ?');
    args.push(patch.honorLinks ? 1 : 0);
  }
  if (sets.length === 0) return;
  args.push(id);
  db.runSync(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?;`, args);
}

export function getSessionRoster(sessionId: number): Player[] {
  return db
    .getAllSync<PlayerRow>(
      `SELECT p.* FROM players p
       JOIN session_players sp ON sp.player_id = p.id
       WHERE sp.session_id = ?
       ORDER BY p.name COLLATE NOCASE;`,
      [sessionId]
    )
    .map(toPlayer);
}

export function setSessionRoster(sessionId: number, playerIds: number[]): void {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM session_players WHERE session_id = ?;', [sessionId]);
    for (const pid of playerIds) {
      db.runSync('INSERT INTO session_players (session_id, player_id) VALUES (?, ?);', [
        sessionId,
        pid,
      ]);
    }
  });
}

// --- rounds & matches -------------------------------------------------------

export type StoredMatch = Match & { id: number };
export type StoredRound = Omit<Round, 'matches'> & { id: number; matches: StoredMatch[] };

export function saveRound(sessionId: number, round: Round): StoredRound {
  let roundId = 0;
  const stored: StoredMatch[] = [];

  db.withTransactionSync(() => {
    const r = db.runSync('INSERT INTO rounds (session_id, number) VALUES (?, ?);', [
      sessionId,
      round.number,
    ]);
    roundId = r.lastInsertRowId;

    for (const m of round.matches) {
      const mr = db.runSync(
        'INSERT INTO matches (round_id, court, mode, winner) VALUES (?, ?, ?, ?);',
        [roundId, m.court, m.mode, m.winner]
      );
      const matchId = mr.lastInsertRowId;
      m.teamA.forEach((pid, slot) =>
        db.runSync(
          'INSERT INTO match_players (match_id, player_id, team, slot) VALUES (?, ?, ?, ?);',
          [matchId, pid, 'A', slot]
        )
      );
      m.teamB.forEach((pid, slot) =>
        db.runSync(
          'INSERT INTO match_players (match_id, player_id, team, slot) VALUES (?, ?, ?, ?);',
          [matchId, pid, 'B', slot]
        )
      );
      stored.push({ ...m, id: matchId });
    }

    for (const pid of round.resting) {
      db.runSync('INSERT INTO round_rests (round_id, player_id) VALUES (?, ?);', [
        roundId,
        pid,
      ]);
    }
  });

  return { id: roundId, number: round.number, matches: stored, resting: round.resting };
}

/** Rewrites a round's line-ups in place, used after manual swaps. */
export function updateRoundLineups(stored: StoredRound, round: Round): void {
  db.withTransactionSync(() => {
    for (let i = 0; i < stored.matches.length; i++) {
      const matchId = stored.matches[i].id;
      const m = round.matches[i];
      if (!m) continue;
      db.runSync('DELETE FROM match_players WHERE match_id = ?;', [matchId]);
      m.teamA.forEach((pid, slot) =>
        db.runSync(
          'INSERT INTO match_players (match_id, player_id, team, slot) VALUES (?, ?, ?, ?);',
          [matchId, pid, 'A', slot]
        )
      );
      m.teamB.forEach((pid, slot) =>
        db.runSync(
          'INSERT INTO match_players (match_id, player_id, team, slot) VALUES (?, ?, ?, ?);',
          [matchId, pid, 'B', slot]
        )
      );
    }
    db.runSync('DELETE FROM round_rests WHERE round_id = ?;', [stored.id]);
    for (const pid of round.resting) {
      db.runSync('INSERT INTO round_rests (round_id, player_id) VALUES (?, ?);', [
        stored.id,
        pid,
      ]);
    }
  });
}

export function setMatchWinner(matchId: number, winner: Team | null): void {
  db.runSync('UPDATE matches SET winner = ? WHERE id = ?;', [winner, matchId]);
}

/**
 * Replaces one player in an in-progress match with another, keeping their
 * team/slot. Used for substitutions - a player leaving mid-session, or
 * swapping someone in from the waiting queue on a court that has no round
 * concept for the other side of the swap to live in.
 */
export function substitutePlayer(matchId: number, outPlayerId: number, inPlayerId: number): void {
  db.runSync('UPDATE match_players SET player_id = ? WHERE match_id = ? AND player_id = ?;', [
    inPlayerId,
    matchId,
    outPlayerId,
  ]);
}

export function deleteRound(roundId: number): void {
  db.runSync('DELETE FROM rounds WHERE id = ?;', [roundId]);
}

export function loadRounds(sessionId: number): StoredRound[] {
  const roundRows = db.getAllSync<{ id: number; number: number }>(
    'SELECT id, number FROM rounds WHERE session_id = ? ORDER BY number ASC;',
    [sessionId]
  );
  if (roundRows.length === 0) return [];

  const matchRows = db.getAllSync<{
    id: number;
    round_id: number;
    court: number;
    mode: MatchMode;
    winner: Team | null;
  }>(
    `SELECT m.* FROM matches m
     JOIN rounds r ON r.id = m.round_id
     WHERE r.session_id = ?
     ORDER BY m.round_id ASC, m.court ASC;`,
    [sessionId]
  );

  const mpRows = db.getAllSync<{
    match_id: number;
    player_id: number;
    team: 'A' | 'B';
    slot: number;
  }>(
    `SELECT mp.* FROM match_players mp
     JOIN matches m ON m.id = mp.match_id
     JOIN rounds r ON r.id = m.round_id
     WHERE r.session_id = ?
     ORDER BY mp.slot ASC;`,
    [sessionId]
  );

  const restRows = db.getAllSync<{ round_id: number; player_id: number }>(
    `SELECT rr.* FROM round_rests rr
     JOIN rounds r ON r.id = rr.round_id
     WHERE r.session_id = ?;`,
    [sessionId]
  );

  const byMatch = new Map<number, { A: number[]; B: number[] }>();
  for (const mp of mpRows) {
    let e = byMatch.get(mp.match_id);
    if (!e) {
      e = { A: [], B: [] };
      byMatch.set(mp.match_id, e);
    }
    e[mp.team].push(mp.player_id);
  }

  const matchesByRound = new Map<number, StoredMatch[]>();
  for (const m of matchRows) {
    const teams = byMatch.get(m.id) ?? { A: [], B: [] };
    const list = matchesByRound.get(m.round_id) ?? [];
    list.push({
      id: m.id,
      court: m.court,
      mode: m.mode,
      teamA: teams.A,
      teamB: teams.B,
      winner: m.winner,
    });
    matchesByRound.set(m.round_id, list);
  }

  const restsByRound = new Map<number, number[]>();
  for (const r of restRows) {
    const list = restsByRound.get(r.round_id) ?? [];
    list.push(r.player_id);
    restsByRound.set(r.round_id, list);
  }

  return roundRows.map((r) => ({
    id: r.id,
    number: r.number,
    matches: matchesByRound.get(r.id) ?? [],
    resting: restsByRound.get(r.id) ?? [],
  }));
}

// --- derived history --------------------------------------------------------

/**
 * Rebuilds partner/opponent/games counts for a session. Recomputed from the
 * stored rounds rather than kept as running totals, so manual line-up edits
 * and deleted rounds can never leave the counters out of sync.
 */
export function buildHistory(sessionId: number): PlayHistory {
  const history = emptyHistory();
  const rounds = loadRounds(sessionId);

  const bump = (map: Map<string, number>, a: number, b: number) => {
    const k = pairKey(a, b);
    map.set(k, (map.get(k) ?? 0) + 1);
  };

  for (const round of rounds) {
    for (const m of round.matches) {
      for (const team of [m.teamA, m.teamB]) {
        for (let i = 0; i < team.length; i++) {
          history.gamesPlayed.set(team[i], (history.gamesPlayed.get(team[i]) ?? 0) + 1);
          for (let j = i + 1; j < team.length; j++) bump(history.partnerCount, team[i], team[j]);
        }
      }
      for (const a of m.teamA) for (const b of m.teamB) bump(history.opponentCount, a, b);
    }
  }

  // Players on the roster who haven't played yet must appear with 0, otherwise
  // the engine can't tell "no games" from "not in this session" when it picks
  // who sits out.
  for (const p of getSessionRoster(sessionId)) {
    if (!history.gamesPlayed.has(p.id)) history.gamesPlayed.set(p.id, 0);
  }

  return history;
}

export type PlayerStats = {
  player: Player;
  games: number;
  wins: number;
  losses: number;
};

/**
 * Win/loss totals across all sessions, for the History tab.
 * Matches with no winner recorded count as games played but neither a win
 * nor a loss.
 */
export function playerStats(): PlayerStats[] {
  const rows = db.getAllSync<PlayerRow & { games: number; wins: number; losses: number }>(
    `SELECT p.*,
            COUNT(mp.match_id) AS games,
            SUM(CASE WHEN m.winner IS NOT NULL AND m.winner = mp.team THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN m.winner IS NOT NULL AND m.winner <> mp.team THEN 1 ELSE 0 END) AS losses
     FROM players p
     JOIN match_players mp ON mp.player_id = p.id
     JOIN matches m ON m.id = mp.match_id
     GROUP BY p.id
     ORDER BY wins DESC, games DESC, p.name COLLATE NOCASE;`
  );

  return rows.map((r) => ({
    player: toPlayer(r),
    games: r.games,
    wins: r.wins ?? 0,
    losses: r.losses ?? 0,
  }));
}
