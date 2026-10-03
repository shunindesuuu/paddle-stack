import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { TIERS, TIER_LABEL, Player, Tier } from '../../src/domain/types';

/** Cycles a tier forward, wrapping past Advanced back to Beginner. */
function nextTier(tier: Tier): Tier {
  return TIERS[(TIERS.indexOf(tier) + 1) % TIERS.length];
}

/** Trims trailing zeros so "3.50" reads as "3.5". */
function formatDupr(n: number): string {
  return String(Number(n.toFixed(2)));
}
import {
  createPlayer,
  deleteOrArchivePlayer,
  DuprSettings,
  getDuprSettings,
  linkPlayers,
  listPlayers,
  setPlayerArchived,
  unlinkPlayer,
  updatePlayer,
} from '../../src/db/repo';
import {
  Button,
  Card,
  EmptyState,
  Grid,
  GridCell,
  Heading,
  Input,
  LinkButton,
  Muted,
  Row,
  Screen,
  SearchField,
  Segmented,
  TierBadge,
  Title,
  matchesSearch,
} from '../../src/ui/components';
import { panelIn, panelOut, rowLayout } from '../../src/ui/motion';
import { Icon } from '../../src/ui/Icon';
import { themedStyles, useTheme } from '../../src/ui/ThemeContext';
import { font, radius, space } from '../../src/ui/theme';
import { useResponsive } from '../../src/ui/useResponsive';

