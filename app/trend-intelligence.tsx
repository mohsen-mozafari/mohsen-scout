import { useRef, useState } from 'react';
import { Linking, View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Page, Panel, Heading, Txt, Field, Action, Choices, styles, ErrorBox, useOperation } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { SETTINGS_ROUTE } from '@/lib/routes';
import { searchYouTubeSample, type YouTubeSampleVideo } from '@/lib/api';
import { getKey } from '@/lib/vault';
import { MediaPreview } from '@/components/MediaPreview';
import { rememberTopicDossier } from '@/lib/topic-dossier';
import { recordRuntimeFinish, recordRuntimeStart } from '@/lib/runtime-metrics';

const formatCount = (value: number | null, label: string) => value === null ? label + ' unavailable' : value.toLocaleString() + ' ' + label;

export default function TrendIntelligence() {
  const params = useLocalSearchParams<{ topic?: string; idea?: string }>();
  const preferences = useScout((state) => state.data.preferences);
  const linkedIdea = useScout((state) => state.data.ideas.find((idea) => idea.id === params.idea));
  const [topic, setTopic] = useState(typeof params.topic === 'string' ? params.topic : '');
  const [videos, setVideos] = useState<YouTubeSampleVideo[]>([]);
  const [warning, setWarning] = useState('');
  const [days, setDays] = useState(String(preferences.defaultResearchDays ?? 30));
  const [sort, setSort] = useState('Discovery Mix');
  const [nextPageToken, setNextPageToken] = useState('');
  const [activeSearch, setActiveSearch] = useState<{ topic: string; days: 0 | 7 | 30 | 90; sort: string }>();
  const searchGeneration = useRef(0);
  const op = useOperation();
  const resetSample = () => {
    searchGeneration.current += 1;
    setVideos([]);
    setNextPageToken('');
    setActiveSearch(undefined);
    setWarning('');
  };
  const executeSample = async (
    search: { topic: string; days: 0 | 7 | 30 | 90; sort: string },
    pageToken = '',
    append = false,
  ) => {
    const generation = searchGeneration.current;
    const key = await getKey('youtube');
    if (!key) throw new Error('Save your personal YouTube Data API key in Settings before running a YouTube sample.');
    recordRuntimeStart('YouTube');
    let youtubeRecorded = false;
    let result: Awaited<ReturnType<typeof searchYouTubeSample>>;
    try {
      result = await searchYouTubeSample(search.topic, {
        key,
        charge: useScout.getState().charge,
        onQuota: () => useScout.getState().commit((data) => ({ ...data, budget: { ...data.budget, exhausted: true } })),
      }, 50, {
        days: search.days,
        order: search.sort === 'Discovery Mix' ? 'discovery' : search.sort === 'Newest' ? 'date' : search.sort === 'Most Likes' ? 'relevance' : 'viewCount',
        region: preferences.region,
        language: preferences.languages[0],
        ...(pageToken ? { pageToken } : {}),
      });
      recordRuntimeFinish('YouTube', result.videos.length ? 'success' : 'partial');
      youtubeRecorded = true;
    } catch (error) {
      if (!youtubeRecorded) recordRuntimeFinish('YouTube', 'error', error instanceof Error ? error.message : String(error));
      throw error;
    }
    if (generation !== searchGeneration.current) return;
    const combinedVideos = append
      ? [...videos, ...result.videos.filter((video) => !videos.some((item) => item.id === video.id))]
      : result.videos;
    rememberTopicDossier(search.topic, {
      videos: combinedVideos,
      videoCriteria: {
        days: search.days,
        region: preferences.region,
        language: preferences.languages[0] ?? '',
        order: search.sort === 'Discovery Mix' ? 'discovery' : search.sort === 'Newest' ? 'date' : search.sort === 'Most Likes' ? 'relevance' : 'viewCount',
      },
    });
    setVideos(combinedVideos);
    setNextPageToken(result.nextPageToken ?? '');
    setWarning(result.warning);
    setActiveSearch(search);
  };
  const run = () => void op.run(async () => {
    const selectedDays: 0 | 7 | 30 | 90 = days === '7' ? 7 : days === '90' ? 90 : days === '0' ? 0 : 30;
    const search = {
      topic: topic.trim(),
      days: selectedDays,
      sort,
    };
    if (!search.topic) throw new Error('Enter a topic before sampling YouTube.');
    resetSample();
    await executeSample(search);
  }, 'YouTube sample refreshed.');
  const loadMore = () => {
    if (!activeSearch || !nextPageToken) return;
    void op.run(() => executeSample(activeSearch, nextPageToken, true), 'Loaded the next YouTube result page.');
  };

  const sortedVideos = sort === 'Discovery Mix' ? videos : [...videos].sort((a, b) => {
    if (sort === 'Newest') return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    const aValue = sort === 'Most Likes' ? a.likeCount : a.viewCount;
    const bValue = sort === 'Most Likes' ? b.likeCount : b.viewCount;
    if (aValue === null) return bValue === null ? 0 : 1;
    if (bValue === null) return -1;
    return bValue - aValue;
  });
  const channels = new Set(videos.map((video) => video.channelId)).size;

  return (
    <Page title="YouTube Trend Sample" eyebrow="BOUNDED API SAMPLE" showBack subtitle="Discover videos through official YouTube search lanes, then continue into independent web research and the in-app browser.">
      <Txt muted>Measure YouTube separately from search interest and publisher news. This view uses the official YouTube Data API, not scraping.</Txt>
      {linkedIdea ? <Txt muted>Research context: {linkedIdea.topic}. Only video links you explicitly save below become durable personal references.</Txt> : null}
      <Panel>
        <Field label="Space topic" value={topic} onChange={(value) => { setTopic(value); resetSample(); }} placeholder="e.g. exoplanet atmosphere discoveries" />
        <Choices
          label="Publication period"
          options={['Last 7 days', 'Last 30 days', 'Last 90 days', 'All time']}
          selected={[days === '7' ? 'Last 7 days' : days === '90' ? 'Last 90 days' : days === '0' ? 'All time' : 'Last 30 days']}
          onChange={(values) => {
            const value = values[0];
            setDays(value === 'Last 7 days' ? '7' : value === 'Last 90 days' ? '90' : value === 'All time' ? '0' : '30');
            resetSample();
          }}
        />
        <Choices
          label="Sort sample by"
          options={['Discovery Mix', 'Newest', 'Most Views', 'Most Likes']}
          selected={[sort]}
          onChange={(values) => { setSort(values[0]); resetSample(); }}
        />
        <Action busy={op.busy} disabled={!topic.trim()} onPress={run}>Sample YouTube videos</Action>
        <Txt muted>{sort === 'Discovery Mix' ? 'Each page samples three official YouTube search lanes (view-count order, newest-first and relevance) and interleaves distinct results without calculating a growth score. Estimate: about 302 quota units per page.' : sort === 'Most Likes' ? 'Each page samples two discovery pools (relevance and view-count order), then compares raw public like counts within the returned sample. Estimate: about 202 quota units per page; this is not a global ranking.' : 'Each page uses one official search request plus video and channel statistics (about 102 quota units). Newest follows YouTube publication-date order; Most Views follows YouTube view-count order.'}</Txt>
        <Txt muted>Use Load next 50 to expand the same bounded sample. Discovery Mix spends more API quota to cover three official result lanes. Nothing scans automatically in the background.</Txt>
        <Action secondary disabled={!topic.trim()} onPress={() => router.push({ pathname: '/deep-research', params: { topic: topic.trim() } })}>Research independent web and news sources</Action>
        <Action secondary onPress={() => router.push('/browser')}>Open internal web browser</Action>
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
            {linkedIdea ? (
              <Action
                secondary
                busy={op.busy}
                disabled={linkedIdea.videoIds.includes(video.id)}
                onPress={() => void op.run(
                  () => useScout.getState().bookmarkVideoForIdea(linkedIdea.id, video.id),
                  'Personal video reference saved to this idea.',
                )}
              >
                {linkedIdea.videoIds.includes(video.id) ? 'Saved to this idea' : 'Save link to this idea'}
              </Action>
            ) : null}
        </Panel>
      ))}
      {nextPageToken.length > 0 && <Action secondary busy={op.busy} onPress={loadMore}>Load next 50 videos</Action>}
      {videos.length > 0 && !nextPageToken && <Txt muted>YouTube has no next page for this query and filter set.</Txt>}
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={run} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
      <Action secondary onPress={() => router.push(SETTINGS_ROUTE)}>Manage YouTube API key and research defaults</Action>
    </Page>
  );
}
