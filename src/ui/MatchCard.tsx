import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Match, Player, TIER_LABEL, Team } from '../domain/types';
import { SlotRef } from '../pairing/engine';
import { Icon } from './Icon';
import { themedStyles, useTheme } from './ThemeContext';
import { font, radius, space, tierColor } from './theme';

function sameSlot(a: SlotRef | null, b: SlotRef): boolean {
  if (!a) return false;
  if (a.kind === 'bench' && b.kind === 'bench') return a.index === b.index;
  if (a.kind === 'court' && b.kind === 'court')
    return a.court === b.court && a.team === b.team && a.index === b.index;
  return false;
}

/**
 * A tappable player slot. Tapping selects it; the session screen then shows
 * what can be done with the selection (swap, sub, remove) in its action bar.
 */
export function Slot({
  player,
  refSlot,
  selected,
  onPress,
  team,
  disabled = false,
}: {
  player: Player | undefined;
  refSlot: SlotRef;
  selected: SlotRef | null;
  onPress: (ref: SlotRef) => void;
  team?: 'A' | 'B';
  /** True for a past round, where swapping teams after the fact makes no sense. */
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const styles = useStyles();
  const isSelected = !disabled && sameSlot(selected, refSlot);
  const accent = team === 'A' ? c.teamA : team === 'B' ? c.teamB : c.textFaint;

  return (
    <Pressable
      onPress={disabled ? undefined : () => onPress(refSlot)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected, disabled }}
      accessibilityLabel={player ? `${player.name}, ${TIER_LABEL[player.tier]}` : 'Empty slot'}
      accessibilityHint={disabled ? undefined : 'Selects this player to swap, sub, or remove'}
      style={({ pressed }) => [
        styles.slot,
        { borderColor: isSelected ? c.accentEdge : c.border },
        isSelected && { backgroundColor: c.accentWash },
        disabled && { opacity: 0.7 },
        pressed && !disabled && { opacity: 0.75 },
      ]}
    >
      <View
        style={[styles.tierDot, { backgroundColor: player ? tierColor(c, player.tier) : accent }]}
      />
      <Text style={styles.slotName} numberOfLines={1}>
        {player?.name ?? '—'}
      </Text>
    </Pressable>
  );
}

/**
 * One team's points.
 *
 * Holds a draft string rather than writing on every keystroke: a half-typed
 * "1" on the way to "11" would otherwise be saved as a real score and flip
 * the winner mid-entry. The value is committed on blur and re-seeded whenever
 * the stored score changes underneath (tapping the cup clears it).
 */
function ScoreBox({
  value,
  onCommit,
  editable,
  label,
}: {
  value: number | null;
  onCommit: (next: number | null) => void;
  editable: boolean;
  label: string;
}) {
  const { c } = useTheme();
  const styles = useStyles();
  const asText = (n: number | null) => (n == null ? '' : String(n));
  const [draft, setDraft] = useState(asText(value));

  useEffect(() => setDraft(asText(value)), [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === '') {
      onCommit(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 0) {
      setDraft(asText(value)); // reject junk rather than storing it
      return;
    }
    onCommit(n);
  };

  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      onBlur={commit}
      onEndEditing={commit}
      editable={editable}
      keyboardType="number-pad"
      returnKeyType="done"
      maxLength={3}
      placeholder="–"
      placeholderTextColor={c.textFaint}
      accessibilityLabel={label}
      style={[styles.scoreBox, !editable && { opacity: 0.6 }]}
    />
  );
}

