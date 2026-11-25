import { useState } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Panel, Heading, Txt, Field, Choices, Action, styles, ErrorBox, useOperation } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { palette as p } from '@/lib/theme';
import { SEARCH_DEMAND_PROVIDERS, type WikiLanguage, type WikiSignal } from '@/lib/space';
import { uid, type Note } from '@/lib/types';
import { getTopicDossier, rememberTopicDossier } from '@/lib/topic-dossier';
import { recordRuntimeFinish, recordRuntimeStart } from '@/lib/runtime-metrics';
import { openExternalUrl } from '@/lib/external-links';

export default function SearchDemand() {
  const params = useLocalSearchParams<{ topic?: string; idea?: string }>();
  const preferences = useScout((state) => state.data.preferences);
  const linkedIdea = useScout((state) => state.data.ideas.find((idea) => idea.id === params.idea));
  const language: WikiLanguage = preferences.spaceInterestLanguage ?? 'en';
  const [country, setCountry] = useState('Worldwide');
  const [period, setPeriod] = useState('Past 12 months');
  const [topics, setTopics] = useState<{ id: string; value: string }[]>([{ id: uid(), value: typeof params.topic === 'string' && params.topic.trim() ? params.topic : 'exoplanet' }]);
  const [results, setResults] = useState<WikiSignal[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  const op = useOperation();
  const setTopic = (id: string, value: string) => {
    setTopics((current) => current.map((item) => item.id === id ? { ...item, value } : item));
    setResults([]);
    setFailures([]);
  };
  const active = topics.map((topic) => topic.value.trim()).filter(Boolean);
  const compare = () => void op.run(async () => {
    if (!active.length) throw new Error('Enter at least one topic.');
    const provider = SEARCH_DEMAND_PROVIDERS[0];
    const settled = await Promise.allSettled(active.map(async (topic) => {
      const cached = getTopicDossier(topic);
      if (cached?.wiki?.language === language) return cached.wiki;
      recordRuntimeStart('Wikimedia');
      try {
        const signal = await provider.run(topic, language);
        recordRuntimeFinish('Wikimedia', 'success');
        rememberTopicDossier(topic, { wiki: signal });
        return signal;
      } catch (error) {
        recordRuntimeFinish('Wikimedia', 'error', error instanceof Error ? error.message : String(error));
        throw error;
      }
    }));
    const values = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const issues = settled.flatMap((result, index) => result.status === 'rejected'
      ? [active[index] + ': ' + (result.reason instanceof Error ? result.reason.message : 'Wikimedia data unavailable.')]
      : []);
    setResults(values);
    setFailures(issues);
    if (!values.length) throw new Error(issues.join(' · ') || 'No public-interest data was returned.');
  }, 'Public-interest pageview data updated.');
  const saveComparisonToIdea = () => void op.run(async () => {
    if (!linkedIdea) throw new Error('Open this comparison from a saved idea first.');
    if (!results.length) throw new Error('Run a successful public-interest comparison before saving it.');
    const title = ('Public interest: ' + active.join(' vs ')).slice(0, 120);
    const existing = useScout.getState().data.notes.find((note) => note.ideaId === linkedIdea.id && note.title === title);
    const blocks: Note['blocks'] = [
      { id: uid(), type: 'heading', text: 'Wikimedia article pageviews' },
      { id: uid(), type: 'paragraph', text: 'These observations count monthly pageviews for the matched article in the selected Wikipedia language edition. They are not search volume, unique people or YouTube views.' },
      ...results.flatMap((result) => [
        { id: uid(), type: 'heading' as const, text: result.articleTitle + ' · ' + result.language.toUpperCase() },
        { id: uid(), type: 'link' as const, text: result.articleUrl },
        { id: uid(), type: 'link' as const, text: result.apiUrl },
        ...result.monthlyViews.map((point) => ({
          id: uid(),
          type: 'bullet' as const,
          text: point.month + ': ' + point.views.toLocaleString() + ' article pageviews',
        })),
      ]),
      ...failures.map((failure) => ({ id: uid(), type: 'paragraph' as const, text: 'Unavailable comparison: ' + failure })),
    ];
    const note: Note = {
      id: existing?.id ?? uid(),
      title,
      folder: 'Space Research',
      tags: ['space', 'wikimedia', 'public-interest'],
      updatedAt: Date.now(),
      ideaId: linkedIdea.id,
      blocks,
    };
    await useScout.getState().commit((data) => ({
      ...data,
      notes: [note, ...data.notes.filter((item) => item.id !== note.id)],
    }));
  }, 'Public-interest comparison saved to the linked idea.');

  const maxViews = Math.max(1, ...results.flatMap((result) => result.monthlyViews.map((point) => point.views)));
  const countryCodes: Record<string, string> = { Worldwide: '', 'United States': 'US', 'United Kingdom': 'GB', Germany: 'DE', Iran: 'IR', Canada: 'CA', Australia: 'AU', Japan: 'JP', India: 'IN', France: 'FR', Brazil: 'BR' };
  const periods: Record<string, string> = { 'Past 7 days': 'now 7-d', 'Past 30 days': 'today 1-m', 'Past 90 days': 'today 3-m', 'Past 12 months': 'today 12-m', 'Past 5 years': 'today 5-y' };
  const trendsParams = new URLSearchParams();
  if (active.length) trendsParams.set('q', active.join(','));
  if (countryCodes[country]) trendsParams.set('geo', countryCodes[country]);
  trendsParams.set('date', periods[period] ?? 'today 12-m');
  const trendsUrl = 'https://trends.google.com/trends/explore?' + trendsParams.toString();
  return (
    <Page title="Public-interest Signals" eyebrow="PUBLIC ATTENTION · SEARCH SIGNALS" showBack subtitle="Compare article attention in a Wikipedia language edition. These observations are not search volume, unique people or YouTube views.">
      <Txt muted>Compare multiple topics without mixing Wikimedia article attention, Google Trends interest, YouTube views or publisher coverage. These are separate measurements.</Txt>
      {linkedIdea ? <Txt muted>Connected idea: {linkedIdea.topic}. Save the comparison below to keep its source links and monthly pageview observations with this idea.</Txt> : null}
      <Panel>
        <Heading>Topics to compare</Heading>
        {topics.map((topic, index) => (
          <View key={topic.id} style={{ gap: 6 }}>
            <Field label={preferences.uiLanguage === 'fa' ? 'موضوع ' + (index + 1) : 'Topic ' + (index + 1)} value={topic.value} onChange={(next) => setTopic(topic.id, next)} placeholder={index === 0 ? 'e.g. exoplanets' : 'Optional comparison topic'} />
            {topics.length > 1 ? <Action secondary disabled={op.busy} onPress={() => { setTopics((current) => current.filter((item) => item.id !== topic.id)); setResults([]); setFailures([]); }}>{preferences.uiLanguage === 'fa' ? 'حذف موضوع ' + (index + 1) : 'Remove topic ' + (index + 1)}</Action> : null}
          </View>
        ))}
        <Action secondary disabled={topics.length >= 8 || op.busy} onPress={() => setTopics((current) => [...current, { id: uid(), value: '' }])}>{preferences.uiLanguage === 'fa' ? 'افزودن موضوع مقایسه' : 'Add comparison topic'} ({topics.length}/8)</Action>
        <Txt muted>{preferences.uiLanguage === 'fa' ? active.length + ' موضوع برای مقایسه انتخاب شده؛ حداکثر ۸ موضوع در هر اجرا.' : active.length + ' topic(s) will be compared. Maximum 8 per run to keep requests bounded.'}</Txt>
        <Txt muted>{language.toUpperCase()} Wikipedia project · change this default in Settings.</Txt>
        <Heading>Google Trends comparison settings</Heading>
        <Choices label="Country / region" options={['Worldwide', 'United States', 'United Kingdom', 'Germany', 'Iran', 'Canada', 'Australia', 'Japan', 'India', 'France', 'Brazil']} selected={[country]} onChange={(values) => setCountry(values[0])} />
        <Choices label="Time range" options={['Past 7 days', 'Past 30 days', 'Past 90 days', 'Past 12 months', 'Past 5 years']} selected={[period]} onChange={(values) => setPeriod(values[0])} />
        <Action busy={op.busy} disabled={!active.length} onPress={compare}>Compare public-interest history</Action>
      </Panel>
      <Panel>
        <Heading>Provider: {SEARCH_DEMAND_PROVIDERS[0].label}</Heading>
        <Txt muted>Wikimedia Pageviews is a free public API and does not use your YouTube API key. Its figures count views of an encyclopedia article in the selected language project over the last six months. They are an attention proxy—not Google search volume, not unique people, not YouTube views, and not country-level audience data. Country and time range selected above apply only to the external Google Trends comparison page.</Txt>
        <Txt muted>Google Trends has a separate API, but official programmatic access is currently a limited alpha. Until public access is available, the app opens the Trends website for manual comparison rather than pretending to call an unavailable API.</Txt>
        <Action secondary onPress={() => void openExternalUrl(trendsUrl, preferences.uiLanguage ?? 'fa')}>Open Google Trends for entered topics</Action>
      </Panel>
      {failures.length > 0 && (
        <Panel>
          <Heading>Some comparisons were unavailable</Heading>
          {failures.map((failure) => <Txt muted key={failure}>{failure}</Txt>)}
          <Txt muted>Successful topics remain visible below; one failed article lookup no longer discards all comparison results.</Txt>
        </Panel>
      )}
      {results.map((result) => (
        <Panel key={result.language + ':' + result.articleTitle}>
          <Heading>{result.articleTitle}</Heading>
          <Text style={styles.badge}>{result.language.toUpperCase()} Wikipedia · monthly article pageviews</Text>
          {Boolean(result.summary) && <Txt muted>{result.summary}</Txt>}
          {!result.monthlyViews.length && <Txt muted>No monthly pageview series was returned for this article.</Txt>}
          {result.monthlyViews.map((point) => (
            <View key={point.month} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt>{point.month}</Txt>
                <Text style={styles.badge}>{point.views.toLocaleString()}</Text>
              </View>
              <View style={{ height: 5, borderRadius: 4, backgroundColor: p.raised, overflow: 'hidden' }}>
                <View style={{ height: 5, width: (result.monthlyViews.length ? (point.views / maxViews) * 100 : 0) + '%', backgroundColor: p.purple, borderRadius: 4 }} />
              </View>
            </View>
          ))}
          <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void openExternalUrl(result.articleUrl, preferences.uiLanguage ?? 'fa')}>
            <Button.Label>Open Wikipedia article ↗</Button.Label>
          </Button>
          <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void openExternalUrl(result.apiUrl, preferences.uiLanguage ?? 'fa')}>
            <Button.Label>Open raw pageview data ↗</Button.Label>
          </Button>
        </Panel>
      ))}
      {linkedIdea && results.length > 0 ? <Action secondary busy={op.busy} onPress={saveComparisonToIdea}>Save comparison to this idea</Action> : null}
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={compare} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </Page>
  );
}
