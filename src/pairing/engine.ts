/**
 * Pairing engine.
 *
 * One scorer drives every strategy; the strategies are just different weights
 * on the same three objectives:
 *
 *   balance  - how evenly matched the two sides of a court are (by tier weight)
 *   freshness - how often these players have already partnered / faced off
 *   rest      - how evenly sit-outs are spread across the session
 *
 * Rounds are produced by sampling many random candidate arrangements and
 * keeping the best-scoring one. Sampling beats a hand-rolled greedy here: the
 * search space for a typical open-play night (8-20 players, 1-4 courts) is
 * small enough that a few hundred samples reliably lands on a near-optimal
 * round, and it stays correct when players/courts/mode change.
 */

import {
  Match,
  MatchMode,
  PlayHistory,
  Player,
  Round,
  TEAM_SIZE,
  TIER_WEIGHT,
  pairKey,
} from '../domain/types';

export type Strategy = 'balanced' | 'rotation' | 'mixed' | 'random';

type Weights = {
  balance: number;
  freshness: number;
  rest: number;
};

const STRATEGY_WEIGHTS: Record<Strategy, Weights> = {
  // Fairest possible games; will happily repeat a good pairing.
  balanced: { balance: 10, freshness: 1, rest: 3 },
  // Play with everyone; tolerates lopsided games.
  rotation: { balance: 1, freshness: 10, rest: 3 },
  // Sensible default for a social night.
  mixed: { balance: 5, freshness: 5, rest: 3 },
  // Pure shuffle. Rest fairness is still respected so nobody sits all night.
  random: { balance: 0, freshness: 0, rest: 3 },
};

export const STRATEGY_LABEL: Record<Strategy, string> = {
  balanced: 'Balanced',
  rotation: 'Rotation',
  // Short enough to sit on one line in the segmented control; the hint below
  // it carries the fuller explanation.
  mixed: 'Fair mix',
  random: 'Random',
};

export const STRATEGY_HINT: Record<Strategy, string> = {
  balanced: 'Closest possible skill match on every court.',
  rotation: 'Prioritises new partners and new opponents.',
  mixed: 'Fair games, while still mixing the group up.',
  random: 'Pure shuffle.',
};

export type GenerateOptions = {
  /** Players available to play this round. */
  players: Player[];
  courts: number;
  mode: MatchMode;
  strategy: Strategy;
  history: PlayHistory;
  roundNumber: number;
  /** Sampling budget. Higher = slightly better rounds, still instant. */
  samples?: number;
  /** Injectable RNG so tests are deterministic. */
  rng?: () => number;
  /** Seat linked ("fixed partner") pairs together. Default true; ignored for singles. */
  honorLinks?: boolean;
};

export type GenerateResult =
  | { ok: true; round: Round }
  | { ok: false; reason: string };

function shuffled<T>(input: T[], rng: () => number): T[] {
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function weightOf(p: Player): number {
  return TIER_WEIGHT[p.tier];
}

/** Minimum players needed to fill a single court in this mode. */
export function minPlayersFor(mode: MatchMode): number {
  return TEAM_SIZE[mode] * 2;
}

/**
 * How many courts can actually run given the player count, capped by the
 * courts available.
 */
export function usableCourts(playerCount: number, courts: number, mode: MatchMode): number {
  return Math.min(courts, Math.floor(playerCount / minPlayersFor(mode)));
}

/**
 * Split 4 players into the 2v2 arrangement with the smallest weight gap.
 * There are only three distinct splits, so this is exact, not heuristic.
 */
function bestDoublesSplit(group: Player[]): { teamA: Player[]; teamB: Player[] } {
  const splits: [number[], number[]][] = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];
  let best = splits[0];
  let bestGap = Infinity;
  for (const [a, b] of splits) {
    const gap = Math.abs(
      weightOf(group[a[0]]) + weightOf(group[a[1]]) -
        (weightOf(group[b[0]]) + weightOf(group[b[1]]))
    );
    if (gap < bestGap) {
      bestGap = gap;
      best = [a, b];
    }
  }
  return {
    teamA: best[0].map((i) => group[i]),
    teamB: best[1].map((i) => group[i]),
  };
}

