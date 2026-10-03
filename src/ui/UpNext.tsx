/**
 * "Up next" - the queue view.
 *
 * Shows the round the app intends to play next *before* it is committed, plus
 * the order players are waiting in. The preview is held in component state and
 * only written to the database when it actually starts, so reshuffling costs
 * nothing and an unplayed round never pollutes the history the pairing engine
 * learns from.
 *
 * One preview card is rendered per court, laid out in the same grid the live
 * round uses - with 3 courts you see 3 "up next" cards, matching the 3 live
 * match cards below them.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Match, Player, Round } from '../domain/types';
import { Icon } from './Icon';
import { rowLayout, rowOut } from './motion';
import { themedStyles, useTheme } from './ThemeContext';
import { Button, Grid, GridCell, LinkButton, Row } from './components';
import { radius, space } from './theme';

export type QueueEntry = {
  player: Player;
  games: number;
  /** True when this player is in the previewed round. */
  playingNext: boolean;
};

/**
 * Waiting order: fewest games first, which is the same rule the engine uses to
 * pick who sits, so the list always agrees with what actually happens.
 */
export function buildQueue(
  roster: Player[],
  gamesPlayed: Map<number, number>,
  next: Round | null
): QueueEntry[] {
  const onCourt = new Set<number>();
  if (next) {
    for (const m of next.matches) for (const id of [...m.teamA, ...m.teamB]) onCourt.add(id);
  }

  return roster
    .map((player) => ({
      player,
      games: gamesPlayed.get(player.id) ?? 0,
      playingNext: onCourt.has(player.id),
    }))
    .sort((a, b) => a.games - b.games || a.player.name.localeCompare(b.player.name));
}

/** One upcoming matchup. Not interactive - the round isn't committed yet, so
 * there's nothing to tap; Shuffle regenerates the whole preview instead. */
function NextCourtCard({ match, players }: { match: Match; players: Map<number, Player> }) {
  const { c } = useTheme();
  const styles = useStyles();
  const name = (id: number) => players.get(id)?.name ?? '—';

  return (
    <View style={styles.nextCard}>
      <Text style={styles.courtLabel}>Court {match.court + 1}</Text>
      <View style={styles.matchup}>
        <Text style={[styles.side, { color: c.teamA }]} numberOfLines={2}>
          {match.teamA.map(name).join(' & ')}
        </Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={[styles.side, { color: c.teamB }]} numberOfLines={2}>
          {match.teamB.map(name).join(' & ')}
        </Text>
      </View>
    </View>
  );
}

/** A court with nobody assigned to it yet - not enough players have freed up. */
export function EmptyCourtCard({ court }: { court: number }) {
  const styles = useStyles();
  return (
    <View style={styles.nextCard}>
      <Text style={styles.courtLabel}>Court {court + 1}</Text>
      <View style={[styles.matchup, styles.matchupEmpty]}>
        <Text style={styles.waitingForPlayers}>Waiting for players</Text>
      </View>
    </View>
  );
}

/**
 * Compact waiting list for continuous play, where courts refill one at a time
 * as each finishes rather than the whole group advancing together - there's
 * no shared "next round" left to preview, just who's up.
 *
 * Sits below the courts: the games in progress are what the organiser is
 * looking for, this is the supporting cast. Every chip is tappable - selecting
 * someone waiting works the same as selecting someone on court, and either
 * order (waiting first or court first) ends in the same substitution.
 */
