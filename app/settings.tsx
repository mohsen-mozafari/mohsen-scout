import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { Text, View, Linking } from 'react-native';
import { Button, Skeleton } from 'heroui-native';
import { KeyRound, Download, Upload, Bell, Trash2, Bug } from 'lucide-react-native';
import {
  Page,
  Panel,
  Heading,
  Txt,
  Field,
  Choices,
  Action,
  Fold,
  BadgeText,
  styles,
  ErrorBox,
  useOperation,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { type Preferences, type SecondOpinionProvider, DEFAULT_CLOUDFLARE_FREE_MODEL, DEFAULT_SECOND_OPINION_ORDER, defaults, regions, languages } from '@/lib/types';
import { getKey, setKey, deleteKey, credentialPersistence, type Credential } from '@/lib/vault';
import { getFreeModels, getOpenRouterDailyQuota, testYouTube, testOpenRouter, quotaDay, localDateKey } from '@/lib/api';
import { discoverSecondOpinionModels, testSecondOpinionCredential } from '@/lib/ai-gateway';
import { testFirecrawlKey } from '@/lib/web-research';
import { exportBackup, importBackup, restorePersonalData } from '@/lib/backup';
import { shareText, readBackup, shareApk } from '@/lib/transfer';
import { configureSchedule, enableNotifications, scheduleNotice } from '@/lib/scheduler';
import { commitWithSchedule } from '@/lib/schedule';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { palette as p } from '@/lib/theme';
import { translateText } from '@/lib/i18n';
import { SPACE_NICHES, SPACE_NEWS_SOURCES, type WikiLanguage } from '@/lib/space';
function providerName(provider: SecondOpinionProvider): string {
  return provider === 'cloudflare' ? 'Cloudflare Workers AI' : provider === 'xai' ? 'Grok (xAI)' : provider[0].toUpperCase() + provider.slice(1);
}
function normalizePreferences(value?: Partial<Preferences>): Preferences {
  const fallback = defaults().preferences;
  const legacy = value as (Omit<Partial<Preferences>, 'secondOpinionProvider' | 'secondOpinionOrder' | 'secondOpinionModels'> & { secondOpinionProvider?: string; secondOpinionOrder?: string[]; secondOpinionModels?: Record<string, string> }) | undefined;
  const legacyModels = legacy?.secondOpinionModels ?? {};
  const migratedOrder = Array.isArray(legacy?.secondOpinionOrder)
    ? legacy.secondOpinionOrder.map((provider) => provider === 'groq' ? 'xai' : provider).filter((provider): provider is SecondOpinionProvider => ['gemini', 'xai', 'cloudflare', 'openrouter'].includes(provider))
    : fallback.secondOpinionOrder;
  const migratedModel = legacyModels.xai || 'grok-4.7';
  return {
    ...fallback,
    ...value,
    secondOpinionProvider: legacy?.secondOpinionProvider === 'groq' ? 'xai' : (value?.secondOpinionProvider ?? fallback.secondOpinionProvider),
    secondOpinionOrder: migratedOrder.length ? migratedOrder : fallback.secondOpinionOrder,
    secondOpinionModels: { ...fallback.secondOpinionModels, ...legacyModels, xai: migratedModel },
    languages: Array.isArray(value?.languages) ? [...value.languages] : fallback.languages,
    spaceNewsSources: Array.isArray(value?.spaceNewsSources) ? [...value.spaceNewsSources] : fallback.spaceNewsSources,
  };
}

function CredentialSection({
  kind,
  label,
  onStatusChange,
}: {
  kind: Credential;
  label: string;
  onStatusChange?: (kind: Credential, stored: boolean | null) => void;
}) {
  const language = useScout((state) => state.data.preferences.uiLanguage ?? 'fa');
  const [key, setValue] = useState('');
  const [stored, setStored] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [readError, setReadError] = useState('');
  const op = useOperation();
  useEffect(() => {
    void getKey(kind)
      .then((value) => {
        const exists = Boolean(value);
        setStored(exists);
        onStatusChange?.(kind, exists);
      })
      .catch(() => {
        onStatusChange?.(kind, null);
        setReadError('Could not read saved credentials. Reopen Settings to retry.');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      });
  }, [kind, onStatusChange]);
  const test = () =>
    void op.run(async () => {
      const value = await getKey(kind);
      if (!value) throw new Error('Save a key before testing.');
      if (kind === 'youtube') {
        await testYouTube({
          key: value,
          charge: useScout.getState().charge,
          onQuota: () =>
            useScout.getState().commit((d) => ({ ...d, budget: { ...d.budget, exhausted: true } })),
        });
      } else if (kind === 'openrouter') {
        await testOpenRouter(value);
      } else if (kind === 'cloudflare-account-id') {
        if (!/^[a-f0-9]{32}$/i.test(value.trim())) throw new Error('Cloudflare Account ID must be 32 hexadecimal characters.');
      } else if (kind === 'firecrawl') {
        await testFirecrawlKey(value);
      } else {
        const accountId = kind === 'cloudflare' ? await getKey('cloudflare-account-id') ?? undefined : undefined;
        await testSecondOpinionCredential(kind, { key: value, accountId });
      }
    }, `${label} connection verified.`);
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 8 }}>
        <View style={styles.row}>
          <KeyRound size={18} color={p.purple} />
          <Text style={[styles.heading, { flex: 1 }]}>{translateText(label, language)}</Text>
        </View>
        <Text style={styles.badge}>{stored ? '•••• ' + translateText('Saved', language) : translateText('Not set', language)}</Text>
      </View>
      <Field
        label={stored ? 'Replace key' : 'API key'}
        value={key}
        onChange={setValue}
        secret={kind !== 'cloudflare-account-id'}
        placeholder={kind === 'cloudflare-account-id' ? '32-character Cloudflare Account ID' : 'Enter your key here, never in chat'}
      />
      <Txt muted>{credentialPersistence}</Txt>
      <Action
        busy={op.busy}
        onPress={() =>
          void op.run(async () => {
            await setKey(kind, key);
            setValue('');
            setStored(true);
            onStatusChange?.(kind, true);
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
                onStatusChange?.(kind, false);
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
  const [prefs, setPrefs] = useState<Preferences>(() => normalizePreferences(data.preferences));
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [credentialStatus, setCredentialStatus] = useState<Record<Credential, boolean | null>>({
    youtube: null,
    openrouter: null,
    gemini: null,
    xai: null,
    cloudflare: null,
    'cloudflare-account-id': null,
    firecrawl: null,
  });
  const [modelBusy, setModelBusy] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [restore, setRestore] = useState<ReturnType<typeof importBackup>>();
  const op = useOperation();
  const fa = prefs.uiLanguage === 'fa';
  const providerOrder = prefs.secondOpinionOrder ?? DEFAULT_SECOND_OPINION_ORDER;
  const moveProvider = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= providerOrder.length) return;
    const next = [...providerOrder];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setPrefs({ ...prefs, secondOpinionProvider: next[0], secondOpinionOrder: next });
  };
  const handleCredentialStatus = useCallback((kind: Credential, stored: boolean | null) => {
    setCredentialStatus((current) => ({ ...current, [kind]: stored }));
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPrefs(normalizePreferences(data.preferences)));
    return () => cancelAnimationFrame(frame);
  }, [data.preferences]);
  useEffect(() => {
    let active = true;
    const kinds: Credential[] = ['youtube', 'openrouter', 'gemini', 'xai', 'cloudflare', 'cloudflare-account-id', 'firecrawl'];
    void Promise.all(kinds.map(async (kind) => [kind, Boolean(await getKey(kind))] as const))
      .then((entries) => {
        if (!active) return;
        setCredentialStatus(Object.fromEntries(entries) as Record<Credential, boolean | null>);
      })
      .catch(() => {
        if (active) setCredentialStatus({
          youtube: null, openrouter: null, gemini: null, xai: null, cloudflare: null, 'cloudflare-account-id': null, firecrawl: null,
        });
      });
    return () => { active = false; };
  }, []);
  const save = () =>
    void op.run(async () => {
      if (!Array.isArray(prefs.languages) || !prefs.languages.length) throw new Error('Choose at least one default language.');
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
        const provider = prefs.secondOpinionProvider;
        const credentialKind: Credential = provider === 'openrouter' ? 'openrouter' : provider;
        const key = await getKey(credentialKind);
        if (!key) throw new Error('Save this provider key before refreshing its model list.');
        const accountId = provider === 'cloudflare' ? await getKey('cloudflare-account-id') ?? undefined : undefined;
        const available = provider === 'openrouter'
          ? await getFreeModels()
          : await discoverSecondOpinionModels(provider, { key, accountId });
        setModels(available);
        if (!available.length) throw new Error('No supported models were returned by this provider.');
        const currentModels = prefs.secondOpinionModels ?? defaults().preferences.secondOpinionModels;
        if (!available.some((model) => model.id === currentModels[provider])) {
          setPrefs({
            ...prefs,
            secondOpinionModels: { ...currentModels, [provider]: available[0].id },
          });
        }
      } finally {
        setModelBusy(false);
      }
    }, 'Provider models refreshed.');
  const refreshOpenRouterQuota = () =>
    void op.run(async () => {
      const key = await getKey('openrouter');
      if (!key) throw new Error('Save your OpenRouter key in Settings first.');
      const quota = await getOpenRouterDailyQuota(key);
      if (!quota) throw new Error('OpenRouter did not return a readable free-model quota counter.');
      const current = useScout.getState();
      await current.commit((d) => ({
        ...d,
        preferences: {
          ...d.preferences,
          openRouterUsageDay: localDateKey(),
          openRouterRequestsToday: quota.used,
          openRouterDailyLimit: quota.limit,
          openRouterDailyUsed: quota.used,
          openRouterDailyRemaining: quota.remaining,
          openRouterQuotaCheckedAt: Date.now(),
        },
      }));
    }, 'OpenRouter daily quota refreshed.');
  return (
    <Page showBack title="Settings" eyebrow="DEVICE & PROVIDERS" subtitle="Control your local profile, provider access, quotas, privacy and backups.">
      {!ready && <Skeleton className="h-32 rounded-2xl" />}
      <Fold title="Profile & defaults" summary={prefs.region + ' · ' + (prefs.languages?.length ?? 0) + ' language(s)'}>
        <Field
          label="Name (optional)"
          value={prefs.name}
          onChange={(name) => setPrefs({ ...prefs, name })}
        />
        <Choices
          label="App language"
          options={["Persian", "English"]}
          selected={[prefs.uiLanguage === "en" ? "English" : "Persian"]}
          onChange={(values) => setPrefs({ ...prefs, uiLanguage: values[0] === "English" ? "en" : "fa" })}
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

      <Fold title="Content discovery defaults" summary={(prefs.selectedSpaceNiche === 'all' ? 'All topics' : prefs.selectedSpaceNiche === 'custom' ? (prefs.customSpaceNiche || 'Custom topic') : prefs.selectedSpaceNiche) + ' · ' + (prefs.spaceNewsSources?.length ?? 0) + ' feeds'}>
        <Txt muted>These preferences are saved on this device and used automatically by Discovery and research screens.</Txt>
        <Choices
          label="Discovery scope"
          options={['All space topics', 'Custom niche', ...SPACE_NICHES.map((niche) => niche.title)]}
          selected={[prefs.selectedSpaceNiche === 'all'
            ? 'All space topics'
            : prefs.selectedSpaceNiche === 'custom'
              ? 'Custom niche'
              : SPACE_NICHES.find((niche) => niche.id === prefs.selectedSpaceNiche)?.title ?? 'All space topics']}
          onChange={(values) => {
            const selected = SPACE_NICHES.find((niche) => niche.title === values[0]);
            setPrefs({
              ...prefs,
              selectedSpaceNiche: values[0] === 'All space topics'
                ? 'all'
                : values[0] === 'Custom niche'
                  ? 'custom'
                  : selected?.id ?? 'all',
            });
          }}
        />
        <Field
          label="Custom niche / topic terms"
          value={prefs.customSpaceNiche}
          onChange={(customSpaceNiche) => setPrefs({ ...prefs, customSpaceNiche })}
          placeholder="e.g. JWST spectroscopy, exoplanet atmospheres"
        />
        <Txt muted>Separate related terms with commas. All-space mode scans every enabled official feed; custom mode matches these terms in publisher titles and summaries. This is source coverage, not search-volume or audience-demand data.</Txt>
        <Choices
          label="Official news sources"
          options={SPACE_NEWS_SOURCES.map((source) => source.label)}
          selected={(prefs.spaceNewsSources ?? []).map((id) => SPACE_NEWS_SOURCES.find((source) => source.id === id)?.label ?? id)}
          multiple
          onChange={(labels) => setPrefs({
            ...prefs,
            spaceNewsSources: SPACE_NEWS_SOURCES.filter((source) => labels.includes(source.label)).map((source) => source.id),
          })}
        />
        <Choices
          label="Wikimedia article language"
          options={['English', 'Persian', 'German', 'French', 'Spanish', 'Japanese']}
          selected={[({ en: 'English', fa: 'Persian', de: 'German', fr: 'French', es: 'Spanish', ja: 'Japanese' } as Record<WikiLanguage, string>)[prefs.spaceInterestLanguage ?? 'en']]}
          onChange={(values) => {
            const codes: Record<string, WikiLanguage> = { English: 'en', Persian: 'fa', German: 'de', French: 'fr', Spanish: 'es', Japanese: 'ja' };
            setPrefs({ ...prefs, spaceInterestLanguage: codes[values[0]] ?? 'en' });
          }}
        />
        <Choices
          label="Default YouTube research period"
          options={['Last 7 days', 'Last 30 days', 'Last 90 days', 'All time']}
          selected={[prefs.defaultResearchDays === 7 ? 'Last 7 days' : prefs.defaultResearchDays === 90 ? 'Last 90 days' : prefs.defaultResearchDays === 0 ? 'All time' : 'Last 30 days']}
          onChange={(values) => {
            const days: Record<string, Preferences['defaultResearchDays']> = { 'Last 7 days': 7, 'Last 30 days': 30, 'Last 90 days': 90, 'All time': 0 };
            setPrefs({ ...prefs, defaultResearchDays: days[values[0]] ?? 30 });
          }}
        />
        <Action busy={op.busy} disabled={!ready} onPress={save}>Save discovery preferences</Action>
      </Fold>
      <Fold title="YouTube API" summary={credentialStatus.youtube === null ? 'Key status not confirmed' : credentialStatus.youtube ? 'Key saved securely' : 'Key not set'}>
        <CredentialSection kind="youtube" label="YouTube Data API v3" onStatusChange={handleCredentialStatus} />
        <Txt muted>
          Enable YouTube Data API v3 in Google Cloud, create a key, and restrict it to that API.
          Native clients cannot keep bundled secrets; this key belongs to you and is entered on your
          device. Google controls project quota.
        </Txt>
        <Txt muted>{fa
          ? 'در حالت فعلی، نمونه‌های خام YouTube جدا نمایش داده می‌شوند و امتیاز/نسبت/پیش‌بینی مشتق‌شده از آن‌ها ساخته نمی‌شود. برای معیارهای مشتق‌شده مانند امتیاز کانال، نسبت تعامل یا رتبه‌بندی رشد، ابتدا باید اصلاحیه رسمی Derived Metrics Policy را برای پروژه API خود بپذیری: Section 5 · Use Cases, API Integration, and Feature Implementation · Analytics & Reporting. این برنامه پذیرش را از طرف تو انجام نمی‌دهد.'
          : 'In the current mode, raw YouTube samples are displayed separately and no custom score, ratio or forecast is derived from them. To use derived metrics such as channel scores, engagement ratios or growth leaderboards, first accept YouTube’s Derived Metrics Policy amendment for your API project: Section 5 · Use Cases, API Integration, and Feature Implementation · Analytics & Reporting. The app cannot accept this amendment on your behalf.'}</Txt>
        <Action secondary onPress={() => void Linking.openURL('https://developers.google.com/youtube/terms/derived-metrics-policy')}>Read YouTube derived-metrics policy</Action>
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
      <Fold title="Independent web research · Firecrawl" summary={prefs.webResearchEnabled ? 'Enabled · Firecrawl + selected RSS + Wikimedia' : 'Disabled · selected RSS + Wikimedia only'}>
        <Choices
          label={fa ? 'جست‌وجوی وب مستقل' : 'Independent web search'}
          options={['Enabled', 'Disabled']}
          selected={[prefs.webResearchEnabled ? 'Enabled' : 'Disabled']}
          onChange={(values) => setPrefs({ ...prefs, webResearchEnabled: values[0] === 'Enabled' })}
        />
        <Txt muted>{fa
          ? 'Firecrawl Search نتایج وب و خبر را برای موضوع انتخابی پیدا می‌کند و با کلید شخصی می‌تواند خلاصه محتوای صفحات را هم برگرداند. بدون کلید، جست‌وجوی رایگانِ بدون کلید با محدودیت روزانه IP امتحان می‌شود؛ در صورت محدودیت یا قطع دسترسی، خوراک‌های RSS و ویکی‌مدیا مستقل ادامه می‌دهند.'
          : 'Firecrawl Search finds independent web/news sources for the selected topic and can return concise page summaries when a personal key is configured. Without a key, keyless search is attempted subject to daily IP limits; RSS feeds and Wikimedia continue independently if Firecrawl is unavailable.'}</Txt>
        <CredentialSection kind="firecrawl" label="Firecrawl API key (optional)" onStatusChange={handleCredentialStatus} />
        <Txt muted>{fa
          ? 'فقط عبارت موضوع و تنظیمات جست‌وجو به Firecrawl ارسال می‌شود؛ هیچ عنوان، توضیح، شناسه، آمار یا تصویر YouTube به Firecrawl فرستاده نمی‌شود. کلید Firecrawl به‌صورت رمزنگاری‌شده روی همین دستگاه نگهداری می‌شود.'
          : 'Only the topic query and search options are sent to Firecrawl. No YouTube title, description, ID, statistic or thumbnail is sent. A Firecrawl key is stored encrypted on this device.'}</Txt>
        <Action busy={op.busy} onPress={save} disabled={!ready}>Save web research settings</Action>
      </Fold>
      <Fold title="Second Opinion · Multi-provider" summary={providerOrder.map(providerName).join(' → ')}>
        <Txt muted>
          {prefs.uiLanguage === 'fa'
            ? 'پس از تولید ایده، نقد خودکار با ترتیب اولویت ذخیره‌شده اجرا می‌شود. هر سرویس در صورت خطا، محدودیت یا پاسخ نامعتبر به سرویس بعدی واگذار می‌کند. فقط موضوع، مفهوم ایده و خلاصه/پیوند منابع مستقل وب و ناشران ارسال می‌شود. هیچ داده YouTube API، عنوان ویدئو، شناسه، آمار بازدید/پسند، تصویر یا امتیاز YouTube به مدل‌ها ارسال یا با منابع دیگر ترکیب نمی‌شود.'
            : 'After local idea generation, automatic critique runs through the saved provider priority order. On an error, rate limit or invalid response, the next provider is tried. Providers receive the idea topic/concept plus summaries and links from independent web/publisher sources. No YouTube API data, video titles, IDs, view/like statistics, thumbnails or YouTube-derived scores are sent to models or combined with external sources.'}
        </Txt>
        <Txt muted>
          {prefs.uiLanguage === 'fa'
            ? 'نکته حریم خصوصی: طبق شرایط فعلی Google، محتوای ارسالی در سطح رایگان Gemini می‌تواند برای بهبود محصولات Google استفاده شود؛ در سطح پولی این استفاده اعلام نشده است. محدودیت، قیمت و دسترسی همه سرویس‌ها و مدل‌ها تغییرپذیر است؛ قبل از استفاده شرایط حساب خودت را بررسی کن. Grok (xAI) و Cloudflare نیز ممکن است هزینه یا سهمیه مصرف داشته باشند.'
            : 'Privacy and billing note: Google currently states that Gemini Free Tier content may be used to improve its products; the Paid Tier is listed as not used for product improvement. Provider pricing, quotas and model availability can change. Check your account terms before use. Grok (xAI) and Cloudflare models may also incur charges or quota limits.'}
        </Txt>
        <Choices
          label="Preferred provider"
          options={['Gemini', 'Grok (xAI)', 'Cloudflare Workers AI', 'OpenRouter']}
          selected={[providerName(prefs.secondOpinionProvider ?? 'gemini')]}
          onChange={(values) => {
            const selected: Record<string, SecondOpinionProvider> = {
              Gemini: 'gemini', 'Grok (xAI)': 'xai', 'Cloudflare Workers AI': 'cloudflare', OpenRouter: 'openrouter',
            };
            const provider = selected[values[0]] ?? 'gemini';
            const currentOrder = prefs.secondOpinionOrder ?? DEFAULT_SECOND_OPINION_ORDER;
            const nextOrder = [provider, ...currentOrder.filter((item) => item !== provider)];
            setPrefs({ ...prefs, secondOpinionProvider: provider, secondOpinionOrder: nextOrder });
          }}
        />
        <Choices
          label={fa ? 'نقد خودکار پس از تحقیق' : 'Automatic AI critique after research'}
          options={['Enabled', 'Disabled']}
          selected={[prefs.automaticExternalReview ? 'Enabled' : 'Disabled']}
          onChange={(values) => setPrefs({ ...prefs, automaticExternalReview: values[0] === 'Enabled' })}
        />
        <Txt muted>{fa
          ? 'در حالت فعال، هر ایده تازه با مدل اصلی بررسی می‌شود؛ در صورت خطا یا عدم دسترسی، مدل‌های پشتیبان به ترتیب امتحان می‌شوند. اگر همه مدل‌ها در دسترس نباشند، ایده‌های موتور داخلی حفظ می‌شوند و وضعیت نقد ناموفق ثبت می‌شود.'
          : 'When enabled, each new idea is reviewed by the primary model; if it fails or is unavailable, backup providers are tried in order. If every provider fails, local ideas are preserved and the failed review is reported.'}</Txt>
        <Heading>{fa ? 'ترتیب اولویت اجرا' : 'Provider priority order'}</Heading>
        <Txt muted>{fa
          ? 'ردیف اول سرویس اصلی است؛ اگر کلید نداشته باشد یا درخواست ناموفق باشد، سرویس‌های بعدی به همین ترتیب امتحان می‌شوند. برای جابه‌جایی از دکمه‌های بالا و پایین استفاده کن.'
          : 'The first row is the primary provider. If it has no saved key or its request fails, the following providers are tried in order. Use Move up or Move down to reorder them.'}</Txt>
        {providerOrder.map((provider, index) => (
          <View key={provider} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <BadgeText>{index === 0
                ? (fa ? 'اولویت ۱ · اصلی' : 'PRIORITY 1 · PRIMARY')
                : (fa ? 'پشتیبان ' + (index + 1) : 'FALLBACK ' + (index + 1))}</BadgeText>
              <Txt>{providerName(provider)}</Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              <View style={{ width: 88 }}>
                <Action secondary disabled={index === 0} onPress={() => moveProvider(index, -1)}>
                  {fa ? '↑ بالاتر' : '↑ Move up'}
                </Action>
              </View>
              <View style={{ width: 88 }}>
                <Action secondary disabled={index === providerOrder.length - 1} onPress={() => moveProvider(index, 1)}>
                  {fa ? '↓ پایین‌تر' : '↓ Move down'}
                </Action>
              </View>
            </View>
          </View>
        ))}
        <Field
          label={'Gemini model'}
          value={prefs.secondOpinionModels?.gemini ?? 'gemini-3.8-flash'}
          onChange={(value) => setPrefs({ ...prefs, secondOpinionModels: { ...prefs.secondOpinionModels, gemini: value } })}
          placeholder="gemini-3.8-flash"
        />
        <Field
          label={'Grok (xAI) model'}
          value={prefs.secondOpinionModels?.xai ?? 'grok-4.7'}
          onChange={(value) => setPrefs({ ...prefs, secondOpinionModels: { ...prefs.secondOpinionModels, xai: value } })}
          placeholder="grok-4.7"
        />
        <Field
          label={'Cloudflare Workers AI model'}
          value={prefs.secondOpinionModels?.cloudflare ?? DEFAULT_CLOUDFLARE_FREE_MODEL}
          onChange={(value) => setPrefs({ ...prefs, secondOpinionModels: { ...prefs.secondOpinionModels, cloudflare: value } })}
          placeholder={DEFAULT_CLOUDFLARE_FREE_MODEL}
        />
        <Field
          label={'OpenRouter model (must be in its live free-model list)'}
          value={prefs.secondOpinionModels?.openrouter ?? ''}
          onChange={(value) => setPrefs({ ...prefs, secondOpinionModels: { ...prefs.secondOpinionModels, openrouter: value } })}
          placeholder="Auto-select a live free model"
        />
        <Action secondary busy={modelBusy || op.busy} onPress={loadModels}>Refresh models for preferred provider</Action>
        {models.map((model) => (
          <Button
            variant={(prefs.secondOpinionModels?.[prefs.secondOpinionProvider] ?? '') === model.id ? 'primary' : 'secondary'}
            key={model.id}
            className="h-auto justify-start p-3"
            onPress={() => setPrefs({
              ...prefs,
              secondOpinionModels: { ...prefs.secondOpinionModels, [prefs.secondOpinionProvider]: model.id },
            })}
          >
            <Button.Label numberOfLines={2}>{model.name}</Button.Label>
          </Button>
        ))}
        <Action disabled={!ready} busy={op.busy} onPress={save}>Save second-opinion settings</Action>
        <Fold title="Gemini API key" summary={credentialStatus.gemini ? 'Key saved securely' : 'Key not set'}>
          <CredentialSection kind="gemini" label="Gemini API key" onStatusChange={handleCredentialStatus} />
          <Action secondary onPress={() => void Linking.openURL('https://aistudio.google.com/apikey')}>Open Google AI Studio</Action>
        </Fold>
        <Fold title="Grok (xAI) API key" summary={credentialStatus.xai ? 'Key saved securely' : 'Key not set'}>
          <CredentialSection kind="xai" label="Grok (xAI) API key" onStatusChange={handleCredentialStatus} />
          <Action secondary onPress={() => void Linking.openURL('https://console.x.ai/')}>Open Grok (xAI) Console</Action>
        </Fold>
        <Fold title="Cloudflare Workers AI" summary={credentialStatus.cloudflare && credentialStatus['cloudflare-account-id'] ? 'Token and Account ID saved' : 'Token or Account ID missing'}>
          <CredentialSection kind="cloudflare-account-id" label="Cloudflare Account ID" onStatusChange={handleCredentialStatus} />
          <CredentialSection kind="cloudflare" label="Cloudflare API token" onStatusChange={handleCredentialStatus} />
          <Txt muted>{fa
            ? 'راه ساده: در داشبورد Workers AI گزینهٔ Use REST API و سپس Create a Workers AI API Token را بزن؛ همان‌جا Account ID را هم بردار. اگر توکن را دستی می‌سازی، مجوزهای AI Gateway - Read، AI Gateway - Edit و Workers AI - Read را بده. مدل پیش‌فرض رایگان: @cf/zai-org/glm-4.7-flash. پلن رایگان روزانه ۱۰٬۰۰۰ Neurons دارد و سهمیه در ساعت ۰۰:۰۰ UTC صفر می‌شود؛ با تمام‌شدن سهمیه، درخواست‌ها متوقف می‌شوند.'
            : 'Easy setup: In the Workers AI dashboard choose Use REST API, then Create a Workers AI API Token; copy the Account ID shown there too. For a manually created token, grant AI Gateway - Read, AI Gateway - Edit, and Workers AI - Read. Default free model: @cf/zai-org/glm-4.7-flash. The Free plan includes 10,000 Neurons per day, resetting at 00:00 UTC; requests stop when the daily allocation is exhausted.'}</Txt>
          <Action secondary onPress={() => void Linking.openURL('https://dash.cloudflare.com/?to=/:account/ai/workers-ai')}>Open Workers AI dashboard</Action>
        </Fold>
        <Fold title="OpenRouter" summary={credentialStatus.openrouter ? 'Key saved securely' : 'Key not set'}>
          <CredentialSection kind="openrouter" label="OpenRouter API key" onStatusChange={handleCredentialStatus} />
          <Txt>
            Free-model requests today (UTC): {prefs.openRouterDailyUsed ?? prefs.openRouterRequestsToday ?? 0}
            /{prefs.openRouterDailyLimit ?? 50} · Remaining: {prefs.openRouterDailyRemaining ?? 'not refreshed'}
          </Txt>
          <Action secondary busy={op.busy} onPress={refreshOpenRouterQuota}>Refresh OpenRouter quota</Action>
          <Action secondary onPress={() => void Linking.openURL('https://openrouter.ai/settings/keys')}>Open OpenRouter</Action>
        </Fold>
      </Fold>
      <Fold title="API budget & quota" summary={(data.budget.units ?? 0) + ' units · ' + (data.budget.requests ?? 0) + ' requests today'}>
        <Txt>Estimated units today: {data.budget.date === quotaDay() ? data.budget.units : 0}</Txt>
        <Txt>Requests today: {data.budget.date === quotaDay() ? data.budget.requests : 0}</Txt>
        <Choices
          label="Local daily budget (estimated units)"
          options={['500', '1500', '3000', '10000']}
          selected={[String(prefs.budget)]}
          onChange={(v) => setPrefs({ ...prefs, budget: Number(v[0]) })}
        />
        <Txt muted>
          Search.list uses its own 100-calls-per-day bucket (each call costs one quota).
          Other read endpoints share the 10,000-unit daily bucket and use the local budget above.
          These counters cover this app instance only; Google Cloud Console shows actual usage
          across every app and API key in the project. Daily reset follows Pacific time.
        </Txt>
        <Txt muted>
          {data.budget.date === quotaDay() && (data.budget.searchExhausted || data.budget.otherExhausted)
            ? 'YouTube reported quota exhaustion for one API bucket. The independent bucket remains available.'
            : 'The local counter estimates only this app instance; Google Cloud Console is the authoritative project-wide view.'}
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
      <Fold title="Automatic YouTube research" summary={prefs.schedule === 'Manual' ? 'Manual · off' : prefs.paused ? 'Paused' : prefs.schedule}>
        <Choices
          label="Frequency"
          options={['Manual', 'Every 6 hours', 'Every 12 hours', 'Daily', 'Weekly'] as const}
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
          Uses the last researched topic and the same daily quota. Each scheduled run refreshes the selected publisher feeds and official YouTube sample, then generates new local ideas. Android may defer the six-hour minimum; there is no always-on polling.
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
      <Fold title="Backup & phone transfer" summary={(data.notes?.length ?? 0) + ' notes · ' + (data.links?.length ?? 0) + ' links · ' + (data.ideas?.length ?? 0) + ' ideas'}>
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
      <Fold title="Privacy & data management" summary={(data.researchMemory?.length ?? 0) + ' saved research topics · keys stay on device'}>
        <Txt muted>
          YouTube receives YouTube search queries and the key stored on this device. Firecrawl receives the research topic query when independent web search is enabled. The selected AI provider receives the new idea, its concept and source summaries/links from independent publisher, web and Wikimedia sources when automatic review is enabled. YouTube API data (video titles, descriptions, IDs, view/like counts and thumbnails) is never sent to Firecrawl or AI providers and is not combined into publisher/web editorial scores. Private notes and API keys are not sent. Nothing is sent to an app-owned server. No video, audio, subtitle or caption downloads. YouTube API metadata is purged within 29 days; saved personal links and notes remain.
        </Txt>
        <Txt muted>{'Saved research memory: ' + data.researchMemory.length + ' topic(s). This memory is used only for local research comparisons and can be cleared independently.'}</Txt>
        <Action
          secondary
          disabled={!data.researchMemory.length || op.busy}
          onPress={() => {
            if (confirm !== 'memory') {
              setConfirm('memory');
              return;
            }
            void op.run(async () => {
              await useScout.getState().commit((d) => ({ ...d, researchMemory: [] }));
              setConfirm('');
            }, 'Research memory cleared. Notes, ideas and saved links were kept.');
          }}
        >
          {confirm === 'memory' ? 'Confirm clear research memory' : 'Clear research memory'}
        </Action>
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
                  await deleteKey('firecrawl');
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
      <Fold title="App info & mock diagnostics" summary="Version 1.10.0 · local-first · isolated test runner">
        <Heading>MOHSEN SCOUT</Heading>
        <Txt>Version 1.10.0</Txt>
        <Txt muted>Run synthetic regression checks with mocked responses. They do not call YouTube or OpenRouter, use saved API keys, or change your research workspace.</Txt>
        <Action secondary icon={Bug} onPress={() => router.push({
          pathname: '/diagnostics',
          params: { run: '1', runId: String(Date.now()) },
        })}>
          Run mock regression checks
        </Action>
      </Fold>
      {Boolean(op.error) && <ErrorBox message={op.error} onDismiss={op.clear} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </Page>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Page showBack title="Settings recovery" eyebrow="LOCAL FALLBACK">
      <Panel>
        <Heading>Settings could not be displayed</Heading>
        <Txt>The settings screen encountered a problem. Your saved preferences and keys have not been intentionally changed.</Txt>
        <Action onPress={retry}>Retry settings</Action>
        <Action secondary onPress={() => router.replace('/(tabs)')}>Return to Space Radar</Action>
        <Fold title="Technical details" summary="Optional diagnostic detail">
          <Txt muted>{error.message}</Txt>
        </Fold>
      </Panel>
    </Page>
  );
}
