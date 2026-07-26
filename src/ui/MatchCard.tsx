import React from 'react';
import { Pressable, Text, View } from 'react-native';
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

/** A tappable player slot. Tapping two slots in a row swaps them. */
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
      accessibilityLabel={
        player
          ? `${player.name}, ${TIER_LABEL[player.tier]}${isSelected ? ', selected for swap' : ''}`
          : 'Empty slot'
      }
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

export function MatchCard({
  match,
  players,
  selected,
  onSlotPress,
  onWinnerChange,
  editable = true,
  allowSwap = true,
}: {
  match: Match;
  players: Map<number, Player>;
  selected: SlotRef | null;
  onSlotPress: (ref: SlotRef) => void;
  onWinnerChange: (winner: Team | null) => void;
  /** Gates the winner button - correcting a result stays useful in history. */
  editable?: boolean;
  /** Gates player swapping - only makes sense for the round in progress. */
  allowSwap?: boolean;
}) {
  const { c } = useTheme();
  const styles = useStyles();
  const decided = match.winner != null;

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

        <Pressable
          // Tapping the winner again clears it, so a mis-tap is one tap to undo
          // rather than a dead end.
          onPress={() => onWinnerChange(won ? null : team)}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityState={{ selected: won }}
          accessibilityLabel={won ? `Team ${team} won, tap to clear` : `Mark team ${team} as winner`}
          style={({ pressed }) => [
            styles.winBtn,
            won && { backgroundColor: c.accent, borderColor: c.accent },
            pressed && { opacity: 0.75 },
          ]}
        >
          <Icon name="trophy" size={18} color={won ? c.accentText : c.textFaint} />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.court}>Court {match.court + 1}</Text>
        <Text style={decided ? styles.final : styles.pending}>
          {decided ? 'Result in' : 'Tap the cup to pick a winner'}
        </Text>
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