export default function PlayersScreen() {
  const r = useResponsive();
  const styles = useStyles();
  const { c } = useTheme();
  const [players, setPlayers] = useState<Player[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');

  const [name, setName] = useState('');
  const [manualTier, setManualTier] = useState<Tier>('intermediate');
  const [duprText, setDuprText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [duprSettings, setDuprSettingsState] = useState<DuprSettings>(() => getDuprSettings());
  const scrollRef = useRef<ScrollView>(null);
  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  const refresh = useCallback(() => {
    setPlayers(listPlayers(true));
    setDuprSettingsState(getDuprSettings());
  }, []);
  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const visible = players.filter(
    (p) => (showArchived ? true : !p.archived) && matchesSearch(p.name, query)
  );
  const activeCount = players.filter((p) => !p.archived).length;
  const searching = query.trim() !== '';

  const resetForm = () => {
    setName('');
    setManualTier('intermediate');
    setDuprText('');
    setEditingId(null);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    // Names are how you pick people off a list mid-session, so a duplicate is
    // a genuine usability problem rather than a data-integrity one.
    const clash = players.find(
      (p) => p.id !== editingId && p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (clash) {
      Alert.alert('Name already used', `There is already a player called "${clash.name}".`);
      return;
    }

    let dupr: number | null = null;
    const durTrim = duprText.trim();
    if (durTrim !== '') {
      const n = Number(durTrim);
      if (!Number.isFinite(n) || n <= 0) {
        Alert.alert('Invalid DUPR rating', 'Enter a number like 3.75, or leave it blank.');
        return;
      }
      dupr = n;
    }

    if (editingId != null) updatePlayer(editingId, trimmed, manualTier, dupr);
    else createPlayer(trimmed, manualTier, dupr);

    resetForm();
    refresh();
  };

  /** No-op when this player's badge is DUPR-derived: cycling the fallback
   * tier wouldn't visibly change anything until their rating is cleared. */
  const cycleTier = (p: Player) => {
    updatePlayer(p.id, p.name, nextTier(p.manualTier));
    refresh();
  };

  const partnerName = (id: number | null) => players.find((p) => p.id === id)?.name ?? '—';

  const linkingPlayer = linkingId != null ? players.find((p) => p.id === linkingId) : undefined;

  const setLink = (partnerId: number) => {
    if (!linkingPlayer) return;
    linkPlayers(linkingPlayer.id, partnerId);
    setLinkingId(null);
    refresh();
  };

  const clearLink = (p: Player) => {
    unlinkPlayer(p.id);
    setLinkingId(null);
    refresh();
  };

  const startEdit = (p: Player) => {
    setEditingId(p.id);
    setName(p.name);
    setManualTier(p.manualTier);
    setDuprText(p.dupr != null ? formatDupr(p.dupr) : '');
    scrollToTop();
  };

  const remove = (p: Player) => {
    Alert.alert(`Remove ${p.name}?`, 'Players who already have recorded games are archived instead of deleted, so past results keep their names.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const what = deleteOrArchivePlayer(p.id);
          refresh();
          if (what === 'archived') {
            Alert.alert('Archived', `${p.name} has match history, so they were archived rather than deleted.`);
          }
        },
      },
    ]);
  };

  return (
    <Screen scrollRef={scrollRef}>
      <Title>Players</Title>
      <Muted>
        {duprSettings.useDupr
          ? "DUPR ratings set a player's tier automatically using the brackets in Settings. Players without a DUPR score fall back to the tier below."
          : "Tier decides how the app balances doubles teams. Tap a player's tier badge to change it."}
      </Muted>

      <Card style={{ marginTop: space.lg }}>
        <Heading>{editingId != null ? 'Edit player' : 'Add player'}</Heading>
        <Input
          placeholder="Player name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        <View style={{ height: space.md }} />
        <Muted>{duprSettings.useDupr ? 'Skill tier (fallback when no DUPR)' : 'Skill tier'}</Muted>
        <View style={{ height: space.sm }} />
        <Segmented
          value={manualTier}
          onChange={setManualTier}
          options={TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] }))}
        />
        {duprSettings.useDupr ? (
          <>
            <View style={{ height: space.md }} />
            <Muted>DUPR rating (optional)</Muted>
            <View style={{ height: space.sm }} />
            <Input
              placeholder="e.g. 3.75"
              value={duprText}
              onChangeText={setDuprText}
              keyboardType="decimal-pad"
            />
          </>
        ) : null}
        <View style={{ height: space.lg }} />
        <Row gap={space.sm}>
          <Button
            label={editingId != null ? 'Save changes' : 'Add player'}
            onPress={submit}
            disabled={!name.trim()}
            style={{ flex: 1 }}
          />
          {editingId != null ? (
            <Button label="Cancel" variant="ghost" onPress={resetForm} style={{ flex: 1 }} />
          ) : null}
        </Row>
      </Card>

      {linkingPlayer ? (
        <Animated.View entering={panelIn} exiting={panelOut}>
          <Card style={{ marginTop: space.lg }}>
          <Heading>Fixed partner for {linkingPlayer.name}</Heading>
          <Muted>
            Linked players always play together in doubles - the fairness engine seats them as a
            team every round instead of shuffling partners.
          </Muted>
          <View style={{ height: space.md }} />
          {linkingPlayer.linkedPlayerId != null ? (
            <>
              <Button
                label={`Unlink from ${partnerName(linkingPlayer.linkedPlayerId)}`}
                variant="ghost"
                onPress={() => clearLink(linkingPlayer)}
              />
              <View style={{ height: space.md }} />
            </>
          ) : null}
          {players.filter((p) => !p.archived && p.id !== linkingPlayer.id).length === 0 ? (
            <Muted>Nobody else to link with yet.</Muted>
          ) : (
            players
              .filter((p) => !p.archived && p.id !== linkingPlayer.id)
              .map((candidate) => {
                const isCurrent = linkingPlayer.linkedPlayerId === candidate.id;
                return (
                  <Pressable
                    key={candidate.id}
                    onPress={() => setLink(candidate.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Link with ${candidate.name}`}
                  >
                    <Card
                      tone="alt"
                      style={{
                        padding: space.sm,
                        marginBottom: space.xs,
                        borderColor: isCurrent ? c.accentEdge : c.border,
                        borderWidth: isCurrent ? 2 : 1,
                      }}
                    >
                      <Row style={{ justifyContent: 'space-between' }}>
                        <View style={{ flex: 1, paddingRight: space.sm }}>
                          <Text style={styles.name} numberOfLines={1}>
                            {candidate.name}
                          </Text>
                          {candidate.linkedPlayerId != null && !isCurrent ? (
                            <Muted>Currently linked with {partnerName(candidate.linkedPlayerId)}</Muted>
                          ) : null}
                        </View>
                        <TierBadge tier={candidate.tier} small />
                      </Row>
                    </Card>
                  </Pressable>
                );
              })
          )}
            <View style={{ height: space.sm }} />
            <Button label="Cancel" variant="ghost" onPress={() => setLinkingId(null)} />
          </Card>
        </Animated.View>
      ) : null}

      <Row style={{ justifyContent: 'space-between', marginTop: space.xl }}>
        <Heading>
          {searching ? `${visible.length} of ${activeCount}` : `${activeCount} active`}
        </Heading>
        <LinkButton
          label={showArchived ? 'Hide archived' : 'Show archived'}
          onPress={() => setShowArchived((v) => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: showArchived }}
        />
      </Row>

      {players.length > 0 ? (
        <View style={{ marginTop: space.sm, marginBottom: space.xs }}>
          <SearchField value={query} onChangeText={setQuery} />
        </View>
      ) : null}

      {visible.length === 0 ? (
        searching ? (
          <EmptyState
            title={`No one matches "${query.trim()}"`}
            body="Check the spelling, or clear the search to see the whole roster again."
          />
        ) : (
          <EmptyState
            title="No players yet"
            body="Add everyone who plays regularly. You pick who's actually here when you start a session."
          />
        )
      ) : (
        <Grid>
          {visible.map((p) => (
            <GridCell key={p.id} columns={r.playerColumns} layout={rowLayout}>
              <Card tone="alt" style={{ padding: space.md, opacity: p.archived ? 0.5 : 1 }}>
                {/* Name + tier sit on their own line so the name always has the
                    full card width - the action buttons below never squeeze it. */}
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={[styles.name, { flex: 1, paddingRight: space.sm }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {p.archived || (duprSettings.useDupr && p.dupr != null) ? (
                    <TierBadge tier={p.tier} small />
                  ) : (
                    <Pressable
                      onPress={() => cycleTier(p)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.name}, ${TIER_LABEL[p.tier]}. Tap to change tier.`}
                    >
                      <TierBadge tier={p.tier} small />
                    </Pressable>
                  )}
                </Row>

                {p.archived ? (
                  <>
                    <View style={{ height: space.xs }} />
                    <Text style={styles.archivedTag}>archived</Text>
                  </>
                ) : (
                  <>
                    {p.linkedPlayerId != null ? (
                      <>
                        <View style={{ height: space.xs }} />
                        <Row gap={4}>
                          <Icon name="link" size={12} color={c.accentInk} />
                          <Text style={styles.linkedTag} numberOfLines={1}>
                            Linked with {partnerName(p.linkedPlayerId)}
                          </Text>
                        </Row>
                      </>
                    ) : null}
                    {duprSettings.useDupr && p.dupr != null ? (
                      <>
                        <View style={{ height: space.xs }} />
                        <Muted>DUPR {formatDupr(p.dupr)}</Muted>
                      </>
                    ) : null}
                  </>
                )}

                <View style={{ height: space.sm }} />
                <Row gap={space.xs} style={{ justifyContent: 'flex-end' }}>
                  {p.archived ? (
                    <Pressable
                      onPress={() => {
                        setPlayerArchived(p.id, false);
                        refresh();
                      }}
                      style={styles.iconBtn}
                      accessibilityLabel={`Restore ${p.name}`}
                    >
                      <Icon name="restore" size={18} color={c.textDim} />
                    </Pressable>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => {
                          setLinkingId(p.id);
                          scrollToTop();
                        }}
                        style={[styles.iconBtn, p.linkedPlayerId != null && styles.iconBtnActive]}
                        accessibilityLabel={
                          p.linkedPlayerId != null
                            ? `Change fixed partner for ${p.name}`
                            : `Set a fixed partner for ${p.name}`
                        }
                      >
                        <Icon
                          name="link"
                          size={17}
                          color={p.linkedPlayerId != null ? c.accentInk : c.textDim}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => startEdit(p)}
                        style={styles.iconBtn}
                        accessibilityLabel={`Edit ${p.name}`}
                      >
                        <Icon name="edit" size={17} color={c.textDim} />
                      </Pressable>
                      <Pressable
                        onPress={() => remove(p)}
                        style={styles.iconBtn}
                        accessibilityLabel={`Remove ${p.name}`}
                      >
                        <Icon name="remove" size={19} color={c.danger} />
                      </Pressable>
                    </>
                  )}
                </Row>
              </Card>
            </GridCell>
          ))}
        </Grid>
      )}
    </Screen>
  );
}

const useStyles = themedStyles(({ c, font, family }) => ({
  name: { color: c.text, fontSize: font.md, fontFamily: family.semibold },
  link: { color: c.accentInk, fontSize: font.sm, fontFamily: family.semibold },
  archivedTag: { color: c.textFaint, fontSize: font.xs, fontFamily: family.regular },
  linkedTag: { color: c.accentInk, fontSize: font.xs, fontFamily: family.semibold, flexShrink: 1 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
  },
  iconBtnActive: { borderWidth: 1, borderColor: c.accentEdge },
}));