/** Imbalance of one court: absolute gap between the two sides' total weight. */
function matchImbalance(teamA: Player[], teamB: Player[]): number {
  const sum = (t: Player[]) => t.reduce((n, p) => n + weightOf(p), 0);
  return Math.abs(sum(teamA) - sum(teamB));
}

/**
 * Repeat penalty for one court. Partner repeats are weighted more heavily
 * than opponent repeats: playing *with* the same person again is what makes a
 * social session feel stale, while facing them again is comparatively fine.
 */
function matchRepeatPenalty(teamA: Player[], teamB: Player[], history: PlayHistory): number {
  let penalty = 0;

  const partnerPairs = (team: Player[]) => {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        // Linked partners are *meant* to repeat every round, so that
        // repetition shouldn't read as staleness the way an ordinary
        // repeat pairing would.
        if (team[i].linkedPlayerId === team[j].id) continue;
        penalty += 3 * (history.partnerCount.get(pairKey(team[i].id, team[j].id)) ?? 0);
      }
    }
  };
  partnerPairs(teamA);
  partnerPairs(teamB);

  for (const a of teamA) {
    for (const b of teamB) {
      penalty += history.opponentCount.get(pairKey(a.id, b.id)) ?? 0;
    }
  }
  return penalty;
}

/**
 * Rest penalty: sitting out again when you've already played less than the
 * group average is the thing players actually complain about, so we penalise
 * benching whoever has the fewest games.
 */
function restPenalty(resting: Player[], history: PlayHistory): number {
  if (resting.length === 0) return 0;
  return resting.reduce((n, p) => {
    const played = history.gamesPlayed.get(p.id) ?? 0;
    // Fewer games played -> larger penalty for sitting again.
    return n + 1 / (1 + played);
  }, 0);
}

type Candidate = {
  matches: { teamA: Player[]; teamB: Player[] }[];
  resting: Player[];
};

/** A solo player, or a linked pair that must be seated together or not at all. */
type Unit = { members: Player[] };

/**
 * Groups eligible players into units - a linked pair collapses into one
 * atomic 2-player unit, everyone else stays solo. Links only apply to
 * doubles: a "fixed partner" has no meaning in singles.
 */
function buildUnits(players: Player[], mode: MatchMode, honorLinks: boolean): Unit[] {
  if (mode !== 'doubles' || !honorLinks) return players.map((p) => ({ members: [p] }));

  const byId = new Map(players.map((p) => [p.id, p]));
  const seen = new Set<number>();
  const units: Unit[] = [];
  for (const p of players) {
    if (seen.has(p.id)) continue;
    const partner = p.linkedPlayerId != null ? byId.get(p.linkedPlayerId) : undefined;
    if (partner && partner.linkedPlayerId === p.id && !seen.has(partner.id)) {
      units.push({ members: [p, partner] });
      seen.add(partner.id);
    } else {
      units.push({ members: [p] });
    }
    seen.add(p.id);
  }
  return units;
}

/**
 * Splits playing units from resting ones so the total players seated is
 * exactly `slots`. A linked pair is 2 seats wide, so simply slicing a
 * priority-ordered list can overshoot by one seat; instead this seats as
 * many pairs as fit (highest-priority pairs first) and fills the rest with
 * solos. That combination always lands on `slots` exactly: `slots` is a
 * multiple of 4 (courts * 4), so it's even, and 2 * pairsSeated is even too,
 * which makes the solo remainder even - and there are always enough solos
 * to cover it, because the caller already checked total players >= slots.
 */
function splitByPriority(
  units: Unit[],
  slots: number,
  history: PlayHistory
): { playing: Unit[]; resting: Unit[] } {
  const priority = (u: Unit) =>
    u.members.reduce((n, p) => n + (history.gamesPlayed.get(p.id) ?? 0), 0) / u.members.length;

  const bySize = (size: number) =>
    units.filter((u) => u.members.length === size).sort((a, b) => priority(a) - priority(b));
  const pairs = bySize(2);
  const solos = bySize(1);

  const pairsToSeat = Math.min(pairs.length, Math.floor(slots / 2));
  const solosToSeat = slots - pairsToSeat * 2;

  return {
    playing: [...pairs.slice(0, pairsToSeat), ...solos.slice(0, solosToSeat)],
    resting: [...pairs.slice(pairsToSeat), ...solos.slice(solosToSeat)],
  };
}

