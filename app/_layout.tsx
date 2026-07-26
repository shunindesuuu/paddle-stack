import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka';
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDatabase } from '../src/db/client';
import { ThemeProvider, useTheme } from '../src/ui/ThemeContext';
import { family } from '../src/ui/theme';

// Runs once at module load, before any screen renders, so every screen can
// query synchronously without guarding for an uninitialised database.
initDatabase();

// Hold the splash until the fonts are in. Without this the first frame paints
// in the system font and visibly reflows once the custom faces land.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden (fast reload); nothing to do.
});

/** Split out so it sits inside the provider and can read the palette. */
function Navigation() {
  const { c, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerTitleStyle: { fontFamily: family.display },
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
        <Stack.Screen name="tutorial" options={{ title: 'How to use' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fredoka_600SemiBold,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  const onReady = useCallback(() => {
    // Proceed even if a font failed: the system face is a far better outcome
    // than a splash screen that never goes away.
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <View style={{ flex: 1 }} onLayout={onReady}>
            <Navigation />
          </View>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
