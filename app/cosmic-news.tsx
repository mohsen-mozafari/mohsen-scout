import { useEffect, useState } from 'react';
import { Linking, View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Panel, Heading, Txt, Action, Choices, styles, ErrorBox, useOperation } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { SPACE_NICHES, SPACE_NEWS_SOURCES, fetchSpaceNews, newsForNiche, type SpaceNewsItem } from '@/lib/space';
import { uid } from '@/lib/types';
import { getKey } from '@/lib/vault';
import { getFreeModels, translateNewsToPersian } from '@/lib/api';
import { MediaPreview } from '@/components/MediaPreview';

export default function CosmicNews() {
  const params = useLocalSearchParams<{ niche?: string }>();
  const preferences = useScout((state) => state.data.preferences);
  const nicheId = typeof params.niche === 'string' ? params.niche : preferences.selectedSpaceNiche;
  const niche = SPACE_NICHES.find((item) => item.id === nicheId);
  const [items, setItems] = useState<SpaceNewsItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('All selected feeds');
  const displayedItems = scope === 'Selected niche'
    ? newsForNiche(items, nicheId, preferences.customSpaceNiche)
    : items;
  const [translations, setTranslations] = useState<Record<string, { title: string; summary: string }>>({});
  const [showTranslation, setShowTranslation] = useState<Record<string, boolean>>({});
  const op = useOperation();

  const saveItem = (item: SpaceNewsItem) => void op.run(async () => {
    const note = {
      id: uid(),
      title: ('Space source: ' + item.title).slice(0, 120),
      folder: 'Space Research',
      tags: ['space', item.sourceId],
      updatedAt: Date.now(),
      blocks: [
        { id: uid(), type: 'paragraph' as const, text: item.sourceName + (item.publishedAt ? ' · ' + item.publishedAt : '') },
        { id: uid(), type: 'paragraph' as const, text: item.summary },
        ...(item.imageUrl ? [{ id: uid(), type: 'link' as const, text: 'Image: ' + item.imageUrl }] : []),
        { id: uid(), type: 'link' as const, text: item.url },
      ],
    };
    await useScout.getState().commit((data) => ({ ...data, notes: [note, ...data.notes] }));
  }, 'Source saved to the Space Research folder in Notes.');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchSpaceNews(preferences.spaceNewsSources).then((result) => {
      if (!active) return;
      setItems(result.items);
      setWarnings(result.warnings);
    }).catch(() => {
      if (active) setWarnings(['Official news feeds could not be reached. Check the network and retry.']);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [preferences.spaceNewsSources]);

  const refresh = () => void op.run(async () => {
    const result = await fetchSpaceNews(preferences.spaceNewsSources, fetch, true);
    setItems(result.items);
    setWarnings(result.warnings);
    if (!result.items.length && result.warnings.length) throw new Error(result.warnings.join(' '));
  }, 'Space news updated from selected feeds.');

  const researchStory = (item: SpaceNewsItem) => void op.run(async () => {
    const idea = await useScout.getState().ensureSourceIdea({
      topic: item.title,
      concept: item.summary || 'Review the original publisher report, verify its scientific claims and develop an original explanatory angle.',
      sourceUrl: item.url,
      sourceName: item.sourceName,
      imageUrl: item.imageUrl,
      region: preferences.region,
      languages: preferences.languages,
    });
    router.push({ pathname: '/deep-research', params: { topic: item.title, niche: nicheId, idea: idea.id } });
  }, 'Story connected to your personal research ideas.');

  const translate = (item: SpaceNewsItem) => void op.run(async () => {
    const key = await getKey('openrouter');
    if (!key) throw new Error('Add your OpenRouter key in Settings to translate news.');
    let model = preferences.model;
    if (!model) {
      const models = await getFreeModels();
      model = models[0]?.id ?? '';
      if (!model) throw new Error('No free OpenRouter model is currently available. Refresh models in Settings and try again.');
      await useScout.getState().commit((data) => ({
        ...data,
        preferences: { ...data.preferences, model },
      }));
    }
    const result = await translateNewsToPersian(key, model, item.title, item.summary);
    setTranslations((current) => ({ ...current, [item.id]: result }));
    setShowTranslation((current) => ({ ...current, [item.id]: true }));
  }, 'Persian translation ready.');

  return (
    <Page title="COSMIC NEWS">
      <Txt muted>Official NASA, JPL and ESA headlines with the original publisher link and publication date. These are source reports, not independent scientific verification.</Txt>
      <Panel>
        <Heading>How Cosmic News works</Heading>
        <Txt muted>Refresh retrieves the RSS/Atom feeds enabled in Settings. Stories show the publisher headline, summary, date and original link. Open the original story to verify its claims. You can translate one selected headline and RSS summary into Persian on demand.</Txt>
        <Choices label="Show stories" options={['All selected feeds', 'Selected niche']} selected={[scope]} onChange={(values) => setScope(values[0])} />
        <Txt muted>{niche?.title ?? (nicheId === 'custom' ? 'Custom niche: ' + preferences.customSpaceNiche : 'All space topics')}</Txt>
        <Action busy={op.busy} onPress={refresh}>Refresh selected feeds</Action>
        {warnings.map((warning) => <Txt muted key={warning}>{warning}</Txt>)}
        <Text style={styles.badge}>{displayedItems.length} {scope === 'Selected niche' ? 'matching niche reports' : 'source reports'}</Text>
        {loading && <Txt muted>Checking enabled publishers independently…</Txt>}
        {!loading && !items.length && <Txt muted>No live article was returned. This is a publisher/network availability issue, not proof that the topic has no news. Retry when the connection recovers, or continue researching below.</Txt>}
        <Txt muted>Persian translation requires your OpenRouter key; the app selects an available free model when none is saved. Only the item you explicitly choose is sent; there is no automatic or batch translation.</Txt>
      </Panel>
      {!loading && !items.length && (
        <Panel>
          <Heading>Continue research without the news feed</Heading>
          <Txt muted>The translator needs a real publisher article; no placeholder story is shown when feeds are unavailable. You can still investigate a topic using the other research routes.</Txt>
          <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: niche?.topic ?? (nicheId === 'custom' ? preferences.customSpaceNiche : 'Space science discoveries') } })}>Search this topic on YouTube</Action>
          <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: niche?.topic ?? (nicheId === 'custom' ? preferences.customSpaceNiche : 'Space science discoveries'), niche: nicheId } })}>Start Deep Research anyway</Action>
          {SPACE_NEWS_SOURCES.filter((source) => preferences.spaceNewsSources.includes(source.id)).map((source) => (
            <Button key={source.id} variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(source.url).catch(() => {})}>
              <Button.Label>{'Open official ' + source.label + ' feed ↗'}</Button.Label>
            </Button>
          ))}
          <Txt muted>Persian translation appears on each real article after it loads. It requires your saved OpenRouter key and remains an explicit, one-item action.</Txt>
        </Panel>
      )}
      {displayedItems.map((item) => {
        const translated = translations[item.id];
        const showing = Boolean(showTranslation[item.id] && translated);
        return (
          <Panel key={item.id}>
            {item.imageUrl ? <MediaPreview uri={item.imageUrl} aspectRatio={16 / 9} viewer alt={item.title} /> : null}
            <View style={{ gap: 7 }}>
              <Text style={styles.badge}>{item.sourceName} · {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : 'Publisher did not provide a date'}</Text>
              <Heading>{showing ? translated?.title : item.title}</Heading>
              {Boolean(item.summary) && <Txt muted>{showing ? translated?.summary : item.summary}</Txt>}
              {showing ? (
                <Action secondary disabled={op.busy} onPress={() => setShowTranslation((current) => ({ ...current, [item.id]: false }))}>Show original text</Action>
              ) : (
                <Action secondary busy={op.busy} onPress={() => translated
                  ? setShowTranslation((current) => ({ ...current, [item.id]: true }))
                  : translate(item)}>Translate to Persian</Action>
              )}
            </View>
            <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(item.url).catch(() => {})}>
              <Button.Label>Open original source ↗</Button.Label>
            </Button>
            <Action secondary onPress={() => saveItem(item)} busy={op.busy}>Save source to Notes</Action>
            <Action secondary busy={op.busy} onPress={() => researchStory(item)}>Research this story</Action>
          </Panel>
        );
      })}
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={refresh} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </Page>
  );
}