/**
 * Packs units into `courts` bins of exactly `perCourt` seats. A unit that
 * doesn't fit the court currently being filled is held back and gets first
 * shot at the next one, rather than being lost - which is what keeps this
 * correct for the same reason `splitByPriority` is: every court's leftover
 * seats after placing pairs is even, so the held-back queue never strands a
 * pair with nowhere it fits.
 */
function packCourts(units: Unit[], perCourt: number, courts: number): Unit[][] {
  const result: Unit[][] = [];
  let queue = units.slice();
  for (let c = 0; c < courts; c++) {
    const bin: Unit[] = [];
    const held: Unit[] = [];
    let remaining = perCourt;
    while (remaining > 0 && queue.length > 0) {
      const u = queue.shift()!;
      if (u.members.length <= remaining) {
        bin.push(u);
        remaining -= u.members.length;
      } else {
        held.push(u);
      }
    }
    queue = [...held, ...queue];
    result.push(bin);
  }
  return result;
}

/** Turns one court's units into a 2v2 (or, for a lone pair, an already-fixed) split. */
function assignDoublesTeams(courtUnits: Unit[]): { teamA: Player[]; teamB: Player[] } {
  const pairs = courtUnits.filter((u) => u.members.length === 2);
  const solos = courtUnits.filter((u) => u.members.length === 1).map((u) => u.members[0]);

  if (pairs.length === 2) return { teamA: pairs[0].members, teamB: pairs[1].members };
  if (pairs.length === 1) return { teamA: pairs[0].members, teamB: solos };
  return bestDoublesSplit(solos);
}

function scoreCandidate(c: Candidate, history: PlayHistory, w: Weights): number {
  let score = 0;
  for (const m of c.matches) {
    score += w.balance * matchImbalance(m.teamA, m.teamB);
    score += w.freshness * matchRepeatPenalty(m.teamA, m.teamB, history);
  }
  score += w.rest * restPenalty(c.resting, history) * 10;
  return score;
}

function buildCandidate(
  players: Player[],
  courts: number,
  mode: MatchMode,
  strategy: Strategy,
  history: PlayHistory,
  rng: () => number,
  honorLinks: boolean
): Candidate {
  const teamSize = TEAM_SIZE[mode];
  const perCourt = teamSize * 2;
  const slots = courts * perCourt;

  // Who sits is a hard constraint, not a soft preference: whoever has played
  // the most games sits first (see splitByPriority). Shuffling first means
  // repeated samples still explore different arrangements when players are
  // tied on games played, which is the common case early in a session. A
  // linked pair moves as one unit throughout, so they're always seated - or
  // benched - together.
  const units = buildUnits(shuffled(players, rng), mode, honorLinks);
  const { playing, resting } = splitByPriority(units, slots, history);

  // For balanced/mixed play, grouping similar total strength onto the same
  // court is what actually produces competitive games, so sort before
  // packing courts.
  const unitWeight = (u: Unit) => u.members.reduce((n, p) => n + weightOf(p), 0);
  const ordered =
    strategy === 'balanced' || strategy === 'mixed'
      ? playing.slice().sort((a, b) => unitWeight(b) - unitWeight(a))
      : playing;

  const courtGroups = packCourts(ordered, perCourt, courts);
  const matches: { teamA: Player[]; teamB: Player[] }[] = [];
  for (const group of courtGroups) {
    if (group.reduce((n, u) => n + u.members.length, 0) < perCourt) break;
    if (mode === 'singles') {
      matches.push({ teamA: group[0].members, teamB: group[1].members });
    } else {
      matches.push(assignDoublesTeams(group));
    }
  }

  return { matches, resting: resting.flatMap((u) => u.members) };
}

