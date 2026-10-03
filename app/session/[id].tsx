import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Text, View } from 'react-native';
import { Player } from '../../src/domain/types';
import {
  deleteSession,
  getSession,
  getSessionRoster,
  loadRounds,
  sessionStandings,
} from '../../src/db/repo';
import { STRATEGY_LABEL } from '../../src/pairing/engine';
import { Icon } from '../../src/ui/Icon';
import {
  Button,
  Card,
  EmptyState,
  Grid,
  GridCell,
  Heading,
  Muted,
  Row,
  Screen,
  Title,
} from '../../src/ui/components';
import { STANDINGS_HINT, Standings } from '../../src/ui/Standings';
import { themedStyles, useTheme } from '../../src/ui/ThemeContext';
import { font, space } from '../../src/ui/theme';
import { useResponsive } from '../../src/ui/useResponsive';
import { formatDate } from '../(tabs)/history';

/** Read-only view of a past session. */
export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const r = useResponsive();
  const styles = useStyles();
  const { c } = useTheme();

  const sessionId = Number(id);
  const session = useMemo(() => (Number.isFinite(sessionId) ? getSession(sessionId) : null), [sessionId]);
  const rounds = useMemo(() => (session ? loadRounds(session.id) : []), [session]);
  const roster = useMemo(() => (session ? getSessionRoster(session.id) : []), [session]);
  const standings = useMemo(() => (session ? sessionStandings(session.id) : []), [session]);
  const byId = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);

  if (!session) {
    return (
      <Screen>
        <EmptyState title="Session not found" body="It may have been deleted." />
      </Screen>
    );
  }

  const remove = () => {
    Alert.alert('Delete session?', 'All rounds and scores in it are removed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteSession(session.id);
          router.back();
        },
      },
    ]);
  };

  const name = (id: number) => byId.get(id)?.name ?? 'Unknown';

  return (
    <>
      <Stack.Screen options={{ title: session.name }} />
      <Screen>
        <Title>{session.name}</Title>
        <Muted>
          {formatDate(session.startedAt)} · {session.mode === 'doubles' ? 'Doubles' : 'Singles'} ·{' '}
          {STRATEGY_LABEL[session.strategy]} · {roster.length} players
        </Muted>

        {standings.length > 0 ? (
          <View style={{ marginTop: space.lg }}>
            <Heading>Standings</Heading>
            <Muted>{STANDINGS_HINT}</Muted>
            <Standings standings={standings} />
          </View>
        ) : null}

        {rounds.length === 0 ? (
          <EmptyState title="No rounds played" body="This session ended before any matchups were generated." />
        ) : (
          rounds.map((round) => (
            <View key={round.id} style={{ marginTop: space.xl }}>
              <Heading>Round {round.number}</Heading>
              <Grid>
                {round.matches.map((m) => {
                  const side = (team: 'A' | 'B') => {
                    const won = m.winner === team;
                    const ids = team === 'A' ? m.teamA : m.teamB;
                    const score = team === 'A' ? m.scoreA : m.scoreB;
                    return (
                      <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
                        <Text style={[styles.team, won && styles.won]} numberOfLines={2}>
                          {ids.map(name).join(' & ')}
                        </Text>
                        {score != null ? (
                          <Text style={[styles.score, won && styles.scoreWon]}>{score}</Text>
                        ) : null}
                        {won ? <Icon name="trophy" size={15} color={c.accentInk} /> : null}
                      </Row>
                    );
                  };
                  return (
                    <GridCell key={m.id} columns={r.courtColumns}>
                      <Card tone="alt" style={{ padding: space.md }}>
                        <Muted>
                          Court {m.court + 1}
                          {m.winner == null ? ' · no result' : ''}
                        </Muted>
                        <View style={{ height: space.sm }} />
                        {side('A')}
                        <View style={{ height: space.xs }} />
                        {side('B')}
                      </Card>
                    </GridCell>
                  );
                })}
              </Grid>
              {round.resting.length > 0 ? (
                <Muted style={{ marginTop: space.sm }}>
                  Rested: {round.resting.map(name).join(', ')}
                </Muted>
              ) : null}
            </View>
          ))
        )}

        <View style={{ height: space.xxl }} />
        <Button label="Delete session" variant="danger" onPress={remove} />
      </Screen>
    </>
  );
}

const useStyles = themedStyles(({ c, font, family }) => ({
  team: {
    color: c.textDim,
    fontSize: font.sm,
    fontFamily: family.regular,
    flex: 1,
    paddingRight: space.sm,
  },
  won: { color: c.text, fontFamily: family.semibold },
  score: { color: c.textDim, fontSize: font.md, fontFamily: family.display },
  scoreWon: { color: c.accentInk },
}));
