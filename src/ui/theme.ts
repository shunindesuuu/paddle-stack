/**
 * Design tokens.
 *
 * Colours come in two palettes with identical keys, so every component reads
 * the same names and the active scheme decides the values. Sizing tokens are
 * scheme-independent.
 */

import { Tier } from '../domain/types';

export type Palette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;

  /** The two sides of a match. */
  teamA: string;
  teamB: string;

  /** Fill colour for primary buttons and selected segments. */
  accent: string;
  /** Text/icon colour drawn ON an accent fill. */
  accentText: string;
  /**
   * Accent used as text on the page background. Kept separate because the
   * lime that reads well as a fill fails contrast as text on a light page.
   */
  accentInk: string;
  /** Low-opacity accent washes, pre-blended per scheme. */
  accentWash: string;
  accentEdge: string;

  danger: string;
  warn: string;

  beginner: string;
  intermediate: string;
  advanced: string;
};

export const darkPalette: Palette = {
  bg: '#0F1417',
  surface: '#181F24',
  surfaceAlt: '#212A31',
  border: '#2C3841',
  text: '#F2F5F7',
  textDim: '#9AAAB5',
  textFaint: '#63757F',

  teamA: '#2E9E6B',
  teamB: '#3D7FD1',

  accent: '#C7F04A',
  accentText: '#141A0A',
  accentInk: '#C7F04A',
  accentWash: 'rgba(199, 240, 74, 0.12)',
  accentEdge: 'rgba(199, 240, 74, 0.40)',

  danger: '#E5544B',
  warn: '#E0A33E',

  beginner: '#5C93C9',
  intermediate: '#D9A441',
  advanced: '#CC5F52',
};

export const lightPalette: Palette = {
  bg: '#F4F6EF',
  surface: '#FFFFFF',
  surfaceAlt: '#EAEEE0',
  border: '#D5DBC8',
  text: '#151C11',
  textDim: '#57624F',
  textFaint: '#8A9382',

  teamA: '#1E7A50',
  teamB: '#2A5FA8',

  accent: '#B6E23F',
  accentText: '#141A0A',
  // Dark olive: the brand lime is unreadable as text on a light background.
  accentInk: '#4C6910',
  accentWash: 'rgba(122, 166, 26, 0.16)',
  accentEdge: 'rgba(76, 105, 16, 0.45)',

  danger: '#C0392B',
  warn: '#9A6B12',

  beginner: '#2F6FA8',
  intermediate: '#96690F',
  advanced: '#AF4033',
};

export function tierColor(c: Palette, tier: Tier): string {
  return tier === 'beginner' ? c.beginner : tier === 'intermediate' ? c.intermediate : c.advanced;
}

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/**
 * Type families.
 *
 * Custom fonts on Android do NOT synthesise weight - `fontWeight: '700'` on a
 * regular-weight file silently does nothing. Every weight must be its own
 * loaded family, so styles name a family instead of a weight.
 *
 * Fredoka (rounded, characterful) carries the display voice; Outfit (geometric,
 * tall x-height) does the UI work where legibility at 12-14px matters.
 */
export const family = {
  display: 'Fredoka_600SemiBold',
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
} as const;

/** Base ramp, sized for a normal phone. Larger screens scale it up. */
export const baseFont = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 19,
  xl: 23,
  xxl: 28,
} as const;

export type FontScale = Record<keyof typeof baseFont, number>;

/** Rounded so text never lands on a half-pixel. */
export function scaleFont(factor: number): FontScale {
  return {
    xs: Math.round(baseFont.xs * factor),
    sm: Math.round(baseFont.sm * factor),
    md: Math.round(baseFont.md * factor),
    lg: Math.round(baseFont.lg * factor),
    xl: Math.round(baseFont.xl * factor),
    xxl: Math.round(baseFont.xxl * factor),
  };
}

/** Unscaled ramp, for the rare style built outside a themed stylesheet. */
export const font = baseFont;
