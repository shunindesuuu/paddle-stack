import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Text, View } from 'react-native';
import { resetDatabase } from '../../src/db/client';
import { DuprSettings, getDuprSettings, listPlayers, listSessions, setDuprSettings } from '../../src/db/repo';
import { checkForUpdate, downloadAndInstallUpdate, UpdateManifest } from '../../src/update/updateChecker';
import { ThemeMode, themedStyles, useTheme } from '../../src/ui/ThemeContext';
import {
  Button,
  Card,
  Heading,
  Input,
  Muted,
  Row,
  Screen,
  Segmented,
  Title,
  ToggleRow,
} from '../../src/ui/components';
import { font, radius, space } from '../../src/ui/theme';

const FEEDBACK_EMAIL = 'paololuisramirez@gmail.com';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'upToDate' }
  | { phase: 'available'; manifest: UpdateManifest }
  | { phase: 'downloading'; manifest: UpdateManifest; progress: number }
  | { phase: 'error'; message: string };

export default function SettingsScreen() {
  const router = useRouter();
  const { mode, setMode, scheme, c } = useTheme();
  const styles = useStyles();
  const [counts, setCounts] = useState({ players: 0, sessions: 0 });
  const [update, setUpdate] = useState<UpdateState>({ phase: 'idle' });
  const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

  const [dupr, setDupr] = useState<DuprSettings>(() => getDuprSettings());
  const [beginnerText, setBeginnerText] = useState(() => String(dupr.brackets.beginnerMax));
  const [intermediateText, setIntermediateText] = useState(() => String(dupr.brackets.intermediateMax));

  const refresh = useCallback(() => {
    setCounts({ players: listPlayers(true).length, sessions: listSessions().length });
    const next = getDuprSettings();
    setDupr(next);
    setBeginnerText(String(next.brackets.beginnerMax));
    setIntermediateText(String(next.brackets.intermediateMax));
  }, []);
  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const toggleUseDupr = (v: boolean) => {
    setDuprSettings({ useDupr: v });
    setDupr(getDuprSettings());
  };

  const commitBeginnerMax = () => {
    const n = Number(beginnerText);
    if (!Number.isFinite(n) || n <= 0 || n >= dupr.brackets.intermediateMax) {
      Alert.alert('Invalid bracket', 'The Beginner cutoff must be a positive number below the Advanced cutoff.');
      setBeginnerText(String(dupr.brackets.beginnerMax));
      return;
    }
    setDuprSettings({ beginnerMax: n });
    setDupr(getDuprSettings());
  };

  const commitIntermediateMax = () => {
    const n = Number(intermediateText);
    if (!Number.isFinite(n) || n <= dupr.brackets.beginnerMax) {
      Alert.alert('Invalid bracket', 'The Advanced cutoff must be a number above the Beginner cutoff.');
      setIntermediateText(String(dupr.brackets.intermediateMax));
      return;
    }
    setDuprSettings({ intermediateMax: n });
    setDupr(getDuprSettings());
  };

  const sendFeedback = () => {
    const version = Constants.expoConfig?.version ?? 'unknown';
    const body = [
      '',
      '',
      '---',
      `App version: ${version}`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `Players: ${counts.players} · Sessions: ${counts.sessions}`,
    ].join('\n');
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
      'Paddle Stack feedback'
    )}&body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('No email app found', `You can reach me directly at ${FEEDBACK_EMAIL}.`)
    );
  };

  const runCheck = async () => {
    setUpdate({ phase: 'checking' });
    try {
      const result = await checkForUpdate(currentVersion);
      setUpdate(result.available ? { phase: 'available', manifest: result.manifest } : { phase: 'upToDate' });
    } catch (err) {
      setUpdate({ phase: 'error', message: err instanceof Error ? err.message : 'Update check failed.' });
    }
  };

  const runInstall = async (manifest: UpdateManifest) => {
    setUpdate({ phase: 'downloading', manifest, progress: 0 });
    try {
      await downloadAndInstallUpdate(manifest.apkUrl, (fraction) =>
        setUpdate({ phase: 'downloading', manifest, progress: fraction })
      );
      // The system installer takes over from here; if the user backs out of
      // it, leave them on the "available" card rather than looking stuck.
      setUpdate({ phase: 'available', manifest });
    } catch (err) {
      setUpdate({ phase: 'error', message: err instanceof Error ? err.message : 'Download failed.' });
    }
  };

  const wipe = () => {
    Alert.alert(
      'Erase all data?',
      'Every player, session and result is deleted. This cannot be undone. Your appearance setting is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase everything',
          style: 'destructive',
          onPress: () => {
            resetDatabase();
            refresh();
            Alert.alert('Done', 'All players and sessions have been removed.');
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <Title>Settings</Title>

      <Card style={{ marginTop: space.lg }}>
        <Heading>Appearance</Heading>
        <Muted>
          {mode === 'system'
            ? `Following your device, currently ${scheme}.`
            : `Always ${mode}, ignoring your device setting.`}
        </Muted>
        <View style={{ height: space.md }} />
        <Segmented value={mode} onChange={setMode} options={MODES} />
      </Card>

      <Card style={{ marginTop: space.lg }}>
        <Heading>Skill rating method</Heading>
        <ToggleRow
          label="Use DUPR ratings"
          hint="Players with a DUPR score are auto-placed into Beginner / Intermediate / Advanced using the brackets below. Players without a DUPR score keep working off their manually set tier."
          value={dupr.useDupr}
          onChange={toggleUseDupr}
        />
        {dupr.useDupr ? (
          <>
            <View style={{ height: space.md }} />
            <Muted>Beginner below</Muted>
            <View style={{ height: space.xs }} />
            <Input
              keyboardType="decimal-pad"
              value={beginnerText}
              onChangeText={setBeginnerText}
              onEndEditing={commitBeginnerMax}
            />
            <View style={{ height: space.md }} />
            <Muted>Advanced at or above</Muted>
            <View style={{ height: space.xs }} />
            <Input
              keyboardType="decimal-pad"
              value={intermediateText}
              onChangeText={setIntermediateText}
              onEndEditing={commitIntermediateMax}
            />
          </>
        ) : null}
      </Card>

      <Card style={{ marginTop: space.lg }}>
        <Heading>App updates</Heading>
        <Muted>
          Version {currentVersion} · this build isn't on the Play Store, so updates are checked
          manually.
        </Muted>
        <View style={{ height: space.md }} />
        {update.phase === 'available' ? (
          <>
            <Text style={styles.updateHeadline}>Version {update.manifest.version} is available</Text>
            {update.manifest.notes ? (
              <>
                <View style={{ height: space.xs }} />
                <Muted>{update.manifest.notes}</Muted>
              </>
            ) : null}
            <View style={{ height: space.md }} />
            <Button label="Download & install" onPress={() => runInstall(update.manifest)} />
          </>
        ) : update.phase === 'downloading' ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted>Downloading update…</Muted>
              <Muted>{Math.round(update.progress * 100)}%</Muted>
            </Row>
            <View style={{ height: space.sm }} />
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.max(4, Math.round(update.progress * 100))}%`, backgroundColor: c.accent },
                ]}
              />
            </View>
          </>
        ) : (
          <>
            {update.phase === 'upToDate' ? <Muted>You're on the latest version.</Muted> : null}
            {update.phase === 'error' ? <Muted>{update.message}</Muted> : null}
            <View style={{ height: update.phase === 'idle' ? 0 : space.md }} />
            <Button
              label={update.phase === 'checking' ? 'Checking…' : 'Check for updates'}
              variant="secondary"
              disabled={update.phase === 'checking'}
              onPress={runCheck}
            />
          </>
        )}
      </Card>

      <Card style={{ marginTop: space.lg }}>
        <Heading>How to use Paddle Stack</Heading>
        <Muted>A quick walkthrough of players, sessions and continuous play.</Muted>
        <View style={{ height: space.md }} />
        <Button label="Open tutorial" variant="secondary" onPress={() => router.push('/tutorial')} />
      </Card>

      <Card style={{ marginTop: space.lg }}>
        <Heading>Feedback & bug reports</Heading>
        <Muted>
          Found something broken, or have an idea? This opens your email app with the details
          already filled in.
        </Muted>
        <View style={{ height: space.md }} />
        <Button label="Send feedback" variant="secondary" onPress={sendFeedback} />
      </Card>

      <Card style={{ marginTop: space.lg }}>
        <Heading>Your data</Heading>
        <Muted>
          Everything is stored on this device only. Nothing is uploaded, and the app works with no
          connection.
        </Muted>
        <View style={{ height: space.md }} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={styles.stat}>{counts.players}</Text>
          <Muted>players</Muted>
        </Row>
        <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
          <Text style={styles.stat}>{counts.sessions}</Text>
          <Muted>sessions</Muted>
        </Row>
        <View style={{ height: space.lg }} />
        <Button label="Erase all data" variant="danger" onPress={wipe} />
      </Card>

      <View style={{ height: space.xl }} />
      <Muted>Paddle Stack · offline pickleball pairings</Muted>
    </Screen>
  );
}

const useStyles = themedStyles(({ c, font, family }) => ({
  stat: { color: c.text, fontSize: font.lg, fontFamily: family.display },
  updateHeadline: { color: c.text, fontSize: font.md, fontFamily: family.semibold },
  progressTrack: {
    height: 8,
    borderRadius: radius.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.sm },
}));
