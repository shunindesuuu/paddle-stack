import React from 'react';
import { Text, View } from 'react-native';
import { Icon, IconName } from '../src/ui/Icon';
import { themedStyles, useTheme } from '../src/ui/ThemeContext';
import { Card, Muted, Row, Screen, Title } from '../src/ui/components';
import { space } from '../src/ui/theme';

type Step = {
  icon: IconName;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: 'players',
    title: 'Add your players',
    body: "Head to the Players tab and add everyone who plays regularly, with a skill tier for each. Tap a player's tier badge any time to bump it up or down - no need to open the edit form.",
  },
  {
    icon: 'play',
    title: 'Start a session',
    body: "On the Play tab, check in whoever's here, pick doubles or singles, a pairing style, and how many courts you have. The app fills every court from the checked-in group.",
  },
  {
    icon: 'swap',
    title: 'Keep rounds rolling',
    body: 'Renting courts by the hour? Turn on "Keep rounds rolling" and each court refills itself the instant you record its winner - no waiting on the other courts, and nothing to tap between games.',
  },
  {
    icon: 'trophy',
    title: 'Record a winner',
    body: "Tap the cup next to a team to mark them the winner - tap it again to undo. Tap two players to swap them, or, once a court has a spare, tap someone from the waiting list to sub them straight in.",
  },
  {
    icon: 'players',
    title: 'Mid-session changes',
    body: "Someone show up late, or need to leave early? Use \"Add players\" on the Play tab to check in a new or existing player without stopping the session. To sub a player out, select them on court, then tap whoever's waiting.",
  },
  {
    icon: 'history',
    title: 'Review the results',
    body: 'The Live tab always shows what\'s happening right now; History shows everything already played, per session. The History tab at the bottom tracks every player\'s wins and losses across all sessions.',
  },
];

export default function TutorialScreen() {
  const { c } = useTheme();
  const styles = useStyles();

  return (
    <Screen>
      <Title>How to use Paddle Stack</Title>
      <Muted>A quick walkthrough, in the order you'll actually use it.</Muted>

      {STEPS.map((step, i) => (
        <Card key={step.title} style={{ marginTop: space.lg }}>
          <Row gap={space.sm}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: c.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={step.icon} size={17} color={c.accentInk} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepLabel}>Step {i + 1}</Text>
              <Text style={styles.stepTitle}>{step.title}</Text>
            </View>
          </Row>
          <View style={{ height: space.sm }} />
          <Muted>{step.body}</Muted>
        </Card>
      ))}

      <View style={{ height: space.xl }} />
    </Screen>
  );
}

const useStyles = themedStyles(({ c, font, family }) => ({
  stepLabel: {
    color: c.textFaint,
    fontSize: font.xs,
    fontFamily: family.bold,
    letterSpacing: 0.4,
  },
  stepTitle: { color: c.text, fontSize: font.lg, fontFamily: family.display },
}));
