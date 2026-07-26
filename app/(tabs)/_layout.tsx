import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/ui/Icon';
import { useTheme } from '../../src/ui/ThemeContext';
import { baseFont, family } from '../../src/ui/theme';
import { useResponsive } from '../../src/ui/useResponsive';

export default function TabsLayout() {
  const r = useResponsive();
  const { c } = useTheme();
  // The system navigation bar (or gesture pill) sits below the tab bar and
  // will draw straight over the labels unless we reserve its height.
  const insets = useSafeAreaInsets();

  const barHeight = r.isTablet ? 66 : 58;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accentInk,
        tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          // Tablets have room for a taller, easier-to-hit bar.
          height: barHeight + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: baseFont.xs,
          fontFamily: family.semibold,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Play',
          tabBarIcon: ({ color, size }) => <Icon name="play" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="players"
        options={{
          title: 'Players',
          tabBarIcon: ({ color, size }) => <Icon name="players" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => <Icon name="history" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Icon name="settings" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
