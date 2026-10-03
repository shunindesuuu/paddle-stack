/**
 * Controls for the live session screen's header and footer.
 *
 * The footer is the thumb zone, so it holds whatever the organiser is in the
 * middle of: the action for a selected player, the undo for a result they just
 * entered, or (manual rounds) starting the next round. Rarely used and
 * destructive actions - ending the session - live behind the header menu
 * instead of in that prime spot.
 */

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Icon, IconName } from './Icon';
import { panelIn, panelOut } from './motion';
import { themedStyles, useTheme } from './ThemeContext';
import { radius, space } from './theme';
import { useResponsive } from './useResponsive';

/**
 * Shown while a player is selected. Spells out what the next tap will do -
 * before this, the only hint appeared mid-page and swapping was something
 * people found by accident - and puts Remove on screen instead of behind a
 * long-press nobody discovered.
 */
export function SelectionBar({
  name,
  hint,
  subOptions,
  onSub,
  onRemove,
  onCancel,
}: {
  name: string;
  hint: string;
  /**
   * Who can sub in for the selected court player, in queue order. Shown in
   * the bar itself because the waiting list lives below the courts, and with
   * this bar open it sits under it - out of reach exactly when it's needed.
   */
  subOptions?: { id: number; name: string; games: number }[];
  onSub?: (playerId: number) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const { c } = useTheme();
  const styles = useStyles();
  const r = useResponsive();

  return (
    <Animated.View entering={panelIn} exiting={panelOut} accessibilityLiveRegion="polite">
      <View style={styles.barRow}>
        <View style={styles.barIcon}>
          <Icon name="swap" size={18} color={c.accentInk} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.barTitle} numberOfLines={1}>
            {name} selected
          </Text>
          <Text style={styles.barHint}>{hint}</Text>
        </View>
      </View>
      {subOptions && subOptions.length > 0 && onSub ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={[styles.subStrip, { marginHorizontal: -r.gutter }]}
          contentContainerStyle={[styles.subStripInner, { paddingHorizontal: r.gutter }]}
        >
          {subOptions.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => onSub(o.id)}
              accessibilityRole="button"
              accessibilityLabel={`Sub in ${o.name}, ${o.games} games played`}
              style={({ pressed }) => [styles.subChip, pressed && styles.pressed]}
            >
              <Icon name="swap" size={14} color={c.accentInk} />
              <Text style={styles.subChipName} numberOfLines={1}>
                {o.name}
              </Text>
              <Text style={styles.subChipGames}>{o.games}g</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.barActions}>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          style={({ pressed }) => [styles.action, styles.actionNeutral, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>Cancel</Text>
        </Pressable>
        {/* Outlined rather than filled: it appears on every swap, and a solid
            red slab there would shout louder than the swap itself. The
            confirmation dialog behind it is the real guard. */}
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name} from this session`}
          style={({ pressed }) => [
            styles.action,
            { borderColor: c.danger },
            pressed && styles.pressed,
          ]}
        >
          <Icon name="remove" size={16} color={c.danger} />
          <Text style={[styles.actionText, { color: c.danger }]}>Remove</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

/**
 * Brief "result recorded" confirmation with an undo.
 *
 * In continuous play a decided court refills the instant the second score
 * goes in, so a score typed the wrong way round used to reshuffle the court
 * before anyone noticed. Naming the winning side here is the point: it's the
 * one detail that catches a flipped score at a glance.
 */
export function UndoBar({ message, onUndo }: { message: string; onUndo: () => void }) {
  const { c } = useTheme();
  const styles = useStyles();

  return (
    <Animated.View
      entering={panelIn}
      exiting={panelOut}
      accessibilityLiveRegion="polite"
      style={styles.barRow}
    >
      <View style={styles.barIcon}>
        <Icon name="check" size={18} color={c.accentInk} />
      </View>
      <Text style={[styles.barHint, styles.undoText]} numberOfLines={2}>
        {message}
      </Text>
      <Pressable
        onPress={onUndo}
        accessibilityRole="button"
        accessibilityLabel={`Undo: ${message}`}
        style={({ pressed }) => [styles.action, styles.undoAction, pressed && styles.pressed]}
      >
        <Icon name="restore" size={16} color={c.text} />
        <Text style={styles.actionText}>Undo</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Compact header control - the session screen's "Add" and "More". */
export function HeaderButton({
  icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const styles = useStyles();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
    >
      <Icon name={icon} size={20} color={c.accentInk} />
      {label ? <Text style={styles.headerBtnText}>{label}</Text> : null}
    </Pressable>
  );
}

const useStyles = themedStyles(({ c, font, family }) => ({
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  barIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: c.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barTitle: { color: c.text, fontSize: font.md, fontFamily: family.semibold },
  barHint: {
    color: c.textDim,
    fontSize: font.sm,
    fontFamily: family.regular,
    lineHeight: font.sm * 1.35,
  },
  undoText: { flex: 1, color: c.text },
  barActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  // Bleeds to the screen edge (by the live gutter, applied inline) so a long
  // queue reads as scrollable rather than cut off.
  subStrip: { marginTop: space.md },
  subStripInner: { gap: space.sm },
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.accentEdge,
    backgroundColor: c.surfaceAlt,
  },
  subChipName: { color: c.text, fontSize: font.sm, fontFamily: family.semibold, maxWidth: 140 },
  subChipGames: { color: c.textFaint, fontSize: font.xs, fontFamily: family.regular },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: space.lg,
  },
  actionNeutral: { backgroundColor: c.surfaceAlt },
  undoAction: { flex: 0, backgroundColor: c.surfaceAlt },
  actionText: { color: c.text, fontSize: font.md, fontFamily: family.semibold },
  pressed: { opacity: 0.75 },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    justifyContent: 'center',
    backgroundColor: c.surfaceAlt,
  },
  headerBtnText: { color: c.accentInk, fontSize: font.sm, fontFamily: family.semibold },
}));