export function WaitingQueue({
  queue,
  title = 'Waiting for a court',
  selectedId,
  subbing,
  onPress,
}: {
  queue: QueueEntry[];
  title?: string;
  /** The waiting player currently selected, if any. */
  selectedId: number | null;
  /** True while a court player is selected, so a tap here subs that chip in. */
  subbing: boolean;
  onPress: (playerId: number) => void;
}) {
  const { c } = useTheme();
  const styles = useStyles();
  if (queue.length === 0) return null;

  const label = subbing ? `${title} · tap someone to sub them in` : title;

  return (
    <View style={{ marginTop: space.lg }}>
      <Text style={styles.waitingLabel}>
        {label} · {queue.length}
      </Text>
      <View style={styles.waitingRow}>
        {queue.map((q, i) => {
          const isSelected = q.player.id === selectedId;
          return (
            // The queue reorders constantly as games finish, so animating the
            // layout keeps a name you were tracking followable.
            <Animated.View key={q.player.id} layout={rowLayout} exiting={rowOut}>
              <Pressable
                onPress={() => onPress(q.player.id)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${q.player.name}, waiting, ${q.games} games played`}
                accessibilityHint={
                  subbing ? 'Subs this player in' : 'Selects this player to sub in or remove'
                }
                style={({ pressed }) => [
                  styles.chip,
                  (subbing || isSelected) && { borderColor: c.accentEdge },
                  isSelected && { backgroundColor: c.accentWash },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text style={styles.chipPos}>{i + 1}</Text>
                <Text style={styles.chipName} numberOfLines={1}>
                  {q.player.name}
                </Text>
                <Text style={styles.chipGames}>{q.games}g</Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Continuous play's queue of matchups formed ahead of time, in the order
 * courts will take them. At open play - ten or so people per court - "when am
 * I up?" is the question of the night, and a flat waiting list can't answer
 * it. Each entry is what the next free court will actually play, whichever
 * court that turns out to be, so there's no court number on it.
 *
 * Names are tappable like any waiting player: select one to sub them onto a
 * court or remove them, and the queue re-forms around the gap.
 */
export function NextMatchups({
  matches,
  players,
  columns,
  selectedId,
  subbing,
  onPress,
  onShuffle,
}: {
  matches: Match[];
  players: Map<number, Player>;
  /** Same column count as the court grid, so tablets lay these out alike. */
  columns: number;
  selectedId: number | null;
  subbing: boolean;
  onPress: (playerId: number) => void;
  onShuffle: () => void;
}) {
  const { c } = useTheme();
  const styles = useStyles();
  if (matches.length === 0) return null;

  const team = (ids: number[], color: string, game: number) => (
    <View style={[styles.queuedTeam, { borderLeftColor: color }]}>
      {ids.map((id) => {
        const p = players.get(id);
        const isSelected = id === selectedId;
        return (
          <Pressable
            key={id}
            onPress={() => onPress(id)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${p?.name ?? 'Player'}, in up-next game ${game}`}
            accessibilityHint={
              subbing ? 'Subs this player in' : 'Selects this player to sub in or remove'
            }
            style={({ pressed }) => [
              styles.chip,
              (subbing || isSelected) && { borderColor: c.accentEdge },
              isSelected && { backgroundColor: c.accentWash },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={[styles.chipName, styles.queuedName]} numberOfLines={1}>
              {p?.name ?? '—'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={{ marginTop: space.xl }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={styles.title}>Up next</Text>
        <LinkButton label="Shuffle" onPress={onShuffle} />
      </Row>
      <View style={{ height: space.sm }} />
      <Grid gap={space.md}>
        {matches.map((m, i) => (
          <GridCell
            key={[...m.teamA, ...m.teamB].join('-')}
            columns={columns}
            gap={space.md}
            layout={rowLayout}
            exiting={rowOut}
          >
            <View style={styles.nextCard}>
              <Text style={styles.courtLabel}>
                {i === 0 ? 'Next free court' : `Game ${i + 1} in line`}
              </Text>
              {/* Side by side rather than stacked: at open play there can be
                  five or six of these queued, and halving each one's height
                  keeps the courts and the queue within a short scroll. */}
              <View style={styles.queuedRow}>
                {team(m.teamA, c.teamA, i + 1)}
                <Text style={styles.vs}>vs</Text>
                {team(m.teamB, c.teamB, i + 1)}
              </View>
            </View>
          </GridCell>
        ))}
      </Grid>
    </View>
  );
}

export function UpNext({
  next,
  queue,
  players,
  onShuffle,
  roundNumber,
  courtColumns,
  autoQueue = false,
}: {
  next: Round | null;
  queue: QueueEntry[];
  players: Map<number, Player>;
  onShuffle: () => void;
  roundNumber: number;
  /** Same column count the live round grid uses, so the two line up. */
  courtColumns: number;
  autoQueue?: boolean;
}) {
  const { c } = useTheme();
  const styles = useStyles();

  return (
    <View style={{ marginTop: space.lg }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={styles.title}>Up next</Text>
        <Text style={styles.roundTag}>Round {roundNumber}</Text>
      </Row>

      {autoQueue ? (
        <Row gap={space.xs} style={{ marginTop: space.xs }}>
          <Icon name="swap" size={14} color={c.accentInk} />
          <Text style={styles.autoNote}>Starts on its own once every court has a winner</Text>
        </Row>
      ) : null}

      {!next ? (
        <Text style={styles.empty}>
          Not enough players checked in to fill a court. Add more from the roster and the queue
          picks up again.
        </Text>
      ) : (
        <>
          <Grid gap={space.md}>
            {next.matches.map((m) => (
              <GridCell key={m.court} columns={courtColumns} gap={space.md}>
                <NextCourtCard match={m} players={players} />
              </GridCell>
            ))}
          </Grid>

          {queue.some((q) => !q.playingNext) ? (
            <>
              <Text style={styles.waitingLabel}>Waiting</Text>
              <View style={styles.waitingRow}>
                {queue
                  .filter((q) => !q.playingNext)
                  .map((q, i) => (
                    <View key={q.player.id} style={styles.chip}>
                      <Text style={styles.chipPos}>{i + 1}</Text>
                      <Text style={styles.chipName} numberOfLines={1}>
                        {q.player.name}
                      </Text>
                      <Text style={styles.chipGames}>{q.games}g</Text>
                    </View>
                  ))}
              </View>
            </>
          ) : (
            <Text style={styles.waitingLabel}>Everyone is on a court this round.</Text>
          )}

          <View style={{ height: space.md }} />
          <Button label="Shuffle matchups" variant="ghost" onPress={onShuffle} />
        </>
      )}
    </View>
  );
}

const useStyles = themedStyles(({ c, font, family }) => ({
  title: { color: c.text, fontSize: font.lg, fontFamily: family.display },
  roundTag: { color: c.textFaint, fontSize: font.xs, fontFamily: family.semibold },
  autoNote: { color: c.accentInk, fontSize: font.xs, fontFamily: family.semibold, flex: 1 },
  empty: { color: c.textDim, fontSize: font.sm, fontFamily: family.regular, marginTop: space.sm },
  nextCard: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    borderStyle: 'dashed',
    padding: space.md,
  },
  courtLabel: {
    color: c.textFaint,
    fontSize: font.xs,
    fontFamily: family.bold,
    letterSpacing: 0.6,
    marginBottom: space.xs,
  },
  matchup: {
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    padding: space.sm,
    gap: 2,
  },
  matchupEmpty: { alignItems: 'center', paddingVertical: space.md },
  waitingForPlayers: { color: c.textFaint, fontSize: font.sm, fontFamily: family.regular },
  side: { fontSize: font.sm, fontFamily: family.semibold },
  vs: { color: c.textFaint, fontSize: font.xs, fontFamily: family.regular },
  waitingLabel: {
    color: c.textDim,
    fontSize: font.xs,
    fontFamily: family.semibold,
    marginTop: space.lg,
    letterSpacing: 0.4,
  },
  waitingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  queuedRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  queuedTeam: { flex: 1, gap: space.xs, borderLeftWidth: 3, paddingLeft: space.sm },
  // Read from arm's length by whoever's checking if they're up, so a step
  // larger than the waiting chips, and free to use the column's width.
  queuedName: { fontSize: font.sm, maxWidth: undefined, flexShrink: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: space.md,
    // Tapped mid-game to sub someone in, so sized as a real touch target
    // (40 + hitSlop clears 48dp) rather than as a passive label.
    minHeight: 40,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipPos: { color: c.accentInk, fontSize: font.xs, fontFamily: family.display },
  chipName: { color: c.text, fontSize: font.xs, fontFamily: family.semibold, maxWidth: 110 },
  chipGames: { color: c.textFaint, fontSize: font.xs, fontFamily: family.regular },
}));
