import { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Activity, ExternalLink } from 'lucide-react-native';
import {
  Action,
  BadgeText,
  Choices,
  Empty,
  Field,
  Heading,
  Page,
  Panel,
  ScreenIntro,
  Txt,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { palette as p } from '@/lib/theme';
import { isAllowedBrowserNavigation } from '@/lib/browser';
import type { ResearchActivityEvent, ResearchActivityFeedback } from '@/lib/types';

const ENGINES = [
  'YouTube Data API',
  'Firecrawl Search',
  'Publisher Feeds',
  'Wikimedia',
  'Internal Engine',
  'AI Provider Review',
] as const;
const STATUSES = ['running', 'success', 'partial', 'empty', 'error', 'skipped'] as const;
const TIME_RANGES = ['24 hours', '7 days', '30 days', 'All time'] as const;
const ACTIVITY_VIEW_STARTED_AT = Date.now();
const FEEDBACK: { value: ResearchActivityFeedback; label: string }[] = [
  { value: 'useful', label: 'Useful' },
  { value: 'irrelevant', label: 'Irrelevant' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'weak-source', label: 'Weak source' },
];

function when(value: number, fa: boolean): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.DateTimeFormat(fa ? 'fa-IR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function duration(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (value < 1000) return Math.round(value) + ' ms';
  return (value / 1000).toFixed(value < 10000 ? 1 : 0) + ' s';
}

function statusText(status: ResearchActivityEvent['status'], fa: boolean): string {
  if (!fa) return status.toUpperCase();
  const labels: Record<ResearchActivityEvent['status'], string> = {
    running: 'در حال اجرا',
    success: 'موفق',
    partial: 'ناقص',
    empty: 'بدون نتیجه',
    error: 'ناموفق',
    skipped: 'اجرا نشد',
  };
  return labels[status];
}

function engineText(engine: ResearchActivityEvent['engine'], fa: boolean): string {
  if (!fa) return engine;
  const labels: Record<ResearchActivityEvent['engine'], string> = {
    'YouTube Data API': 'جست‌وجوی API یوتیوب',
    'Firecrawl Search': 'جست‌وجوی Firecrawl',
    'Publisher Feeds': 'فیدهای ناشران',
    Wikimedia: 'ویکی‌مدیا',
    'Internal Engine': 'موتور تحلیل داخلی',
    'AI Provider Review': 'نظر دوم مدل‌های هوش مصنوعی',
  };
  return labels[engine];
}

function statusColor(status: ResearchActivityEvent['status']): string {
  if (status === 'success') return p.success;
  if (status === 'running') return p.cyan;
  if (status === 'error') return p.danger;
  return p.muted;
}

function FeedbackButton({
  eventId,
  resultId,
  current,
  value,
  label,
  onFeedback,
}: {
  eventId: string;
  resultId: string;
  current?: ResearchActivityFeedback;
  value: ResearchActivityFeedback;
  label: string;
  onFeedback: (eventId: string, resultId: string, feedback: ResearchActivityFeedback) => void;
}) {
  const selected = current === value;
  return (
    <Pressable
      onPress={() => onFeedback(eventId, resultId, value)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? p.accent : p.border,
        backgroundColor: selected ? p.surfaceAlt : p.surface,
        paddingHorizontal: 9,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: selected ? p.accent : p.muted, fontSize: 10, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function ActivityCard({
  event,
  expanded,
  onToggle,
  onFeedback,
  fa,
}: {
  event: ResearchActivityEvent;
  expanded: boolean;
  onToggle: () => void;
  onFeedback: (eventId: string, resultId: string, feedback: ResearchActivityFeedback) => void;
  fa: boolean;
}) {
  const completed = event.completedAt ? when(event.completedAt, fa) : (fa ? 'در حال اجرا' : 'Running');
  const summary = event.resultCount + (fa ? ' نتیجه' : ' results') +
    ' · ' + event.analyzedCount + (fa ? ' وارد تحلیل' : ' analyzed') +
    ' · ' + duration(event.durationMs);
  return (
    <Panel>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }}>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <BadgeText>{engineText(event.engine, fa)}</BadgeText>
            <Text style={{ color: statusColor(event.status), fontSize: 10, fontWeight: '800' }}>{statusText(event.status, fa)}</Text>
          </View>
          <Heading>{event.query || event.topic}</Heading>
          <Txt muted>{(fa ? 'موضوع: ' : 'Topic: ') + event.topic + (event.niche ? ' · ' + (fa ? 'نیچ: ' : 'Niche: ') + event.niche : '')}</Txt>
          <Txt muted>{when(event.startedAt, fa)} → {completed}</Txt>
          <Txt muted>{summary}</Txt>
          {event.error ? <Txt>{(fa ? 'خطا: ' : 'Error: ') + event.error}</Txt> : null}
          {event.status === 'running' ? <Txt muted>{fa ? 'درخواست واقعی آغاز شده و هنوز پایان نیافته است.' : 'A real request has started and has not completed yet.'}</Txt> : null}
        </View>
      </Pressable>
      {expanded ? (
        <View style={{ borderTopWidth: 1, borderTopColor: p.border, paddingTop: 12, gap: 12 }}>
          {event.engine === 'YouTube Data API' ? (
            <View style={{ gap: 8 }}>
              <Txt muted>
                {fa
                  ? 'این رخداد فقط عبارت‌های واقعی جست‌وجو و شمار نتایج را نگه می‌دارد. جزئیات خام ویدئوها در گزارش موقت یوتیوب با نگهداری ۲۹روزه باقی می‌ماند.'
                  : 'This event keeps the actual search query and result count only. Raw video details remain in the separate 29-day temporary YouTube report.'}
              </Txt>
              {event.reportId ? (
                <Action secondary onPress={() => router.push({
                  pathname: '/youtube',
                  params: { topic: event.topic, report: event.reportId },
                })}>{fa ? 'بازکردن نمونه خام یوتیوب' : 'Open temporary YouTube sample'}</Action>
              ) : null}
            </View>
          ) : null}
          {event.results.map((result) => (
            <View key={result.id} style={{ borderRadius: 13, borderWidth: 1, borderColor: p.border, padding: 11, gap: 7 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: p.text, fontSize: 12, fontWeight: '800', flex: 1 }}>{result.title}</Text>
                <Text style={{ color: p.accent, fontSize: 10, fontWeight: '800' }}>{result.relevanceScore}/100</Text>
              </View>
              <Txt muted>{result.sourceName}</Txt>
              {result.publishedAt ? <Txt muted>{when(Date.parse(result.publishedAt), fa)}</Txt> : null}
              {result.summary ? <Txt>{result.summary}</Txt> : null}
              <Txt muted>
                {(result.includedInAnalysis
                  ? (fa ? 'وارد تحلیل شد: ' : 'Included in analysis: ')
                  : (fa ? 'وارد تحلیل نشد: ' : 'Not included: ')) + result.decisionReason}
              </Txt>
              <Txt muted>
                {result.sourceAssessment === 'configured-feed'
                  ? (fa ? 'منبع در تنظیمات فید انتخاب شده؛ اعتبار مستقل آن جداگانه تأیید نشده است.' : 'Configured publisher feed; independent source credibility has not been verified here.')
                  : (fa ? 'اعتبار منبع به‌صورت مستقل امتیازدهی نشده است.' : 'Source credibility has not been independently rated.')}
                {' · ' + (fa ? 'ارتباط موضوعی' : 'Topic relevance')}
              </Txt>
              {result.url && isAllowedBrowserNavigation(result.url) ? (
                <Action secondary icon={ExternalLink} onPress={() => {
                  void Linking.openURL(result.url!).catch(() => undefined);
                }}>{fa ? 'بازکردن منبع' : 'Open source'}</Action>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {FEEDBACK.map((item) => (
                  <FeedbackButton
                    key={item.value}
                    eventId={event.id}
                    resultId={result.id}
                    current={result.feedback}
                    value={item.value}
                    label={fa ? ({
                      useful: 'مفید',
                      irrelevant: 'بی‌ربط',
                      duplicate: 'تکراری',
                      'weak-source': 'منبع ضعیف',
                    } as const)[item.value] : item.label}
                    onFeedback={onFeedback}
                  />
                ))}
              </View>
            </View>
          ))}
          {event.warnings.length ? (
            <View style={{ gap: 5 }}>
              <Txt muted>{fa ? 'هشدارها و محدودیت‌ها' : 'Warnings and limitations'}</Txt>
              {event.warnings.map((warning, index) => <Txt key={index}>{warning}</Txt>)}
            </View>
          ) : null}
          {!event.results.length && event.engine !== 'YouTube Data API' ? (
            <Txt muted>{fa ? 'این اجرا نتیجه‌ای برای نمایش نداشت.' : 'No result records were returned by this operation.'}</Txt>
          ) : null}
        </View>
      ) : null}
      <Action secondary onPress={onToggle}>{expanded ? (fa ? 'بستن جزئیات' : 'Hide details') : (fa ? 'جزئیات تحقیق' : 'View activity details')}</Action>
    </Panel>
  );
}

export default function ResearchActivityScreen() {
  const events = useScout((state) => state.data.researchActivity);
  const setFeedback = useScout((state) => state.setResearchActivityFeedback);
  const language = useScout((state) => state.data.preferences.uiLanguage ?? 'fa');
  const fa = language === 'fa';
  const [engine, setEngine] = useState('All engines');
  const [status, setStatus] = useState('All statuses');
  const [niche, setNiche] = useState('All niches');
  const [timeRange, setTimeRange] = useState<(typeof TIME_RANGES)[number]>('7 days');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string>();
  const refreshTime = timeRange === '24 hours' ? 86400000
    : timeRange === '7 days' ? 7 * 86400000
      : timeRange === '30 days' ? 30 * 86400000 : Number.POSITIVE_INFINITY;
  const niches = useMemo(() => ['All niches', ...new Set(events.map((event) => event.niche).filter(Boolean).sort())], [events]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const since = ACTIVITY_VIEW_STARTED_AT - refreshTime;
    return events.filter((event) =>
      (engine === 'All engines' || event.engine === engine) &&
      (status === 'All statuses' || event.status === status) &&
      (niche === 'All niches' || event.niche === niche) &&
      event.startedAt >= since &&
      (!query || [event.query, event.topic, event.niche, event.engine, ...event.results.map((item) => item.title + ' ' + item.sourceName)]
        .join(' ').toLocaleLowerCase().includes(query)),
    ).sort((a, b) => b.startedAt - a.startedAt);
  }, [events, engine, status, niche, refreshTime, search]);
  const header = (
    <View style={{ gap: 14, paddingBottom: 14 }}>
      <ScreenIntro
        eyebrow="RESEARCH ACTIVITY"
        title={fa ? 'تاریخچه و نظارت تحقیق' : 'Research activity'}
        subtitle={fa
          ? 'درخواست‌های واقعی API، جست‌وجوی وب، فیدها و تحلیل داخلی؛ همراه با زمان، نتیجه و دلیل تصمیم‌ها.'
          : 'Real API requests, web searches, feeds and internal analysis, with timings, outcomes and decision reasons.'}
        icon={Activity}
      />
      <Panel>
        <Field
          label={fa ? 'عبارت جست‌وجو یا عملیات، موضوع و منابع' : 'Search queries, operations, topics and sources'}
          value={search}
          onChange={setSearch}
          placeholder={fa ? 'عبارت جست‌وجو یا نام منبع' : 'Search phrase or source name'}
        />
        <Choices
          label={fa ? 'موتور' : 'Engine'}
          options={['All engines', ...ENGINES]}
          selected={[engine]}
          onChange={(values) => setEngine(values[0] ?? 'All engines')}
        />
        <Choices
          label={fa ? 'وضعیت اجرا' : 'Run status'}
          options={['All statuses', ...STATUSES]}
          selected={[status]}
          onChange={(values) => setStatus(values[0] ?? 'All statuses')}
        />
        <Choices
          label={fa ? 'نیچ' : 'Niche'}
          options={niches}
          selected={[niche]}
          onChange={(values) => setNiche(values[0] ?? 'All niches')}
        />
        <Choices
          label={fa ? 'بازه زمانی' : 'Time range'}
          options={[...TIME_RANGES]}
          selected={[timeRange]}
          onChange={(values) => setTimeRange((TIME_RANGES.find((value) => value === values[0]) ?? '7 days'))}
        />
        <Txt muted>{filtered.length} / {events.length} {fa ? 'رخداد ثبت‌شده' : 'recorded activities'}</Txt>
      </Panel>
      {!events.length ? (
        <Panel>
          <Empty
            title={fa ? 'هنوز تحقیقی ثبت نشده است' : 'No research activity yet'}
            action={fa ? 'بازگشت به فرصت‌ها' : 'Back to opportunities'}
            onPress={() => router.push('/(tabs)/opportunities')}
            icon={Activity}
          />
        </Panel>
      ) : null}
    </View>
  );
  return (
    <Page scroll={false} title={fa ? 'فعالیت تحقیق' : 'Research activity'} showBack>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ActivityCard
            event={item}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId((current) => current === item.id ? undefined : item.id)}
            onFeedback={(eventId, resultId, value) => { void setFeedback(eventId, resultId, value); }}
            fa={fa}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={events.length ? (
          <Panel>
            <Empty
            title={fa ? 'مطابق فیلترها نتیجه‌ای نیست' : 'No matching activity'}
            action={fa ? 'پاک‌کردن فیلترها' : 'Clear filters'}
            onPress={() => {
              setSearch('');
              setEngine('All engines');
              setStatus('All statuses');
              setTimeRange('7 days');
              setNiche('All niches');
            }}
          />
          </Panel>
        ) : undefined}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}
        initialNumToRender={7}
        maxToRenderPerBatch={7}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews
      />
    </Page>
  );
}
