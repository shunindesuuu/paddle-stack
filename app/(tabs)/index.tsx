import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { MatchMode, Player, Round, TIER_LABEL, TIERS, Team, Tier } from '../../src/domain/types';
import {
  Session,
  StoredMatch,
  StoredRound,
  buildHistory,
  createPlayer,
  createSession,
  endSession,
  getActiveSession,
  getSessionRoster,
  getSetting,
  listPlayers,
  setSessionRoster,
  setSetting,
  loadRounds,
  saveRound,
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
import { EmptyCourtCard, QueueEntry, UpNext, WaitingQueue, buildQueue } from '../../src/ui/UpNext';
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
  Segmented,
  Stepper,
  TierBadge,
  Title,
  ToggleRow,
} from '../../src/ui/components';
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

      <Row style={{ justifyContent: 'space-between', marginTop: space.xl }}>
        <Heading>Who's here?</Heading>
        <LinkButton
          label={picked.size === allPlayers.length ? 'Clear all' : 'Select all'}
          onPress={() =>
            setPicked(picked.size === allPlayers.length ? new Set() : new Set(allPlayers.map((p) => p.id)))
          }
        />
      </Row>

      <Grid>
        {allPlayers.map((p) => {
          const on = picked.has(p.id);
          return (
            <GridCell key={p.id} columns={r.playerColumns}>
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
    </Screen>
  );
}

// --- active session ---------------------------------------------------------

type SessionTab = 'live' | 'history';

function ActiveSession({ session, onChanged }: { session: Session; onChanged: () => void }) {
  const r = useResponsive();
  const styles = useStyles();
  const { c } = useTheme();
  const [rounds, setRounds] = useState<StoredRound[]>([]);
  const [roster, setRoster] = useState<Player[]>([]);
  const [selected, setSelected] = useState<{ roundId: number; ref: SlotRef } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddPlayers, setShowAddPlayers] = useState(false);
  const [tab, setTab] = useState<SessionTab>('live');

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

  const refresh = useCallback(() => {
    const loaded = loadRounds(session.id);
    const currentRoster = getSessionRoster(session.id);
    setRounds(loaded);
    setRoster(currentRoster);
    setAllPlayers(listPlayers());
    // The whole-roster preview only feeds the manual "Start next round" flow -
    // continuous play fills courts one at a time instead (see the effect
    // below), so computing it there would just be wasted sampling.
    if (!session.autoQueue) planNext(currentRoster, loaded);
  }, [session.id, session.autoQueue, planNext]);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const playersById = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);

  const rosterIds = useMemo(() => new Set(roster.map((p) => p.id)), [roster]);
  const addCandidates = useMemo(
    () => allPlayers.filter((p) => !p.archived && !rosterIds.has(p.id)),
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

  // Fills every currently-empty court it can from whoever's idle right now.
  // Runs at session start (every court is "empty") and again after every
  // winner tap, since deciding a match frees its players and can immediately
  // unblock a different court that was waiting on a body count.
  useEffect(() => {
    if (!session.autoQueue || emptyCourts.length === 0) return;
    const history = buildHistory(session.id);
    const result = generateRound({
      players: idlePlayers,
      courts: emptyCourts.length,
      mode: session.mode,
      strategy: session.strategy,
      history,
      roundNumber: rounds.length + 1,
      honorLinks: session.honorLinks,
    });
    if (!result.ok) return; // Not enough idle players yet - stays queued.
    const filled: Round = {
      ...result.round,
      matches: result.round.matches.map((m, i) => ({ ...m, court: emptyCourts[i] })),
    };
    saveRound(session.id, filled);
    refresh();
  }, [
    session.autoQueue,
    session.id,
    session.mode,
    session.strategy,
    session.honorLinks,
    emptyCourts,
    idlePlayers,
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
    refresh();
  };

  const onSlotPress = (roundId: number, ref: SlotRef) => {
    const round = rounds.find((x) => x.id === roundId);
    if (!round) return;

    // First tap selects; second tap swaps. Selecting across two different
    // rounds would move a player out of a round they already played, so a tap
    // in another round just moves the selection instead.
    if (!selected || selected.roundId !== roundId) {
      setSelected({ roundId, ref });
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
  // their own, so whoever isn't currently seated is just idle. This lets a
  // selected on-court player be replaced by someone from that waiting list
  // directly, which covers both a tactical sub and a player leaving mid-game.
  const substituteFromWaiting = (inId: number) => {
    if (!selected) return;
    const ref = selected.ref;
    if (ref.kind !== 'court') return;
    const round = rounds.find((x) => x.id === selected.roundId);
    const match = round?.matches.find((m) => m.court === ref.court);
    if (!round || !match) return;
    const outId = (ref.team === 'A' ? match.teamA : match.teamB)[ref.index];
    if (outId === undefined || outId === inId) {
      setSelected(null);
      return;
    }
    substitutePlayer(match.id, outId, inId);
    setSelected(null);
    refresh();
  };

  const changeWinner = (round: StoredRound, matchIndex: number, winner: Team | null) => {
    const match = round.matches[matchIndex];
    setMatchWinner(match.id, winner);

    // In continuous play, this is the only trigger the fill effect above needs:
    // updating `rounds` here recomputes `busyIds`/`emptyCourts`, which frees
    // this court's players and lets that effect refill whichever court just
    // opened up, independently of every other court's progress.
    const updated = round.matches.map((m, i) => (i === matchIndex ? { ...m, winner } : m));
    setRounds((prev) =>
      prev.map((r2) => (r2.id !== round.id ? r2 : { ...r2, matches: updated }))
    );
  };

  const finish = () => {
    Alert.alert('End this session?', 'It moves to History and you can start a new one.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End session',
        style: 'destructive',
        onPress: () => {
          endSession(session.id);
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

  return (
    <Screen
      footer={
        session.autoQueue ? (
          <Button label="End" variant="ghost" onPress={finish} />
        ) : (
          <Row gap={space.sm}>
            <Button label="Start next round" onPress={startRound} disabled={!next} style={{ flex: 2 }} />
            <Button label="End" variant="ghost" onPress={finish} style={{ flex: 1 }} />
          </Row>
        )
      }
    >
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
        <Row gap={space.md}>
          <LinkButton
            label="Add players"
            onPress={() => {
              setShowSettings(false);
              setShowAddPlayers((v) => !v);
            }}
          />
          <LinkButton
            label={showSettings ? 'Done' : 'Settings'}
            onPress={() => {
              setShowAddPlayers(false);
              setShowSettings((v) => !v);
            }}
          />
        </Row>
      </Row>

      {showAddPlayers ? (
        <Card style={{ marginTop: space.md }}>
          <Heading>Add players</Heading>
          {addCandidates.length === 0 ? (
            <Muted>Everyone else is already checked in.</Muted>
          ) : (
            <>
              <Muted>Tap to check someone in - they join right away, mid-session.</Muted>
              <View style={{ height: space.sm }} />
              <Grid>
                {addCandidates.map((p) => {
                  const on = addPicked.has(p.id);
                  return (
                    <GridCell key={p.id} columns={r.playerColumns}>
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
              <View style={{ height: space.sm }} />
              <Button
                label={addPicked.size > 0 ? `Add ${addPicked.size} to session` : 'Select players to add'}
                disabled={addPicked.size === 0}
                onPress={() => addPlayersToSession([...addPicked])}
              />
              <View style={{ height: space.lg }} />
            </>
          )}
          <Muted>Not on the roster at all yet?</Muted>
          <View style={{ height: space.sm }} />
          <QuickAddPlayer
            existing={allPlayers}
            onAdd={(name, tier) => {
              const p = createPlayer(name, tier);
              addPlayersToSession([p.id]);
            }}
          />
        </Card>
      ) : null}

      {showSettings ? (
        <Card style={{ marginTop: space.md }}>
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
        </Card>
      ) : null}

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
          ]}
        />
      </View>

      {tab === 'live' ? (
        <>
          {session.autoQueue ? (
            <WaitingQueue queue={waitingQueue} onPress={selected ? substituteFromWaiting : undefined} />
          ) : (
            <UpNext
              next={next}
              queue={queue}
              players={playersById}
              roundNumber={rounds.length + 1}
              courtColumns={r.courtColumns}
              autoQueue={session.autoQueue}
              onShuffle={() => planNext(roster, rounds)}
            />
          )}

          {selected ? (
            <View style={styles.swapHint}>
              <Icon name="swap" size={18} color={c.accentInk} />
              <Text style={styles.swapHintText}>
                {session.autoQueue
                  ? 'Tap another player on court to swap them, or tap someone waiting to sub them in.'
                  : 'Tap another player to swap them. Tap the same one again to cancel.'}
              </Text>
            </View>
          ) : null}

          {session.autoQueue ? (
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
                          selected={selected?.roundId === loc.round.id ? selected.ref : null}
                          onSlotPress={(ref) => onSlotPress(loc.round.id, ref)}
                          onWinnerChange={(w) => changeWinner(loc.round, loc.index, w)}
                        />
                      ) : (
                        <EmptyCourtCard court={court} />
                      )}
                    </GridCell>
                  );
                })}
              </Grid>
            </View>
          ) : !currentRound ? (
            <EmptyState
              title="No rounds played yet"
              body="Start the round above and it'll show up here, ready for you to tap in a winner."
            />
          ) : (
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
                      selected={selected?.roundId === currentRound.id ? selected.ref : null}
                      onSlotPress={(ref) => onSlotPress(currentRound.id, ref)}
                      onWinnerChange={(w) => changeWinner(currentRound, i, w)}
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
                          selected={selected?.roundId === currentRound.id ? selected.ref : null}
                          onPress={(ref) => onSlotPress(currentRound.id, ref)}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </>
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
  swapHint: {
    marginTop: space.md,
    backgroundColor: c.accentWash,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: c.accentEdge,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  swapHintText: { color: c.text, fontSize: font.sm, fontFamily: family.regular, flex: 1 },
}));
