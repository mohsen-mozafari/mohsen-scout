import { useEffect, useState } from 'react';
import { Newspaper } from 'lucide-react-native';
import { Linking, View, Text, FlatList } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Panel, Heading, Txt, Action, Choices, styles, ErrorBox, useOperation, ScreenIntro } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { SPACE_NICHES, SPACE_NEWS_SOURCES, fetchSpaceNews, getCachedSpaceNews, newsForNiche, type SpaceNewsItem } from '@/lib/space';
import { uid } from '@/lib/types';
import { MediaPreview } from '@/components/MediaPreview';

export default function CosmicNews() {
  const params = useLocalSearchParams<{ niche?: string }>();
  const preferences = useScout((state) => state.data.preferences);
  const feedRegistry = useScout((state) => state.data.feedRegistry);
  const lastUpdatedAt = feedRegistry.reduce((latest, feed) => Math.max(latest, feed.lastSuccessAt), 0);
  const nicheId = typeof params.niche === 'string' ? params.niche : preferences.selectedSpaceNiche;
  const niche = SPACE_NICHES.find((item) => item.id === nicheId);
  const [items, setItems] = useState<SpaceNewsItem[]>(() =>
    getCachedSpaceNews(useScout.getState().data.feedRegistry, preferences.spaceNewsSources),
  );
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(() =>
    getCachedSpaceNews(useScout.getState().data.feedRegistry, preferences.spaceNewsSources).length === 0,
  );
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
      const currentRegistry = useScout.getState().data.feedRegistry;
      if (JSON.stringify(currentRegistry) !== JSON.stringify(result.registry)) {
        void useScout.getState().commit((data) => ({ ...data, feedRegistry: result.registry }))
          .catch(() => setWarnings((current) => [...current, 'The refreshed feed cache could not be saved locally.']));
      }
    }).catch(() => {
      if (active) setWarnings((current) => [...current, 'Official news feeds could not be reached. Showing saved publisher items when available.']);
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
    await useScout.getState().commit((data) => ({ ...data, feedRegistry: result.registry }));
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
    <Page scroll={false}>
      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 18 }}>
            <ScreenIntro
              eyebrow="OFFICIAL PUBLISHER FEEDS"
              title="Cosmic News"
              subtitle="NASA, JPL and ESA headlines with the publisher, publication date and original source link kept attached."
              icon={Newspaper}
            />
            <Txt muted>A headline is a source lead, not independent scientific verification. Check the original release or paper before relying on a claim.</Txt>
            <Panel variant="soft">
              <View style={styles.rowBetween}>
                <Heading>Feed controls</Heading>
                <Text style={styles.badge}>{items.length} STORIES</Text>
              </View>
              <Txt muted>Saved headlines appear immediately. Selected feeds refresh in the background when the short cache expires; use Refresh for a deliberate update.</Txt>
              <Choices label="Show stories" options={['All selected feeds', 'Selected niche']} selected={[scope]} onChange={(values) => { setScope(values[0]); setVisibleCount(15); }} />
              <Txt muted>{niche?.title ?? (nicheId === 'custom' ? 'Custom niche: ' + preferences.customSpaceNiche : 'All space topics')}</Txt>
              {lastUpdatedAt > 0 ? <Txt muted>{'Last successful feed update: ' + new Date(lastUpdatedAt).toLocaleString()}</Txt> : null}
              <Action busy={op.busy} onPress={refresh}>Refresh selected feeds</Action>
              {warnings.map((warning) => <Txt muted key={warning}>{warning}</Txt>)}
              <Text style={styles.badge}>{Math.min(visibleCount, displayedItems.length)} / {displayedItems.length} {scope === 'Selected niche' ? 'matching niche reports' : 'source reports'}</Text>
              {loading ? <Txt muted>Checking enabled publishers… saved stories remain visible where available.</Txt> : null}
            </Panel>
            {!loading && !items.length ? (
              <Panel>
                <Heading>No current publisher items</Heading>
                <Txt muted>No placeholder story is shown when feeds are unavailable. You can still investigate a topic through the other research routes.</Txt>
                <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: niche?.topic ?? (nicheId === 'custom' ? preferences.customSpaceNiche : 'Space science discoveries') } })}>Search this topic on YouTube</Action>
                <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: niche?.topic ?? (nicheId === 'custom' ? preferences.customSpaceNiche : 'Space science discoveries'), niche: nicheId } })}>Start Deep Research</Action>
                {SPACE_NEWS_SOURCES.filter((source) => preferences.spaceNewsSources.includes(source.id)).map((source) => (
                  <Button key={source.id} variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(source.url).catch(() => {})}>
                    <Button.Label>{'Open official ' + source.label + ' feed ↗'}</Button.Label>
                  </Button>
                ))}
              </Panel>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Panel>
            {item.imageUrl ? <MediaPreview uri={item.imageUrl} aspectRatio={16 / 9} viewer alt={item.title} /> : null}
            <View style={{ gap: 7 }}>
              <Text style={styles.badge}>{item.sourceName} · {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : 'Publisher did not provide a date'}</Text>
              <Heading>{item.title}</Heading>
              {item.summary ? <Txt muted>{item.summary}</Txt> : null}
            </View>
            <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(item.url).catch(() => {})}>
              <Button.Label>Open original source ↗</Button.Label>
            </Button>
            <Action secondary onPress={() => saveItem(item)} busy={op.busy}>Save source to Notes</Action>
            <Action secondary busy={op.busy} onPress={() => researchStory(item)}>Research this story</Action>
          </Panel>
        )}
        ListFooterComponent={
          <View style={{ gap: 12, marginTop: 14 }}>
            {visibleCount < displayedItems.length ? (
              <Action secondary onPress={() => setVisibleCount((current) => Math.min(current + 15, displayedItems.length))}>
                {'Show More · ' + String(displayedItems.length - visibleCount) + ' remaining'}
              </Action>
            ) : null}
            {op.error ? <ErrorBox message={op.error} onRetry={refresh} /> : null}
            {op.message ? <Txt muted>{op.message}</Txt> : null}
          </View>
        }
      />
    </Page>
  );
}
