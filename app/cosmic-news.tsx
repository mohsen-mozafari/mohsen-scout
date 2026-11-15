import { useState } from 'react';
import { Linking, View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Panel, Heading, Txt, Action, styles, ErrorBox, useOperation } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { SPACE_NICHES, fetchSpaceNews, newsForNiche, type SpaceNewsItem } from '@/lib/space';
import { uid } from '@/lib/types';

export default function CosmicNews() {
  const params = useLocalSearchParams<{ niche?: string }>();
  const preferences = useScout((state) => state.data.preferences);
  const nicheId = typeof params.niche === 'string' ? params.niche : preferences.selectedSpaceNiche;
  const niche = SPACE_NICHES.find((item) => item.id === nicheId);
  const [items, setItems] = useState<SpaceNewsItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
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
        { id: uid(), type: 'link' as const, text: item.url },
      ],
    };
    await useScout.getState().commit((data) => ({ ...data, notes: [note, ...data.notes] }));
  }, 'Source saved to the Space Research folder in Notes.');
  const refresh = () => void op.run(async () => {
    const result = await fetchSpaceNews(preferences.spaceNewsSources);
    setItems(niche ? newsForNiche(result.items, nicheId) : result.items);
    setWarnings(result.warnings);
    if (!result.items.length && result.warnings.length) throw new Error(result.warnings.join(' '));
  }, 'Space news updated from selected feeds.');
  return (
    <Page title="COSMIC NEWS">
      <Txt muted>{niche ? 'Tracking: ' + niche.title : 'Recent space and astronomy updates from selected official feeds.'}</Txt>
      <Panel>
        <Heading>Primary-source monitoring</Heading>
        <Txt muted>NASA, NASA JPL and ESA RSS headlines. Each item opens the originating publisher; feed failures are shown separately.</Txt>
        <Action busy={op.busy} onPress={refresh}>Refresh selected feeds</Action>
        {warnings.map((warning) => <Txt muted key={warning}>{warning}</Txt>)}
        <Text style={styles.badge}>{items.length} matching reports</Text>
        {!items.length && <Txt muted>Refresh to retrieve the latest source items. Select feeds on the Space Radar screen.</Txt>}
      </Panel>
      {items.map((item) => (
        <Panel key={item.id}>
          <View style={{ gap: 5 }}>
            <Text style={styles.badge}>{item.sourceName} · {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : 'Publisher did not provide a date'}</Text>
            <Heading>{item.title}</Heading>
            {Boolean(item.summary) && <Txt muted>{item.summary}</Txt>}
          </View>
          <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(item.url).catch(() => {})}>
            <Button.Label>Open original source ↗</Button.Label>
          </Button>
          <Action secondary onPress={() => saveItem(item)} busy={op.busy}>Save source to Notes</Action>
          <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: item.title, niche: nicheId } })}>Research this story</Action>
        </Panel>
      ))}
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={refresh} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </Page>
  );
}
