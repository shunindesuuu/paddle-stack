import { Player, Round, Tier, emptyHistory, TIER_WEIGHT } from '../src/domain/types';
import {
  generateRound,
  applyRoundToHistory,
  swapSlots,
} from '../src/pairing/engine';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (!cond) {
    failures++;
    console.log(`FAIL  ${name} ${extra}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

const mk = (id: number, name: string, tier: Tier, linkedPlayerId: number | null = null): Player => ({
  id,
  name,
  tier,
  manualTier: tier,
  dupr: null,
  archived: false,
  linkedPlayerId,
});

// 8 players: 2 advanced, 4 intermediate, 2 beginner
const players: Player[] = [
  mk(1, 'Ana', 'advanced'),
  mk(2, 'Ben', 'advanced'),
  mk(3, 'Cy', 'intermediate'),
  mk(4, 'Dee', 'intermediate'),
  mk(5, 'Eli', 'intermediate'),
  mk(6, 'Fay', 'intermediate'),
  mk(7, 'Gus', 'beginner'),
  mk(8, 'Hal', 'beginner'),
];

const w = (id: number) => TIER_WEIGHT[players.find((p) => p.id === id)!.tier];
const teamW = (ids: number[]) => ids.reduce((n, id) => n + w(id), 0);

// --- 1. basic doubles round, 2 courts, everyone plays
{
  const r = generateRound({
    players,
    courts: 2,
    mode: 'doubles',
    strategy: 'balanced',
    history: emptyHistory(),
    roundNumber: 1,
  });
  check('generates a round', r.ok);
  if (r.ok) {
    const ids = r.round.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
    check('2 courts filled', r.round.matches.length === 2);
    check('8 players placed', ids.length === 8);
    check('no duplicate players', new Set(ids).size === 8);
    check('nobody resting', r.round.resting.length === 0);
    const gaps = r.round.matches.map((m) => Math.abs(teamW(m.teamA) - teamW(m.teamB)));
    check('balanced: every court gap <= 1', gaps.every((g) => g <= 1), `gaps=${gaps}`);
    console.log('   courts:', r.round.matches.map((m) =>
      `${m.teamA.map(i=>players[i-1].name).join('+')}(${teamW(m.teamA)}) vs ${m.teamB.map(i=>players[i-1].name).join('+')}(${teamW(m.teamB)})`
    ));
  }
}

// --- 2. odd player count -> correct number rest
{
  const r = generateRound({
    players: players.slice(0, 6),
    courts: 3,
    mode: 'doubles',
    strategy: 'mixed',
    history: emptyHistory(),
    roundNumber: 1,
  });
  check('6 players doubles -> 1 court', r.ok && r.round.matches.length === 1);
  check('6 players doubles -> 2 resting', r.ok && r.round.resting.length === 2);
}

// --- 3. too few players
{
  const r = generateRound({
    players: players.slice(0, 3),
    courts: 1,
    mode: 'doubles',
    strategy: 'balanced',
    history: emptyHistory(),
    roundNumber: 1,
  });
  check('rejects 3 players for doubles', !r.ok);
}

// --- 4. singles
{
  const r = generateRound({
    players: players.slice(0, 4),
    courts: 2,
    mode: 'singles',
    strategy: 'balanced',
    history: emptyHistory(),
    roundNumber: 1,
  });
  check('singles: 4 players -> 2 courts', r.ok && r.round.matches.length === 2);
  check('singles: 1 per side', r.ok && r.round.matches.every((m) => m.teamA.length === 1 && m.teamB.length === 1));
}

// --- 5. rotation actually reduces repeat partners over a long session
{
  const runSession = (strategy: 'rotation' | 'balanced', rounds: number) => {
    let hist = emptyHistory();
    for (let i = 1; i <= rounds; i++) {
      const r = generateRound({
        players, courts: 2, mode: 'doubles', strategy,
        history: hist, roundNumber: i,
      });
      if (!r.ok) throw new Error(r.reason);
      hist = applyRoundToHistory(r.round, hist);
    }
    return hist;
  };

  const rot = runSession('rotation', 7);
  const bal = runSession('balanced', 7);
  const maxRepeat = (h: ReturnType<typeof emptyHistory>) =>
    Math.max(...[...h.partnerCount.values()]);
  const distinctPartners = (h: ReturnType<typeof emptyHistory>) => h.partnerCount.size;

  console.log(`   rotation: ${distinctPartners(rot)} distinct partnerships, max repeat ${maxRepeat(rot)}`);
  console.log(`   balanced: ${distinctPartners(bal)} distinct partnerships, max repeat ${maxRepeat(bal)}`);
  check('rotation yields more distinct partnerships than balanced',
    distinctPartners(rot) > distinctPartners(bal),
    `${distinctPartners(rot)} vs ${distinctPartners(bal)}`);

  // every player should have played every round (8 players, 2 courts, no bench)
  const games = [...rot.gamesPlayed.values()];
  check('rotation: all 8 players tracked', rot.gamesPlayed.size === 8);
  check('rotation: everyone played 7 games', games.every((g) => g === 7), `${games}`);
}

// --- 6. rest fairness with 10 players / 2 courts (2 sit each round)
{
  let hist = emptyHistory();
  const ten = [...players, mk(9, 'Ivy', 'intermediate'), mk(10, 'Jo', 'beginner')];
  for (let i = 1; i <= 10; i++) {
    const r = generateRound({
      players: ten, courts: 2, mode: 'doubles', strategy: 'mixed',
      history: hist, roundNumber: i,
    });
    if (!r.ok) throw new Error(r.reason);
    hist = applyRoundToHistory(r.round, hist);
  }
  const counts = ten.map((p) => hist.gamesPlayed.get(p.id) ?? 0);
  const spread = Math.max(...counts) - Math.min(...counts);
  console.log('   games played per player:', counts.join(','));
  check('rest is fair (spread <= 2 over 10 rounds)', spread <= 2, `spread=${spread}`);
}

// --- 7. swapSlots
{
  const r = generateRound({
    players, courts: 2, mode: 'doubles', strategy: 'balanced',
    history: emptyHistory(), roundNumber: 1,
  });
  if (r.ok) {
    const before = r.round;
    const a = before.matches[0].teamA[0];
    const b = before.matches[1].teamB[1];
    const after = swapSlots(before,
      { kind: 'court', court: 0, team: 'A', index: 0 },
      { kind: 'court', court: 1, team: 'B', index: 1 });
    check('swap moved player a', after.matches[1].teamB[1] === a);
    check('swap moved player b', after.matches[0].teamA[0] === b);
    check('swap did not mutate original', before.matches[0].teamA[0] === a);
    const ids = after.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
    check('swap kept roster intact', new Set(ids).size === 8);
  }

  // bench swap
  const r2 = generateRound({
    players: players.slice(0, 6), courts: 1, mode: 'doubles', strategy: 'mixed',
    history: emptyHistory(), roundNumber: 1,
  });
  if (r2.ok) {
    const benched = r2.round.resting[0];
    const after = swapSlots(r2.round,
      { kind: 'bench', index: 0 },
      { kind: 'court', court: 0, team: 'A', index: 0 });
    check('bench swap puts benched player on court', after.matches[0].teamA[0] === benched);
    check('bench swap keeps 2 resting', after.resting.length === 2);
    const all = [...after.matches.flatMap((m) => [...m.teamA, ...m.teamB]), ...after.resting];
    check('bench swap kept roster intact', new Set(all).size === 6);
  }

  // A round from a single refilled court has one match whose `court` isn't
  // 0 - continuous play produces exactly this shape once a court other than
  // the first refills on its own. Regression test for a bug where swapSlots
  // indexed matches[] by array position instead of by the `court` field,
  // which crashed with "Cannot read property 'teamA' of undefined" the
  // moment someone swapped within any court but the first.
  {
    const solo: Round = {
      number: 1,
      matches: [
        { court: 1, mode: 'doubles', teamA: [101, 102], teamB: [103, 104], winner: null, scoreA: null, scoreB: null },
      ],
      resting: [],
    };
    const after = swapSlots(solo,
      { kind: 'court', court: 1, team: 'A', index: 0 },
      { kind: 'court', court: 1, team: 'B', index: 1 });
    check(
      'swap on a lone non-zero court works',
      after.matches[0].teamA[0] === 104 && after.matches[0].teamB[1] === 101
    );
  }
}

// --- 8. history folding math
{
  let h = emptyHistory();
  h = applyRoundToHistory({
    number: 1,
    matches: [{ court: 0, mode: 'doubles', teamA: [1, 2], teamB: [3, 4], winner: null, scoreA: null, scoreB: null }],
    resting: [],
  }, h);
  check('partner recorded once', h.partnerCount.get('1:2') === 1);
  check('opponent recorded', h.opponentCount.get('1:3') === 1 && h.opponentCount.get('2:4') === 1);
  check('non-pair absent', h.partnerCount.get('1:3') === undefined);
  check('games played', h.gamesPlayed.get(1) === 1 && h.gamesPlayed.get(4) === 1);
}

// --- 9. linked pairs ("fixed partner")
{
  /** True if every linked pair present is either seated on the same team, or both resting. */
  function linksHonored(round: Round, roster: Player[]): boolean {
    const byId = new Map(roster.map((p) => [p.id, p]));
    const teamOf = new Map<number, number[]>();
    for (const m of round.matches) {
      for (const id of m.teamA) teamOf.set(id, m.teamA);
      for (const id of m.teamB) teamOf.set(id, m.teamB);
    }
    for (const p of roster) {
      if (p.linkedPlayerId == null) continue;
      const partner = byId.get(p.linkedPlayerId);
      if (!partner) continue;
      const pTeam = teamOf.get(p.id);
      const partnerTeam = teamOf.get(partner.id);
      if (!!pTeam !== !!partnerTeam) return false; // one plays, the other doesn't
      if (pTeam && !pTeam.includes(partner.id)) return false; // playing, but split across teams
    }
    return true;
  }

  // Two linked pairs plus four solos, 2 courts: pairs must never split, and
  // every seat is still accounted for.
  const linked: Player[] = [
    mk(1, 'Ana', 'advanced', 2),
    mk(2, 'Ben', 'beginner', 1), // deliberately mismatched tiers - links override balance
    mk(3, 'Cy', 'intermediate', 4),
    mk(4, 'Dee', 'intermediate', 3),
    mk(5, 'Eli', 'advanced'),
    mk(6, 'Fay', 'beginner'),
    mk(7, 'Gus', 'intermediate'),
    mk(8, 'Hal', 'intermediate'),
  ];
  let allHonored = true;
  let allAccounted = true;
  for (let i = 0; i < 30; i++) {
    const r = generateRound({
      players: linked,
      courts: 2,
      mode: 'doubles',
      strategy: 'balanced',
      history: emptyHistory(),
      roundNumber: i + 1,
      rng: Math.random,
    });
    if (!r.ok) { allAccounted = false; continue; }
    if (!linksHonored(r.round, linked)) allHonored = false;
    const seated = r.round.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
    const everyone = [...seated, ...r.round.resting];
    if (new Set(everyone).size !== 8 || everyone.length !== 8) allAccounted = false;
  }
  check('linked pairs never split across 30 random rounds', allHonored);
  check('every seat accounted for with pairs in the mix', allAccounted);

  // Odd one out: Ana's partner (Ben) isn't in this round's roster at all, so
  // Ana should just play solo instead of the engine choking on a dangling link.
  const oneSided = linked.filter((p) => p.id !== 2);
  const r2 = generateRound({
    players: oneSided,
    courts: 1,
    mode: 'doubles',
    strategy: 'mixed',
    history: emptyHistory(),
    roundNumber: 1,
  });
  check('missing half of a link does not block generation', r2.ok);
  if (r2.ok) {
    const seated = r2.round.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
    check('unlinked-for-this-round player still gets seated normally', new Set(seated).size === 4);
  }

  // honorLinks: false falls back to normal shuffling - just needs to still
  // produce a valid, fully-accounted-for round.
  const r3 = generateRound({
    players: linked,
    courts: 2,
    mode: 'doubles',
    strategy: 'balanced',
    history: emptyHistory(),
    roundNumber: 1,
    honorLinks: false,
  });
  check('honorLinks: false still generates a valid round', r3.ok);

  // Singles has no partner concept - links must be ignored even if set.
  const r4 = generateRound({
    players: linked,
    courts: 2,
    mode: 'singles',
    strategy: 'mixed',
    history: emptyHistory(),
    roundNumber: 1,
  });
  check('singles ignores links and fills every court', r4.ok && r4.round.matches.length === 2);

  // Every player linked, courts=2 (all 4 pairs's worth of seats needed but
  // only 4 pairs exist for 8 players / 2 courts): both pairs on a court
  // should end up facing each other.
  const allLinked: Player[] = [
    mk(11, 'Uma', 'advanced', 12),
    mk(12, 'Vic', 'advanced', 11),
    mk(13, 'Wes', 'beginner', 14),
    mk(14, 'Xan', 'beginner', 13),
  ];
  const r5 = generateRound({
    players: allLinked,
    courts: 1,
    mode: 'doubles',
    strategy: 'mixed',
    history: emptyHistory(),
    roundNumber: 1,
  });
  check('two linked pairs on one court face each other, not split', r5.ok && linksHonored((r5 as { ok: true; round: Round }).round, allLinked));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
