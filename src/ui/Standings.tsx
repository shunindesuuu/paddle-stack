/**
 * Leaderboard for a single session.
 *
 * Deliberately separate from the all-time table on the History tab: that one
 * is dominated by whoever plays most, so it can't show how a given night
 * actually went. Each row pairs this session's record with a trend chip
 * comparing it to the player's form in earlier sessions, which is what makes
 * "who improved tonight?" readable at a glance.
 */

import React from 'react';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { SessionStanding } from '../db/repo';
import { Card, EmptyState, Muted, Row, TierBadge } from './components';
import { Icon } from './Icon';
import { rowInAt, rowLayout } from './motion';
import { themedStyles, useTheme } from './ThemeContext';
import { radius, space } from './theme';

export const STANDINGS_HINT =
  'Ranked by wins, then point difference. The chip compares each win rate with the same player across earlier sessions.';

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Signed so a positive difference reads as one at a glance. */
export function formatDiff(diff: number): string {
  return diff > 0 ? `+${diff}` : String(diff);
}

/** Short trend marker; long labels would wrap badly in the narrow right column. */
function TrendChip({ standing }: { standing: SessionStanding }) {
  const styles = useStyles();
  const { c } = useTheme();
  const { deltaPct, priorWinRate, winRate } = standing;

  // Nothing decided yet this session - a trend would be meaningless.
  if (winRate == null) return null;

  if (priorWinRate == null) {
    return <Text style={styles.plainTag}>new</Text>;
  }
  if (deltaPct === 0) {
    return <Text style={styles.plainTag}>even</Text>;
  }
  if (deltaPct == null) return null;

  const up = deltaPct > 0;
  const tint = up ? c.accentInk : c.danger;
  return (
    <View style={[styles.chip, { backgroundColor: tint + '22', borderColor: tint }]}>
      <Icon name={up ? 'trendUp' : 'trendDown'} size={11} color={tint} />
      <Text style={[styles.chipText, { color: tint }]}>
        {up ? '+' : ''}
        {deltaPct}
      </Text>
    </View>
  );
}

export function Standings({
  standings,
  emptyTitle = 'No results yet',
  emptyBody = 'Pick a winner on a court and the standings fill in.',
}: {
  standings: SessionStanding[];
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const styles = useStyles();

  if (standings.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }

  return (
    <View style={{ marginTop: space.md, gap: space.sm }}>
      {standings.map((s, i) => (
        // Rank changes the moment a score lands, so the layout transition is
        // doing real work here: you can watch someone move up the table
        // instead of the rows silently swapping.
        <Animated.View key={s.player.id} entering={rowInAt(i)} layout={rowLayout}>
        <Card tone="alt" style={{ padding: space.md }}>
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
                {s.priorWinRate != null ? ` · usually ${pct(s.priorWinRate)}` : ''}
              </Muted>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.pct}>{s.winRate == null ? '—' : pct(s.winRate)}</Text>
              <View style={{ height: 4 }} />
              <TrendChip standing={s} />
            </View>
          </Row>
        </Card>
        </Animated.View>
      ))}
    </View>
  );
}

const useStyles = themedStyles(({ c, font, family }) => ({
  name: { color: c.text, fontSize: font.md, fontFamily: family.semibold, flexShrink: 1 },
  rank: { color: c.textFaint, fontSize: font.md, fontFamily: family.display, minWidth: 22 },
  pct: { color: c.accentInk, fontSize: font.md, fontFamily: family.display },
  plainTag: { color: c.textFaint, fontSize: font.xs, fontFamily: family.regular },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: font.xs, fontFamily: family.bold },
}));
