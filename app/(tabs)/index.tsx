import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import {
  Match,
  MatchMode,
  Player,
  Round,
  TIER_LABEL,
  TIERS,
  Team,
  Tier,
  winnerFromScores,
} from '../../src/domain/types';
import {
  Session,
  StoredMatch,
  StoredRound,
  buildHistory,
  createPlayer,
  createSession,
  deleteRound,
  endSession,
  getActiveSession,
  getSessionRoster,
  getSetting,
  listPlayers,
  setSessionRoster,
  setSetting,
  loadRounds,
  removePlayerFromSession,
  saveRound,
  sessionStandings,
  setMatchScore,
  setMatchWinner,
  substitutePlayer,
  updateRoundLineups,
  updateSessionSettings,
} from '../../src/db/repo';
import {
  STRATEGY_HINT,
  STRATEGY_LABEL,
  SlotRef,
  Strategy,
  generateRound,
  minPlayersFor,
  swapSlots,
  usableCourts,
} from '../../src/pairing/engine';
import { Icon } from '../../src/ui/Icon';
import { MatchCard, Slot } from '../../src/ui/MatchCard';
import {
  EmptyCourtCard,
  NextMatchups,
  QueueEntry,
  UpNext,
  WaitingQueue,
  buildQueue,
} from '../../src/ui/UpNext';
import { HeaderButton, SelectionBar, UndoBar } from '../../src/ui/SessionControls';
import { STANDINGS_HINT, Standings } from '../../src/ui/Standings';
import {
  Button,
  Card,
  EmptyState,
  Grid,
  GridCell,
  Heading,
  Input,
  LinkButton,
  Muted,
  Row,
  Screen,
  SearchField,
  Segmented,
  Sheet,
  Stepper,
  TierBadge,
  Title,
  ToggleRow,
  matchesSearch,
} from '../../src/ui/components';
import { rowLayout } from '../../src/ui/motion';
import { themedStyles, useTheme } from '../../src/ui/ThemeContext';
import { font, radius, space } from '../../src/ui/theme';
import { useResponsive } from '../../src/ui/useResponsive';

const STRATEGIES: Strategy[] = ['mixed', 'balanced', 'rotation', 'random'];

/** Remembers the last auto-queue choice so the next session starts the same way. */
const AUTO_QUEUE_KEY = 'auto_queue_default';

export default function PlayScreen() {
  const [session, setSession] = useState<Session | null>(null);

  const reload = useCallback(() => setSession(getActiveSession()), []);
  useFocusEffect(useCallback(() => reload(), [reload]));

  return session ? (
    <ActiveSession session={session} onChanged={reload} />
  ) : (
    <SessionSetup onStarted={reload} />
  );
}

// --- setup ------------------------------------------------------------------

