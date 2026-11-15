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
  const [nextPageToken, setNextPageToken] = useState('');
  const [activeSearch, setActiveSearch] = useState<{ topic: string; days: 0 | 7 | 30 | 90; sort: string }>();
  const op = useOperation();
  const executeSample = async (
    search: { topic: string; days: 0 | 7 | 30 | 90; sort: string },
    pageToken = '',
    append = false,
  ) => {
    const key = await getKey('youtube');
    if (!key) throw new Error('Save your personal YouTube Data API key in Settings before running a YouTube sample.');
    const result = await searchYouTubeSample(search.topic, {
      key,
      charge: useScout.getState().charge,
      onQuota: () => useScout.getState().commit((data) => ({ ...data, budget: { ...data.budget, exhausted: true } })),
    }, 25, {
      days: search.days,
      order: search.sort === 'Newest' ? 'date' : 'viewCount',
      region: preferences.region,
      language: preferences.languages[0],
      ...(pageToken ? { pageToken } : {}),
    });
    setVideos((current) => append
      ? [...current, ...result.videos.filter((video) => !current.some((item) => item.id === video.id))]
      : result.videos);
    setNextPageToken(result.nextPageToken ?? '');
    setWarning(result.warning);
    setActiveSearch(search);
  };
  const run = () => void op.run(async () => {
    const search = {
      topic: topic.trim(),
      days: days === '7' ? 7 : days === '90' ? 90 : days === '0' ? 0 : 30,
      sort,
    };
    if (!search.topic) throw new Error('Enter a topic before sampling YouTube.');
    setVideos([]);
    setNextPageToken('');
    setActiveSearch(undefined);
    setWarning('');
    await executeSample(search);
  }, 'YouTube sample refreshed.');
  const loadMore = () => {
    if (!activeSearch || !nextPageToken) return;
    void op.run(() => executeSample(activeSearch, nextPageToken, true), 'Loaded the next YouTube result page.');
  };

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
        <Field label="Space topic" value={topic} onChange={(value) => { setTopic(value); setNextPageToken(''); }} placeholder="e.g. exoplanet atmosphere discoveries" />
        <Choices
          label="Publication period"
          options={['Last 7 days', 'Last 30 days', 'Last 90 days', 'All time']}
          selected={[days === '7' ? 'Last 7 days' : days === '90' ? 'Last 90 days' : days === '0' ? 'All time' : 'Last 30 days']}
          onChange={(values) => {
            const value = values[0];
            setDays(value === 'Last 7 days' ? '7' : value === 'Last 90 days' ? '90' : value === 'All time' ? '0' : '30');
            setNextPageToken('');
          }}
        />
        <Choices
          label="Sort sample by"
          options={['Newest', 'Most Views', 'Most Likes']}
          selected={[sort]}
          onChange={(values) => { setSort(values[0]); setNextPageToken(''); }}
        />
        <Action busy={op.busy} disabled={!topic.trim()} onPress={run}>Sample YouTube videos</Action>
        <Txt muted>Each page uses one official search request plus batched video and channel statistics. A page costs about 102 YouTube quota units. Sorting by likes is local to the returned sample because YouTube search cannot order directly by likes.</Txt>
        <Txt muted>Use Load next 25 to continue with the same saved search filters. Nothing loads automatically in the background.</Txt>
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
      {nextPageToken.length > 0 && <Action secondary busy={op.busy} onPress={loadMore}>Load next 25 videos</Action>}
      {videos.length > 0 && !nextPageToken && <Txt muted>YouTube has no next page for this query and filter set.</Txt>}
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={run} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
      <Action secondary onPress={() => router.push('/settings')}>Manage YouTube API key and research defaults</Action>
    </Page>
  );
}
