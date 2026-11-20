import { useCallback, useState } from 'react';
import { Text, View, Linking } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button, Skeleton } from 'heroui-native';
import { ArrowRight, SlidersHorizontal, Sparkles, KeyRound, Search } from 'lucide-react-native';
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
import { languages, regions, type ResearchInput, type Report } from '@/lib/types';
import { relatedQueries } from '@/lib/api';
import { limitations } from '@/lib/engine';
import { sortResearchVideos, type ResearchVideoSort } from '@/lib/intelligence';
import { getKey } from '@/lib/vault';
import { SETTINGS_ROUTE } from '@/lib/routes';
const RESEARCH_SORT_OPTIONS: ResearchVideoSort[] = [
  'Newest', 'Oldest', 'Most Views', 'Least Views',
  'Most Likes', 'Least Likes', 'Most Relevant', 'A-Z', 'Z-A',
];
const isResearchVideoSort = (value: string): value is ResearchVideoSort =>
  RESEARCH_SORT_OPTIONS.some((option) => option === value);

export default function Discover() {
  const params = useLocalSearchParams<{ topic?: string; idea?: string; report?: string }>();
  const preferences = useScout((s) => s.data.preferences);
  const ready = useScout((s) => s.ready);
  const busy = useScout((s) => s.busy);
  const progress = useScout((s) => s.progress);
  const reports = useScout((s) => s.data.reports);
  const ideas = useScout((s) => s.data.ideas);
  const linkedIdea = ideas.find((idea) => idea.id === params.idea);
  const [topic, setTopic] = useState(typeof params.topic === 'string' ? params.topic : '');
  const [region, setRegion] = useState<ResearchInput['region']>(preferences.region);
  const [selectedLanguages, setLanguages] = useState(preferences.languages);
  const defaultPeriod = preferences.defaultResearchDays === 7 ? 'Last 7 days' : preferences.defaultResearchDays === 90 ? 'Last 90 days' : preferences.defaultResearchDays === 0 ? 'Any time' : 'Last 30 days';
  const [period, setPeriod] = useState(defaultPeriod);
  const [duration, setDuration] = useState('Any duration');
  const [category, setCategory] = useState('All categories');
  const [maximum, setMaximum] = useState('25');
  const [sort, setSort] = useState('Most Views');
  const [reportId, setReportId] = useState(typeof params.report === 'string' ? params.report : '');
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
  const sortedReportVideos = report
    ? sortResearchVideos(report.videos, sort as ResearchVideoSort, topic)
    : [];
  const run = async (forceRefresh = false) => {
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
    const result = await useScout.getState().research(input, 'manual', forceRefresh);
    if (result) setReportId(result.id);
  };
  return (
    <Page
      title="YouTube Research"
      eyebrow="OFFICIAL DATA API"
      showBack
      subtitle="Build a bounded sample with your own topic, filters and saved reports. No scraping and no automatic background searches."
    >
      <Panel>
        <Field
          label="What are you exploring?"
          value={topic}
          onChange={(value) => { setTopic(value); setReportId(''); }}
          placeholder="e.g. Small-space home studios"
        />
        <Txt muted>
          Current sample: {region} · {selectedLanguages.map((code) => languages[code] || code).join(', ')} · {period} · {maximum} max videos
        </Txt>
        <Fold title="Adjust search settings" summary={region + ' · ' + period + ' · ' + maximum + ' max videos'}>
          <Choices
            label="Region"
            options={regions}
            selected={[region]}
            onChange={(values) => { setRegion(values[0]); setReportId(''); }}
          />
          <Choices
            label="Languages"
            options={Object.keys(languages)}
            selected={selectedLanguages}
            multiple
            onChange={(values) => { setLanguages(values); setReportId(''); }}
          />
          <Choices
            label="Publication period"
            options={['Last 7 days', 'Last 30 days', 'Last 90 days', 'Any time']}
            selected={[period]}
            onChange={(v) => { setPeriod(v[0]); setReportId(''); }}
          />
          <Choices
            label="Duration"
            options={['Any duration', 'Short (<4 min)', 'Medium (4–20 min)', 'Long (>20 min)']}
            selected={[duration]}
            onChange={(v) => { setDuration(v[0]); setReportId(''); }}
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
            onChange={(v) => { setCategory(v[0]); setReportId(''); }}
          />
          <Choices
            label="Maximum unique videos"
            options={['10', '25', '50', '100']}
            selected={[maximum]}
            onChange={(v) => { setMaximum(v[0]); setReportId(''); }}
          />
        </Fold>
        <Action
          icon={Search}
          disabled={busy || !ready || !topic.trim() || !selectedLanguages.length}
          onPress={() => void run()}
        >
          {busy ? 'Researching…' : 'Start research'}
        </Action>
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
                  backgroundColor: index ? p.border : p.accent,
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
          onPress={() => router.push(SETTINGS_ROUTE)}
          className="h-auto justify-start px-0"
        >
          <KeyRound size={18} color={p.accent} />
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
          <Action secondary busy={busy} onPress={() => void run(true)}>
            {preferences.uiLanguage === 'fa' ? 'جست‌وجوی تازه و نادیده‌گرفتن حافظهٔ موقت' : 'Fetch fresh results (bypass recent cache)'}
          </Action>
          {report.warnings.map((w) => (
            <Txt muted key={w}>
              {w}
            </Txt>
          ))}
          {linkedIdea ? (
            <Panel>
              <Heading>Connect this research</Heading>
              <Txt muted>Current idea: {linkedIdea.topic}. Connecting stores this report and its temporary video references locally. YouTube metadata remains subject to the existing retention policy.</Txt>
              <Action
                secondary
                busy={op.busy}
                disabled={linkedIdea.reportId === report.id}
                onPress={() => void op.run(
                  () => useScout.getState().linkReportToIdea(linkedIdea.id, report.id),
                  'YouTube report connected to this idea.',
                )}
              >
                {linkedIdea.reportId === report.id ? 'This report is already connected' : 'Connect report to this idea'}
              </Action>
            </Panel>
          ) : null}
          <Fold title="Evidence & limitations" summary={report.videos.length + ' videos · ' + report.warnings.length + ' warnings'}>
            <Txt muted>{limitations}</Txt>
            <Txt muted>
              Collected {new Date(report.createdAt).toLocaleString('en-US')}. Cached for 15 minutes.
              Metadata expires after 29 days.
            </Txt>
            <Txt muted>Queries: {report.queries.join(' · ')}</Txt>
          </Fold>
          <Fold title="Emerging Topics" summary={Math.min(2, report.videos.length) + ' recent examples'}>
            <Txt muted>Recent examples, not proof of an emerging trend.</Txt>
            {[...report.videos].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 2).map((v) => (
              <View style={{ gap: 6 }} key={v.id}>
                <MediaPreview uri={v.thumbnail} aspectRatio={16 / 9} onPress={() => void Linking.openURL('https://www.youtube.com/watch?v=' + v.id).catch(() => {})} alt={v.title} />
                <Txt>{v.title}</Txt>
                <Txt muted>
                  Observed publication: {new Date(v.publishedAt).toLocaleDateString('en-US')}
                </Txt>
              </View>
            ))}
          </Fold>
          <Fold title="Popular Topics" summary={report.videos.filter((v) => v.query.includes('YouTube popularity order')).length + ' popularity-ordered examples'}>
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
          <Fold title="Interesting Subtopics" summary={Math.max(0, report.queries.length - 1) + ' follow-up queries'}>
            <Txt muted>Generated search angles to investigate, not discovered trends.</Txt>
            {report.queries.slice(1).map((q) => (
              <Txt key={q}>{q}</Txt>
            ))}
          </Fold>
          <Fold title="Research Questions" summary="3 production prompts">
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
          <Fold title="Relevant Videos" summary={report.videos.length + ' returned videos'}>
            {report.videos.length > 1 && (
              <Choices label="Sort this sample" options={RESEARCH_SORT_OPTIONS} selected={[sort]} onChange={(values) => { const value = values[0]; if (value && isResearchVideoSort(value)) setSort(value); }} />
            )}
            <Txt muted>Sort order applies to the returned sample only. View and like counts are fetched from YouTube when available; unavailable counts are not estimated.</Txt>
            {!report.videos.length ? (
              <Empty
                title="No videos matched this search."
                action="Change filters"
                onPress={() => setReportId('')}
              />
            ) : (
              sortedReportVideos.map((v) => <VideoRow key={v.id} video={v} topic={topic} />)
            )}
          </Fold>
          {report.videos.length > 0 && (
            <Action secondary onPress={() => router.push({ pathname: '/trend-intelligence', params: linkedIdea ? { topic: report.input.topic, idea: linkedIdea.id } : { topic: report.input.topic } })}>
              Explore more results with paginated YouTube search
            </Action>
          )}
        </>
      )}
      {!report && !busy && reports.length > 0 && (
        <Fold title="Recent research" summary={reports.length + ' saved runs'}>
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
