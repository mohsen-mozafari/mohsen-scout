import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Text, View, Linking } from 'react-native';
import { Button, Skeleton } from 'heroui-native';
import { ShieldCheck, KeyRound, Download, Upload, Bell, Trash2 } from 'lucide-react-native';
import {
  Page,
  Panel,
  Heading,
  Txt,
  Field,
  Choices,
  Action,
  Fold,
  styles,
  ErrorBox,
  useOperation,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { type Preferences, defaults, regions, languages } from '@/lib/types';
import { getKey, setKey, deleteKey, credentialPersistence, type Credential } from '@/lib/vault';
import { getFreeModels, testYouTube, testOpenRouter, quotaDay } from '@/lib/api';
import { exportBackup, importBackup, restorePersonalData } from '@/lib/backup';
import { shareText, readBackup, shareApk } from '@/lib/transfer';
import { configureSchedule, enableNotifications, scheduleNotice } from '@/lib/scheduler';
import { commitWithSchedule } from '@/lib/schedule';
import { router } from 'expo-router';
import { palette as p } from '@/lib/theme';
function CredentialSection({ kind, label }: { kind: Credential; label: string }) {
  const [key, setValue] = useState('');
  const [stored, setStored] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [readError, setReadError] = useState('');
  const op = useOperation();
  useEffect(() => {
    void getKey(kind)
      .then((value) => setStored(Boolean(value)))
      .catch(() => {
        setReadError('Could not read saved credentials. Reopen Settings to retry.');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      });
  }, [kind]);
  const test = () =>
    void op.run(async () => {
      const value = await getKey(kind);
      if (!value) throw new Error('Save a key before testing.');
      if (kind === 'youtube')
        await testYouTube({
          key: value,
          charge: useScout.getState().charge,
          onQuota: () =>
            useScout.getState().commit((d) => ({ ...d, budget: { ...d.budget, exhausted: true } })),
        });
      else await testOpenRouter(value);
    }, `${label} connection verified.`);
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 8 }}>
        <View style={styles.row}>
          <KeyRound size={18} color={p.purple} />
          <Text style={[styles.heading, { flex: 1 }]}>{label}</Text>
        </View>
        <Text style={styles.badge}>{stored ? '•••• Saved' : 'Not set'}</Text>
      </View>
      <Field
        label={stored ? 'Replace key' : 'API key'}
        value={key}
        onChange={setValue}
        secret
        placeholder="Enter your key here, never in chat"
      />
      <Txt muted>{credentialPersistence}</Txt>
      <Action
        busy={op.busy}
        onPress={() =>
          void op.run(async () => {
            await setKey(kind, key);
            setValue('');
            setStored(true);
          }, 'Key saved securely.')
        }
      >
        {stored ? 'Replace key' : 'Save key'}
      </Action>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Action secondary disabled={!stored} busy={op.busy} onPress={test}>
            Test key
          </Action>
        </View>
        <View style={{ flex: 1 }}>
          <Action
            secondary
            disabled={!stored}
            busy={op.busy}
            onPress={() => {
              if (!confirmed) {
                setConfirmed(true);
                return;
              }
              void op.run(async () => {
                await deleteKey(kind);
                setStored(false);
                setConfirmed(false);
              }, 'Key deleted.');
            }}
          >
            {confirmed ? 'Confirm delete' : 'Delete key'}
          </Action>
        </View>
      </View>
      {Boolean(readError) && <Txt muted>{readError}</Txt>}
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={test} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </View>
  );
}
export default function Settings() {
  const data = useScout((s) => s.data);
  const ready = useScout((s) => s.ready);
  const [prefs, setPrefs] = useState<Preferences>(data.preferences);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [modelBusy, setModelBusy] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [restore, setRestore] = useState<ReturnType<typeof importBackup>>();
  const op = useOperation();
  const [previousPreferences, setPreviousPreferences] = useState(data.preferences);
  if (previousPreferences !== data.preferences) {
    setPreviousPreferences(data.preferences);
    setPrefs(data.preferences);
  }
  const save = () =>
    void op.run(async () => {
      if (!prefs.languages.length) throw new Error('Choose at least one default language.');
      const current = useScout.getState();
      await commitWithSchedule(
        current.ready,
        current.data.preferences,
        prefs,
        () => current.commit((d) => ({ ...d, preferences: prefs })),
        configureSchedule,
      );
    }, 'Preferences saved.');
  const loadModels = () =>
    void op.run(async () => {
      setModelBusy(true);
      try {
        const available = await getFreeModels();
        setModels(available);
        if (!available.length)
          throw new Error('No free models are currently available. Try later.');
        if (!prefs.model || !available.some((m) => m.id === prefs.model))
          setPrefs({ ...prefs, model: available[0].id });
      } finally {
        setModelBusy(false);
      }
    }, 'Available free models refreshed.');
  return (
    <Page title="Your research desk">
      {!ready && <Skeleton className="h-32 rounded-2xl" />}
      <Panel>
        <View style={styles.row}>
          <ShieldCheck size={22} strokeWidth={1.8} color={p.purple} />
          <Heading>Local by default</Heading>
        </View>
        <Txt muted>
          No account, no required AI, no paid server. API keys are excluded from backups.
        </Txt>
      </Panel>
      <Fold title="Profile & defaults">
        <Field
          label="Name (optional)"
          value={prefs.name}
          onChange={(name) => setPrefs({ ...prefs, name })}
        />
        <Field
          label="Email (optional, stays local)"
          value={prefs.email}
          onChange={(email) => setPrefs({ ...prefs, email })}
        />
        <Choices
          label="Default region"
          options={regions}
          selected={[prefs.region]}
          onChange={(v) => setPrefs({ ...prefs, region: v[0] })}
        />
        <Choices
          label="Default languages"
          options={Object.values(languages)}
          selected={prefs.languages.map((l) => languages[l])}
          multiple
          onChange={(names) =>
            setPrefs({
              ...prefs,
              languages: names
                .map((n) => Object.keys(languages).find((l) => languages[l] === n)!)
                .filter(Boolean),
            })
          }
        />
        <Action busy={op.busy} disabled={!ready} onPress={save}>
          Save defaults
        </Action>
      </Fold>
      <Fold title="YouTube API" open>
        <CredentialSection kind="youtube" label="YouTube Data API v3" />
        <Txt muted>
          Enable YouTube Data API v3 in Google Cloud, create a key, and restrict it to that API.
          Native clients cannot keep bundled secrets; this key belongs to you and is entered on your
          device. Google controls project quota.
        </Txt>
        <Action
          secondary
          onPress={() =>
            void Linking.openURL(
              'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
            )
          }
        >
          Open Google Cloud
        </Action>
      </Fold>
      <Fold title="OpenRouter · optional">
        <CredentialSection kind="openrouter" label="OpenRouter" />
        <Txt muted>
          Free models are discovered live. Providers can change availability and limits. Nothing is
          sent until you explicitly request an opinion.
        </Txt>
        <Txt muted>Selected model: {prefs.model || 'Auto-select an available free model'}</Txt>
        <Action busy={modelBusy || op.busy} secondary onPress={loadModels}>
          Refresh free models
        </Action>
        {models.map((model) => (
          <Button
            variant={prefs.model === model.id ? 'primary' : 'secondary'}
            key={model.id}
            className="h-auto justify-start p-4"
            onPress={() => setPrefs({ ...prefs, model: model.id })}
          >
            <Button.Label numberOfLines={2}>{model.name}</Button.Label>
          </Button>
        ))}
        <Action disabled={!ready} busy={op.busy} onPress={save}>
          Save model
        </Action>
        <Action
          secondary
          onPress={() => void Linking.openURL('https://openrouter.ai/settings/keys')}
        >
          Open OpenRouter
        </Action>
      </Fold>
      <Fold title="API budget & quota">
        <Txt>Estimated units today: {data.budget.date === quotaDay() ? data.budget.units : 0}</Txt>
        <Txt>Requests today: {data.budget.date === quotaDay() ? data.budget.requests : 0}</Txt>
        <Choices
          label="Local daily budget (estimated units)"
          options={['500', '1500', '3000', '10000']}
          selected={[String(prefs.budget)]}
          onChange={(v) => setPrefs({ ...prefs, budget: Number(v[0]) })}
        />
        <Txt muted>
          Each search is estimated at 100 units; connection tests at 1. Retries are charged. This is
          a conservative local counter, not Google&apos;s live quota. Other clients using this
          project are not counted. Daily reset follows Pacific time.
        </Txt>
        <Txt muted>
          {data.budget.date === quotaDay() && data.budget.exhausted
            ? 'YouTube reported quota exhaustion. Automatic requests are stopped for this quota day.'
            : 'Google may reject requests before this local budget is reached.'}
        </Txt>
        <Action busy={op.busy} onPress={save}>
          Save budget
        </Action>
        <Action
          secondary
          onPress={() =>
            void Linking.openURL(
              'https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas',
            )
          }
        >
          Open Google quota
        </Action>
      </Fold>
      <Fold title="Scheduled research">
        <Choices
          label="Frequency"
          options={['Manual', 'Every 12 hours', 'Daily', 'Weekly'] as const}
          selected={[prefs.schedule]}
          onChange={(v) => setPrefs({ ...prefs, schedule: v[0] })}
        />
        <Choices
          label="Background research"
          options={['Active', 'Paused']}
          selected={[prefs.paused ? 'Paused' : 'Active']}
          onChange={(v) => setPrefs({ ...prefs, paused: v[0] === 'Paused' })}
        />
        <Txt muted>{scheduleNotice}</Txt>
        <Txt muted>
          Uses the last manually researched topic and the same daily budget. No continuous polling.
        </Txt>
        <Action busy={op.busy} onPress={save}>
          Save schedule
        </Action>
        <Action
          secondary
          icon={Bell}
          busy={op.busy}
          onPress={() => void op.run(enableNotifications, 'Notifications enabled.')}
        >
          Allow notifications
        </Action>
      </Fold>
      <Fold title="Backup & phone transfer">
        <Txt muted>
          Exports your notes, links, folders, tags, ideas and preferences. API metadata, AI replies
          and keys are excluded. Restore replaces personal data and resets scheduling to Manual.
          Current research and quota remain; opinions stay only for unchanged ideas. Your keys stay
          on this device.
        </Txt>
        <Action
          icon={Download}
          secondary
          busy={op.busy}
          onPress={() =>
            void op.run(
              () => shareText(exportBackup(data), 'mohsen-scout-backup.json'),
              'Backup exported.',
            )
          }
        >
          Export backup
        </Action>
        <Action
          icon={Upload}
          secondary
          busy={op.busy}
          onPress={() =>
            void op.run(async () => {
              const raw = await readBackup();
              if (raw) setRestore(importBackup(raw));
            })
          }
        >
          Choose backup to restore
        </Action>
        {restore && (
          <Panel>
            <Heading>Replace personal data?</Heading>
            <Txt>
              {restore.notes.length} pages · {restore.links.length} links · {restore.ideas.length}{' '}
              ideas
            </Txt>
            <Action
              busy={op.busy}
              onPress={() =>
                void op.run(async () => {
                  const current = useScout.getState();
                  await commitWithSchedule(
                    current.ready,
                    current.data.preferences,
                    restore.preferences,
                    () => current.commit((d) => restorePersonalData(d, restore)),
                    configureSchedule,
                  );
                  setRestore(undefined);
                }, 'Backup restored. Re-enter keys on a new phone.')
              }
            >
              Confirm restore
            </Action>
            <Action secondary onPress={() => setRestore(undefined)}>
              Cancel
            </Action>
          </Panel>
        )}
        <Action secondary busy={op.busy} onPress={() => void op.run(shareApk)}>
          Share an existing APK
        </Action>
        <Txt muted>
          No APK is bundled. Choose a generated APK from your phone to share it. An AAB cannot be
          installed directly.
        </Txt>
      </Fold>
      <Fold title="Privacy & data management">
        <Txt muted>
          YouTube receives your searches and API key. OpenRouter receives only your explicitly
          approved editorial prompt. Nothing is sent to an app-owned server. No video, audio,
          subtitle or caption downloads. API titles, descriptions and thumbnails expire within 29
          days; saved personal links and notes remain.
        </Txt>
        <Action
          secondary
          busy={op.busy}
          onPress={() =>
            void op.run(
              () => useScout.getState().commit((d) => ({ ...d, reports: [], videos: [] })),
              'YouTube metadata cleared.',
            )
          }
        >
          Clear YouTube metadata
        </Action>
        <Action
          icon={Trash2}
          secondary
          busy={op.busy}
          onPress={() => {
            if (confirm !== 'all') {
              setConfirm('all');
              return;
            }
            void op.run(async () => {
              const current = useScout.getState();
              await commitWithSchedule(
                current.ready,
                current.data.preferences,
                defaults().preferences,
                async () => {
                  await deleteKey('youtube');
                  await deleteKey('openrouter');
                  await current.commit(() => defaults());
                },
                configureSchedule,
              );
              setConfirm('');
            }, 'Local data and keys cleared.');
          }}
        >
          {confirm === 'all' ? 'Confirm clear all data & keys' : 'Clear all local data'}
        </Action>
        <Action
          secondary
          onPress={() => void Linking.openURL('https://policies.google.com/privacy')}
        >
          Google Privacy Policy
        </Action>
        <Action secondary onPress={() => void Linking.openURL('https://www.youtube.com/t/terms')}>
          YouTube Terms of Service
        </Action>
        <Action secondary onPress={() => void Linking.openURL('https://openrouter.ai/privacy')}>
          OpenRouter privacy
        </Action>
      </Fold>
      <Fold title="App info">
        <Heading>MOHSEN SCOUT</Heading>
        <Txt>Version 1.0.0 · Personal research assistant for Mohsen</Txt>
        <Txt muted>
          YouTube is a trademark of Google LLC. This app is not affiliated with YouTube. No
          comprehensive trend coverage or guaranteed results.
        </Txt>
        <Action secondary onPress={() => router.push('/diagnostics')}>
          Run mock regression checks
        </Action>
      </Fold>
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={op.clear} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </Page>
  );
}
