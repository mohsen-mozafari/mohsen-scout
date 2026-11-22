import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Search } from 'lucide-react-native';

import { router } from 'expo-router';
import {
  Page, Panel, Heading, Txt, Action, Fold, Field, styles,
  SourceHeading, BadgeText,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { palette as p } from '@/lib/theme';
import { useShallow } from 'zustand/react/shallow';
import { uid, type Idea } from '@/lib/types';
import { SPACE_NICHES, getCachedSpaceNews } from '@/lib/space';
import { getTopicDossier } from '@/lib/topic-dossier';
import { VideoRow } from '@/components/VideoRow';
import {
  buildUnifiedDashboardBrief, collectEngineVideoEvidence, engineReviewCacheKey,
  findCachedEngineReview, rankDashboardIdeas, selectDashboardFeaturedIdeas, selectDashboardVideos,
} from '@/lib/dashboard';
import {
  engineV2ReviewPrompt, fingerprintText, getFreeModels, getOpenRouterDailyQuota,
  getStructuredOpinion, localDateKey, nextOpenRouterUsage, selectFreeModel,
  validateEngineV2Opinion, type EngineV2Opinion, type YouTubeSampleVideo,
} from '@/lib/api';
import { getKey } from '@/lib/vault';
import { ResearchOverviewChart } from '@/components/ResearchOverviewChart';
import { recordRuntimeFinish, recordRuntimeStart, runtimeErrorHint, useRuntimeMetrics } from '@/lib/runtime-metrics';
import type { UnifiedBrief } from '@/lib/engine-v2-adapter';

type BriefState = { id: string; updatedAt: number; cached: boolean; brief: UnifiedBrief };

const automaticReviewStarted = new Set<string>();
const NO_IDEAS: Idea[] = [];

function EngineStatusStrip({ brief, updatedAt, cached, totalMs, fa }: {
  brief?: UnifiedBrief;
  updatedAt?: number;
  cached?: boolean;
  totalMs?: number;
  fa: boolean;
}) {
  const coverage = (brief?.coverage ?? [])
    .map((entry) => {
      const label = entry.source === 'news'
        ? (fa ? 'خبر' : 'News')
        : entry.source === 'youtube'
          ? 'YouTube'
          : (fa ? 'ویکی' : 'Wiki');
      const fetched = Number.isFinite(entry.fetched) ? entry.fetched : 0;
      const normalized = Number.isFinite(entry.normalized) ? entry.normalized : 0;
      return label + ' ' + normalized + '/' + fetched;
    })
    .join(' · ');
  const state = !brief
    ? (fa ? 'در انتظار' : 'pending')
    : cached
      ? (fa ? 'کششده' : 'cached')
      : brief.fallback
        ? (fa ? 'حالت جایگزین' : 'fallback')
        : (fa ? 'تازه' : 'fresh');
  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(fa ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' })
    : '';
  const timing = typeof totalMs === 'number' && Number.isFinite(totalMs) && totalMs > 0
    ? (fa ? ' · موتور ' : ' · engine ') + Math.round(totalMs) + (fa ? ' میلیثانیه' : ' ms')
    : '';
  return (
    <Txt muted>
      {(time ? (fa ? 'آخرین بهروزرسانی ' : 'Updated ') + time + ' · ' : '') +
        (coverage || (fa ? 'پوشش منبعی ثبت نشده' : 'No source coverage yet')) +
        timing +
        ' · ' + (fa ? 'موتور: ' : 'Engine: ') + state}
    </Txt>
  );
}

function EngineAIReview({ topic, brief, idea }: {
  topic: string;
  brief?: UnifiedBrief;
  idea?: Idea;
}) {
  const preferences = useScout(useShallow((state) => ({
    model: state.data.preferences.model,
    hybridIntelligence: state.data.preferences.hybridIntelligence,
    uiLanguage: state.data.preferences.uiLanguage,
  })));
  const opinions = useScout((state) => state.data.opinions);
  const fa = preferences.uiLanguage === 'fa';

  // The single unified brief that produced the chart and ideas also supplies
  // topics, scores and real evidence to the second, optional AI review.
  const prompt = useMemo(() => {
    if (!brief?.result?.topics?.length) return '';
    return engineV2ReviewPrompt({
      topic,
      result: brief.result,
      ...(idea ? {
        idea: {
          titleSuggestion: idea.topic,
          angle: idea.concept,
          why: idea.engineV2Why ?? idea.engineScoreReason ?? idea.decision ?? '',
        },
      } : {}),
      language: fa ? 'fa' : 'en',
    });
  }, [brief, topic, idea, fa]);
  const fingerprint = useMemo(() => prompt ? fingerprintText(prompt) : '', [prompt]);
  const visibleCacheKey = preferences.model && prompt
    ? engineReviewCacheKey(preferences.model, prompt, fingerprint)
    : '';
  const savedReview = useMemo(() => {
    if (!preferences.model || !prompt) return undefined;
    const cached = findCachedEngineReview(opinions, preferences.model, prompt, fingerprint);
    if (!cached) return undefined;
    try {
      return {
        opinion: validateEngineV2Opinion(JSON.parse(cached.text) as unknown),
        model: cached.model,
        createdAt: cached.createdAt,
      };
    } catch {
      return undefined;
    }
  }, [opinions, preferences.model, prompt, fingerprint]);

  const [reviewState, setReviewState] = useState<{ key: string; opinion?: EngineV2Opinion }>({ key: visibleCacheKey });
  const [externalKeyAvailable, setExternalKeyAvailable] = useState<boolean | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewStatus, setReviewStatus] = useState('');
  const reviewInFlightRef = useRef(false);
  const review = reviewState.key === visibleCacheKey ? reviewState.opinion : undefined;

  const runReview = async (automaticTriggerKey?: string) => {
    if (reviewInFlightRef.current) {
      if (automaticTriggerKey) automaticReviewStarted.delete(automaticTriggerKey);
      return;
    }
    if (!prompt) return;
    reviewInFlightRef.current = true;
    recordRuntimeStart('AI');
    setReviewBusy(true);
    setReviewStatus('');
    let reviewSucceeded = false;
    let reviewFromCache = false;
    let reviewSkipped = false;
    let reviewFailure = '';
    try {
      // Give the native UI a frame to paint progress before network work.
      await new Promise<void>((resolve) => setTimeout(resolve, 32));
      const key = await getKey('openrouter');
      setExternalKeyAvailable(Boolean(key));
      if (!key) {
        reviewSkipped = true;
        throw new Error('OpenRouter key unavailable.');
      }

      const current = useScout.getState().data;
      const storedModel = current.preferences.model;
      const cachedStoredModel = findCachedEngineReview(current.opinions, storedModel ?? '', prompt, fingerprint);
      if (cachedStoredModel && storedModel) {
        try {
          setReviewState({
            key: engineReviewCacheKey(storedModel, prompt, fingerprint),
            opinion: validateEngineV2Opinion(JSON.parse(cachedStoredModel.text) as unknown),
          });
          reviewSucceeded = true;
          reviewFromCache = true;
          setReviewStatus(fa ? 'نظر ذخیرهشده بارگذاری شد.' : 'Saved AI review loaded.');
          return;
        } catch {
          // Ignore a malformed/legacy cached review and request a fresh one.
        }
      }

      const models = await getFreeModels();
      const model = selectFreeModel(models, storedModel ?? '');
      if (!model) {
        reviewSkipped = true;
        throw new Error('No free model available.');
      }

      if (model !== storedModel) {
        await useScout.getState().commit((data) => ({
          ...data,
          preferences: { ...data.preferences, model },
        }));
      }

      const cacheKey = engineReviewCacheKey(model, prompt, fingerprint);
      const cached = findCachedEngineReview(useScout.getState().data.opinions, model, prompt, fingerprint);
      if (cached) {
        try {
          setReviewState({ key: cacheKey, opinion: validateEngineV2Opinion(JSON.parse(cached.text) as unknown) });
          reviewSucceeded = true;
          reviewFromCache = true;
          setReviewStatus(fa ? 'نظر ذخیرهشده بارگذاری شد.' : 'Saved AI review loaded.');
          return;
        } catch {
          // Request a fresh structured review below.
        }
      }

      const quota = model.toLowerCase().endsWith(':free')
        ? await getOpenRouterDailyQuota(key).catch(() => undefined)
        : undefined;
      if (quota && quota.remaining <= 0) {
        reviewSkipped = true;
        throw new Error('OpenRouter free-model daily quota is exhausted (' + quota.used + '/' + quota.limit + ' UTC).');
      }
      const response = await getStructuredOpinion(key, model, prompt, async () => {
        const currentPreferences = useScout.getState().data.preferences;
        const usage = nextOpenRouterUsage(
          currentPreferences.openRouterUsageDay,
          currentPreferences.openRouterRequestsToday,
          localDateKey(),
          quota?.limit ?? (model.toLowerCase().endsWith(':free') ? 50 : 10000),
          quota?.used,
        );
        await useScout.getState().commit((data) => ({
          ...data,
          preferences: {
            ...data.preferences,
            model,
            ...usage,
            ...(quota ? {
              openRouterDailyLimit: quota.limit,
              openRouterDailyUsed: quota.used + 1,
              openRouterDailyRemaining: Math.max(0, quota.remaining - 1),
              openRouterQuotaCheckedAt: Date.now(),
            } : {}),
          },
        }));
      });
      const opinion = { id: uid(), ideaId: cacheKey, text: JSON.stringify(response), model, createdAt: Date.now() };
      setReviewState({ key: cacheKey, opinion: response });
      await useScout.getState().commit((data) => ({
        ...data,
        opinions: [opinion, ...data.opinions],
      }));
      reviewSucceeded = true;
      setReviewStatus(fa ? 'نظر ساختاریافته ذخیره شد.' : 'Structured AI review saved.');
    } catch (error) {
      reviewFailure = error instanceof Error ? error.message : String(error);
      // Never surface a scary/empty error: the engine-only result stays intact.
      setReviewStatus(reviewSkipped
        ? (fa
          ? 'بازبینی AI اختیاری است و انجام نشد؛ نتیجه موتور محلی بدون تغییر است.'
          : 'Optional AI review was skipped — engine result unchanged.')
        : (fa
          ? 'بازبینی AI در دسترس نیست؛ نتیجه موتور محلی بدون تغییر است.'
          : 'AI review unavailable — engine result unchanged.'));
    } finally {
      // A missing optional key or an exhausted free quota is a neutral skip,
      // never a failure recorded against Session Health.
      recordRuntimeFinish(
        'AI',
        reviewFromCache ? 'partial' : reviewSucceeded ? 'success' : reviewSkipped ? 'skipped' : 'error',
        reviewSkipped ? '' : reviewFailure,
      );
      reviewInFlightRef.current = false;
      setReviewBusy(false);
      // Always release the auto-trigger key so it cannot accumulate forever.
      if (automaticTriggerKey) automaticReviewStarted.delete(automaticTriggerKey);
    }
  };

  const runReviewRef = useRef(runReview);
  useEffect(() => {
    runReviewRef.current = runReview;
  });

  useEffect(() => {
    if (!preferences.hybridIntelligence || savedReview || externalKeyAvailable === false || !prompt.trim()) return;
    const triggerKey = fingerprintText(prompt + '\n' + fingerprint);
    if (automaticReviewStarted.has(triggerKey) || reviewInFlightRef.current) return;
    automaticReviewStarted.add(triggerKey);
    void getKey('openrouter').then((key) => {
      setExternalKeyAvailable(Boolean(key));
      if (!key) {
        automaticReviewStarted.delete(triggerKey);
        return;
      }
      void runReviewRef.current(triggerKey);
    }).catch(() => automaticReviewStarted.delete(triggerKey));
  }, [preferences.hybridIntelligence, savedReview, prompt, fingerprint, externalKeyAvailable]);

  const decisionLabel = review
    ? review.decision === 'develop'
      ? (fa ? 'توسعه ایده' : 'Develop')
      : review.decision === 'gather_more'
        ? (fa ? 'جمعآوری شواهد بیشتر' : 'Gather more evidence')
        : (fa ? 'بازتعریف موضوع' : 'Reframe')
    : '';

  return (
    <View style={{ gap: 8 }}>
      <BadgeText>{review ? 'SECOND OPINION · AI' : 'SECOND OPINION · OPTIONAL'}</BadgeText>
      <Heading>{fa ? 'بازبینی مستقل با AI' : 'Independent AI review'}</Heading>
      <Txt muted>{fa
        ? 'مدل فقط خلاصه امتیاز موضوعات و شواهد واقعی موتور محلی را میبیند؛ پیوند خام و عدد ساختگی ارسال نمیشود. نتیجه موتور تغییری نمیکند.'
        : 'The model sees only compact topic scores and the real evidence already used by the engine — never raw links or invented numbers. The engine result stays unchanged.'}</Txt>
      {reviewBusy ? (
        <Txt muted>{fa ? 'دریافت بازبینی AI؛ میتوانی همزمان در بخشهای مختلف کار کنی.' : 'Getting the AI review. You can keep using other sections.'}</Txt>
      ) : null}
      {review ? (
        <View style={{ gap: 6 }}>
          <BadgeText>{decisionLabel}</BadgeText>
          {review.usefulFindings.map((finding) => <Txt key={finding}>{'• ' + finding}</Txt>)}
          <Txt muted>{(fa ? 'نقد مخالف: ' : 'Counter-check: ') + review.counterCritique}</Txt>
          <Txt muted>{(fa ? 'اقدام بعدی: ' : 'Next action: ') + review.nextAction}</Txt>
          <Txt muted>{(fa ? 'داده مفقود: ' : 'Missing data: ') + review.missingData}</Txt>
          {savedReview ? <Txt muted>{'Model: ' + savedReview.model + ' · ' + new Date(savedReview.createdAt).toLocaleString()}</Txt> : null}
        </View>
      ) : (
        <Txt muted>{fa
          ? 'تا زمان دردسترس بودن بازبینی AI، نتیجه موتور محلی بدون تغییر نمایش داده میشود.'
          : 'The engine result is shown unchanged until an AI review is available.'}</Txt>
      )}
      {reviewStatus ? <Txt muted>{reviewStatus}</Txt> : null}
      <Action busy={reviewBusy} disabled={!prompt} onPress={() => void runReview()}>
        {fa ? 'دریافت نظر دوم' : 'Get second opinion'}
      </Action>
    </View>
  );
}

export default function DiscoveryDashboard() {
  const ready = useScout((state) => state.ready);
  if (!ready) {
    return (
      <Page title="YouTube Trend Scout" eyebrow="YOUTUBE INTELLIGENCE">
        <Txt muted>Loading your local research workspace…</Txt>
      </Page>
    );
  }
  return <DiscoveryDashboardReady />;
}

function DiscoveryDashboardReady() {
  const preferences = useScout(useShallow((state) => ({
    uiLanguage: state.data.preferences.uiLanguage ?? 'fa',
    lastInput: state.data.preferences.lastInput,
    selectedSpaceNiche: state.data.preferences.selectedSpaceNiche,
    customSpaceNiche: state.data.preferences.customSpaceNiche,
    spaceInterestLanguage: state.data.preferences.spaceInterestLanguage ?? 'en',
    spaceNewsSources: state.data.preferences.spaceNewsSources,
    region: state.data.preferences.region,
    languages: state.data.preferences.languages,
  })));
  const reports = useScout((state) => state.data.reports);
  const allIdeas = useScout((state) => state.data.ideas);
  const storedVideos = useScout((state) => state.data.videos);
  const feedRegistry = useScout((state) => state.data.feedRegistry);
  const runtimeMetrics = useRuntimeMetrics();
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [briefState, setBriefState] = useState<BriefState>();
  const [analysisError, setAnalysisError] = useState('');
  const [dashboardNow] = useState(() => Date.now());
  const [quickTopicDraft, setQuickTopicDraft] = useState<string | undefined>(undefined);

  const fa = preferences.uiLanguage === 'fa';
  const label = (english: string, persian: string) => fa ? persian : english;

  const niche = SPACE_NICHES.find((item) => item.id === preferences.selectedSpaceNiche);
  const discoveryTopic = preferences.selectedSpaceNiche === 'all'
    ? 'Space science and exploration'
    : preferences.selectedSpaceNiche === 'custom'
      ? preferences.customSpaceNiche
      : niche?.topic ?? 'Space science and exploration';

  const engineNews = useMemo(
    () => getCachedSpaceNews(feedRegistry, preferences.spaceNewsSources),
    [feedRegistry, preferences.spaceNewsSources],
  );

  const latestReport = reports[0];
  const latestReportId = latestReport?.id ?? '';
  const latestReportSignature = latestReport
    ? latestReport.videos.map((video) => video.id + ':' + video.fetchedAt).join('|')
    : '';
  const latestReportVideoRecords = latestReport?.videos;
  // Data layer enforces ENGINE_VIDEO_EVIDENCE_CAP (300); 300 is passed explicitly.
  const engineVideoEvidence = useMemo(
    () => collectEngineVideoEvidence(reports, storedVideos, dashboardNow, 300),
    [reports, storedVideos, dashboardNow],
  );
  const engineVideoSignature = useMemo(
    () => engineVideoEvidence.map((video) => video.id + ':' + video.fetchedAt + ':' + video.title).join('|'),
    [engineVideoEvidence],
  );
  const engineVideoSamples = useMemo<YouTubeSampleVideo[]>(() => engineVideoEvidence.map((video) => ({
    id: video.id,
    title: video.title,
    description: video.description,
    channel: video.channel,
    channelId: '',
    publishedAt: video.publishedAt,
    thumbnailUrl: '',
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    channelSubscriberCount: null,
    channelVideoCount: null,
    url: 'https://www.youtube.com/watch?v=' + video.id,
  })), [engineVideoEvidence]);

  // Exactly ONE analysis pass, deferred exactly as before. Every number on
  // this screen reads the single unified brief stored below.
  useEffect(() => {
    if (!latestReportId || !latestReportSignature || !engineVideoSignature) return;
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      const report = useScout.getState().data.reports.find((item) => item.id === latestReportId);
      if (!report || !engineVideoSamples.length) return;
      recordRuntimeStart('Engine');
      try {
        const reportWiki = getTopicDossier(report.input.topic)?.wiki;
        const dashboard = buildUnifiedDashboardBrief(
          report.input.topic,
          engineNews,
          engineVideoSamples,
          {
            wiki: reportWiki,
            now: dashboardNow,
            niche: preferences.selectedSpaceNiche,
            language: preferences.uiLanguage ?? 'fa',
            region: report.input.region,
            languages: report.input.languages,
            reportId: report.id,
          },
        );
        if (!active) return;
        recordRuntimeFinish(
          'Engine',
          dashboard.fallback ? 'partial' : 'success',
          dashboard.fallback ? 'Engine fell back to cached or reduced evidence.' : '',
        );
        setAnalysisError('');
        setBriefState((previous) => {
          // On fallback or failure keep the last good brief and mark it cached
          // instead of blanking the page.
          if (dashboard.fallback && previous) {
            return previous.cached ? previous : { ...previous, cached: true };
          }
          if (!dashboard.result) return previous;
          return {
            id: report.id,
            updatedAt: Date.now(),
            cached: dashboard.fallback,
            brief: {
              result: dashboard.result,
              ideas: dashboard.ideas,
              coverage: dashboard.coverage,
              timings: dashboard.timings,
              warnings: dashboard.warnings,
              fallback: dashboard.fallback,
              angles: dashboard.angles ?? [],
            },
          };
        });
      } catch (error) {
        // Keep the last good brief; the saved report and videos remain intact.
        recordRuntimeFinish('Engine', 'error', error instanceof Error ? error.message : String(error));
        if (active) setAnalysisError('The latest local analysis could not be completed. The cached brief and saved report remain available.');
      }
    }, 160);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    latestReportId, latestReportSignature, engineVideoSignature, engineVideoSamples,
    engineNews, preferences.uiLanguage, preferences.selectedSpaceNiche, dashboardNow,
  ]);

  const briefForReview = briefState?.brief;
  const briefIsCached = Boolean(briefState && (briefState.cached || briefState.id !== latestReportId));
  const chartTopic = latestReport?.input.topic ?? preferences.lastInput?.topic ?? discoveryTopic;
  const rankedIdeas = useMemo(() => rankDashboardIdeas(briefForReview?.ideas ?? NO_IDEAS), [briefForReview]);
  const bestIdea = selectDashboardFeaturedIdeas(allIdeas, 1)[0];
  const bestIdeaForReview = bestIdea && briefForReview?.ideas.some((idea) => idea.id === bestIdea.id)
    ? bestIdea
    : undefined;
  const pageOneIdeas = rankedIdeas.slice(0, 5);

  const completedOperations = runtimeMetrics.succeeded + runtimeMetrics.partial + runtimeMetrics.failed;
  const sessionSuccessRate = completedOperations
    ? Math.round(runtimeMetrics.succeeded * 100 / completedOperations)
    : undefined;
  const feedHealth = useMemo(() => ({
    registered: feedRegistry.length,
    healthy: feedRegistry.filter((item) => item.status === 'healthy').length,
    stale: feedRegistry.filter((item) => item.status === 'stale').length,
    unavailable: feedRegistry.filter((item) => item.status === 'unavailable').length,
    unknown: feedRegistry.filter((item) => item.status === 'unknown').length,
    cachedItems: feedRegistry.reduce((sum, item) => sum + item.cachedItems.length, 0),
  }), [feedRegistry]);
  const advisoryWarnings = useMemo(
    () => Array.from(new Set(briefForReview?.warnings ?? [])).filter(Boolean).slice(0, 4),
    [briefForReview],
  );
  const totalBriefMs = useMemo(
    () => (briefForReview?.timings ?? []).reduce((sum, timing) =>
      sum + (Number.isFinite(timing.ms) ? timing.ms : 0), 0),
    [briefForReview],
  );

  const quickTopic = quickTopicDraft ?? preferences.lastInput?.topic ?? latestReport?.input.topic ?? '';
  const nicheTerms = useMemo<string[]>(() => {
    if (preferences.selectedSpaceNiche === 'custom') {
      return preferences.customSpaceNiche.split(/[,;\n]+/).map((term) => term.trim()).filter(Boolean);
    }
    return preferences.selectedSpaceNiche === 'all' ? [] : niche?.keywords ? [...niche.keywords] : [];
  }, [preferences.selectedSpaceNiche, preferences.customSpaceNiche, niche]);
  const feedTopic = preferences.selectedSpaceNiche === 'all'
    ? latestReport?.input.topic ?? discoveryTopic
    : discoveryTopic;
  const feedVideos = useMemo(
    () => selectDashboardVideos(latestReportVideoRecords ?? [], feedTopic, nicheTerms, dashboardNow, 12),
    [latestReportVideoRecords, feedTopic, nicheTerms, dashboardNow],
  );

  // Stable element identity keeps ResearchOverviewChart's memo effective.
  const secondOpinion = useMemo(
    () => briefForReview
      ? <EngineAIReview topic={chartTopic} brief={briefForReview} idea={bestIdeaForReview} />
      : undefined,
    [briefForReview, chartTopic, bestIdeaForReview],
  );

  return (
    <Page
      title={fa ? 'دستیار ترند یوتیوب' : 'YouTube Trend Scout'}
      eyebrow={fa ? 'تحلیل هوشمند YouTube' : 'YOUTUBE INTELLIGENCE'}
      subtitle={fa
        ? 'موضوعی مشخص وارد کن؛ نمونهٔ واقعی نتایج YouTube و محدودیت‌های داده را بررسی کن.'
        : 'Enter a focused topic and inspect real YouTube results, evidence quality and sample limits.'}
    >
      <View style={{ gap: 15 }}>
        <EngineStatusStrip
          brief={briefForReview}
          updatedAt={briefState?.updatedAt}
          cached={briefIsCached}
          totalMs={totalBriefMs}
          fa={fa}
        />
        {analysisError ? <Txt muted>{analysisError}</Txt> : null}
        <ResearchOverviewChart
          ideas={allIdeas}
          topic={chartTopic}
          language={preferences.uiLanguage ?? 'fa'}
          secondOpinion={secondOpinion}
        />

        <Panel>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <BadgeText>{label('REAL IDEAS FROM THIS BRIEF', 'ایدههای واقعی از این تحلیل')}</BadgeText>
              {briefIsCached ? <BadgeText>{label('CACHED BRIEF', 'تحلیل کششده')}</BadgeText> : null}
            </View>
            {pageOneIdeas.length ? pageOneIdeas.map((idea) => {
              const why = (idea.engineV2Why ?? idea.engineScoreReason ?? idea.decision ?? idea.concept ?? '').trim();
              return (
                <Pressable
                  key={idea.id}
                  onPress={() => router.push({ pathname: '/detail', params: { idea: idea.id } })}
                  accessibilityRole="button"
                  style={styles.softCard}
                >
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <SourceHeading>{idea.topic}</SourceHeading>
                      {typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore)
                        ? <Text style={{ color: p.accent, fontSize: 12, fontWeight: '800' }}>{idea.engineScore}/100</Text>
                        : null}
                    </View>
                    {why ? <Txt>{why}</Txt> : null}
                    {(idea.engineV2Evidence ?? []).slice(0, 2).map((item, index) => {
                      const views = typeof item.views === 'number' && Number.isFinite(item.views) && item.views > 0
                        ? new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(Math.round(item.views)) + (fa ? ' بازدید' : ' views')
                        : '';
                      const line = [item.title, item.source, views].filter(Boolean).join(' · ');
                      return <Txt muted key={index}>{line}</Txt>;
                    })}
                    {(idea.engineV2Claims ?? []).slice(0, 1).map((claim, index) => (
                      <Txt muted key={index}>{(fa ? 'ادعای مستند: ' : 'Source claim: ') + claim.text + ' · ' + claim.source}</Txt>
                    ))}
                    <Txt muted>{fa ? 'برای جزئیات کامل لمس کن' : 'Tap for the full breakdown'}</Txt>
                  </View>
                </Pressable>
              );
            }) : (
              <Txt muted>{label(
                'No evidence-backed ideas are available yet. Run a YouTube research pass to create them.',
                'هنوز ایدهای مبتنی بر شواهد در دسترس نیست. برای ساخت آنها یک تحقیق YouTube اجرا کن.',
              )}</Txt>
            )}
          </View>
        </Panel>

        <Panel variant="hero">
          <View style={{ gap: 11 }}>
            <BadgeText>{fa ? 'شروع تحقیق' : 'START A RESEARCH RUN'}</BadgeText>
            <Heading>{fa ? 'موضوع ویدئوی بعدیات را پیدا کن' : 'Find your next video topic'}</Heading>
            <Txt muted>{fa
              ? 'جستوجو فقط پس از اقدام تو انجام میشود. نتایج نامرتبط حذف میشوند و موتور ایده فقط از شواهد همین نمونه استفاده میکند.'
              : 'Search runs only after you start it. Weakly related results are excluded, and ideas are tied to evidence in the returned sample.'}</Txt>
            <Field
              label={fa ? 'موضوع یا کلیدواژه' : 'Topic or keyword'}
              value={quickTopic}
              onChange={(value) => setQuickTopicDraft(value)}
              placeholder={fa ? 'مثلاً هوش مصنوعی در تدوین ویدئو' : 'e.g. AI video editing workflows'}
            />
            <Action icon={Search} disabled={!quickTopic.trim()}
              onPress={() => router.push({ pathname: '/youtube', params: { topic: quickTopic.trim() } })}>
              {fa ? 'شروع تحقیق YouTube' : 'Start YouTube research'}
            </Action>
            {latestReport ? (
              <View style={{ gap: 7 }}>
                <Txt muted>
                  {(fa ? 'آخرین نمونه: ' : 'Latest sample: ') + latestReport.input.topic + ' · ' +
                    latestReport.videos.length + (fa ? ' ویدئو · ' : ' videos · ') +
                    new Date(latestReport.createdAt).toLocaleString(fa ? 'fa-IR' : 'en-US')}
                </Txt>
                <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: latestReport.input.topic, report: latestReport.id } })}>
                  {fa ? 'مشاهده آخرین تحقیق' : 'Review latest research'}
                </Action>
              </View>
            ) : (
              <Txt muted>{fa
                ? 'هنوز تحقیقی اجرا نشده؛ با بازکردن داشبورد هیچ درخواست YouTube یا مصرف سهمیهای انجام نمیشود.'
                : 'No research run yet. Opening the dashboard does not call YouTube or consume API quota.'}</Txt>
            )}
          </View>
        </Panel>

        <Fold
          title={fa ? 'تحقیق و نتایج ذخیرهشده' : 'Recent research and saved results'}
          summary={reports.length + ' reports · ' + allIdeas.length + ' saved ideas'}
        >
          <View style={{ gap: 12 }}>
            {feedVideos.length ? (
              <View style={{ gap: 8 }}>
                <Heading>{fa ? 'ویدئوهای مرتبط' : 'Related videos'}</Heading>
                {feedVideos.slice(0, 5).map((video) => <VideoRow key={video.id} video={video} topic={feedTopic} />)}
              </View>
            ) : <Txt muted>{fa
              ? 'هیچ ویدئوی ذخیرهای با این تمرکز مطابقت نداشت.'
              : 'No saved video matched this focus. Unrelated results are intentionally hidden.'}</Txt>}
            {reports.length ? (
              <View style={{ gap: 7 }}>
                <Heading>{fa ? 'اجراهای ذخیرهشده' : 'Saved research runs'}</Heading>
                {reports.slice(0, 4).map((report) => (
                  <Action key={report.id} secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: report.input.topic, report: report.id } })}>
                    {report.input.topic + ' · ' + new Date(report.createdAt).toLocaleDateString(fa ? 'fa-IR' : 'en-US')}
                  </Action>
                ))}
              </View>
            ) : null}
          </View>
        </Fold>

        {briefForReview ? (
          <Fold
            title={fa ? 'یادداشتهای موتور و زمانبندی' : 'Engine notes and timing'}
            summary={(briefForReview.angles?.length ?? 0) + ' angles · ' + Math.round(totalBriefMs) + ' ms'}
          >
            <View style={{ gap: 8 }}>
              {briefForReview.angles?.length
                ? briefForReview.angles.slice(0, 6).map((angle, index) => <Txt muted key={index}>{angle}</Txt>)
                : <Txt muted>{label('No engine angles were produced for this brief.', 'برای این تحلیل زاویهای تولید نشد.')}</Txt>}
              {advisoryWarnings.length ? (
                <View style={{ gap: 4 }}>
                  <Heading>{fa ? 'هشدارهای اطلاعی' : 'Advisory notes'}</Heading>
                  {advisoryWarnings.map((warning) => <Txt muted key={warning}>{warning}</Txt>)}
                </View>
              ) : null}
              {briefForReview.timings?.length ? (
                <Txt muted>{label('Stages', 'مراحل') + ': ' + briefForReview.timings
                  .map((timing) => timing.stage + ' ' + Math.round(timing.ms) + ' ms')
                  .join(' · ')}</Txt>
              ) : null}
              <Txt muted>{label(
                'These notes are informational and are not counted as Session Health failures.',
                'این یادداشتهای اطلاعیاند و جزء خطاهای سلامت نشست محسوب نمیشوند.',
              )}</Txt>
            </View>
          </Fold>
        ) : null}

        <Panel>
          <Heading>{fa ? 'ابزارهای تکمیلی تحقیق' : 'Additional research tools'}</Heading>
          <Txt muted>{fa
            ? 'ابزارهای مستقل برنامه از همین داشبورد هم در دسترساند؛ هرکدام مسیر و خروجی تخصصی خود را دارند.'
            : 'The app’s dedicated research tools are also accessible here, each with its own focused workflow and results.'}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flexGrow: 1, flexBasis: 180 }}>
              <Panel variant="soft">
                <Heading>{fa ? 'تحقیق عمیق' : 'Deep Research'}</Heading>
                <Txt muted>{fa ? 'ساخت پرونده تحقیق با منابع و پرسشهای قابل پیگیری.' : 'Build a source-linked research brief and follow-up questions.'}</Txt>
                <Action secondary onPress={() => router.push('/deep-research')}>{fa ? 'شروع تحقیق عمیق' : 'Open Deep Research'}</Action>
              </Panel>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 180 }}>
              <Panel variant="soft">
                <Heading>{fa ? 'هوشمندی روندها' : 'Trend Intelligence'}</Heading>
                <Txt muted>{fa ? 'بررسی نشانههای موضوعی و زمینههای مرتبط.' : 'Inspect topic signals and related context.'}</Txt>
                <Action secondary onPress={() => router.push('/trend-intelligence')}>{fa ? 'بررسی روندها' : 'Open Trend Intelligence'}</Action>
              </Panel>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 180 }}>
              <Panel variant="soft">
                <Heading>{fa ? 'تقاضای جستوجو' : 'Search Demand'}</Heading>
                <Txt muted>{fa ? 'مقایسه دادههای در دسترس جستوجو و محدودیتهای آن.' : 'Compare available search signals and their data limits.'}</Txt>
                <Action secondary onPress={() => router.push('/search-demand')}>{fa ? 'بررسی تقاضا' : 'Open Search Demand'}</Action>
              </Panel>
            </View>
          </View>
        </Panel>

        <Pressable onPress={() => setHealthExpanded((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: healthExpanded }}>
          <Panel>
            <View style={{ gap: 5 }}>
              <View style={[styles.rowBetween, { flexWrap: 'wrap' }]}>
                <BadgeText>{label('SESSION HEALTH · MEASURED OPERATIONS', 'سلامت نشست · عملیات اندازهگیری شده')}</BadgeText>
                <Text style={{ color: runtimeMetrics.failed ? p.danger : runtimeMetrics.partial ? p.warning : p.success, fontSize: 10, fontWeight: '800' }}>
                  {runtimeMetrics.failed
                    ? label('ERRORS RECORDED', 'خطای ثبتشده')
                    : runtimeMetrics.partial
                      ? label('PARTIAL RESULTS', 'نتیجه ناقص')
                      : completedOperations
                        ? label('NO RECORDED ERRORS', 'خطای ثبتشده ندارد')
                        : label('AWAITING FIRST RUN', 'در انتظار نخستین اجرا')}
                </Text>
              </View>
              <Heading>{sessionSuccessRate === undefined
                ? label('No completed operation has been measured this session', 'هنوز اجرای تکمیلشدهاندازهگیری نشده')
                : sessionSuccessRate + '% ' + label('measured success rate', 'موفقیت ثبتشده')}</Heading>
              <Txt muted>
                {runtimeMetrics.failed + ' ' + label('errors', 'خطا') + ' · ' +
                  runtimeMetrics.partial + ' ' + label('partial', 'ناقص') + ' · ' +
                  runtimeMetrics.skipped + ' ' + label('skipped (optional)', 'ردشده (اختیاری)') + ' · ' +
                  feedHealth.healthy + '/' + feedHealth.registered + ' ' + label('healthy feeds', 'خوراک سالم') +
                  (runtimeMetrics.lastCompletedAt
                    ? ' · ' + label('last run', 'آخرین اجرا') + ' ' + new Date(runtimeMetrics.lastCompletedAt).toLocaleString(fa ? 'fa-IR' : 'en-US')
                    : '')}
              </Txt>
              <Txt muted>{healthExpanded
                ? label('Tap to hide module details', 'برای بستن جزئیات لمس کن')
                : label('Tap for measured module outcomes and source status', 'برای دیدن نتایج ماژولها و وضعیت منابع لمس کن')}</Txt>
            </View>
          </Panel>
        </Pressable>
        {healthExpanded ? (
          <Panel>
            <Heading>{label('Measured operation results', 'نتیجه واقعی اجرای ماژولها')}</Heading>
            {(['YouTube', 'Sources', 'Wikimedia', 'Engine', 'AI'] as const).map((name) => {
              const item = runtimeMetrics.modules[name];
              const done = item.succeeded + item.partial + item.failed;
              const rate = done ? Math.round(item.succeeded * 100 / done) + '%' : label('not measured', 'اندازهگیری نشده');
              const moduleLabel = name === 'YouTube' && fa ? 'API یوتیوب'
                : name === 'Sources' && fa ? 'خوراکهای رسمی'
                  : name === 'Wikimedia' && fa ? 'صفحهنمای ویکیمدیا'
                    : name === 'Engine' && fa ? 'موتور داخلی'
                      : name === 'AI' && fa ? 'نظر مستقل هوش مصنوعی'
                        : name;
              return (
                <View key={name} style={{ gap: 2, borderBottomWidth: 1, borderBottomColor: p.borderSoft, paddingVertical: 7 }}>
                  <View style={[styles.rowBetween, { flexWrap: 'wrap' }]}>
                    <Text style={{ color: p.text, fontSize: 12, fontWeight: '700' }}>{moduleLabel}</Text>
                    <Text style={{ color: item.failed ? p.danger : item.partial ? p.warning : p.success, fontSize: 11, fontWeight: '700' }}>{rate}</Text>
                  </View>
                  <Txt muted>{item.attempted + ' ' + label('attempted', 'تلاش') + ' · ' +
                    item.succeeded + ' ' + label('success', 'موفق') + ' · ' +
                    item.partial + ' ' + label('partial', 'ناقص') + ' · ' +
                    item.skipped + ' ' + label('skipped', 'ردشده') + ' · ' +
                    item.failed + ' ' + label('errors', 'خطا')}</Txt>
                  <Txt muted>{(item.lastStartedAt
                    ? label('Last attempt started', 'شروع آخرین تلاش') + ': ' + new Date(item.lastStartedAt).toLocaleString(fa ? 'fa-IR' : 'en-US')
                    : label('Not run this session', 'اجرا نشده')) + ' · ' +
                    (item.lastCompletedAt
                      ? label('Last completed', 'آخرین تکمیل') + ': ' + new Date(item.lastCompletedAt).toLocaleString(fa ? 'fa-IR' : 'en-US')
                      : label('No completed run', 'تکمیل ثبت نشده'))}</Txt>
                  {item.lastError ? <Txt muted>{runtimeErrorHint(item.lastError, fa ? 'fa' : 'en')}</Txt> : null}
                </View>
              );
            })}
            <Heading>{label('Official feed status', 'وضعیت خوراکهای رسمی')}</Heading>
            <Txt muted>{feedHealth.registered + ' ' + label('registered', 'ثبتشده') + ' · ' +
              feedHealth.cachedItems + ' ' + label('cached items', 'آیتم کششده') + ' · ' +
              feedHealth.healthy + ' ' + label('healthy', 'سالم') + ' · ' +
              feedHealth.stale + ' ' + label('stale', 'قدیمی') + ' · ' +
              feedHealth.unavailable + ' ' + label('unavailable', 'ناموجود') + ' · ' +
              feedHealth.unknown + ' ' + label('unknown (untested)', 'نامشخص (آزمایشنشده)')}</Txt>
            {feedRegistry.map((feed) => {
              // Untested/unknown feeds are neutral, never red as a failure.
              const statusColor = feed.status === 'healthy'
                ? p.success
                : feed.status === 'unavailable'
                  ? p.danger
                  : feed.status === 'stale'
                    ? p.warning
                    : p.muted;
              return (
                <View key={feed.sourceId} style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: p.borderSoft, gap: 2 }}>
                  <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>{feed.sourceId + ' · ' + feed.status}</Text>
                  <Txt muted>{feed.cachedItems.length + ' cached items · ' + feed.failureCount + ' failures · ' + (feed.lastSuccessAt ? new Date(feed.lastSuccessAt).toLocaleString(fa ? 'fa-IR' : 'en-US') : label('no successful response', 'پاسخ موفقی ثبت نشده')) + ' · ' + (feed.lastCheckedAt ? label('Last checked', 'آخرین بررسی') + ': ' + new Date(feed.lastCheckedAt).toLocaleString(fa ? 'fa-IR' : 'en-US') : label('not checked', 'بررسی نشده')) + (feed.retryAt > dashboardNow ? ' · ' + label('retry after', 'تلاش مجدد پس از') + ' ' + new Date(feed.retryAt).toLocaleTimeString(fa ? 'fa-IR' : 'en-US') : '')}</Txt>
                  {feed.lastError ? <Txt muted>{runtimeErrorHint(feed.lastError, fa ? 'fa' : 'en')}</Txt> : null}
                </View>
              );
            })}
            <Txt muted>{label(
              'Percentages use only completed instrumented operations since this session began. Optional skipped features and untested feeds are not failures.',
              'درصدها فقط از عملیات اندازهگیری شده همین نشست محاسبه میشوند. قابلیتهای اختیاری ردشده و خوراکهای آزمایشنشده خطا محسوب نمیشوند.',
            )}</Txt>
            {runtimeMetrics.lastError ? <Txt muted>{(fa ? 'آخرین خطای ثبتشده: ' : 'Latest measured error: ') + runtimeErrorHint(runtimeMetrics.lastError, fa ? 'fa' : 'en')}</Txt> : null}
          </Panel>
        ) : null}
      </View>
    </Page>
  );
}