export function generateRound(opts: GenerateOptions): GenerateResult {
  const {
    players,
    mode,
    strategy,
    history,
    roundNumber,
    samples = 500,
    rng = Math.random,
    honorLinks = true,
  } = opts;

  const needed = minPlayersFor(mode);
  if (players.length < needed) {
    return {
      ok: false,
      reason: `Need at least ${needed} players for ${mode}. ${players.length} selected.`,
    };
  }

  const courts = usableCourts(players.length, opts.courts, mode);
  if (courts < 1) {
    return { ok: false, reason: 'Not enough players to fill a court.' };
  }

  const weights = STRATEGY_WEIGHTS[strategy];

  let best: Candidate | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < samples; i++) {
    const cand = buildCandidate(players, courts, mode, strategy, history, rng, honorLinks);
    const score = scoreCandidate(cand, history, weights);
    if (score < bestScore) {
      bestScore = score;
      best = cand;
      // A zero score is optimal on every objective; no point sampling further.
      if (score === 0) break;
    }
  }

  if (!best) return { ok: false, reason: 'Could not build a round.' };

  const round: Round = {
    number: roundNumber,
    matches: best.matches.map((m, i) => ({
      court: i,
      mode,
      teamA: m.teamA.map((p) => p.id),
      teamB: m.teamB.map((p) => p.id),
      winner: null,
      scoreA: null,
      scoreB: null,
    })),
    resting: best.resting.map((p) => p.id),
  };

  return { ok: true, round };
}

/**
 * Swap two player slots anywhere in a round - between teams, between courts,
 * or with someone on the bench. This backs the manual-override UI, so it must
 * accept any two locations and stay consistent.
 */
export type SlotRef =
  | { kind: 'court'; court: number; team: 'A' | 'B'; index: number }
  | { kind: 'bench'; index: number };

export function swapSlots(round: Round, x: SlotRef, y: SlotRef): Round {
  const next: Round = {
    ...round,
    matches: round.matches.map((m) => ({
      ...m,
      teamA: m.teamA.slice(),
      teamB: m.teamB.slice(),
    })),
    resting: round.resting.slice(),
  };

  // Matches are looked up by their `court` property, not by array position.
  // A round's matches array only holds every court in order for the initial
  // multi-court fill - once continuous play refills a single freed court on
  // its own, that round has one match whose `court` can be any index, so
  // `matches[ref.court]` would silently grab the wrong element (or nothing).
  const findMatch = (court: number) => next.matches.find((m) => m.court === court);

  const read = (ref: SlotRef): number | undefined => {
    if (ref.kind === 'bench') return next.resting[ref.index];
    const m = findMatch(ref.court);
    return m ? (ref.team === 'A' ? m.teamA : m.teamB)[ref.index] : undefined;
  };

  const write = (ref: SlotRef, id: number) => {
    if (ref.kind === 'bench') {
      next.resting[ref.index] = id;
      return;
    }
    const m = findMatch(ref.court);
    if (!m) return;
    if (ref.team === 'A') m.teamA[ref.index] = id;
    else m.teamB[ref.index] = id;
  };

  const a = read(x);
  const b = read(y);
  if (a === undefined || b === undefined) return round;
  write(x, b);
  write(y, a);
  return next;
}

/** Fold a completed round back into the running history. */
export function applyRoundToHistory(round: Round, history: PlayHistory): PlayHistory {
  const next: PlayHistory = {
    partnerCount: new Map(history.partnerCount),
    opponentCount: new Map(history.opponentCount),
    gamesPlayed: new Map(history.gamesPlayed),
  };

  const bump = (map: Map<string, number>, a: number, b: number) => {
    const k = pairKey(a, b);
    map.set(k, (map.get(k) ?? 0) + 1);
  };

  for (const m of round.matches) {
    for (const team of [m.teamA, m.teamB]) {
      for (let i = 0; i < team.length; i++) {
        next.gamesPlayed.set(team[i], (next.gamesPlayed.get(team[i]) ?? 0) + 1);
        for (let j = i + 1; j < team.length; j++) bump(next.partnerCount, team[i], team[j]);
      }
    }
    for (const a of m.teamA) for (const b of m.teamB) bump(next.opponentCount, a, b);
  }

  return next;
}
