/**
 * Responsive layout.
 *
 * Phone-first: the base design targets an ordinary phone, and larger screens
 * add density and a little type scale rather than the phone being a shrunken
 * tablet. Everything keys off live window width (not a static device check) so
 * split-screen and rotation stay correct.
 */

import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Width in dp.
 *  xs  small/older phones (<360) - the squeeze case
 *  sm  ordinary phones - the design target
 *  md  600+, Android's sw600dp tablet line, also big phones in landscape
 *  lg  900+, real tablets
 */
const BREAKPOINTS = { sm: 360, md: 600, lg: 900 } as const;

export type Responsive = {
  width: number;
  height: number;
  bp: Breakpoint;
  isPhone: boolean;
  isTablet: boolean;
  landscape: boolean;
  /** Multiplier applied to the type ramp. */
  fontScale: number;
  /** Columns for the match/court grid. */
  courtColumns: number;
  /** Columns for player lists. */
  playerColumns: number;
  /** Horizontal page padding. */
  gutter: number;
  /**
   * Caps line length on big screens. Undefined on phones so content uses the
   * full width instead of sitting in a narrow column.
   */
  maxContentWidth: number | undefined;
};

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  // Device class comes from the short side (Android's "smallest width"
  // concept), not raw window width. A phone rotated to landscape reports a
  // huge width - e.g. 915dp for a phone whose short side is only 412dp -
  // which used to misclassify it as a tablet and hand it tablet-sized
  // gutters, fonts and column counts on a screen that's actually short on
  // vertical room. The short side stays small when a phone rotates, so it
  // keeps reading as a phone; only a genuinely large device crosses the line.
  const shortSide = Math.min(width, height);

  const bp: Breakpoint =
    shortSide >= BREAKPOINTS.lg
      ? 'lg'
      : shortSide >= BREAKPOINTS.md
        ? 'md'
        : shortSide >= BREAKPOINTS.sm
          ? 'sm'
          : 'xs';

  const isTablet = bp === 'md' || bp === 'lg';

  // Courts are wide cards. Two per row needs real width; three only when both
  // the device class and the current orientation have room for it.
  const courtColumns =
    bp === 'lg' ? (landscape ? 3 : 2) : bp === 'md' ? (landscape ? 3 : 2) : bp === 'sm' && landscape ? 2 : 1;

  // Player chips are small, so they pack tighter. An ordinary phone gets an
  // extra column in landscape since the short-side fix now lets it keep
  // phone-sized fonts/gutters while still using the extra width.
  const playerColumns =
    bp === 'lg'
      ? 4
      : bp === 'md'
        ? 3
        : bp === 'sm'
          ? (landscape ? 3 : 2)
          : landscape
            ? 2
            : 1;

  const fontScale = bp === 'lg' ? 1.12 : bp === 'md' ? 1.06 : bp === 'sm' ? 1 : 0.94;

  return {
    width,
    height,
    bp,
    isPhone: !isTablet,
    isTablet,
    landscape,
    fontScale,
    courtColumns,
    playerColumns,
    gutter: bp === 'xs' ? 12 : bp === 'sm' ? 16 : bp === 'md' ? 20 : 24,
    // Phones get the whole width; only tablets need a reading-width cap.
    maxContentWidth: bp === 'lg' ? 1200 : bp === 'md' ? 860 : undefined,
  };
}
