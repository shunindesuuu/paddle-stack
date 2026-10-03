import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PlayerStats, Session, listSessions, playerStats } from '../../src/db/repo';
import {
  Card,
  EmptyState,
  Heading,
  Muted,
  Row,
  Screen,
  Segmented,
  TierBadge,
  Title,
} from '../../src/ui/components';
import { Icon } from '../../src/ui/Icon';
import { formatDiff } from '../../src/ui/Standings';
import { themedStyles, useTheme } from '../../src/ui/ThemeContext';
import { font, radius, space } from '../../src/ui/theme';

type Tab = 'sessions' | 'leaderboard';

export default function HistoryScreen() {
  const router = useRouter();
  const styles = useStyles();
  const { c } = useTheme();
  const [tab, setTab] = useState<Tab>('sessions');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<PlayerStats[]>([]);

  useFocusEffect(
    useCallback(() => {
      setSessions(listSessions());
      setStats(playerStats());
    }, [])
  );

  return (
    <Screen>
      <Title>History</Title>

      <View style={{ marginTop: space.md }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'sessions', label: 'Sessions' },
            { value: 'leaderboard', label: 'Leaderboard' },
          ]}
        />
      </View>

      {tab === 'sessions' ? (
        sessions.length === 0 ? (
          <EmptyState title="No sessions yet" body="Start one from the Play tab and it'll show up here." />
        ) : (
          <View style={{ marginTop: space.lg, gap: space.sm }}>
            {sessions.map((s) => (
              <Pressable key={s.id} onPress={() => router.push(`/session/${s.id}`)}>
                <Card tone="alt" style={{ padding: space.md }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <View style={{ height: 2 }} />
                      <Muted>
                        {formatDate(s.startedAt)} · {s.mode === 'doubles' ? 'Doubles' : 'Singles'}
                      </Muted>
                    </View>
                    {s.endedAt == null ? (
                      <View style={styles.liveTag}>
                        <Text style={styles.liveText}>In progress</Text>
                      </View>
                    ) : null}
                    <Icon name="chevron" size={18} color={c.textFaint} />
                  </Row>
                </Card>
              </Pressable>
            ))}
          </View>
        )
      ) : stats.length === 0 ? (
        <EmptyState title="No results yet" body="Record some match scores and the leaderboard fills in." />
      ) : (
        <View style={{ marginTop: space.lg }}>
          <Heading>All-time record</Heading>
          <Muted>
            Ranked by wins, then point difference. Only matches with a recorded winner count
            toward wins and losses.
          </Muted>
          <View style={{ marginTop: space.md, gap: space.sm }}>
            {stats.map((s, i) => {
              const decided = s.wins + s.losses;
              const pct = decided > 0 ? Math.round((s.wins / decided) * 100) : null;
              return (
                <Card key={s.player.id} tone="alt" style={{ padding: space.md }}>
                  <Row gap={space.md}>
                    <Text style={styles.rank}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Row gap={space.sm}>
                        <Text style={styles.name} numberOfLines={1}>
                          {s.player.name}
                        </Text>
                        <TierBadge tier={s.player.tier} small />
                      </Row>
                      <View style={{ height: 2 }} />
                      <Muted>
                        {s.games} game{s.games === 1 ? '' : 's'} · {s.wins}W {s.losses}L
                        {s.scoredGames > 0
                          ? ` · ${s.pointsFor}-${s.pointsAgainst} (${formatDiff(s.pointDiff)})`
                          : ''}
                      </Muted>
                    </View>
                    <Text style={styles.pct}>{pct == null ? '—' : `${pct}%`}</Text>
                  </Row>
                </Card>
              );
            })}
          </View>
        </View>
      )}
    </Screen>
  );
}

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const useStyles = themedStyles(({ c, font, family }) => ({
  name: { color: c.text, fontSize: font.md, fontFamily: family.semibold },
  rank: { color: c.textFaint, fontSize: font.md, fontFamily: family.display, minWidth: 22 },
  pct: { color: c.accentInk, fontSize: font.md, fontFamily: family.display },
  liveTag: {
    backgroundColor: c.accentWash,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: c.accentEdge,
  },
  liveText: { color: c.accentInk, fontSize: font.xs, fontFamily: family.bold },
}));
