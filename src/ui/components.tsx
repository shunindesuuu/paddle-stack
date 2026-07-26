/**
 * Shared presentational building blocks. Every colour comes from the active
 * palette via `themedStyles`, so all of these follow light/dark automatically.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TIER_LABEL, Tier } from '../domain/types';
import { Icon } from './Icon';
import { themedStyles, useTheme } from './ThemeContext';
import { font, radius, space, tierColor } from './theme';
import { useResponsive } from './useResponsive';

// --- layout -----------------------------------------------------------------

export function Screen({
  children,
  scroll = true,
  footer,
  scrollRef,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  footer?: React.ReactNode;
  /** Lets a screen scroll itself back to top, e.g. to surface a panel that just opened above a long list. */
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  const r = useResponsive();
  const styles = useStyles();
  const inner: ViewStyle = {
    width: '100%',
    maxWidth: r.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: r.gutter,
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[inner, { paddingBottom: space.xxl }]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[inner, { flex: 1 }]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, inner]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  tone = 'surface',
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  tone?: 'surface' | 'alt';
}) {
  const { c } = useTheme();
  const styles = useStyles();
  return (
    <View
      style={[styles.card, { backgroundColor: tone === 'alt' ? c.surfaceAlt : c.surface }, style]}
    >
      {children}
    </View>
  );
}

export function Row({
  children,
  style,
  gap = space.sm,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  gap?: number;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>
  );
}

/**
 * Fluid grid.
 *
 * Cells are sized by padding rather than by `gap` + a shrunken percentage.
 * Percentage widths that try to leave room for a gap (`width: 49%` beside
 * `gap: 8`) overflow the row by a fraction of a pixel and silently collapse
 * the grid to one column - which is exactly what happened here.
 */
export function Grid({
  children,
  gap = space.sm,
}: {
  children: React.ReactNode;
  gap?: number;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -gap / 2,
      }}
    >
      {children}
    </View>
  );
}

export function GridCell({
  children,
  columns,
  gap = space.sm,
}: {
  children: React.ReactNode;
  columns: number;
  gap?: number;
}) {
  return (
    <View
      style={{
        width: `${100 / columns}%`,
        paddingHorizontal: gap / 2,
        paddingBottom: gap,
      }}
    >
      {children}
    </View>
  );
}

// --- typography -------------------------------------------------------------

export function Title({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.title}>{children}</Text>;
}

export function Heading({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.heading}>{children}</Text>;
}

export function Muted({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const styles = useStyles();
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

/**
 * Accent-coloured tappable text - "Select all", "Show archived", etc.
 *
 * A bare `<Pressable><Text/></Pressable>` only accepts touches within the
 * text's own glyph bounds, well under the ~44dp minimum touch target and easy
 * to miss in real use. This adds padding plus hitSlop so the target is
 * comfortably tappable without changing how the label looks.
 */
export function LinkButton({
  label,
  onPress,
  accessibilityRole = 'button',
  accessibilityState,
}: {
  label: string;
  onPress: () => void;
  accessibilityRole?: 'button' | 'switch';
  accessibilityState?: { checked?: boolean };
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={({ pressed }) => [styles.linkHit, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

// --- controls ---------------------------------------------------------------

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const { c } = useTheme();
  const styles = useStyles();
  const isDisabled = disabled || loading;

  const bg =
    variant === 'primary'
      ? c.accent
      : variant === 'danger'
        ? c.danger
        : variant === 'secondary'
          ? c.surfaceAlt
          : 'transparent';
  const fg = variant === 'primary' ? c.accentText : variant === 'danger' ? '#FFFFFF' : c.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: isDisabled ? 0.45 : pressed ? 0.8 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: c.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const { c } = useTheme();
  const styles = useStyles();
  return (
    <TextInput placeholderTextColor={c.textFaint} {...props} style={[styles.input, props.style]} />
  );
}

/** Horizontal segmented picker; wraps rather than scrolls so nothing hides. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  value,
  min = 1,
  max = 12,
  onChange,
  label,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const { c } = useTheme();
  const styles = useStyles();
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
      <Row gap={space.md}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          style={[styles.stepBtn, value <= min && { opacity: 0.35 }]}
        >
          <Icon name="minus" size={20} color={c.text} />
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          style={[styles.stepBtn, value >= max && { opacity: 0.35 }]}
        >
          <Icon name="plus" size={20} color={c.text} />
        </Pressable>
      </Row>
    </Row>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { c } = useTheme();
  const styles = useStyles();
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <View style={{ flex: 1, paddingRight: space.md }}>
        <Text style={styles.body}>{label}</Text>
        {hint ? (
          <>
            <View style={{ height: space.xs }} />
            <Text style={styles.muted}>{hint}</Text>
          </>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: c.border, true: c.accent }}
        thumbColor={value ? c.accentText : c.textFaint}
        ios_backgroundColor={c.border}
      />
    </Row>
  );
}

// --- domain bits ------------------------------------------------------------

export function TierBadge({ tier, small }: { tier: Tier; small?: boolean }) {
  const { c } = useTheme();
  const styles = useStyles();
  const tint = tierColor(c, tier);
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: tint + '26', borderColor: tint },
        small && { paddingVertical: 1, paddingHorizontal: 6 },
      ]}
    >
      <Text style={[styles.badgeText, { color: tint }, small && { fontSize: font.xs - 1 }]}>
        {small ? TIER_LABEL[tier].slice(0, 3).toUpperCase() : TIER_LABEL[tier]}
      </Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action ? <View style={{ marginTop: space.lg }}>{action}</View> : null}
    </View>
  );
}

const useStyles = themedStyles(({ c, font, family }) => ({
  screen: { flex: 1, backgroundColor: c.bg },
  footer: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingVertical: space.md,
    backgroundColor: c.bg,
  },
  card: {
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: c.border,
  },
  title: {
    color: c.text,
    fontSize: font.xxl,
    fontFamily: family.display,
    marginTop: space.lg,
    marginBottom: space.xs,
  },
  heading: {
    color: c.text,
    fontSize: font.lg,
    fontFamily: family.display,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  body: { color: c.text, fontSize: font.md, fontFamily: family.regular },
  muted: {
    color: c.textDim,
    fontSize: font.sm,
    fontFamily: family.regular,
    lineHeight: font.sm * 1.45,
  },
  link: { color: c.accentInk, fontSize: font.sm, fontFamily: family.semibold },
  linkHit: { paddingVertical: space.sm, paddingHorizontal: space.xs },
  button: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: { fontSize: font.md, fontFamily: family.semibold },
  input: {
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: c.text,
    fontSize: font.md,
    fontFamily: family.regular,
    minHeight: 48,
  },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flexGrow: 1,
    flexBasis: 80,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: c.accent },
  segmentText: { color: c.textDim, fontSize: font.sm, fontFamily: family.semibold },
  segmentTextActive: { color: c.accentText },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: c.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.border,
  },
  stepValue: {
    color: c.text,
    fontSize: font.md,
    fontFamily: family.display,
    minWidth: 28,
    textAlign: 'center',
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: font.xs, fontFamily: family.bold, letterSpacing: 0.3 },
  empty: {
    alignItems: 'center',
    paddingVertical: space.xxl * 1.5,
    paddingHorizontal: space.lg,
  },
  emptyTitle: {
    color: c.text,
    fontSize: font.lg,
    fontFamily: family.display,
    marginBottom: space.sm,
  },
  emptyBody: {
    color: c.textDim,
    fontSize: font.sm,
    fontFamily: family.regular,
    textAlign: 'center',
    lineHeight: font.sm * 1.45,
  },
}));
