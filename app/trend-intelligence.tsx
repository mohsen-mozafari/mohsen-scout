import { useState } from 'react';
import { Linking, View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Panel, Heading, Txt, Field, Action, styles, ErrorBox, useOperation } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { searchYouTubeSample, type YouTubeSampleVideo } from '@/lib/api';
import { getKey } from '@/lib/vault';

const formatViews = (value: number | null) => value === null ? 'View count unavailable' : value.toLocaleString() + ' views';

export default function TrendIntelligence() {
  const params = useLocalSearchParams<{ topic?: string }>();
  const [topic, setTopic] = useState(typeof params.topic === 'string' ? params.topic : '');
  const [videos, setVideos] = useState<YouTubeSampleVideo[]>([]);
  const [warning, setWarning] = useState('');
  const op = useOperation();
  const run = () => void op.run(async () => {
    const key = await getKey('youtube');
    if (!key) throw new Error('Save your personal YouTube Data API key in Settings before running a YouTube sample.');
    const result = await searchYouTubeSample(topic, {
      key,
      charge: useScout.getState().charge,
      onQuota: () => useScout.getState().commit((data) => ({ ...data, budget: { ...data.budget, exhausted: true } })),
    }, 12);
    setVideos(result.videos);
    setWarning(result.warning);
  }, 'YouTube popularity sample refreshed.');
  const channels = new Set(videos.map((video) => video.channelId)).size;
  return (
    <Page title="TREND INTELLIGENCE">
      <Txt muted>Measure YouTube separately from search interest and publisher news. This view uses the official YouTube Data API, not scraping.</Txt>
      <Panel>
        <Field label="Space topic" value={topic} onChange={setTopic} placeholder="e.g. exoplanet atmosphere discoveries" />
        <Action busy={op.busy} disabled={!topic.trim()} onPress={run}>Sample popular YouTube videos</Action>
        <Txt muted>Estimated YouTube quota: 100 units for search.list, 1 for videos.list, and 1 for public channels.list statistics (102 total). The existing local budget and Google quota responses are respected.</Txt>
      </Panel>
      {Boolean(warning) && <Txt muted>{warning}</Txt>}
      {videos.length > 0 && (
        <Panel>
          <Heading>Observed sample</Heading>
          <Text style={styles.badge}>{videos.length} videos · {channels} distinct channels</Text>
          <Txt muted>Popularity-ordered examples are a limited sample, not a complete channel census or proof of saturation. Raw view counts are shown per video; no views/hour or growth percentage is calculated.</Txt>
        </Panel>
      )}
      {videos.map((video) => (
        <Panel key={video.id}>
          <View style={{ gap: 5 }}>
            <Heading>{video.title}</Heading>
            <Text style={styles.badge}>{video.channel} · {formatViews(video.viewCount)}</Text>
            <Txt muted>{video.channelSubscriberCount === null ? 'Subscribers hidden/unavailable' : video.channelSubscriberCount.toLocaleString() + ' subscribers'} · {video.channelVideoCount === null ? 'Channel video total unavailable' : video.channelVideoCount.toLocaleString() + ' channel videos'}</Txt>
            <Txt muted>Published {new Date(video.publishedAt).toLocaleDateString()} · YouTube video ID {video.id}</Txt>
          </View>
          <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(video.url).catch(() => {})}>
            <Button.Label>Open video ↗</Button.Label>
          </Button>
        </Panel>
      ))}
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={run} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
      <Action secondary onPress={() => router.push('/settings')}>Manage YouTube API key and daily budget</Action>
    </Page>
  );
}
