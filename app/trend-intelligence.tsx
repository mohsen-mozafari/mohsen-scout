import { useState } from 'react';
import { Linking, View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Page, Panel, Heading, Txt, Field, Action, Choices, styles, ErrorBox, useOperation } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { searchYouTubeSample, type YouTubeSampleVideo } from '@/lib/api';
import { getKey } from '@/lib/vault';
import { MediaPreview } from '@/components/MediaPreview';

const formatCount = (value: number | null, label: string) => value === null ? label + ' unavailable' : value.toLocaleString() + ' ' + label;

export default function TrendIntelligence() {
  const params = useLocalSearchParams<{ topic?: string }>();
  const preferences = useScout((state) => state.data.preferences);
  const [topic, setTopic] = useState(typeof params.topic === 'string' ? params.topic : '');
  const [videos, setVideos] = useState<YouTubeSampleVideo[]>([]);
  const [warning, setWarning] = useState('');
  const [days, setDays] = useState(String(preferences.defaultResearchDays ?? 30));
  const [sort, setSort] = useState('Most Views');
  const op = useOperation();

  const run = () => void op.run(async () => {
    const key = await getKey('youtube');
    if (!key) throw new Error('Save your personal YouTube Data API key in Settings before running a YouTube sample.');
    const result = await searchYouTubeSample(topic, {
      key,
      charge: useScout.getState().charge,
      onQuota: () => useScout.getState().commit((data) => ({ ...data, budget: { ...data.budget, exhausted: true } })),
    }, 25, {
      days: Number(days) as 0 | 7 | 30 | 90,
      order: sort === 'Newest' ? 'date' : 'viewCount',
      region: preferences.region,
      language: preferences.languages[0],
    });
    setVideos(result.videos);
    setWarning(result.warning);
  }, 'YouTube sample refreshed.');

  const sortedVideos = [...videos].sort((a, b) => {
    if (sort === 'Newest') return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    const aValue = sort === 'Most Likes' ? a.likeCount : a.viewCount;
    const bValue = sort === 'Most Likes' ? b.likeCount : b.viewCount;
    if (aValue === null) return bValue === null ? 0 : 1;
    if (bValue === null) return -1;
    return bValue - aValue;
  });
  const channels = new Set(videos.map((video) => video.channelId)).size;

  return (
    <Page title="TREND INTELLIGENCE">
      <Txt muted>Measure YouTube separately from search interest and publisher news. This view uses the official YouTube Data API, not scraping.</Txt>
      <Panel>
        <Field label="Space topic" value={topic} onChange={setTopic} placeholder="e.g. exoplanet atmosphere discoveries" />
        <Choices
          label="Publication period"
          options={['Last 7 days', 'Last 30 days', 'Last 90 days', 'All time']}
          selected={[days === '7' ? 'Last 7 days' : days === '90' ? 'Last 90 days' : days === '0' ? 'All time' : 'Last 30 days']}
          onChange={(values) => {
            const value = values[0];
            setDays(value === 'Last 7 days' ? '7' : value === 'Last 90 days' ? '90' : value === 'All time' ? '0' : '30');
          }}
        />
        <Choices
          label="Sort sample by"
          options={['Newest', 'Most Views', 'Most Likes']}
          selected={[sort]}
          onChange={(values) => setSort(values[0])}
        />
        <Action busy={op.busy} disabled={!topic.trim()} onPress={run}>Sample YouTube videos</Action>
        <Txt muted>One search plus batched video and channel statistics requests. Sorting is limited to the returned sample; YouTube search itself cannot order directly by likes.</Txt>
        <Txt muted>Changes to period or sort order apply when you press Sample YouTube videos again.</Txt>
      </Panel>
      {Boolean(warning) && <Txt muted>{warning}</Txt>}
      {videos.length > 0 && (
        <Panel>
          <Heading>Observed sample</Heading>
          <Text style={styles.badge}>{videos.length} videos · {channels} distinct channels</Text>
          <Txt muted>{days === '0' ? 'All publication dates' : 'Published within the selected period'} · {sort}</Txt>
        </Panel>
      )}
      {sortedVideos.map((video) => (
        <Panel key={video.id}>
          <MediaPreview uri={video.thumbnailUrl} aspectRatio={16 / 9} onPress={() => void Linking.openURL(video.url).catch(() => {})} alt={video.title} />
          <View style={{ gap: 5 }}>
            <Heading>{video.title}</Heading>
            <Text style={styles.badge}>{video.channel}</Text>
            <Txt muted>{formatCount(video.viewCount, 'views')} · {formatCount(video.likeCount, 'likes')}</Txt>
            <Txt muted>{video.channelSubscriberCount === null ? 'Subscribers hidden/unavailable' : video.channelSubscriberCount.toLocaleString() + ' subscribers'} · {video.channelVideoCount === null ? 'Channel video total unavailable' : video.channelVideoCount.toLocaleString() + ' channel videos'}</Txt>
            <Txt muted>Published {new Date(video.publishedAt).toLocaleDateString()}</Txt>
          </View>
          <Action secondary onPress={() => void Linking.openURL(video.url).catch(() => {})}>Open video on YouTube</Action>
        </Panel>
      ))}
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={run} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
      <Action secondary onPress={() => router.push('/settings')}>Manage YouTube API key and research defaults</Action>
    </Page>
  );
}
