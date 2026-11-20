import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { FileSearch, Search, Telescope } from 'lucide-react-native';

import { router } from 'expo-router';
import {
  Page, Panel, Heading, Txt, Action, Fold, styles, ErrorBox, useOperation,
  SourceHeading, SourceText, BadgeText, MetricCard,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { palette as p } from '@/lib/theme';
import { useShallow } from 'zustand/react/shallow';
import { uid } from '@/lib/types';
import {
  SPACE_NICHES,
  buildNicheSuggestions,
  fetchSpaceNews,
  getWikipediaSignal,
  type SpaceNicheSuggestion,
  newsForNiche,
  type SpaceNewsItem,
} from '@/lib/space';
import { buildInternalResearch, rankNewsForTopic, type InternalResearchResult } from '@/lib/engine';
import { buildResearchInterestProfile, normalizeResearchText, scoreResearchText } from '@/lib/intelligence';
import { rememberTopicDossier } from '@/lib/topic-dossier';
import { createResearchMemoryEntry } from '@/lib/research-memory';
import { VideoRow } from '@/components/VideoRow';
import { engineReviewCacheKey, findCachedEngineReview, rankDashboardIdeas, runSingleFlight, selectDashboardVideos } from '@/lib/dashboard';
import { deduplicateDisplayIdeas, generateEditorialIdeas } from '@/lib/idea-generation';
import { fingerprintText, getFreeModels, getOpenRouterDailyQuota, getOpinion, internalEngineReviewPrompt, localDateKey, nextOpenRouterUsage, quotaDay, selectFreeModel, type YouTubeSampleVideo } from '@/lib/api';
import { getKey } from '@/lib/vault';
import { ResearchOverviewChart } from '@/components/ResearchOverviewChart';
import { recordRuntimeFinish, recordRuntimeStart, runtimeErrorHint, useRuntimeMetrics } from '@/lib/runtime-metrics';
import { useSelectedIdeaId } from '@/lib/idea-selection';

const automaticReviewStarted = new Set<string>();


function AnalysisSignals({ result }: { result: InternalResearchResult }) {
  const language = useScout((state) => state.data.preferences.uiLanguage ?? 'fa');
  const fa = language === 'fa';
  const audit = result.intelligence.selfEvaluation;
  const confidence = result.intelligence.confidence.level;
  const confidenceLabel = fa
    ? confidence === 'high' ? 'بالا' : confidence === 'moderate' ? 'متوسط' : 'پایین'
    : confidence;
  return (
    <Fold title={fa ? 'کیفیت شواهد و گام‌های بعدی' : 'Evidence quality & next steps'} summary={(fa ? 'اطمینان ' : 'Confidence ') + confidenceLabel + ' · ' + result.intelligence.sourceQuality.uniqueStories + (fa ? ' خبر یکتا' : ' unique stories')}>
      <Heading>{fa ? 'حد و حدود اطمینان تحلیل' : 'Confidence and evidence scope'}</Heading>
      <BadgeText>{(fa ? 'میزان اطمینان: ' : 'Confidence: ') + confidenceLabel}</BadgeText>
      <Txt muted>{result.intelligence.confidence.reason}</Txt>
      <Heading>{fa ? 'تطبیق نمونه با موضوع' : 'Topic match in the sample'}</Heading>
      <Txt muted>{fa
        ? 'خبر هم‌موضوع: ' + audit.topicMatchedNewsCount + ' از ' + audit.uniqueNewsCount + ' · ویدئوی هم‌موضوع در کل نمونه: ' + audit.allTimeMatchedVideoCount + ' · ویدئوی تازه هم‌موضوع: ' + audit.recentMatchedVideoCount + ' از ' + audit.recentVideoCandidateCount + ' · زمینه تاریخی/بی‌تاریخ: ' + audit.outsideVideoWindowCount + ' · تاریخ آینده: ' + audit.futureDatedVideoCount + ' · بازه: ' + audit.videoWindowDays + ' روز · دارای آمار بازدید: ' + audit.videoViewCountsAvailable
        : 'Topic-matched news: ' + audit.topicMatchedNewsCount + '/' + audit.uniqueNewsCount + ' · All-time matched videos: ' + audit.allTimeMatchedVideoCount + ' · Recent matched videos: ' + audit.recentMatchedVideoCount + '/' + audit.recentVideoCandidateCount + ' · Historical/undated context: ' + audit.outsideVideoWindowCount + ' · Future-dated: ' + audit.futureDatedVideoCount + ' · Window: ' + audit.videoWindowDays + ' days · With view counts: ' + audit.videoViewCountsAvailable}</Txt>
      <Txt muted>{fa
        ? 'خوراک‌های حاضر: ' + result.intelligence.sourceQuality.feedsRepresented +
          ' · گروه‌های مستقل ناشر: ' + result.intelligence.sourceQuality.independentPublishers +
          ' · خبرهای تکراری ادغام‌شده: ' + result.intelligence.sourceQuality.duplicateStoriesMerged
        : 'Feeds represented: ' + result.intelligence.sourceQuality.feedsRepresented +
          ' · Independent publisher groups: ' + result.intelligence.sourceQuality.independentPublishers +
          ' · Duplicate stories merged: ' + result.intelligence.sourceQuality.duplicateStoriesMerged}</Txt>
      {result.intelligence.gaps.length > 0 && (
        <View style={{ gap: 5 }}>
          <Heading>{fa ? 'خلأهای تحقیق' : 'Research gaps'}</Heading>
          {result.intelligence.gaps.map((gap) => <Txt muted key={gap}>{gap}</Txt>)}
        </View>
      )}
      {result.intelligence.sharedConcepts.length > 0 && (
        <View style={{ gap: 5 }}>
          <Heading>{fa ? 'واژه‌های مشترک میان نمونه‌ها' : 'Shared concepts in the sample'}</Heading>
          <SourceText>{result.intelligence.sharedConcepts.join(fa ? '، ' : ', ')}</SourceText>
          <Txt muted>{fa
            ? 'این بخش هم‌پوشانی واژگانی نمونه دریافت‌شده را نشان می‌دهد، نه اثبات توافق معنایی یا تقاضا.'
            : 'This is wording overlap in the returned sample, not proof of semantic agreement or audience demand.'}</Txt>
        </View>
      )}
      {result.entityCandidates.length > 0 && (
        <View style={{ gap: 5 }}>
          <Heading>{fa ? 'موجودیت‌های شناخته‌شده در شواهد' : 'Recognized entities in evidence'}</Heading>
          {result.entityCandidates.slice(0, 12).map((entity) => (
            <View key={entity.id} style={{ gap: 2 }}>
              <SourceText>{entity.name}</SourceText>
              <Txt muted>{entity.kind} · {entity.mentionCount} {fa ? 'ذکر' : 'mentions'} · {entity.evidenceIds.length} {fa ? 'رکورد شاهد' : 'evidence records'}</Txt>
            </View>
          ))}
          <Txt muted>{fa
            ? 'این فهرست از تطبیق نام‌ها و نام‌های جایگزین شناخته‌شده ساخته شده است؛ به‌معنای تشخیص جامع همه موجودیت‌ها یا اثبات رابطه علّی نیست.'
            : 'These are exact matches against a bounded alias catalogue, not exhaustive entity recognition or proof of causal relationships.'}</Txt>
          {result.entityRelations.length > 0 && (
            <Txt muted>{fa
              ? 'هم‌ذکری‌های ثبت‌شده: ' + result.entityRelations.length + '؛ هر رابطه فقط هم‌وقوعی در یک رکورد شاهد است.'
              : 'Recorded co-mentions: ' + result.entityRelations.length + '; each link means co-occurrence in an evidence record only.'}</Txt>
          )}
        </View>
      )}
      <Txt muted>{fa
        ? 'زمان پردازش موتور: ' + result.intelligence.selfEvaluation.processingMs + ' میلی‌ثانیه'
        : 'Engine processing time: ' + result.intelligence.selfEvaluation.processingMs + ' ms'}</Txt>
      {result.intelligence.potentialContradictions.length > 0 && (
        <View style={{ gap: 5 }}>
          <Heading>{fa ? 'اختلاف‌هایی که باید بررسی شوند' : 'Discrepancies to verify'}</Heading>
          {result.intelligence.potentialContradictions.map((item) => <Txt muted key={item}>{item}</Txt>)}
        </View>
      )}
      {result.intelligence.followUpQueries.length > 0 && (
        <View style={{ gap: 5 }}>
          <Heading>{fa ? 'جست‌وجوهای تکمیلی پیشنهادی' : 'Suggested follow-up searches'}</Heading>
          {result.intelligence.followUpQueries.map((query) => <SourceText key={query}>{query}</SourceText>)}
        </View>
      )}
      {result.intelligence.scenarios.length > 0 && (
        <View style={{ gap: 5 }}>
          <Heading>{fa ? 'سناریوهای مشروط' : 'Conditional scenarios'}</Heading>
          {result.intelligence.scenarios.map((scenario) => <Txt muted key={scenario}>{scenario}</Txt>)}
        </View>
      )}
    </Fold>
  );
}

function EngineAIReview({ topic, result }: { topic: string; result: InternalResearchResult }) {
  const preferences = useScout(useShallow((state) => ({
    model: state.data.preferences.model,
    hybridIntelligence: state.data.preferences.hybridIntelligence,
    uiLanguage: state.data.preferences.uiLanguage,
  })));
  const opinions = useScout((state) => state.data.opinions);
  const fa = preferences.uiLanguage === 'fa';
  const quality = result.intelligence.sourceQuality;
  const audit = result.intelligence.selfEvaluation;
  const prompt = internalEngineReviewPrompt({
    topic,
    summary: result.summary,
    evidence: [
      { label: 'Input news / unique news', detail: audit.inputNewsCount + ' / ' + audit.uniqueNewsCount },
      { label: 'Topic-matched / excluded news', detail: audit.topicMatchedNewsCount + ' / ' + audit.unmatchedNewsCount },
      { label: 'YouTube input / all-time matched / recent matched', detail: audit.youtubeSampleCount + ' / ' + audit.allTimeMatchedVideoCount + ' / ' + audit.recentMatchedVideoCount },
      { label: 'Historical / undated / future-dated context', detail: audit.outsideVideoWindowCount + ' / ' + audit.futureDatedVideoCount },
      { label: 'Recent candidates / unmatched videos', detail: audit.recentVideoCandidateCount + ' / ' + audit.excludedVideoCount },
      { label: 'Matched videos with raw view counts', detail: String(audit.videoViewCountsAvailable) },
      { label: 'Publication window (days)', detail: String(audit.videoWindowDays) },
      { label: 'Independent publisher groups', detail: String(quality.independentPublishers) },
      { label: 'Official feeds represented', detail: String(quality.feedsRepresented) },
      { label: 'Duplicate records merged', detail: String(quality.duplicateStoriesMerged) },
      { label: 'Stale / undated records', detail: String(quality.staleItems + quality.undatedItems) },
      { label: 'Research gaps / possible discrepancies', detail: String(result.intelligence.gaps.length + result.intelligence.potentialContradictions.length) },
      { label: 'Evidence relationships', detail: String(result.entityRelations.length) },
      { label: 'Editorial angles generated', detail: String(result.angles.length) },
      { label: 'Verification questions', detail: String(result.verificationQuestions.length) },
      { label: 'Known entity candidates', detail: String(result.entityCandidates.length) },
      { label: 'Evidence relationship count', detail: String(result.entityRelations.length) },
      { label: 'Open research questions', detail: String(audit.openResearchQuestionCount) },
      { label: 'Wikimedia pageview observations', detail: String(result.intelligence.trend.observations) },
      { label: 'Wikimedia pageview direction (attention proxy only)', detail: result.intelligence.trend.direction },
      { label: 'Wikimedia pageview change (not search demand)', detail: result.intelligence.trend.changePercent == null ? 'insufficient data' : String(result.intelligence.trend.changePercent) + '%' },
      { label: 'Latest Wikimedia month and article pageviews', detail: result.intelligence.trend.latestMonth ? result.intelligence.trend.latestMonth + ' / ' + String(result.intelligence.trend.latestViews ?? 'unavailable') : 'unavailable' },
      { label: 'Wikimedia pageview anomaly label', detail: result.intelligence.trend.anomaly ?? 'none' },
      { label: 'Local processing time in milliseconds', detail: String(audit.processingMs) },
    ],
    gaps: result.intelligence.gaps,
    discrepancies: result.intelligence.potentialContradictions,
    confidence: {
      level: result.intelligence.confidence.level,
      reason: fa
        ? 'این سطح محلی بر اساس پوشش نمونه و تنوع ناشر محاسبه شده و تأیید صحت ادعاها نیست.'
        : 'This local level reflects sample coverage and publisher diversity; it is not factual verification.',
    },
    language: fa ? 'fa' : 'en',
  });
  const researchFingerprint = fingerprintText(
    result.topic + '|' + result.summary + '|' + JSON.stringify(audit) + '|' +
    result.intelligence.gaps.join('|') + '|' + result.intelligence.potentialContradictions.join('|'),
  );
  const visibleCacheKey = preferences.model
    ? engineReviewCacheKey(preferences.model, prompt, researchFingerprint)
    : '';
  const savedReview = findCachedEngineReview(opinions, preferences.model ?? '', prompt, researchFingerprint);
  const [reviewState, setReviewState] = useState({ key: visibleCacheKey, text: savedReview?.text ?? '' });
  const [externalKeyAvailable, setExternalKeyAvailable] = useState<boolean | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const review = reviewState.key === visibleCacheKey ? reviewState.text : savedReview?.text ?? '';
  const reviewInFlightRef = useRef(false);

  const runReview = async (automaticTriggerKey?: string) => {
    if (reviewInFlightRef.current) {
      if (automaticTriggerKey) automaticReviewStarted.delete(automaticTriggerKey);
      return;
    }
    reviewInFlightRef.current = true;
    recordRuntimeStart('AI');
    setReviewBusy(true);
    setReviewError('');
    setReviewMessage('');
    let reviewSucceeded = false;
    let reviewFromCache = false;
    let reviewFailure = '';
    try {
      // Give the native UI a frame to paint progress before network work.
      await new Promise<void>((resolve) => setTimeout(resolve, 32));
      const key = await getKey('openrouter');
      setExternalKeyAvailable(Boolean(key));
      if (!key) throw new Error(fa ? 'ابتدا کلید OpenRouter را در تنظیمات ذخیره کن.' : 'Save your OpenRouter key in Settings first.');

      const current = useScout.getState().data;
      const storedModel = current.preferences.model;
      const cachedStoredModel = findCachedEngineReview(current.opinions, storedModel ?? '', prompt, researchFingerprint);
      if (cachedStoredModel && storedModel) {
        setReviewState({ key: engineReviewCacheKey(storedModel, prompt, researchFingerprint), text: cachedStoredModel.text });
        reviewSucceeded = true;
        reviewFromCache = true;
        setReviewMessage(fa ? 'نظر ذخیره‌شده بارگذاری شد.' : 'Saved second opinion loaded.');
        return;
      }

      // Every new generation still requires a live zero-price model selection.
      const models = await getFreeModels();
      const model = selectFreeModel(models, storedModel ?? '');
      if (!model) throw new Error(fa
        ? 'هیچ مدل رایگان و فعالی از OpenRouter در دسترس نیست. بعداً دوباره تلاش کن.'
        : 'No currently available free OpenRouter model was found. Try again later.');

      if (model !== storedModel) {
        await useScout.getState().commit((data) => ({
          ...data,
          preferences: { ...data.preferences, model },
        }));
      }

      const cacheKey = engineReviewCacheKey(model, prompt, researchFingerprint);
      const cached = findCachedEngineReview(useScout.getState().data.opinions, model, prompt, researchFingerprint);
      if (cached) {
        setReviewState({ key: cacheKey, text: cached.text });
        reviewSucceeded = true;
        reviewFromCache = true;
        setReviewMessage(fa ? 'نظر ذخیره‌شده بارگذاری شد.' : 'Saved second opinion loaded.');
        return;
      }

      // Refresh the free-model daily counter separately from the generation request.
      const quota = model.toLowerCase().endsWith(':free')
        ? await getOpenRouterDailyQuota(key).catch(() => undefined)
        : undefined;
      if (quota && quota.remaining <= 0)
        throw new Error('OpenRouter free-model daily quota is exhausted (' + quota.used + '/' + quota.limit + ' UTC).');
      // The generation POST remains a single request; quota status is a separate GET.
      const response = await getOpinion(key, model, prompt, async () => {
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
      const opinion = { id: uid(), ideaId: cacheKey, text: response, model, createdAt: Date.now() };
      setReviewState({ key: cacheKey, text: response });
      await useScout.getState().commit((data) => ({
        ...data,
        opinions: [opinion, ...data.opinions],
      }));
      reviewSucceeded = true;
      setReviewMessage(fa ? 'نظر دوم ذخیره شد.' : 'Second opinion saved.');
    } catch (error) {
      reviewFailure = error instanceof Error ? error.message : String(error);
      setReviewError(error instanceof Error
        ? error.message
        : (fa ? 'دریافت نظر دوم ناموفق بود؛ اتصال یا تنظیمات مدل را بررسی کن.' : 'The second opinion failed. Check connectivity and model settings.'));
    } finally {
      recordRuntimeFinish('AI', reviewFromCache ? 'partial' : reviewSucceeded ? 'success' : 'error', reviewFailure);
      reviewInFlightRef.current = false;
      setReviewBusy(false);
      if (automaticTriggerKey && !reviewSucceeded) automaticReviewStarted.delete(automaticTriggerKey);
    }
  };

  const runReviewRef = useRef(runReview);
  useEffect(() => {
    runReviewRef.current = runReview;
  });

  useEffect(() => {
    if (!preferences.hybridIntelligence || savedReview || externalKeyAvailable === false || !prompt.trim()) return;
    const triggerKey = fingerprintText(prompt + '\n' + researchFingerprint);
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
  }, [preferences.hybridIntelligence, savedReview, prompt, researchFingerprint, externalKeyAvailable]);

  return (
    <View style={{ gap: 8 }}>
      <BadgeText>{review ? 'SECOND OPINION · SAVED' : 'SECOND OPINION · OPTIONAL'}</BadgeText>
      <Heading>{fa ? 'بازبینی مستقل با AI' : 'Independent AI review'}</Heading>
      <Txt muted>{fa
        ? 'مدل فقط موضوع و شاخص‌های تجمیعی را می‌بیند؛ تیتر خبرها، عنوان ویدئوها، پیوندها و آمار تک‌تک موارد ارسال نمی‌شوند. دریافت پاسخ در پس‌زمینه انجام می‌شود و جابه‌جایی میان بخش‌های برنامه را قفل نمی‌کند.'
        : 'The model receives only the topic and aggregate indicators — never raw headlines, video titles, links or per-item statistics. The reply is fetched asynchronously and does not lock navigation.'}</Txt>
      {savedReview ? <Txt muted>{'Model: ' + savedReview.model + ' · ' + new Date(savedReview.createdAt).toLocaleString()}</Txt> : null}
      <Txt muted>{reviewBusy
        ? (fa ? 'در حال دریافت نظر دوم؛ می‌توانی هم‌زمان در بخش‌های دیگر کار کنی.' : 'Getting the second opinion. You can keep using other sections.')
        : preferences.hybridIntelligence
          ? externalKeyAvailable === false
            ? (fa ? 'برای اجرای خودکار، کلید OpenRouter را در تنظیمات ذخیره کن.' : 'Save an OpenRouter key in Settings to enable automatic review.')
            : (fa ? 'نظر دوم پس از تحلیل داخلی اجرا می‌شود؛ نتیجه بعد از تکمیل نمایش داده خواهد شد.' : 'The second opinion runs after local analysis; its result appears when complete.')
          : (fa ? 'اجرای خودکار خاموش است؛ می‌توانی نظر دوم را دستی دریافت کنی.' : 'Automatic review is off. You can request a second opinion manually.')}</Txt>
      <Action busy={reviewBusy} onPress={() => void runReview()}>
        {fa ? 'دریافت نظر دوم' : 'Get second opinion'}
      </Action>
      {reviewError ? <ErrorBox message={reviewError} onRetry={() => void runReview()} /> : null}
      {reviewMessage ? <Txt muted>{reviewMessage}</Txt> : null}
      {review ? (
        <Fold title={fa ? 'نمایش کامل نظر دوم' : 'View full second opinion'} summary={fa ? 'پاسخ کامل ذخیره‌شده' : 'Full saved response'}>
          <Txt>{review}</Txt>
        </Fold>
      ) : null}
    </View>
  );
}
export default function DiscoveryDashboard() {
  const ready = useScout((state) => state.ready);
  if (!ready) {
    return (
      <Page title="Space Radar" eyebrow="MISSION CONTROL">
        <Txt muted>Loading your local research workspace…</Txt>
      </Page>
    );
  }
  return <DiscoveryDashboardReady />;
}

function DiscoveryDashboardReady() {
  const preferences = useScout(useShallow((state) => ({
    uiLanguage: state.data.preferences.uiLanguage ?? 'fa',
    selectedSpaceNiche: state.data.preferences.selectedSpaceNiche,
    customSpaceNiche: state.data.preferences.customSpaceNiche,
    spaceInterestLanguage: state.data.preferences.spaceInterestLanguage ?? 'en',
    spaceNewsSources: state.data.preferences.spaceNewsSources,
    region: state.data.preferences.region,
    languages: state.data.preferences.languages,
    schedule: state.data.preferences.schedule,
    paused: state.data.preferences.paused,
    hybridIntelligence: state.data.preferences.hybridIntelligence,
    budget: state.data.preferences.budget,
  })));
  const ideas = useScout((state) => state.data.ideas);
  const reports = useScout((state) => state.data.reports);
  const feedRegistry = useScout((state) => state.data.feedRegistry);
  const memoryCount = useScout((state) => state.data.researchMemory.length);
  const runtimeMetrics = useRuntimeMetrics();
  const selectedIdeaId = useSelectedIdeaId();
  const [healthExpanded, setHealthExpanded] = useState(false);
  const researchMemory = useScout((state) => state.data.researchMemory);
  const youtubeBudget = useScout((state) => state.data.budget);
  const quotaDate = quotaDay();
  const quotaUsage = youtubeBudget.date === quotaDate
    ? youtubeBudget
    : { date: quotaDate, units: 0, requests: 0, exhausted: false };
  const completedOperations = runtimeMetrics.succeeded + runtimeMetrics.partial + runtimeMetrics.failed;
  const sessionSuccessRate = completedOperations
    ? Math.round(runtimeMetrics.succeeded * 100 / completedOperations)
    : undefined;
  const feedHealth = useMemo(() => ({
    registered: feedRegistry.length,
    healthy: feedRegistry.filter((item) => item.status === 'healthy').length,
    stale: feedRegistry.filter((item) => item.status === 'stale').length,
    unavailable: feedRegistry.filter((item) => item.status === 'unavailable').length,
    failures: feedRegistry.reduce((sum, item) => sum + (item.failureCount ?? 0), 0),
    lastSuccessAt: feedRegistry.reduce((latest, item) => Math.max(latest, item.lastSuccessAt ?? 0), 0),
  }), [feedRegistry]);
  const fa = preferences.uiLanguage === 'fa';
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);
  const [dashboardNow, setDashboardNow] = useState(() => Date.now());
  const [nicheSuggestions, setNicheSuggestions] = useState<SpaceNicheSuggestion[]>([]);
  const [radarBrief, setRadarBrief] = useState<InternalResearchResult>();
  const [radarNews, setRadarNews] = useState<SpaceNewsItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [reportAnalysisState, setReportAnalysisState] = useState<{ id: string; result: InternalResearchResult }>();
  const scanInFlightRef = useRef<Promise<void> | null>(null);
  const op = useOperation();

  const niche = SPACE_NICHES.find((item) => item.id === preferences.selectedSpaceNiche);
  const nicheTitle = preferences.selectedSpaceNiche === 'all'
    ? (fa ? 'همه موضوعات فضایی' : 'All space topics')
    : preferences.selectedSpaceNiche === 'custom'
      ? (preferences.customSpaceNiche.trim() || (fa ? 'موضوع دلخواه' : 'Custom niche'))
      : niche?.title ?? (fa ? 'همه موضوعات فضایی' : 'All space topics');
  const discoveryTopic = preferences.selectedSpaceNiche === 'all'
    ? 'Space science and exploration'
    : preferences.selectedSpaceNiche === 'custom'
      ? preferences.customSpaceNiche
      : niche?.topic ?? 'Space science and exploration';

  const runScan = useCallback((force = false): Promise<void> =>
    runSingleFlight(scanInFlightRef, async () => {
      setScanning(true);
      recordRuntimeStart('Sources');
      let sourcesRecorded = false;
      let engineStarted = false;
      let engineRecorded = false;
      try {
        // Fetch this free attention proxy alongside RSS, but never delay the fresh feed preview.
        recordRuntimeStart('Wikimedia');
        const wikiPromise = getWikipediaSignal(discoveryTopic, preferences.spaceInterestLanguage ?? 'en')
          .then((value) => {
            recordRuntimeFinish('Wikimedia', value ? 'success' : 'partial');
            return value;
          })
          .catch((error) => {
            recordRuntimeFinish('Wikimedia', 'error', error instanceof Error ? error.message : String(error));
            return undefined;
          });
        const result = await fetchSpaceNews(preferences.spaceNewsSources, fetch, force);
        recordRuntimeFinish('Sources', result.warnings.length ? 'partial' : 'success');
        sourcesRecorded = true;
        const relevantNews = preferences.selectedSpaceNiche === 'all'
          ? result.items
          : newsForNiche(result.items, preferences.selectedSpaceNiche, preferences.customSpaceNiche);

        // Show the latest feed preview first and defer CPU-heavy local analysis until
        // gestures/navigation settle, so scroll and tab changes remain responsive.
        setRadarNews(relevantNews);
        setWarnings(result.warnings);
        setLastScannedAt(Date.now());
        setDashboardNow(Date.now());
        // Yield one frame before local CPU work so the native UI can paint and respond.
        await new Promise<void>((resolve) => setTimeout(resolve, 96));
        const wiki = await wikiPromise;

        const currentData = useScout.getState().data;
        const priorMemory = currentData.researchMemory.find(
          (entry) => normalizeResearchText(entry.topic) === normalizeResearchText(discoveryTopic),
        );
        const hasEngineInput = Boolean(relevantNews.length || wiki);
        if (hasEngineInput) {
          recordRuntimeStart('Engine');
          engineStarted = true;
        }
        const nextRadarBrief = hasEngineInput ? buildInternalResearch({
          topic: discoveryTopic,
          feedback: buildResearchInterestProfile(currentData.ideas),
          priorMemory,
          language: currentData.preferences.uiLanguage ?? 'fa',
          news: relevantNews.map((item) => ({
            title: item.title,
            summary: item.summary,
            sourceName: item.sourceName,
            sourceUrl: item.url,
            publishedAt: item.publishedAt,
            sourceId: item.sourceId,
          })),
          ...(wiki ? { wiki } : {}),
        }) : undefined;
        const automaticIdeas = generateEditorialIdeas({
          topic: discoveryTopic,
          news: relevantNews,
          context: wiki ? [{
            title: wiki.articleTitle,
            summary: [wiki.summary, wiki.monthlyViews.length
              ? 'Wikimedia monthly article pageviews: ' + wiki.monthlyViews.map((point) => point.month + '=' + point.views).join(', ')
              : 'No monthly Wikimedia pageview observations were returned.'].filter(Boolean).join('\n'),
            sourceUrl: wiki.articleUrl,
            sourceName: 'Wikimedia Pageviews · attention proxy',
          }] : [],
          existingIdeas: currentData.ideas,
          region: currentData.preferences.region,
          languages: currentData.preferences.languages,
          language: currentData.preferences.uiLanguage ?? 'fa',
          evidenceKey: 'rss:' + relevantNews.map((item) => item.url).sort().join('|') + '|memory:' + (priorMemory?.history?.[0]?.sourceFingerprint ?? String(priorMemory?.updatedAt ?? 0)),
          priorMemory,
          skipExistingEvidence: true,
          limit: 5,
        });
        const nextMemory = nextRadarBrief ? createResearchMemoryEntry({
          topic: discoveryTopic,
          news: relevantNews,
          analysis: nextRadarBrief,
          previous: priorMemory,
          now: Date.now(),
          language: currentData.preferences.uiLanguage ?? 'fa',
        }) : undefined;

        // One serialized SQLite write replaces three queued commits for a single scan.
        // The updater uses the latest store state so unrelated edits are never overwritten.
        await useScout.getState().commit((data) => ({
          ...data,
          feedRegistry: result.registry,
          ideas: automaticIdeas.length ? [...automaticIdeas, ...data.ideas] : data.ideas,
          researchMemory: nextMemory
            ? [
                nextMemory,
                ...data.researchMemory.filter((entry) => normalizeResearchText(entry.topic) !== normalizeResearchText(discoveryTopic)),
              ].slice(0, 40)
            : data.researchMemory,
        }));

        rememberTopicDossier(discoveryTopic, { news: relevantNews, ...(wiki ? { wiki } : {}), internalAnalysis: nextRadarBrief });
        if (engineStarted) {
          recordRuntimeFinish('Engine', nextRadarBrief ? 'success' : 'partial');
          engineRecorded = true;
        }
        setNicheSuggestions(buildNicheSuggestions(result.items, 8).filter((suggestion) => !suggestion.id.startsWith('story:')));
        setRadarBrief(nextRadarBrief);
        if (force && !result.items.length && result.warnings.length) {
          throw new Error(result.warnings.join(' '));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (engineStarted && !engineRecorded) recordRuntimeFinish('Engine', 'error', message);
        if (!sourcesRecorded) recordRuntimeFinish('Sources', 'error', message);
        throw error;
      } finally {
        setScanning(false);
      }
    }), [
    preferences.spaceNewsSources,
    preferences.selectedSpaceNiche,
    preferences.customSpaceNiche,
    preferences.spaceInterestLanguage,
    discoveryTopic,
  ]);

  useEffect(() => {
    void runScan(false).catch(() => {
      setWarnings([fa
        ? 'خوراک‌های رسمی در دسترس نبودند یا ذخیرهٔ نتیجه کامل نشد. اتصال و فضای ذخیره‌سازی را بررسی و دوباره تلاش کن.'
        : 'Official feeds were unavailable or the local result could not be saved. Check connectivity and storage, then retry.']);
    });
  }, [runScan, fa]);

  const latestReport = reports[0];
  const latestReportId = latestReport?.id ?? '';
  const latestReportSignature = latestReport
    ? latestReport.videos.map((video) => video.id + ':' + video.fetchedAt).join('|')
    : '';
  const latestReportVideoRecords = latestReport?.videos;
  const latestReportVideos = useMemo<YouTubeSampleVideo[]>(() => (latestReportVideoRecords ?? []).map((video) => ({
    id: video.id,
    title: video.title,
    description: video.description,
    channel: video.channel,
    channelId: '',
    publishedAt: video.publishedAt,
    thumbnailUrl: video.thumbnail,
    viewCount: video.viewCount ?? null,
    likeCount: video.likeCount ?? null,
    channelSubscriberCount: null,
    channelVideoCount: null,
    url: 'https://www.youtube.com/watch?v=' + video.id,
  })), [latestReportVideoRecords]);
  useEffect(() => {
    if (!latestReportId || !latestReportSignature) return;
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      const report = useScout.getState().data.reports.find((item) => item.id === latestReportId);
      if (!report || !report.videos.length) return;
      try {
        const videos: YouTubeSampleVideo[] = report.videos.map((video) => ({
          id: video.id,
          title: video.title,
          description: video.description,
          channel: video.channel,
          channelId: '',
          publishedAt: video.publishedAt,
          thumbnailUrl: video.thumbnail,
          viewCount: video.viewCount ?? null,
          likeCount: video.likeCount ?? null,
          channelSubscriberCount: null,
          channelVideoCount: null,
          url: 'https://www.youtube.com/watch?v=' + video.id,
        }));
        const currentNews = radarNews.map((item) => ({
          title: item.title,
          summary: item.summary,
          sourceName: item.sourceName,
          sourceUrl: item.url,
          publishedAt: item.publishedAt,
          sourceId: item.sourceId,
        }));
        const currentData = useScout.getState().data;
        const priorMemory = currentData.researchMemory.find((entry) => normalizeResearchText(entry.topic) === normalizeResearchText(report.input.topic));
        const result = buildInternalResearch({
          topic: report.input.topic,
          videos,
          news: currentNews,
          feedback: buildResearchInterestProfile(currentData.ideas),
          priorMemory,
          language: preferences.uiLanguage ?? 'fa',
        });
        if (active) setReportAnalysisState({ id: report.id, result });
      } catch {
        if (active) setWarnings([fa
          ? 'تحلیل محلی آخرین جست‌وجو کامل نشد؛ گزارش و ویدئوهای ذخیره‌شده همچنان در دسترس‌اند.'
          : 'The latest local analysis could not be completed. The saved report and videos remain available.']);
      }
    }, 160);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [latestReportId, latestReportSignature, preferences.uiLanguage, fa, radarNews]);

  const latestReportAnalysis = reportAnalysisState?.id === latestReportId
    ? reportAnalysisState.result
    : undefined;
  const showYouTubeResearch = Boolean(latestReport && latestReport.videos.length > 0);
  const deskTopic = showYouTubeResearch ? latestReport!.input.topic : discoveryTopic;
  const deskAnalysis = showYouTubeResearch ? latestReportAnalysis : radarBrief;
  const deskMemory = useMemo(() => researchMemory.find((entry) => normalizeResearchText(entry.topic) === normalizeResearchText(deskTopic)), [researchMemory, deskTopic]);
  const allDeskNews = useMemo(() => rankNewsForTopic(deskTopic, radarNews, Math.max(1, radarNews.length)), [deskTopic, radarNews]);
  // Keep visualization payloads compact; generation and analysis still receive the full feed corpus.
  const deskNews = useMemo(() => allDeskNews.slice(0, 40), [allDeskNews]);
  const deskVideos = useMemo(() => showYouTubeResearch
    ? latestReportVideos
      .filter((video) => scoreResearchText(deskTopic, video.title, video.description) > 0)
      .sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1))
    : [], [showYouTubeResearch, latestReportVideos, deskTopic]);
  const rssGenerationKey = 'rss:' + allDeskNews.map((item) => item.url).sort().join('|');
  const deskIdeas = useMemo(() => rankDashboardIdeas(deduplicateDisplayIdeas(ideas.filter((idea) =>
    idea.engineGenerated && !idea.archived &&
    (showYouTubeResearch ? idea.reportId === latestReport?.id :
      idea.generationKey === rssGenerationKey || Boolean(idea.generationKey?.startsWith(rssGenerationKey + '|memory:'))),
  ))), [ideas, showYouTubeResearch, latestReport?.id, rssGenerationKey]);
  const bestIdea = deskIdeas[0];
  const recommendations = deskIdeas.slice(1, 4);
  const combinedEvidenceKey = fingerprintText(
    deskTopic + '|' + radarNews.map((item) => item.url).sort().join('|') + '|' + deskVideos.map((video) => video.id).sort().join('|') + '|' + (deskMemory?.history?.[0]?.sourceFingerprint ?? String(deskMemory?.updatedAt ?? 0)),
  );
  useEffect(() => {
    if (!latestReport || (!deskNews.length && !deskVideos.length)) return;
    const current = useScout.getState().data;
    const generated = generateEditorialIdeas({
      topic: deskTopic,
      news: radarNews,
      videos: deskVideos,
      priorMemory: deskMemory,
      reportId: latestReport.id,
      existingIdeas: current.ideas,
      evidenceKey: 'combined:' + combinedEvidenceKey,
      skipExistingEvidence: true,
      region: preferences.region,
      languages: preferences.languages,
      language: preferences.uiLanguage ?? 'fa',
      limit: 8,
    });
    if (generated.length) {
      void useScout.getState().commit((data) => ({ ...data, ideas: [...generated, ...data.ideas] })).catch(() => {});
    }
  }, [latestReport, latestReport?.id, latestReportId, combinedEvidenceKey, deskTopic, radarNews, deskNews, deskVideos, deskMemory, preferences.region, preferences.languages, preferences.uiLanguage]);

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

  const audit = deskAnalysis?.intelligence.selfEvaluation;
  const sharedTerms = deskAnalysis?.intelligence.sharedConcepts ?? [];
  const nextGap = deskAnalysis?.intelligence.gaps[0];
  const nextQuery = deskAnalysis?.intelligence.followUpQueries[0];
  const primaryNews = deskNews[0];

  return (
    <Page
      title="Mission Control"
      eyebrow="SPACE INTELLIGENCE"
      subtitle="Your live research desk: source activity, saved work, quotas and the next useful action."
    >
      <View style={{ gap: 15 }}>
        <ResearchOverviewChart
          analysis={deskAnalysis}
          ideas={deskIdeas}
          topic={deskTopic}
          news={deskNews}
          videos={deskVideos}
          language={preferences.uiLanguage ?? 'fa'}
          selectedIdeaId={selectedIdeaId}
        />

        <Pressable onPress={() => setHealthExpanded((current) => !current)} accessibilityRole="button" accessibilityState={{ expanded: healthExpanded }}>
          <Panel>
            <View style={{ gap: 5 }}>
              <View style={[styles.rowBetween, { flexWrap: 'wrap' }]}>
                <BadgeText>{fa ? 'سلامت نشست · عملیات اندازه‌گیری‌شده' : 'SESSION HEALTH · MEASURED OPERATIONS'}</BadgeText>
                <Text style={{ color: runtimeMetrics.failed ? p.danger : runtimeMetrics.partial ? p.warning : p.success, fontSize: 10, fontWeight: '800' }}>
                  {runtimeMetrics.failed
                    ? (fa ? 'خطا ثبت شده' : 'ERRORS RECORDED')
                    : runtimeMetrics.partial
                      ? (fa ? 'نتیجه ناقص' : 'PARTIAL RESULTS')
                      : completedOperations
                        ? (fa ? 'خطای ثبت‌شده ندارد' : 'NO RECORDED ERRORS')
                        : (fa ? 'در انتظار نخستین اجرا' : 'AWAITING FIRST RUN')}
                </Text>
              </View>
              <Heading>{sessionSuccessRate === undefined
                ? (fa ? 'هنوز اجرای تکمیل‌شده‌ای در این نشست اندازه‌گیری نشده' : 'No completed operation has been measured this session')
                : sessionSuccessRate + (fa ? '٪ موفقیت ثبت‌شده' : '% measured success rate')}</Heading>
              <Txt muted>
                {runtimeMetrics.failed + (fa ? ' خطا' : ' errors') + ' · ' +
                  runtimeMetrics.partial + (fa ? ' نتیجه ناقص' : ' partial results') + ' · ' +
                  feedHealth.healthy + '/' + feedHealth.registered + (fa ? ' خوراک سالم' : ' healthy feeds') + ' · ' +
                  (runtimeMetrics.lastCompletedAt
                    ? (fa ? 'آخرین اجرا ' : 'Last run ') + new Date(runtimeMetrics.lastCompletedAt).toLocaleString(fa ? 'fa-IR' : 'en-US')
                    : (fa ? 'اجرای تکمیل‌شده‌ای ثبت نشده' : 'No completed run yet'))}
              </Txt>
              <Txt muted>{healthExpanded
                ? (fa ? 'برای بستن جزئیات لمس کن' : 'Tap to hide module details')
                : (fa ? 'برای دیدن نتیجه ماژول‌ها، وضعیت خوراک‌ها و راه‌حل خطا لمس کن' : 'Tap for module outcomes, source status and the latest measured error')}</Txt>
            </View>
          </Panel>
        </Pressable>
        {healthExpanded ? (
          <Panel>
            <Heading>{fa ? 'نتیجهٔ واقعی اجرای ماژول‌ها' : 'Measured operation results'}</Heading>
            {(['YouTube', 'Sources', 'Wikimedia', 'Engine', 'AI'] as const).map((name) => {
              const item = runtimeMetrics.modules[name];
              const done = item.succeeded + item.partial + item.failed;
              const rate = done ? Math.round(item.succeeded * 100 / done) + '%' : 'not measured';
              return (
                <View key={name} style={{ gap: 2, borderBottomWidth: 1, borderBottomColor: p.borderSoft, paddingVertical: 7 }}>
                  <View style={[styles.rowBetween, { flexWrap: 'wrap' }]}>
                    <Text style={{ color: p.text, fontSize: 12, fontWeight: '700' }}>{name === 'YouTube' && fa ? 'API یوتیوب' : name === 'Sources' && fa ? 'خوراک‌های رسمی' : name === 'Wikimedia' && fa ? 'صفحه‌نمای ویکی‌مدیا' : name === 'Engine' && fa ? 'موتور داخلی' : name === 'AI' && fa ? 'نظر مستقل هوش مصنوعی' : name}</Text>
                    <Text style={{ color: item.failed ? p.danger : item.partial ? p.warning : p.success, fontSize: 11, fontWeight: '700' }}>{rate}</Text>
                  </View>
                  <Txt muted>{item.attempted + (fa ? ' تلاش · ' : ' attempted · ') + item.succeeded + (fa ? ' موفق · ' : ' success · ') + item.partial + (fa ? ' ناقص · ' : ' partial · ') + item.failed + (fa ? ' خطا' : ' errors')}</Txt>
                  {item.lastError ? <Txt muted>{runtimeErrorHint(item.lastError, fa ? 'fa' : 'en')}</Txt> : null}
                </View>
              );
            })}
            <Heading>{fa ? 'نتیجه آخرین نمونه API یوتیوب' : 'Latest YouTube API sample'}</Heading>
            <Txt muted>{latestReport
              ? (fa ? 'نمونه ذخیره‌شده: ' : 'Saved sample: ') + latestReport.videos.length + (fa ? ' ویدئو · ' : ' videos · ') + latestReport.queries.length + (fa ? ' عبارت جست‌وجو · ' : ' search queries · ') + latestReport.warnings.length + (fa ? ' هشدار' : ' warnings') + ' · ' + new Date(latestReport.createdAt).toLocaleString(fa ? 'fa-IR' : 'en-US')
              : (fa ? 'هنوز نمونه‌ای از API یوتیوب ذخیره نشده است.' : 'No YouTube API sample has been saved yet.')}
            </Txt>
            <Heading>{fa ? 'وضعیت خوراک‌های رسمی' : 'Official feed status'}</Heading>
            <Txt muted>{feedHealth.registered + (fa ? ' ثبت‌شده · ' : ' registered · ') + feedHealth.healthy + (fa ? ' سالم · ' : ' healthy · ') + feedHealth.stale + (fa ? ' قدیمی · ' : ' stale · ') + feedHealth.unavailable + (fa ? ' ناموجود · ' : ' unavailable · ') + feedHealth.failures + (fa ? ' خطای ثبت‌شده' : ' recorded failures')}</Txt>
            <Txt muted>{feedHealth.lastSuccessAt
              ? (fa ? 'آخرین پاسخ موفق خوراک: ' : 'Last successful feed response: ') + new Date(feedHealth.lastSuccessAt).toLocaleString(fa ? 'fa-IR' : 'en-US')
              : (fa ? 'در رجیستری محلی پاسخ موفقی ثبت نشده است.' : 'No successful feed response has been recorded in the local registry.')}</Txt>
            {feedRegistry.map((feed) => (
              <View key={feed.sourceId} style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: p.borderSoft, gap: 2 }}>
                <Text style={{ color: feed.status === 'healthy' ? p.success : feed.status === 'unavailable' ? p.danger : p.warning, fontSize: 11, fontWeight: '700' }}>{feed.sourceId + ' · ' + feed.status}</Text>
                <Txt muted>{feed.cachedItems.length + ' cached items · ' + feed.failureCount + ' failures · ' + (feed.lastSuccessAt ? new Date(feed.lastSuccessAt).toLocaleString(fa ? 'fa-IR' : 'en-US') : 'no successful response')}</Txt>
                {feed.lastError ? <Txt muted>{runtimeErrorHint(feed.lastError, fa ? 'fa' : 'en')}</Txt> : null}
              </View>
            ))}
            <Txt muted>{fa
              ? 'درصدها فقط از عملیات ثبت‌شده از ابتدای همین نشست محاسبه می‌شوند و آمار تاریخی یا سلامت کلی سرویس‌دهنده نیستند.'
              : 'Session percentages use completed instrumented operations since this app session began. They are not lifetime, server-wide or provider availability statistics.'}</Txt>
            {runtimeMetrics.lastError ? <Txt muted>{(fa ? 'آخرین خطای ثبت‌شده: ' : 'Latest measured error: ') + runtimeErrorHint(runtimeMetrics.lastError, fa ? 'fa' : 'en')}</Txt> : null}
          </Panel>
        ) : null}

        <Panel variant="hero">
          <View style={[styles.rowBetween, { flexWrap: 'wrap' }]}>
            <BadgeText>ACTIVE RESEARCH FOCUS</BadgeText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: scanning ? p.warning : p.success }} />
              <Txt muted>{scanning ? 'Refreshing sources' : 'Source scan ready'}</Txt>
            </View>
          </View>
          <Heading>{latestReport ? latestReport.input.topic : nicheTitle}</Heading>
          {latestReport ? (
            <Txt muted>{'Latest YouTube sample · ' + new Date(latestReport.createdAt).toLocaleString(preferences.uiLanguage === 'fa' ? 'fa-IR' : 'en-US')}</Txt>
          ) : null}
          <View style={[styles.softCard, { backgroundColor: p.surface, borderColor: p.accentLine }]}>
            <View style={[styles.rowBetween, { flexWrap: 'wrap' }]}>
              <View style={{ flex: 1, minWidth: 120, gap: 3 }}>
                <Text style={[styles.label, { color: p.cyan }]}>SOURCE UPDATE</Text>
                <Txt>{lastScannedAt
                  ? new Date(lastScannedAt).toLocaleString(preferences.uiLanguage === 'fa' ? 'fa-IR' : 'en-US')
                  : 'Checking selected publisher feeds…'}</Txt>
              </View>
              <View style={{ flex: 1, minWidth: 120, gap: 3 }}>
                <Text style={[styles.label, { color: p.warning }]}>YOUTUBE QUOTA</Text>
                <Txt>{quotaUsage.units.toLocaleString()} / {preferences.budget.toLocaleString()} units</Txt>
              </View>
              <View style={{ flex: 1, minWidth: 120, gap: 3 }}>
                <Text style={[styles.label, { color: p.success }]}>SCHEDULE</Text>
                <Txt>{preferences.schedule === 'Manual' ? 'Manual' : preferences.paused ? 'Paused' : preferences.schedule}</Txt>
              </View>
            </View>
          </View>
          <Action icon={Search} onPress={() => router.push({ pathname: '/youtube', params: { topic: deskTopic } })}>
            Start YouTube research
          </Action>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Action secondary icon={FileSearch} onPress={() => router.push({ pathname: '/deep-research', params: { topic: deskTopic } })}>
                Deep research
              </Action>
            </View>
            {latestReport ? (
              <View style={{ flex: 1, minWidth: 0 }}>
                <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: latestReport.input.topic, report: latestReport.id } })}>
                  Latest report
                </Action>
              </View>
            ) : null}
          </View>
        </Panel>
        <View style={{ gap: 9 }}>
          <View style={styles.rowBetween}>
            <Heading>Research tools</Heading>
            <BadgeText>DIRECT ACCESS</BadgeText>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Action secondary icon={Telescope} onPress={() => router.push({ pathname: '/trend-intelligence', params: { topic: deskTopic } })}>
                Trend intelligence
              </Action>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Action secondary icon={Search} onPress={() => router.push({ pathname: '/search-demand', params: { topic: deskTopic } })}>
                Public-interest data
              </Action>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Action secondary onPress={() => router.push('/cosmic-news')}>Cosmic News</Action>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Action secondary onPress={() => router.push('/opportunities')}>Idea workspace</Action>
            </View>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <View style={[styles.rowBetween, { flexWrap: 'wrap' }]}>
            <Heading>Latest evidence brief</Heading>
            {deskAnalysis ? <BadgeText>{`${deskAnalysis.intelligence.confidence.level.toUpperCase()} CONFIDENCE`}</BadgeText> : null}
          </View>
          {deskAnalysis ? (
            <Panel>
              <Txt>{deskAnalysis.summary}</Txt>
              {primaryNews ? (
                <View style={styles.softCard}>
                  <Text style={styles.label}>RELEVANT PUBLISHER ITEM</Text>
                  <SourceHeading>{primaryNews.title}</SourceHeading>
                  <Txt muted>
                    {primaryNews.sourceName}
                    {primaryNews.publishedAt ? ' · ' + new Date(primaryNews.publishedAt).toLocaleDateString(preferences.uiLanguage === 'fa' ? 'fa-IR' : 'en-US') : ''}
                  </Txt>
                </View>
              ) : sharedTerms.length ? (
                <View style={styles.softCard}>
                  <Text style={styles.label}>RECURRING WORDING IN THIS SAMPLE</Text>
                  <SourceHeading>{sharedTerms.slice(0, 4).join(', ')}</SourceHeading>
                  <Txt muted>Repeated wording is not proof of demand, agreement or trend strength.</Txt>
                </View>
              ) : null}
              {bestIdea ? (
                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>EDITORIAL LEAD</Text>
                  <SourceHeading>{bestIdea.topic}</SourceHeading>
                  <Txt muted>{bestIdea.concept.slice(0, 220)}</Txt>
                  <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: bestIdea.id } })}>
                    Review idea and evidence
                  </Action>
                </View>
              ) : null}
              <View style={{ gap: 6 }}>
                <Text style={styles.label}>NEXT RESEARCH STEP</Text>
                <Txt muted>{nextGap ?? 'No additional gap was flagged. Verify important claims against original sources before production.'}</Txt>
                {nextQuery ? (
                  <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: nextQuery } })}>
                    Research suggested question
                  </Action>
                ) : null}
                <Action onPress={() => router.push({ pathname: '/deep-research', params: { topic: deskTopic } })}>
                  Build a research brief
                </Action>
              </View>
            </Panel>
          ) : (
            <Panel>
              <Heading>No topic-specific brief yet</Heading>
              <Txt muted>Publisher headlines alone are not enough for a useful recommendation. Collect a real topic-linked sample first.</Txt>
              <Action onPress={() => router.push({ pathname: '/youtube', params: { topic: discoveryTopic } })}>
                Research the selected topic
              </Action>
            </Panel>
          )}
        </View>

        <Fold title="Evidence quality and source audit" summary={deskAnalysis ? deskAnalysis.intelligence.sourceQuality.uniqueStories + ' stories · ' + deskAnalysis.intelligence.sourceQuality.feedsRepresented + ' feeds' : 'No analyzed sample yet'}>
          {deskAnalysis ? (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                <MetricCard label="UNIQUE STORIES" value={deskAnalysis.intelligence.sourceQuality.uniqueStories} />
                <MetricCard label="FEEDS REPRESENTED" value={deskAnalysis.intelligence.sourceQuality.feedsRepresented} />
                <MetricCard label="STALE / UNDATED" value={deskAnalysis.intelligence.sourceQuality.staleItems + deskAnalysis.intelligence.sourceQuality.undatedItems} />
                <MetricCard label="WIKIMEDIA MONTHS" value={audit?.wikimediaMonthlyObservations ?? 0} />
              </View>
              {deskAnalysis.evidence
                .filter((item) => ['publisher-news', 'wikimedia', 'youtube-sample', 'cross-source-overlap'].includes(item.id))
                .map((item) => (
                  <View key={item.id} style={{ gap: 4 }}>
                    <BadgeText>{item.label}</BadgeText>
                    <Txt muted>{item.detail}</Txt>
                  </View>
                ))}
              <AnalysisSignals result={deskAnalysis} />
            </View>
          ) : (
            <Txt muted>Source-quality details appear after a sample is available.</Txt>
          )}
        </Fold>

        <Fold title="Editorial angles and verification" summary={deskAnalysis ? deskAnalysis.angles.length + ' angles · ' + deskAnalysis.verificationQuestions.length + ' checks' : 'Waiting for analysis'}>
          {deskAnalysis ? deskAnalysis.angles.slice(0, 3).map((angle) => (
            <View key={angle.id} style={{ gap: 5, paddingBottom: 10 }}>
              <Heading>{angle.title}</Heading>
              <Txt>{angle.hook}</Txt>
              <Txt muted>{angle.approach}</Txt>
              <Txt muted>{'Verify: ' + angle.verification}</Txt>
            </View>
          )) : <Txt muted>Research angles are generated from the available evidence.</Txt>}
        </Fold>

        {deskAnalysis ? (
          <Fold title="AI second opinion" summary={preferences.hybridIntelligence ? 'Automatic · enabled' : 'Manual · optional'}>
            <EngineAIReview topic={deskTopic} result={deskAnalysis} />
          </Fold>
        ) : null}

        <Fold title="Recent research and saved results" summary={reports.length + ' reports · ' + deskIdeas.length + ' ideas'}>
          <View style={{ gap: 12 }}>
            {feedVideos.length ? (
              <View style={{ gap: 8 }}>
                <Heading>Related videos</Heading>
                {feedVideos.slice(0, 5).map((video) => <VideoRow key={video.id} video={video} topic={feedTopic} />)}
              </View>
            ) : <Txt muted>No saved video matched this focus. Unrelated results are intentionally hidden.</Txt>}
            {recommendations.length ? (
              <View style={{ gap: 8 }}>
                <Heading>Other editorial ideas</Heading>
                {recommendations.slice(0, 3).map((idea) => (
                  <View key={idea.id} style={styles.softCard}>
                    <SourceHeading>{idea.topic}</SourceHeading>
                    <Txt muted>{idea.concept.slice(0, 180)}</Txt>
                    <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: idea.id } })}>
                      Open idea
                    </Action>
                  </View>
                ))}
              </View>
            ) : null}
            {reports.length ? (
              <View style={{ gap: 7 }}>
                <Heading>Saved research runs</Heading>
                {reports.slice(0, 4).map((report) => (
                  <Action key={report.id} secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: report.input.topic, report: report.id } })}>
                    {report.input.topic + ' · ' + new Date(report.createdAt).toLocaleDateString(preferences.uiLanguage === 'fa' ? 'fa-IR' : 'en-US')}
                  </Action>
                ))}
              </View>
            ) : null}
            <Action secondary onPress={() => router.push('/opportunities')}>Open all ideas</Action>
          </View>
        </Fold>

        <Fold title="Publisher feeds and usage" summary={feedHealth.healthy + '/' + feedHealth.registered + ' healthy feeds · ' + warnings.length + ' warnings'}>
          <View style={{ gap: 10 }}>
            <Heading>{nicheTitle}</Heading>
            <Txt muted>{niche?.description ?? 'Publisher feeds provide source context; headlines alone do not establish a trend or audience demand.'}</Txt>
            <Action busy={scanning || op.busy} onPress={() => void op.run(
              () => runScan(true),
              'Publisher feed refresh completed.',
            )}>
              Refresh official feeds
            </Action>
            <Txt muted>
              {lastScannedAt
                ? 'Last source update: ' + new Date(lastScannedAt).toLocaleString(preferences.uiLanguage === 'fa' ? 'fa-IR' : 'en-US')
                : 'No source update timestamp is available in this session.'} · {radarNews.length} retrieved items
            </Txt>
            {scanning ? <Txt muted>Refresh is running; you can continue using other tabs.</Txt> : null}
            {warnings.slice(0, 3).map((warning, i) => <Txt muted key={String(i) + warning}>{warning}</Txt>)}
            {nicheSuggestions.length ? (
              <View style={{ gap: 8 }}>
                <Heading>Related topics in publisher feeds</Heading>
                {nicheSuggestions.slice(0, 5).map((suggestion) => (
                  <View key={suggestion.id} style={styles.softCard}>
                    <SourceHeading>{suggestion.title}</SourceHeading>
                    <Txt muted>{suggestion.description}</Txt>
                    <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: suggestion.topic } })}>
                      Research this topic
                    </Action>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ borderTopWidth: 1, borderTopColor: p.border, paddingTop: 10, gap: 5 }}>
              <Text style={styles.label}>LOCAL USAGE</Text>
              <Txt muted>{'YouTube quota: ' + quotaUsage.units + ' / ' + preferences.budget + ' units · ' + quotaUsage.requests + ' requests'}</Txt>
              <Txt muted>{memoryCount + ' topics in local research memory · ' + reports.length + ' saved reports'}</Txt>
              <Txt muted>{'AI second opinion: ' + (preferences.hybridIntelligence ? 'Automatic and enabled' : 'Manual only')}</Txt>
              <Txt muted>{'YouTube schedule: ' + (preferences.schedule === 'Manual' ? 'Off' : preferences.paused ? 'Paused' : preferences.schedule)}</Txt>
              <Action secondary onPress={() => router.push('/(tabs)/settings')}>Open settings and preferences</Action>
            </View>
          </View>
        </Fold>

        {op.error ? <ErrorBox message={op.error} onRetry={op.clear} /> : null}
        {op.message ? <Txt muted>{op.message}</Txt> : null}
      </View>
    </Page>
  );
}
