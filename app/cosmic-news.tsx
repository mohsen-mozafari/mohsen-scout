import { useEffect, useState } from 'react';
import { Linking, View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Panel, Heading, Txt, Action, Choices, styles, ErrorBox, useOperation } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { SPACE_NICHES, SPACE_NEWS_SOURCES, fetchSpaceNews, newsForNiche, type SpaceNewsItem } from '@/lib/space';
import { uid } from '@/lib/types';
import { MediaPreview } from '@/components/MediaPreview';

export default function CosmicNews() {
  const params = useLocalSearchParams<{ niche?: string }>();
  const preferences = useScout((state) => state.data.preferences);
  const nicheId = typeof params.niche === 'string' ? params.niche : preferences.selectedSpaceNiche;
  const niche = SPACE_NICHES.find((item) => item.id === nicheId);
  const [items, setItems] = useState<SpaceNewsItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(15);
  const [scope, setScope] = useState('All selected feeds');
  const displayedItems = scope === 'Selected niche'
    ? newsForNiche(items, nicheId, preferences.customSpaceNiche)
    : items;
  const visibleItems = displayedItems.slice(0, visibleCount);
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
    void fetchSpaceNews(preferences.spaceNewsSources).then((result) => {
      if (!active) return;
      setItems(result.items);
      setVisibleCount(15);
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
    setVisibleCount(15);
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

  return (
    <Page title="COSMIC NEWS">
      <Txt muted>Official NASA, JPL and ESA headlines with the original publisher link and publication date. These are source reports, not independent scientific verification.</Txt>
      <Panel>
        <Heading>How Cosmic News works</Heading>
        <Txt muted>Refresh retrieves the RSS/Atom feeds enabled in Settings. Headlines and summaries remain in the publisher’s original language, alongside the date and original link. Open the original story to verify its claims.</Txt>
        <Choices label="Show stories" options={['All selected feeds', 'Selected niche']} selected={[scope]} onChange={(values) => { setScope(values[0]); setVisibleCount(15); }} />
        <Txt muted>{niche?.title ?? (nicheId === 'custom' ? 'Custom niche: ' + preferences.customSpaceNiche : 'All space topics')}</Txt>
        <Action busy={op.busy} onPress={refresh}>Refresh selected feeds</Action>
        {warnings.map((warning) => <Txt muted key={warning}>{warning}</Txt>)}
        <Text style={styles.badge}>{Math.min(visibleCount, displayedItems.length)} / {displayedItems.length} {scope === 'Selected niche' ? 'matching niche reports' : 'source reports'}</Text>
        {loading && <Txt muted>Checking enabled publishers independently…</Txt>}
        {!loading && !items.length && <Txt muted>No live article was returned. This is a publisher/network availability issue, not proof that the topic has no news. Retry when the connection recovers, or continue researching below.</Txt>}
      </Panel>
      {!loading && !items.length && (
        <Panel>
          <Heading>Continue research without the news feed</Heading>
          <Txt muted>No placeholder story is shown when feeds are unavailable. You can still investigate a topic using the other research routes.</Txt>
          <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: niche?.topic ?? (nicheId === 'custom' ? preferences.customSpaceNiche : 'Space science discoveries') } })}>Search this topic on YouTube</Action>
          <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: niche?.topic ?? (nicheId === 'custom' ? preferences.customSpaceNiche : 'Space science discoveries'), niche: nicheId } })}>Start Deep Research anyway</Action>
          {SPACE_NEWS_SOURCES.filter((source) => preferences.spaceNewsSources.includes(source.id)).map((source) => (
            <Button key={source.id} variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(source.url).catch(() => {})}>
              <Button.Label>{'Open official ' + source.label + ' feed ↗'}</Button.Label>
            </Button>
          ))}
        </Panel>
      )}
      {visibleItems.map((item) => {
        return (
          <Panel key={item.id}>
            {item.imageUrl ? <MediaPreview uri={item.imageUrl} aspectRatio={16 / 9} viewer alt={item.title} /> : null}
            <View style={{ gap: 7 }}>
              <Text style={styles.badge}>{item.sourceName} · {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : 'Publisher did not provide a date'}</Text>
              <Heading>{item.title}</Heading>
              {Boolean(item.summary) && <Txt muted>{item.summary}</Txt>}
            </View>
            <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(item.url).catch(() => {})}>
              <Button.Label>Open original source ↗</Button.Label>
            </Button>
            <Action secondary onPress={() => saveItem(item)} busy={op.busy}>Save source to Notes</Action>
            <Action secondary busy={op.busy} onPress={() => researchStory(item)}>Research this story</Action>
          </Panel>
        );
      })}
      {visibleCount < displayedItems.length ? (
        <Action secondary onPress={() => setVisibleCount((current) => Math.min(current + 15, displayedItems.length))}>
          Show More · {displayedItems.length - visibleCount} remaining
        </Action>
      ) : null}
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={refresh} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </Page>
  );
}
