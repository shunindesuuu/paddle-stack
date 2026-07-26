/**
 * Theme plumbing: resolves the active palette and lets components declare
 * styles that follow it.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { getSetting, setSetting } from '../db/repo';
import { FontScale, Palette, darkPalette, family, lightPalette, scaleFont } from './theme';
import { useResponsive } from './useResponsive';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

type ThemeValue = {
  /** Active palette. */
  c: Palette;
  /** What's actually on screen right now. */
  scheme: Scheme;
  /** What the user chose; 'system' follows the OS. */
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

const SETTING_KEY = 'theme_mode';

function isMode(v: string | null): v is ThemeMode {
  return v === 'system' || v === 'light' || v === 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Load the saved preference once. Reading in an effect rather than in
  // useState's initialiser keeps the first render cheap and avoids querying
  // before the database bootstrap has run.
  useEffect(() => {
    const saved = getSetting(SETTING_KEY);
    if (isMode(saved)) setModeState(saved);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    setSetting(SETTING_KEY, m);
  }, []);

  const scheme: Scheme = mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;

  const value = useMemo<ThemeValue>(
    () => ({
      c: scheme === 'light' ? lightPalette : darkPalette,
      scheme,
      mode,
      setMode,
    }),
    [scheme, mode, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>');
  return v;
}

/** What a themed stylesheet builder receives. */
export type StyleTokens = {
  /** Active palette. */
  c: Palette;
  /** Type ramp, already scaled for the current screen size. */
  font: FontScale;
  /** Type families - name a family, never a fontWeight. */
  family: typeof family;
};

/**
 * Declares a stylesheet that depends on the palette and the screen size.
 *
 * Returns a hook rather than a plain object so sheets are created once per
 * (scheme, breakpoint) pair instead of on every render. There are two schemes
 * and four breakpoints, so the cache tops out at eight entries.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(build: (t: StyleTokens) => T) {
  const cache = new Map<string, T>();
  return function useStyles(): T {
    const { c, scheme } = useTheme();
    const { bp, fontScale } = useResponsive();
    const key = `${scheme}|${bp}`;

    let sheet = cache.get(key);
    if (!sheet) {
      sheet = StyleSheet.create(build({ c, font: scaleFont(fontScale), family }));
      cache.set(key, sheet);
    }
    return sheet;
  };
}
