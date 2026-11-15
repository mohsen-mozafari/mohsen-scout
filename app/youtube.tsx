import { useCallback, useState } from 'react';
import { Text, View, Linking } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button, Skeleton } from 'heroui-native';
import { ArrowRight, SlidersHorizontal, Sparkles, KeyRound, Search } from 'lucide-react-native';
import { LinearGradient } from '@/components/ui/primitives/LinearGradient';
import {
  Page,
  Panel,
  Txt,
  Heading,
  Field,
  Choices,
  Action,
  Fold,
  Empty,
  styles,
  useOperation,
  ErrorBox,
} from '@/components/ScoutUI';
import { VideoRow } from '@/components/VideoRow';
import { MediaPreview } from '@/components/MediaPreview';
import { palette as p } from '@/lib/theme';
import { useScout } from '@/lib/store';
import { languages, type ResearchInput, type Report } from '@/lib/types';
import { relatedQueries } from '@/lib/api';
import { limitations } from '@/lib/engine';
import { getKey } from '@/lib/vault';
export default function Discover() {
  const params = useLocalSearchParams<{ topic?: string }>();
  const preferences = useScout((s) => s.data.preferences);
  const ready = useScout((s) => s.ready);
  const busy = useScout((s) => s.busy);
  const progress = useScout((s) => s.progress);
  const reports = useScout((s) => s.data.reports);
  const ideas = useScout((s) => s.data.ideas);
  const [topic, setTopic] = useState(typeof params.topic === 'string' ? params.topic : '');
  const [region, setRegion] = useState<ResearchInput['region']>(preferences.region);
  const [selectedLanguages, setLanguages] = useState(preferences.languages);
  const defaultPeriod = preferences.defaultResearchDays === 7 ? 'Last 7 days' : preferences.defaultResearchDays === 90 ? 'Last 90 days' : preferences.defaultResearchDays === 0 ? 'Any time' : 'Last 30 days';
  const [period, setPeriod] = useState(defaultPeriod);
  const [duration, setDuration] = useState('Any duration');
  const [category, setCategory] = useState('All categories');
  const [maximum, setMaximum] = useState('25');
  const [reportId, setReportId] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const op = useOperation();
  const [previousDefaults, setPreviousDefaults] = useState({
    ready,
    region: preferences.region,
    languages: preferences.languages,
    defaultResearchDays: preferences.defaultResearchDays,
  });
  if (
    previousDefaults.ready !== ready ||
    previousDefaults.region !== preferences.region ||
    previousDefaults.languages !== preferences.languages ||
    previousDefaults.defaultResearchDays !== preferences.defaultResearchDays
  ) {
    setPreviousDefaults({ ready, region: preferences.region, languages: preferences.languages, defaultResearchDays: preferences.defaultResearchDays });
    if (ready) {
      setRegion(preferences.region);
      setLanguages(preferences.languages);
      setPeriod(defaultPeriod);
    }
  }
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getKey('youtube').then((key) => {
        if (active) setHasKey(Boolean(key));
      });
      return () => {
        active = false;
      };
    }, []),
  );
  const report: Report | undefined = reports.find((r) => r.id === reportId);
  const run = async () => {
    const input: ResearchInput = {
      topic,
      region,
      languages: selectedLanguages,
      days:
        period === 'Last 7 days'
          ? 7
          : period === 'Last 90 days'
            ? 90
            : period === 'Any time'
              ? 0
              : 30,
      duration:
        duration === 'Short (<4 min)'
          ? 'short'
          : duration === 'Medium (4–20 min)'
            ? 'medium'
            : duration === 'Long (>20 min)'
              ? 'long'
              : 'any',
      category:
        category === 'Education'
          ? '27'
          : category === 'Science & tech'
            ? '28'
            : category === 'Entertainment'
              ? '24'
              : category === 'How-to & style'
                ? '26'
                : '',
      maxResults: Number(maximum),
    };
    const result = await useScout.getState().research(input);
    if (result) setReportId(result.id);
  };
  return (
    <Page>
      <View style={{ gap: 10, paddingVertical: 4 }}>
        <Text style={[styles.title, { fontSize: 32, lineHeight: 38 }]}>
          Find your{'\n'}
          <Text style={{ color: p.purple }}>next angle.</Text>
        </Text>
        <Txt muted>A research desk for your next YouTube idea.</Txt>
      </View>
      <Panel>
        <Field
          label="What are you exploring?"
          value={topic}
          onChange={setTopic}
          placeholder="e.g. Small-space home studios"
        />
        <Txt muted>Using Settings defaults: {region} · {selectedLanguages.map((code) => languages[code] || code).join(', ')}</Txt>
        <Fold title="Research filters">
          <Choices
            label="Publication period"
            options={['Last 7 days', 'Last 30 days', 'Last 90 days', 'Any time']}
            selected={[period]}
            onChange={(v) => setPeriod(v[0])}
          />
          <Choices
            label="Duration"
            options={['Any duration', 'Short (<4 min)', 'Medium (4–20 min)', 'Long (>20 min)']}
            selected={[duration]}
            onChange={(v) => setDuration(v[0])}
          />
          <Choices
            label="Category"
            options={[
              'All categories',
              'Education',
              'Science & tech',
              'Entertainment',
              'How-to & style',
            ]}
            selected={[category]}
            onChange={(v) => setCategory(v[0])}
          />
          <Choices
            label="Maximum unique videos"
            options={['10', '25', '50', '100']}
            selected={[maximum]}
            onChange={(v) => setMaximum(v[0])}
          />
        </Fold>
        <View style={{ borderRadius: 16, overflow: 'hidden' }}>
          <LinearGradient
            colors={[p.violet, p.indigo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: 2 }}
          >
            <Button
              className="rounded-2xl bg-transparent"
              isDisabled={busy || !ready}
              onPress={() => void run()}
            >
              <Search size={18} color={p.white} strokeWidth={1.8} />
              <Button.Label>{busy ? 'Researching…' : 'START RESEARCH'}</Button.Label>
              <ArrowRight size={18} color={p.white} strokeWidth={1.8} />
            </Button>
          </LinearGradient>
        </View>
      </Panel>
      {Boolean(topic.trim()) && !report && (
        <View style={{ gap: 12 }}>
          <Heading>Query map</Heading>
          {relatedQueries(topic).map((query, index) => (
            <View style={[styles.row, { marginLeft: index ? 16 : 0 }]} key={query}>
              <View
                style={{
                  width: index ? 18 : 6,
                  height: index ? 1 : 6,
                  backgroundColor: index ? p.border : p.purple,
                  borderRadius: 3,
                }}
              />
              <Txt muted>{query}</Txt>
            </View>
          ))}
        </View>
      )}
      {!hasKey && !report && (
        <Button
          variant="tertiary"
          onPress={() => router.push('/settings')}
          className="h-auto justify-start px-0"
        >
          <KeyRound size={18} color={p.purple} />
          <Button.Label className="flex-1">Set up your YouTube API key</Button.Label>
          <ArrowRight size={16} color={p.muted} />
        </Button>
      )}
      {busy && (
        <View style={{ gap: 12 }}>
          <Txt muted>{progress}</Txt>
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </View>
      )}
      {Boolean(op.error) && (
        <ErrorBox
          message={op.error}
          onRetry={() => void op.run(() => useScout.getState().analyze(reportId))}
        />
      )}
      {report && (
        <>
          <View style={styles.row}>
            <Heading>Research desk</Heading>
            <Text style={[styles.badge, { marginLeft: 'auto' }]}>
              {report.videos.length} {report.videos.length === 1 ? 'video' : 'videos'}
            </Text>
          </View>
          {report.warnings.map((w) => (
            <Txt muted key={w}>
              {w}
            </Txt>
          ))}
          <Fold title="Evidence & limitations">
            <Txt muted>{limitations}</Txt>
            <Txt muted>
              Collected {new Date(report.createdAt).toLocaleString('en-US')}. Cached for 15 minutes.
              Metadata expires after 29 days.
            </Txt>
            <Txt muted>Queries: {report.queries.join(' · ')}</Txt>
          </Fold>
          <Fold title="Emerging Topics" open>
            <Txt muted>Recent examples, not proof of an emerging trend.</Txt>
            {report.videos.slice(0, 2).map((v) => (
              <View style={{ gap: 6 }} key={v.id}>
                <MediaPreview uri={v.thumbnail} aspectRatio={16 / 9} onPress={() => void Linking.openURL('https://www.youtube.com/watch?v=' + v.id).catch(() => {})} alt={v.title} />
                <Txt>{v.title}</Txt>
                <Txt muted>
                  Observed publication: {new Date(v.publishedAt).toLocaleDateString('en-US')}
                </Txt>
              </View>
            ))}
          </Fold>
          <Fold title="Popular Topics">
            <Txt muted>
              Examples ordered by YouTube popularity, not an estimate of market demand.
            </Txt>
            {report.videos
              .filter((v) => v.query.includes('YouTube popularity order'))
              .map((v) => (
                <VideoRow key={v.id} video={v} topic={topic} />
              ))}
            {!report.videos.some((v) => v.query.includes('YouTube popularity order')) && (
              <Txt muted>No distinct popularity-ordered examples in this sample.</Txt>
            )}
          </Fold>
          <Fold title="Interesting Subtopics">
            <Txt muted>Generated search angles to investigate, not discovered trends.</Txt>
            {report.queries.slice(1).map((q) => (
              <Txt key={q}>{q}</Txt>
            ))}
          </Fold>
          <Fold title="Research Questions">
            <Txt>
              Who is this useful for? Which claim can you demonstrate? What would your version add?
              Which assumptions need direct audience research?
            </Txt>
          </Fold>
          {!report.analyzed && (
            <Action
              icon={Sparkles}
              busy={op.busy}
              onPress={() => void op.run(() => useScout.getState().analyze(report.id))}
            >
              CONTINUE ANALYSIS
            </Action>
          )}
          {report.analyzed && (
            <View style={{ gap: 14 }}>
              <Heading>Internal Engine · Content Angles</Heading>
              <Txt muted>The local engine converts the real query buckets returned in this report into evidence-linked ideas, links matching video IDs, and leaves unsupported angles marked as uncertain. YouTube titles and statistics are not sent to AI.</Txt>
              {ideas
                .filter((i) => i.reportId === report.id)
                .map((idea) => (
                  <Button
                    variant="secondary"
                    key={idea.id}
                    onPress={() => router.push({ pathname: '/detail', params: { idea: idea.id } })}
                    className="h-auto justify-start p-4"
                  >
                    <View style={{ flex: 1, gap: 8 }}>
                      <Txt>{idea.topic}</Txt>
                      <Text style={styles.badge}>{idea.assessment}</Text>
                    </View>
                    <ArrowRight color={p.purple} size={18} />
                  </Button>
                ))}
            </View>
          )}
          <Fold title="Relevant Videos" open>
            {!report.videos.length ? (
              <Empty
                title="No videos matched this search."
                action="Change filters"
                onPress={() => setReportId('')}
              />
            ) : (
              report.videos.map((v) => <VideoRow key={v.id} video={v} topic={topic} />)
            )}
          </Fold>
        </>
      )}
      {!report && !busy && reports.length > 0 && (
        <Fold title="Recent research">
          {reports.slice(0, 10).map((r) => (
            <Action
              key={r.id}
              secondary
              onPress={() => {
                setReportId(r.id);
                setTopic(r.input.topic);
              }}
            >
              {r.input.topic}
            </Action>
          ))}
        </Fold>
      )}
      {!report && !busy && (
        <View style={[styles.row, { paddingBottom: 8 }]}>
          <SlidersHorizontal size={16} color={p.muted} />
          <Text style={[styles.muted, { flex: 1 }]}>
            Region and language are independent. No AI required.
          </Text>
        </View>
      )}
    </Page>
  );
}