export function MatchCard({
  match,
  players,
  selected,
  onSlotPress,
  onWinnerChange,
  onScoreChange,
  editable = true,
  allowSwap = true,
}: {
  match: Match;
  players: Map<number, Player>;
  selected: SlotRef | null;
  onSlotPress: (ref: SlotRef) => void;
  onWinnerChange: (winner: Team | null) => void;
  /** Both sides at once, since the winner is derived from the pair. */
  onScoreChange?: (scoreA: number | null, scoreB: number | null) => void;
  /** Gates the winner button - correcting a result stays useful in history. */
  editable?: boolean;
  /** Gates player swapping - only makes sense for the round in progress. */
  allowSwap?: boolean;
}) {
  const { c } = useTheme();
  const styles = useStyles();
  const decided = match.winner != null;
  const scored = match.scoreA != null || match.scoreB != null;
  const showScores = !!onScoreChange;
  // Both sides typed in is what makes a result real. Leaving the cup live
  // before that gives an easy path to a scoreless win, and every one of those
  // is a match the standings can't use to break a tie.
  const complete = match.scoreA != null && match.scoreB != null;

  const teamRow = (team: Team) => {
    const ids = team === 'A' ? match.teamA : match.teamB;
    const won = match.winner === team;
    const lost = decided && !won;

    return (
      <View
        style={[
          styles.teamBlock,
          { borderLeftColor: team === 'A' ? c.teamA : c.teamB },
          won && { backgroundColor: c.accentWash },
          lost && { opacity: 0.55 },
        ]}
      >
        <View style={styles.teamPlayers}>
          {ids.map((id, i) => (
            <Slot
              key={`${team}-${i}-${id}`}
              player={players.get(id)}
              refSlot={{ kind: 'court', court: match.court, team, index: i }}
              selected={selected}
              onPress={onSlotPress}
              team={team}
              disabled={!allowSwap}
            />
          ))}
        </View>

        {showScores ? (
          <ScoreBox
            value={team === 'A' ? match.scoreA : match.scoreB}
            editable={editable}
            label={`Points for team ${team}`}
            onCommit={(next) =>
              onScoreChange!(
                team === 'A' ? next : match.scoreA,
                team === 'B' ? next : match.scoreB
              )
            }
          />
        ) : null}

        {/* With scores driving the result the cup becomes a readout: it lights
            up on whichever side the points decided, and only the winning one
            takes a tap - which clears the result so a mistyped score is one
            tap from being re-entered. Without score entry it stays the plain
            tap-to-pick-a-winner control it has always been. */}
        <Pressable
          onPress={() => onWinnerChange(showScores ? null : won ? null : team)}
          disabled={!editable || (showScores && !won)}
          accessibilityRole="button"
          accessibilityState={{ selected: won, disabled: showScores && !won }}
          accessibilityLabel={
            won
              ? `Team ${team} won, tap to clear this result`
              : showScores
                ? 'Type both scores to record a result'
                : `Mark team ${team} as winner`
          }
          style={({ pressed }) => [
            styles.winBtn,
            won && { backgroundColor: c.accent, borderColor: c.accent },
            showScores && !complete && { opacity: 0.4 },
            pressed && { opacity: 0.75 },
          ]}
        >
          <Icon name="trophy" size={18} color={won ? c.accentText : c.textFaint} />
        </Pressable>
      </View>
    );
  };

  const status = () => {
    if (scored && decided) return `Final ${match.scoreA}-${match.scoreB}`;
    if (decided) return 'Result in';
    if (complete) return 'Tied - nobody wins yet';
    if (scored) return 'Add the other score';
    return showScores ? 'Type both scores' : 'Tap the cup to pick a winner';
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.court}>Court {match.court + 1}</Text>
        <Text style={decided ? styles.final : styles.pending}>{status()}</Text>
      </View>
      {teamRow('A')}
      <Text style={styles.vs}>vs</Text>
      {teamRow('B')}
    </View>
  );
}

const useStyles = themedStyles(({ c, font, family }) => ({
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.md,
    gap: space.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  court: { color: c.textDim, fontSize: font.xs, fontFamily: family.bold, letterSpacing: 0.6 },
  final: { color: c.accentInk, fontSize: font.xs, fontFamily: family.bold },
  pending: { color: c.textFaint, fontSize: font.xs, fontFamily: family.regular },
  teamBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderLeftWidth: 3,
    paddingLeft: space.sm,
    borderRadius: 2,
  },
  teamPlayers: { flex: 1, gap: space.xs },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    minHeight: 44,
  },
  tierDot: { width: 8, height: 8, borderRadius: 4 },
  slotName: { color: c.text, fontSize: font.sm, fontFamily: family.semibold, flex: 1 },
  scoreBox: {
    width: 54,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
    color: c.text,
    fontSize: font.lg,
    fontFamily: family.display,
    textAlign: 'center',
    paddingVertical: space.xs,
  },
  winBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
  },
  vs: {
    color: c.textFaint,
    fontSize: font.xs,
    fontFamily: family.medium,
    textAlign: 'center',
    paddingVertical: 2,
  },
}));