function SessionSetup({ onStarted }: { onStarted: () => void }) {
  const r = useResponsive();
  const styles = useStyles();
  const { c } = useTheme();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [name, setName] = useState('');
  const [mode, setMode] = useState<MatchMode>('doubles');
  const [strategy, setStrategy] = useState<Strategy>('mixed');
  const [courts, setCourts] = useState(2);
  // Defaults to whatever was used last, since a group tends to play the same
  // way every week.
  const [autoQueue, setAutoQueue] = useState(getSetting(AUTO_QUEUE_KEY) === '1');
  // Standing links default on - if someone bothered to set up a fixed
  // partner, they want it honored unless they say otherwise for this session.
  const [honorLinks, setHonorLinks] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      const list = listPlayers();
      setAllPlayers(list);
      // Drop anyone who was archived or deleted since this screen last loaded.
      setPicked((prev) => new Set([...prev].filter((id) => list.some((p) => p.id === id))));
    }, [])
  );

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const visiblePickerPlayers = allPlayers.filter((p) => matchesSearch(p.name, pickerQuery));

  const needed = minPlayersFor(mode);
  const canStart = picked.size >= needed;
  const willUse = usableCourts(picked.size, courts, mode);
  const sittingOut = Math.max(0, picked.size - willUse * needed);

  const start = () => {
    const label = name.trim() || defaultSessionName();
    createSession({
      name: label,
      mode,
      strategy,
      courts,
      playerIds: [...picked],
      autoQueue,
      honorLinks,
    });
    setSetting(AUTO_QUEUE_KEY, autoQueue ? '1' : '0');
    onStarted();
  };

  if (allPlayers.length === 0) {
    return (
      <Screen>
        <Title>Play</Title>
        <EmptyState
          title="Add some players first"
          body="Head to the Players tab and add everyone who's here tonight, then come back to start a session."
        />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button
            label={canStart ? `Start session · ${picked.size} players` : `Pick at least ${needed} players`}
            onPress={start}
            disabled={!canStart}
          />
          {canStart ? (
            <Text style={styles.footerNote}>
              {willUse} court{willUse === 1 ? '' : 's'} in play
              {sittingOut > 0 ? ` · ${sittingOut} resting each round` : ' · everyone plays'}
            </Text>
          ) : null}
        </>
      }
    >
      <Title>New session</Title>
      <Muted>Check in who's here, then let the app build the matchups.</Muted>

      {/* Checking people in is the one thing you always do, so it leads -
          and it opens in a dialog rather than an inline grid, which on a
          20-plus roster used to bury every other setting below the fold. */}
      <Card style={{ marginTop: space.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Heading style={{ marginTop: 0 }}>Who's here?</Heading>
            <Muted>
              {picked.size === 0
                ? `Nobody checked in yet · ${allPlayers.length} on the roster`
                : `${picked.size} of ${allPlayers.length} checked in`}
            </Muted>
          </View>
          <Button
            label={picked.size === 0 ? 'Check in' : 'Edit'}
            variant="secondary"
            onPress={() => setShowPicker(true)}
          />
        </Row>

        {picked.size > 0 ? (
          <>
            <View style={{ height: space.sm }} />
            <Text style={styles.pickedNames} numberOfLines={2}>
              {allPlayers
                .filter((p) => picked.has(p.id))
                .map((p) => p.name)
                .join(' · ')}
            </Text>
          </>
        ) : null}
      </Card>

      <Sheet
        visible={showPicker}
        title="Who's here?"
        subtitle="Tap everyone playing tonight. You can add more once the session starts."
        onClose={() => setShowPicker(false)}
        headerAction={
          <>
            <SearchField value={pickerQuery} onChangeText={setPickerQuery} />
            <View style={{ height: space.sm }} />
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted>{picked.size} selected</Muted>
              {/* Select-all follows the filter: with a search active, the
                  obvious meaning is "everyone I can currently see". */}
              <LinkButton
                label={visiblePickerPlayers.every((p) => picked.has(p.id)) ? 'Clear these' : 'Select these'}
                onPress={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    const allOn = visiblePickerPlayers.every((p) => next.has(p.id));
                    for (const p of visiblePickerPlayers) {
                      if (allOn) next.delete(p.id);
                      else next.add(p.id);
                    }
                    return next;
                  })
                }
              />
            </Row>
          </>
        }
        footer={
          <Button
            label={canStart ? `Done · ${picked.size} players` : `Pick at least ${needed} players`}
            onPress={() => setShowPicker(false)}
            disabled={!canStart}
          />
        }
      >
        <Grid>
          {visiblePickerPlayers.map((p) => {
            const on = picked.has(p.id);
            return (
              <GridCell key={p.id} columns={r.playerColumns} layout={rowLayout}>
                <Pressable
                  onPress={() => toggle(p.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${p.name}, ${TIER_LABEL[p.tier]}`}
                >
                  <View style={[styles.pick, on && styles.pickOn]}>
                    <View style={[styles.check, on && styles.checkOn]}>
                      {on ? <Icon name="check" size={14} color={c.accentText} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickName} numberOfLines={1}>
                        {p.name}
                      </Text>
                    </View>
                    <TierBadge tier={p.tier} small />
                  </View>
                </Pressable>
              </GridCell>
            );
          })}
        </Grid>
        {visiblePickerPlayers.length === 0 ? (
          <Muted>Nobody matches "{pickerQuery.trim()}".</Muted>
        ) : null}
      </Sheet>

      <Card style={{ marginTop: space.lg }}>
        <Input placeholder={defaultSessionName()} value={name} onChangeText={setName} />

        <View style={{ height: space.lg }} />
        <Muted>Format</Muted>
        <View style={{ height: space.sm }} />
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'doubles', label: 'Doubles' },
            { value: 'singles', label: 'Singles' },
          ]}
        />

        <View style={{ height: space.lg }} />
        <Muted>Pairing style</Muted>
        <View style={{ height: space.sm }} />
        <Segmented
          value={strategy}
          onChange={setStrategy}
          options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_LABEL[s] }))}
        />
        <View style={{ height: space.sm }} />
        <Muted>{STRATEGY_HINT[strategy]}</Muted>

        <View style={{ height: space.lg }} />
        <Stepper label="Courts available" value={courts} onChange={setCourts} min={1} max={8} />

        <View style={{ height: space.lg }} />
        <ToggleRow
          label="Keep rounds rolling"
          hint="Each court refills the moment you pick its winner - no waiting on the other courts. Nothing to tap until you end the session."
          value={autoQueue}
          onChange={setAutoQueue}
        />

        {mode === 'doubles' ? (
          <>
            <View style={{ height: space.lg }} />
            <ToggleRow
              label="Honor fixed partners"
              hint="Players with a Link (set on the Players tab) always play together. Turn off to shuffle everyone freely for this session."
              value={honorLinks}
              onChange={setHonorLinks}
            />
          </>
        ) : null}
      </Card>

    </Screen>
  );
}

// --- active session ---------------------------------------------------------

type SessionTab = 'live' | 'history' | 'standings';

/**
 * What the organiser has tapped. A court or bench slot belongs to a specific
 * round; someone in the continuous-play waiting list has no slot at all, so
 * they're tracked by player instead.
 */
type Selection =
  | { kind: 'slot'; roundId: number; ref: SlotRef }
  | { kind: 'waiting'; playerId: number };

/** A result that was just decided and can still be taken back. */
type PendingUndo = {
  matchId: number;
  /** The scores as they stood before the deciding entry - what Undo restores. */
  prevA: number | null;
  prevB: number | null;
  /** Rounds with a higher id were filled in after the decision; Undo removes them. */
  afterRoundId: number;
  message: string;
};

/** Long enough to read the bar and reach for it, short enough not to linger into the next game. */
const UNDO_WINDOW_MS = 8000;

function playerAtSlot(round: StoredRound, ref: SlotRef): number | undefined {
  if (ref.kind === 'bench') return round.resting[ref.index];
  const match = round.matches.find((m) => m.court === ref.court);
  return match ? (ref.team === 'A' ? match.teamA : match.teamB)[ref.index] : undefined;
}

function ActiveSession({ session, onChanged }: { session: Session; onChanged: () => void }) {
  const r = useResponsive();
  const styles = useStyles();
  const { c } = useTheme();
  const [rounds, setRounds] = useState<StoredRound[]>([]);
  const [roster, setRoster] = useState<Player[]>([]);
  // False until the first read from the database. Before it, the empty
  // roster makes every queued player look gone and every court look open,
  // and acting on that would throw away a saved queue on every launch.
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddPlayers, setShowAddPlayers] = useState(false);
  const [tab, setTab] = useState<SessionTab>('live');
  const [undo, setUndo] = useState<PendingUndo | null>(null);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
    return () => clearTimeout(t);
  }, [undo]);

  // The proposed next round. Held here rather than in the database so
  // reshuffling is free and an unplayed round never feeds back into the
  // pairing history.
  const [next, setNext] = useState<Round | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);

  /** Recompute the preview and the waiting order from what's stored. */
  const planNext = useCallback(
    (currentRoster: Player[], playedRounds: StoredRound[]) => {
      const history = buildHistory(session.id);
      const result = generateRound({
        players: currentRoster,
        courts: session.courts,
        mode: session.mode,
        strategy: session.strategy,
        history,
        roundNumber: playedRounds.length + 1,
        honorLinks: session.honorLinks,
      });
      const proposed = result.ok ? result.round : null;
      setNext(proposed);
      setQueue(buildQueue(currentRoster, history.gamesPlayed, proposed));
    },
    [session.id, session.courts, session.mode, session.strategy, session.honorLinks]
  );

  // Everyone in the app, players tab and all - the pool "Add players" picks
  // from. Loaded separately from the roster since most of them aren't in it.
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [addPicked, setAddPicked] = useState<Set<number>>(new Set());
  const [addQuery, setAddQuery] = useState('');

  const refresh = useCallback(() => {
    const loadedRounds = loadRounds(session.id);
    const currentRoster = getSessionRoster(session.id);
    setRounds(loadedRounds);
    setRoster(currentRoster);
    setLoaded(true);
    setAllPlayers(listPlayers());
    // The whole-roster preview only feeds the manual "Start next round" flow -
    // continuous play fills courts one at a time instead (see the effect
    // below), so computing it there would just be wasted sampling.
    if (!session.autoQueue) planNext(currentRoster, loadedRounds);
  }, [session.id, session.autoQueue, planNext]);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const playersById = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);

  // Re-read rather than tally locally: `rounds` already changes on every
  // winner tap (and every substitution), and re-querying keeps this in step
  // with the same SQL the finished-session view uses, so live and history
  // standings can't drift apart.
  const standings = useMemo(() => sessionStandings(session.id), [session.id, rounds]);

  const rosterIds = useMemo(() => new Set(roster.map((p) => p.id)), [roster]);
  const addCandidates = useMemo(
    () =>
      allPlayers.filter(
        (p) => !p.archived && !rosterIds.has(p.id) && matchesSearch(p.name, addQuery)
      ),
    [allPlayers, rosterIds, addQuery]
  );
  /** Kept separate from `addCandidates` so a search miss doesn't read as "everyone is in". */
  const hasAddCandidates = useMemo(
    () => allPlayers.some((p) => !p.archived && !rosterIds.has(p.id)),
    [allPlayers, rosterIds]
  );

  const addPlayersToSession = (ids: number[]) => {
    if (ids.length === 0) return;
    setSessionRoster(session.id, [...roster.map((p) => p.id), ...ids]);
    setAddPicked(new Set());
    refresh();
  };

  // --- continuous play: each court advances on its own -----------------------
  //
  // A rented-court session doesn't wait for the slowest game - a court that
  // finishes should refill immediately from whoever's free, while the other
  // courts keep playing. "Round" numbers still exist for bookkeeping, but they
  // no longer mean "every court moves together": each court just shows its own
  // latest match, wherever that match happens to live.
  const { latestMatchByCourt, matchLocation } = useMemo(() => {
    const matchLocation = new Map<number, { round: StoredRound; index: number }>();
    const latestMatchByCourt = new Map<number, StoredMatch>();
    const latestRoundIdByCourt = new Map<number, number>();
    for (const rnd of rounds) {
      rnd.matches.forEach((m, i) => {
        matchLocation.set(m.id, { round: rnd, index: i });
        const seenRoundId = latestRoundIdByCourt.get(m.court);
        if (seenRoundId === undefined || rnd.id > seenRoundId) {
          latestRoundIdByCourt.set(m.court, rnd.id);
          latestMatchByCourt.set(m.court, m);
        }
      });
    }
    return { latestMatchByCourt, matchLocation };
  }, [rounds]);

  // Busy = seated on a court whose latest match has no winner yet. Everyone
  // else - benched or just freed by a decided match - is fair game for the
  // next court that opens up.
  const busyIds = useMemo(() => {
    const s = new Set<number>();
    for (const m of latestMatchByCourt.values()) {
      if (m.winner == null) for (const id of [...m.teamA, ...m.teamB]) s.add(id);
    }
    return s;
  }, [latestMatchByCourt]);

  const idlePlayers = useMemo(() => roster.filter((p) => !busyIds.has(p.id)), [roster, busyIds]);

  const gamesPlayedById = useMemo(() => {
    const m = new Map<number, number>();
    for (const rnd of rounds)
      for (const match of rnd.matches)
        for (const id of [...match.teamA, ...match.teamB]) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [rounds]);

  const waitingQueue = useMemo(
    () => buildQueue(idlePlayers, gamesPlayedById, null),
    [idlePlayers, gamesPlayedById]
  );

  const emptyCourts = useMemo(() => {
    const arr: number[] = [];
    for (let ct = 0; ct < session.courts; ct++) {
      const m = latestMatchByCourt.get(ct);
      if (!m || m.winner != null) arr.push(ct);
    }
    return arr;
  }, [latestMatchByCourt, session.courts]);

  // Continuous play keeps a short queue of matchups formed ahead of time -
  // one per court, the next "wave" - so people waiting can see when they're
  // on. At open play, with ten or so players per court, "when am I up?" is
  // the question the organiser fields all night.
  //
  // The queue is a promise, not a guess: a court that opens takes the front
  // matchup exactly as shown. So it's kept in the settings table, not just in
  // memory - Android kills a backgrounded app freely, and a queue that quietly
  // re-formed on relaunch would bump people who'd been told they were next.
  // It still never feeds the pairing history until a game is actually played.
  const upcomingKey = `upcoming_queue_${session.id}`;
  const [upcoming, setUpcoming] = useState<Match[]>(() => {
    try {
      const saved = getSetting(upcomingKey);
      return saved ? (JSON.parse(saved) as Match[]) : [];
    } catch {
      return []; // A corrupt entry just means the queue forms afresh.
    }
  });
  useEffect(() => {
    setSetting(upcomingKey, JSON.stringify(upcoming));
  }, [upcomingKey, upcoming]);

  // One effect owns both jobs - refilling open courts and topping the queue
  // back up - because they draw from the same pool of free players, and two
  // effects racing over it could seat someone twice.
  //
  // Runs at session start (every court is "empty"), after every result
  // (deciding a match frees its players), and whenever the free pool changes
  // through a sub, a removal or a late arrival.
  useEffect(() => {
    if (!session.autoQueue || !loaded) return;

    const idleIds = new Set(idlePlayers.map((p) => p.id));
    const seated = (m: Match) => [...m.teamA, ...m.teamB];
    // A queued matchup survives only while everyone in it is still free and
    // still checked in.
    const queue = upcoming.filter((m) => seated(m).every((id) => idleIds.has(id)));
    const freeOutside = (taken: Match[]) => {
      const busy = new Set(taken.flatMap(seated));
      return idlePlayers.filter((p) => !busy.has(p.id));
    };
    const form = (pool: Player[], courts: number): Match[] => {
      if (courts <= 0) return [];
      const result = generateRound({
        players: pool,
        courts,
        mode: session.mode,
        strategy: session.strategy,
        history: buildHistory(session.id),
        roundNumber: rounds.length + 1,
        honorLinks: session.honorLinks,
      });
      return result.ok ? result.round.matches : [];
    };

    if (emptyCourts.length > 0) {
      const toPlay = queue.splice(0, emptyCourts.length);
      // Courts the queue couldn't cover - too few people were waiting ahead
      // of time, as in a small group - form their game now from everyone
      // free, including whoever just came off.
      toPlay.push(...form(freeOutside([...toPlay, ...queue]), emptyCourts.length - toPlay.length));
      if (toPlay.length > 0) {
        saveRound(session.id, {
          number: rounds.length + 1,
          matches: toPlay.map((m, i) => ({ ...m, court: emptyCourts[i] })),
          resting: freeOutside(toPlay).map((p) => p.id),
        });
        setUpcoming(queue);
        refresh();
        return;
      }
    }

    const topUp = form(freeOutside(queue), session.courts - queue.length);
    if (topUp.length > 0 || queue.length !== upcoming.length) setUpcoming([...queue, ...topUp]);
  }, [
    loaded,
    session.autoQueue,
    session.id,
    session.mode,
    session.strategy,
    session.honorLinks,
    session.courts,
    emptyCourts,
    idlePlayers,
    upcoming,
    rounds.length,
    refresh,
  ]);

  /** Commit the previewed round and immediately plan the one after it. */
  const startRound = () => {
    if (!next) {
      Alert.alert('Cannot start a round', 'Not enough players are checked in to fill a court.');
      return;
    }
    saveRound(session.id, next);
    setSelected(null);
    // Undo would now also delete the round that just started - not what
    // anyone reaching for it a moment later means.
    setUndo(null);
    refresh();
  };

  const onSlotPress = (roundId: number, ref: SlotRef) => {
    const round = rounds.find((x) => x.id === roundId);
    if (!round) return;

    // Someone waiting was picked first, so this tap names who they replace.
    if (selected?.kind === 'waiting') {
      if (ref.kind === 'court') subIn(round, ref, selected.playerId);
      else setSelected({ kind: 'slot', roundId, ref });
      return;
    }

    // First tap selects; second tap swaps. Selecting across two different
    // rounds would move a player out of a round they already played, so a tap
    // in another round just moves the selection instead.
    if (!selected || selected.roundId !== roundId) {
      setSelected({ kind: 'slot', roundId, ref });
      return;
    }
    if (
      selected.ref.kind === ref.kind &&
      JSON.stringify(selected.ref) === JSON.stringify(ref)
    ) {
      setSelected(null);
      return;
    }

    const next = swapSlots(round, selected.ref, ref);
    updateRoundLineups(round, next);
    setSelected(null);
    refresh();
  };

  // Continuous play has no shared "bench" to swap against - courts advance on
  // their own, so whoever isn't currently seated is just idle. This lets an
  // on-court player be replaced by someone from that waiting list directly,
  // which covers both a tactical sub and a player leaving mid-game.
  const subIn = (round: StoredRound, ref: Extract<SlotRef, { kind: 'court' }>, inId: number) => {
    const match = round.matches.find((m) => m.court === ref.court);
    const outId = playerAtSlot(round, ref);
    setSelected(null);
    if (!match || outId === undefined || outId === inId) return;
    substitutePlayer(match.id, outId, inId);
    refresh();
  };

  /** Either order works: court player then waiting player, or the reverse. */
  const onWaitingPress = (playerId: number) => {
    if (selected?.kind === 'slot') {
      const round = rounds.find((x) => x.id === selected.roundId);
      if (round && selected.ref.kind === 'court') subIn(round, selected.ref, playerId);
      else setSelected({ kind: 'waiting', playerId });
      return;
    }
    if (selected?.kind === 'waiting' && selected.playerId === playerId) {
      setSelected(null);
      return;
    }
    setSelected({ kind: 'waiting', playerId });
  };

  const removeFromSession = (playerId: number) => {
    const player = playersById.get(playerId);
    if (!player) return;
    const onCourt = busyIds.has(playerId);
    Alert.alert(
      `Remove ${player.name}?`,
      onCourt
        ? 'They finish the game they are on, then drop out of the rotation. Results they already have are kept.'
        : 'They drop out of the rotation for the rest of this session. Results they already have are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removePlayerFromSession(session.id, playerId);
            setSelected(null);
            refresh();
          },
        },
      ]
    );
  };

  const changeScore = (
    round: StoredRound,
    matchIndex: number,
    scoreA: number | null,
    scoreB: number | null
  ) => {
    const match = round.matches[matchIndex];
    setMatchScore(match.id, scoreA, scoreB);

    // Mirror the derivation the repo just persisted, so continuous play sees
    // the new winner immediately instead of waiting for a refetch.
    const winner = winnerFromScores(scoreA, scoreB);

    // Only the entry that turns an open match into a result gets an undo -
    // that's the moment continuous play refills the court. Correcting a score
    // that leaves the same winner changes nothing downstream.
    if (match.winner == null && winner != null) {
      const names = (winner === 'A' ? match.teamA : match.teamB)
        .map((id) => playersById.get(id)?.name ?? '—')
        .join(' & ');
      const [won, lost] = winner === 'A' ? [scoreA, scoreB] : [scoreB, scoreA];
      setUndo({
        matchId: match.id,
        prevA: match.scoreA,
        prevB: match.scoreB,
        afterRoundId: rounds.reduce((max, r2) => Math.max(max, r2.id), 0),
        message: `Court ${match.court + 1} · ${names} won ${won}–${lost}`,
      });
      // The court is about to turn over, so a selection made before the
      // result would point at a game that just ended.
      setSelected(null);
    } else if (winner == null && undo?.matchId === match.id) {
      setUndo(null);
    }

    const updated = round.matches.map((m, i) =>
      i === matchIndex ? { ...m, scoreA, scoreB, winner } : m
    );
    setRounds((prev) =>
      prev.map((r2) => (r2.id !== round.id ? r2 : { ...r2, matches: updated }))
    );
  };

  const changeWinner = (round: StoredRound, matchIndex: number, winner: Team | null) => {
    const match = round.matches[matchIndex];
    setMatchWinner(match.id, winner);
    if (undo?.matchId === match.id) setUndo(null);

    // In continuous play, this is the only trigger the fill effect above needs:
    // updating `rounds` here recomputes `busyIds`/`emptyCourts`, which frees
    // this court's players and lets that effect refill whichever court just
    // opened up, independently of every other court's progress.
    // setMatchWinner drops any stored score, so the local copy has to as well
    // or the card would keep rendering points the database no longer has.
    const updated = round.matches.map((m, i) =>
      i === matchIndex ? { ...m, winner, scoreA: null, scoreB: null } : m
    );
    setRounds((prev) =>
      prev.map((r2) => (r2.id !== round.id ? r2 : { ...r2, matches: updated }))
    );
  };

  /**
   * Takes back the last decided result. In continuous play that also means
   * removing whatever was auto-filled since, so the court's players go back
   * on it - deleteRound cascades to the matches and line-ups inside it.
   */
  const undoDecision = () => {
    if (!undo) return;
    const added = rounds.filter((r2) => r2.id > undo.afterRoundId);
    const touched = added.some((r2) =>
      r2.matches.some((m) => m.winner != null || m.scoreA != null || m.scoreB != null)
    );
    setUndo(null);
    if (touched) {
      Alert.alert(
        "Can't undo that one",
        'A game that started after it already has a score. Fix the result from the History tab instead.'
      );
      return;
    }
    for (const r2 of added) deleteRound(r2.id);
    setMatchScore(undo.matchId, undo.prevA, undo.prevB);
    setUpcoming((prev) => [...added.flatMap((r2) => r2.matches), ...prev]);
    setSelected(null);
    refresh();
  };

  const finish = () => {
    Alert.alert('End this session?', 'It moves to History and you can start a new one.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End session',
        style: 'destructive',
        onPress: () => {
          endSession(session.id);
          setSetting(upcomingKey, ''); // nothing left to queue for
          onChanged();
        },
      },
    ]);
  };

  // Manual mode: one round covers every court in lockstep, so "the last round"
  // is unambiguous - split it from everything before it so Live stays focused
  // on the round actually in progress.
  const currentRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const pastRounds = useMemo(
    () => (session.autoQueue ? [] : rounds.slice(0, -1).reverse()),
    [rounds, session.autoQueue]
  );

  // Continuous play: courts advance independently, so "past" is per-court -
  // a match is history the moment a later match has been assigned to its
  // court, regardless of what the other courts are doing. A round row can
  // straddle both tabs at once (one court moved on, another hasn't).
  const pastEntries = useMemo(() => {
    if (!session.autoQueue) return [];
    const list: { round: StoredRound; items: { match: StoredMatch; index: number }[] }[] = [];
    for (let i = rounds.length - 1; i >= 0; i--) {
      const rnd = rounds[i];
      const items = rnd.matches
        .map((m, index) => ({ match: m, index }))
        .filter(({ match }) => latestMatchByCourt.get(match.court)?.id !== match.id);
      if (items.length > 0) list.push({ round: rnd, items });
    }
    return list;
  }, [rounds, latestMatchByCourt, session.autoQueue]);

  const pastCount = session.autoQueue
    ? pastEntries.reduce((n, g) => n + g.items.length, 0)
    : pastRounds.length;

  const stillWaiting = useMemo(() => {
    const queued = new Set(upcoming.flatMap((m) => [...m.teamA, ...m.teamB]));
    return waitingQueue.filter((q) => !queued.has(q.player.id));
  }, [waitingQueue, upcoming]);

  const selectedPlayerId = useMemo(() => {
    if (!selected) return undefined;
    if (selected.kind === 'waiting') return selected.playerId;
    const round = rounds.find((x) => x.id === selected.roundId);
    return round ? playerAtSlot(round, selected.ref) : undefined;
  }, [selected, rounds]);
  const selectedPlayer =
    selectedPlayerId !== undefined ? playersById.get(selectedPlayerId) : undefined;

  /** The selection to hand a MatchCard or bench slot belonging to `roundId`. */
  const slotSelection = (roundId: number) =>
    selected?.kind === 'slot' && selected.roundId === roundId ? selected.ref : null;

  const selectionHint =
    selected?.kind === 'waiting'
      ? `Tap a player on court to sub ${selectedPlayer?.name ?? 'them'} in.`
      : session.autoQueue
        ? waitingQueue.length > 0
          ? 'Tap a court player to swap, or sub in:'
          : 'Tap another player on court to swap places.'
        : 'Tap another player to swap places, or tap them again to cancel.';

  // Only a court player can be subbed out; a waiting player picks their
  // target on court instead.
  const canSub =
    session.autoQueue && selected?.kind === 'slot' && selected.ref.kind === 'court';

  const closeAddPlayers = () => {
    setShowAddPlayers(false);
    setAddPicked(new Set());
    setAddQuery('');
  };

  // The thumb zone holds whatever is in progress: a selection outranks
  // everything (it's the thing being done right now), then the undo for a
  // result just entered, then starting the next round. Continuous play has no
  // standing action, so with nothing going on the bar disappears entirely.
  const mainAction = session.autoQueue ? null : (
    <Button label="Start next round" onPress={startRound} disabled={!next} />
  );
  const footer = selectedPlayer ? (
    <SelectionBar
      name={selectedPlayer.name}
      hint={selectionHint}
      subOptions={
        canSub
          ? waitingQueue.map((q) => ({ id: q.player.id, name: q.player.name, games: q.games }))
          : undefined
      }
      onSub={onWaitingPress}
      onRemove={() => removeFromSession(selectedPlayer.id)}
      onCancel={() => setSelected(null)}
    />
  ) : undo || mainAction ? (
    <View style={{ gap: space.md }}>
      {undo ? <UndoBar message={undo.message} onUndo={undoDecision} /> : null}
      {mainAction}
    </View>
  ) : null;

  return (
    <Screen footer={footer}>
      <Row style={{ justifyContent: 'space-between', marginTop: space.lg }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sessionName} numberOfLines={1}>
            {session.name}
          </Text>
          <Muted>
            {session.mode === 'doubles' ? 'Doubles' : 'Singles'} · {STRATEGY_LABEL[session.strategy]} ·{' '}
            {roster.length} players
          </Muted>
        </View>
        <Row gap={space.sm}>
          <HeaderButton
            icon="plus"
            label="Add"
            accessibilityLabel="Add players"
            onPress={() => setShowAddPlayers(true)}
          />
          <HeaderButton
            icon="more"
            accessibilityLabel="Session settings"
            onPress={() => setShowSettings(true)}
          />
        </Row>
      </Row>

      {/* Sheets rather than inline panels: an inline panel opened at the top
          pushed the courts - the thing actually being played - off screen. */}
      <Sheet
        visible={showAddPlayers}
        title="Add players"
        subtitle="They join the rotation right away, mid-session."
        onClose={closeAddPlayers}
        footer={
          hasAddCandidates ? (
            <Button
              label={addPicked.size > 0 ? `Add ${addPicked.size} to session` : 'Select players to add'}
              disabled={addPicked.size === 0}
              onPress={() => {
                addPlayersToSession([...addPicked]);
                closeAddPlayers();
              }}
            />
          ) : undefined
        }
      >
        {!hasAddCandidates ? (
          <Muted>Everyone else is already checked in.</Muted>
        ) : (
          <>
            <SearchField value={addQuery} onChangeText={setAddQuery} />
            <View style={{ height: space.sm }} />
            {addCandidates.length === 0 ? (
              <Muted>Nobody available matches "{addQuery.trim()}".</Muted>
            ) : null}
            <Grid>
              {addCandidates.map((p) => {
                const on = addPicked.has(p.id);
                return (
                  <GridCell key={p.id} columns={r.playerColumns} layout={rowLayout}>
                    <Pressable
                      onPress={() =>
                        setAddPicked((prev) => {
                          const n = new Set(prev);
                          if (n.has(p.id)) n.delete(p.id);
                          else n.add(p.id);
                          return n;
                        })
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`${p.name}, ${TIER_LABEL[p.tier]}`}
                    >
                      <View style={[styles.pick, on && styles.pickOn]}>
                        <View style={[styles.check, on && styles.checkOn]}>
                          {on ? <Icon name="check" size={14} color={c.accentText} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pickName} numberOfLines={1}>
                            {p.name}
                          </Text>
                        </View>
                        <TierBadge tier={p.tier} small />
                      </View>
                    </Pressable>
                  </GridCell>
                );
              })}
            </Grid>
          </>
        )}
        <View style={{ height: space.lg }} />
        <Muted>Not on the roster at all yet?</Muted>
        <View style={{ height: space.sm }} />
        <QuickAddPlayer
          existing={allPlayers}
          onAdd={(name, tier) => {
            const p = createPlayer(name, tier);
            addPlayersToSession([p.id]);
          }}
        />
      </Sheet>

      <Sheet
        visible={showSettings}
        title="Session"
        subtitle={session.name}
        onClose={() => setShowSettings(false)}
        footer={<Button label="End session" variant="danger" onPress={finish} />}
      >
        <Muted>Pairing style for the next round</Muted>
        <View style={{ height: space.sm }} />
        <Segmented
          value={session.strategy}
          onChange={(s) => {
            updateSessionSettings(session.id, { strategy: s });
            onChanged();
          }}
          options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_LABEL[s] }))}
        />
        <View style={{ height: space.sm }} />
        <Muted>{STRATEGY_HINT[session.strategy]}</Muted>
        <View style={{ height: space.lg }} />
        <Stepper
          label="Courts available"
          value={session.courts}
          min={1}
          max={8}
          onChange={(courts) => {
            updateSessionSettings(session.id, { courts });
            onChanged();
          }}
        />
        <View style={{ height: space.lg }} />
        <ToggleRow
          label="Keep rounds rolling"
          hint="Each court refills the moment you pick its winner - no waiting on the other courts."
          value={session.autoQueue}
          onChange={(autoQueue) => {
            updateSessionSettings(session.id, { autoQueue });
            setSetting(AUTO_QUEUE_KEY, autoQueue ? '1' : '0');
            setSelected(null);
            setUndo(null);
            setUpcoming([]);
            onChanged();
          }}
        />
        {session.mode === 'doubles' ? (
          <>
            <View style={{ height: space.lg }} />
            <ToggleRow
              label="Honor fixed partners"
              hint="Players with a Link always play together. Turn off to shuffle everyone freely for the rest of this session."
              value={session.honorLinks}
              onChange={(honorLinks) => {
                updateSessionSettings(session.id, { honorLinks });
                onChanged();
              }}
            />
          </>
        ) : null}
      </Sheet>

      <View style={{ marginTop: space.lg }}>
        <Segmented
          value={tab}
          onChange={(t) => {
            setSelected(null);
            setTab(t);
          }}
          options={[
            { value: 'live', label: 'Live' },
            {
              value: 'history',
              label: pastCount > 0 ? `History · ${pastCount}` : 'History',
            },
            { value: 'standings', label: 'Standings' },
          ]}
        />
      </View>

      {tab === 'standings' ? (
        <View style={{ marginTop: space.xl }}>
          <Heading>Standings</Heading>
          <Muted>{STANDINGS_HINT}</Muted>
          <Standings
            standings={standings}
            emptyBody="Pick a winner on a court and the standings fill in."
          />
        </View>
      ) : tab === 'live' ? (
        // Courts first: the games in progress are what someone glancing at
        // the phone between points is looking for. Who's waiting, and the
        // preview of the next round, are supporting detail below them.
        session.autoQueue ? (
          <>
            <View style={{ marginTop: space.xl }}>
              <Heading>On court</Heading>
              <Grid gap={space.md}>
                {Array.from({ length: session.courts }, (_, court) => {
                  const match = latestMatchByCourt.get(court);
                  const loc = match ? matchLocation.get(match.id) : undefined;
                  return (
                    <GridCell key={court} columns={r.courtColumns} gap={space.md}>
                      {match && loc ? (
                        <MatchCard
                          match={match}
                          players={playersById}
                          selected={slotSelection(loc.round.id)}
                          onSlotPress={(ref) => onSlotPress(loc.round.id, ref)}
                          onWinnerChange={(w) => changeWinner(loc.round, loc.index, w)}
                          onScoreChange={(a, b) => changeScore(loc.round, loc.index, a, b)}
                        />
                      ) : (
                        <EmptyCourtCard court={court} />
                      )}
                    </GridCell>
                  );
                })}
              </Grid>
            </View>

            <NextMatchups
              matches={upcoming}
              players={playersById}
              columns={r.courtColumns}
              selectedId={selected?.kind === 'waiting' ? selected.playerId : null}
              subbing={selected?.kind === 'slot'}
              onPress={onWaitingPress}
              onShuffle={() => setUpcoming([])}
            />

            <WaitingQueue
              queue={stillWaiting}
              title={upcoming.length > 0 ? 'Still waiting' : 'Waiting for a court'}
              selectedId={selected?.kind === 'waiting' ? selected.playerId : null}
              subbing={selected?.kind === 'slot'}
              onPress={onWaitingPress}
            />
          </>
        ) : (
          <>
            {currentRound ? (
              <View style={{ marginTop: space.xl }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Heading>Round {currentRound.number}</Heading>
                  <Text style={styles.current}>Current</Text>
                </Row>

                <Grid gap={space.md}>
                  {currentRound.matches.map((m, i) => (
                    <GridCell key={m.id} columns={r.courtColumns} gap={space.md}>
                      <MatchCard
                        match={m}
                        players={playersById}
                        selected={slotSelection(currentRound.id)}
                        onSlotPress={(ref) => onSlotPress(currentRound.id, ref)}
                        onWinnerChange={(w) => changeWinner(currentRound, i, w)}
                        onScoreChange={(a, b) => changeScore(currentRound, i, a, b)}
                      />
                    </GridCell>
                  ))}
                </Grid>

                {currentRound.resting.length > 0 ? (
                  <View style={{ marginTop: space.md }}>
                    <Muted>Resting this round · tap to swap someone in</Muted>
                    <View style={[styles.benchRow, { gap: space.sm }]}>
                      {currentRound.resting.map((id, i) => (
                        <View key={`${id}-${i}`} style={{ minWidth: 130, flexGrow: 1, maxWidth: 220 }}>
                          <Slot
                            player={playersById.get(id)}
                            refSlot={{ kind: 'bench', index: i }}
                            selected={slotSelection(currentRound.id)}
                            onPress={(ref) => onSlotPress(currentRound.id, ref)}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            <UpNext
              next={next}
              queue={queue}
              players={playersById}
              roundNumber={rounds.length + 1}
              courtColumns={r.courtColumns}
              autoQueue={session.autoQueue}
              onShuffle={() => planNext(roster, rounds)}
            />
          </>
        )
      ) : session.autoQueue ? (
        pastEntries.length === 0 ? (
          <EmptyState
            title="No past games yet"
            body="Once a court's game is decided and refilled, it moves here so Live stays focused on who's playing now."
          />
        ) : (
          pastEntries.map(({ round, items }) => (
            <View key={round.id} style={{ marginTop: space.xl }}>
              <Heading>Round {round.number}</Heading>
              <Grid gap={space.md}>
                {items.map(({ match, index }) => (
                  <GridCell key={match.id} columns={r.courtColumns} gap={space.md}>
                    <MatchCard
                      match={match}
                      players={playersById}
                      selected={null}
                      onSlotPress={() => {}}
                      onWinnerChange={(w) => changeWinner(round, index, w)}
                      onScoreChange={(a, b) => changeScore(round, index, a, b)}
                      allowSwap={false}
                    />
                  </GridCell>
                ))}
              </Grid>
            </View>
          ))
        )
      ) : pastRounds.length === 0 ? (
        <EmptyState
          title="No past rounds yet"
          body="Once the current round is done, it moves here so Live stays focused on what's happening now."
        />
      ) : (
        pastRounds.map((round) => (
          <View key={round.id} style={{ marginTop: space.xl }}>
            <Heading>Round {round.number}</Heading>

            <Grid gap={space.md}>
              {round.matches.map((m, i) => (
                <GridCell key={m.id} columns={r.courtColumns} gap={space.md}>
                  <MatchCard
                    match={m}
                    players={playersById}
                    selected={null}
                    onSlotPress={() => {}}
                    onWinnerChange={(w) => changeWinner(round, i, w)}
                    onScoreChange={(a, b) => changeScore(round, i, a, b)}
                    allowSwap={false}
                  />
                </GridCell>
              ))}
            </Grid>

            {round.resting.length > 0 ? (
              <Muted style={{ marginTop: space.sm }}>
                Rested: {round.resting.map((id) => playersById.get(id)?.name ?? '—').join(', ')}
              </Muted>
            ) : null}
          </View>
        ))
      )}
    </Screen>
  );
}

/** Inline create-and-check-in row for a player who isn't on the roster yet. */
function QuickAddPlayer({
  existing,
  onAdd,
}: {
  existing: Player[];
  onAdd: (name: string, tier: Tier) => void;
}) {
  const [name, setName] = useState('');
  const [tier, setTier] = useState<Tier>('intermediate');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const clash = existing.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (clash) {
      Alert.alert(
        'Name already used',
        `"${clash.name}" is already a player - pick them from the list above instead of creating a duplicate.`
      );
      return;
    }
    onAdd(trimmed, tier);
    setName('');
    setTier('intermediate');
  };

  return (
    <View>
      <Input
        placeholder="New player name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <View style={{ height: space.sm }} />
      <Segmented value={tier} onChange={setTier} options={TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] }))} />
      <View style={{ height: space.sm }} />
      <Button label="Add & check in" onPress={submit} disabled={!name.trim()} />
    </View>
  );
}

function defaultSessionName(): string {
  const now = new Date();
  return now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

const useStyles = themedStyles(({ c, font, family }) => ({
  benchRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm },
  link: { color: c.accentInk, fontSize: font.sm, fontFamily: family.semibold, paddingLeft: space.md },
  sessionName: { color: c.text, fontSize: font.xl, fontFamily: family.display },
  current: { color: c.accentInk, fontSize: font.xs, fontFamily: family.bold },
  footerNote: {
    color: c.textDim,
    fontSize: font.xs,
    fontFamily: family.regular,
    textAlign: 'center',
    marginTop: space.sm,
  },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    padding: space.md,
    minHeight: 52,
  },
  pickOn: { borderColor: c.accentEdge, backgroundColor: c.accentWash },
  pickName: { color: c.text, fontSize: font.md, fontFamily: family.semibold },
  pickedNames: {
    color: c.accentInk,
    fontSize: font.sm,
    fontFamily: family.semibold,
    lineHeight: font.sm * 1.4,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: c.accent, borderColor: c.accent },
}));
