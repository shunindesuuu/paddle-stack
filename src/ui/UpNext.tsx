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
import { Match, Player, Round } from '../domain/types';
import { Icon } from './Icon';
import { themedStyles, useTheme } from './ThemeContext';
import { Button, Grid, GridCell, Row } from './components';
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
 * When `onPress` is given (a court player is already selected), the chips
 * become tappable so someone waiting can be subbed straight onto that slot -
 * the same motion whether it's a tactical swap or a mid-session substitution
 * for a player who just left.
 */
export function WaitingQueue({
  queue,
  onPress,
}: {
  queue: QueueEntry[];
  onPress?: (playerId: number) => void;
}) {
  const { c } = useTheme();
  const styles = useStyles();
  if (queue.length === 0) return null;
  const selectable = !!onPress;

  return (
    <View style={{ marginTop: space.lg }}>
      <Text style={styles.waitingLabel}>
        {selectable ? 'Waiting · tap someone to sub them in' : 'Waiting for a court'} · {queue.length}
      </Text>
      <View style={styles.waitingRow}>
        {queue.map((q, i) => {
          const chip = (
            <View style={[styles.chip, selectable && { borderColor: c.accentEdge }]}>
              <Text style={styles.chipPos}>{i + 1}</Text>
              <Text style={styles.chipName} numberOfLines={1}>
                {q.player.name}
              </Text>
              <Text style={styles.chipGames}>{q.games}g</Text>
            </View>
          );
          return selectable ? (
            <Pressable
              key={q.player.id}
              onPress={() => onPress!(q.player.id)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Sub in ${q.player.name}`}
            >
              {chip}
            </Pressable>
          ) : (
            <View key={q.player.id}>{chip}</View>
          );
        })}
      </View>
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipPos: { color: c.accentInk, fontSize: font.xs, fontFamily: family.display },
  chipName: { color: c.text, fontSize: font.xs, fontFamily: family.semibold, maxWidth: 110 },
  chipGames: { color: c.textFaint, fontSize: font.xs, fontFamily: family.regular },
}));
