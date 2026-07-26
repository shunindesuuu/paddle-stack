/**
 * Core domain types. Kept free of React/DB imports so the pairing engine
 * stays pure and testable from plain Node.
 */

export type Tier = 'beginner' | 'intermediate' | 'advanced';

/** Numeric weight backing each tier. The UI only ever shows the tier label. */
export const TIER_WEIGHT: Record<Tier, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

export const TIER_LABEL: Record<Tier, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const TIERS: Tier[] = ['beginner', 'intermediate', 'advanced'];

/** DUPR cutoffs used to auto-derive a tier from a rating. Both bounds are exclusive-below. */
export type DuprBrackets = {
  /** Ratings below this are Beginner. */
  beginnerMax: number;
  /** Ratings below this (and at/above beginnerMax) are Intermediate; at/above it, Advanced. */
  intermediateMax: number;
};

export const DEFAULT_DUPR_BRACKETS: DuprBrackets = { beginnerMax: 3.0, intermediateMax: 4.0 };

export function tierFromDupr(dupr: number, brackets: DuprBrackets): Tier {
  if (dupr < brackets.beginnerMax) return 'beginner';
  if (dupr < brackets.intermediateMax) return 'intermediate';
  return 'advanced';
}

export type Player = {
  id: number;
  name: string;
  /**
   * Effective tier used for pairing and display. When DUPR mode is on and
   * this player has a rating, it's `tierFromDupr(dupr, brackets)`; otherwise
   * it falls back to `manualTier`, so a player with no DUPR score still gets
   * a usable tier.
   */
  tier: Tier;
  /** Raw, always-editable tier stored on the player - the fallback above. */
  manualTier: Tier;
  /** Optional DUPR rating. Null means this player relies on `manualTier`. */
  dupr: number | null;
  /** Soft-delete / archive flag so history keeps referencing the player. */
  archived: boolean;
  /**
   * A standing doubles partner ("Link"). Mutual - if A is linked to B, B is
   * linked to A. Whenever both are checked into the same doubles session,
   * the pairing engine always seats them together instead of shuffling
   * partners for fairness/variety.
   */
  linkedPlayerId: number | null;
};

export type MatchMode = 'singles' | 'doubles';

/** Players per side for a given mode. */
export const TEAM_SIZE: Record<MatchMode, number> = {
  singles: 1,
  doubles: 2,
};

export type Team = 'A' | 'B';

export type Match = {
  /** Stable id within a round; 0-based court number. */
  court: number;
  mode: MatchMode;
  teamA: number[];
  teamB: number[];
  /**
   * Which side won, or null while the match is unplayed.
   *
   * Deliberately not a score: mid-session nobody wants to type two numbers on
   * a phone, and nothing in the app consumes the margin - only who won feeds
   * the leaderboard.
   */
  winner: Team | null;
};

export type Round = {
  /** 1-based round number within its session. */
  number: number;
  matches: Match[];
  /** Player ids sitting this round out. */
  resting: number[];
};

/**
 * Aggregated play history used to keep pairings fresh and rest fair.
 * All maps are keyed by the unordered pair key `min:max` except gamesPlayed.
 */
export type PlayHistory = {
  /** How many times two players have been on the SAME team. */
  partnerCount: Map<string, number>;
  /** How many times two players have been on OPPOSITE teams. */
  opponentCount: Map<string, number>;
  /** Total matches each player has played. */
  gamesPlayed: Map<number, number>;
};

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function emptyHistory(): PlayHistory {
  return {
    partnerCount: new Map(),
    opponentCount: new Map(),
    gamesPlayed: new Map(),
  };
}
