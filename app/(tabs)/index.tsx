import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { router } from 'expo-router';
import {
  Page, Panel, Heading, Txt, Action, Fold, styles, ErrorBox, useOperation,
  SourceHeading, SourceText, BadgeText,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
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
import { ResearchKnowledgeGraph } from '@/components/ResearchKnowledgeGraph';
import { VideoRow } from '@/components/VideoRow';
import { engineReviewCacheKey, findCachedEngineReview, rankDashboardIdeas, runSingleFlight, selectDashboardVideos } from '@/lib/dashboard';
import { generateEditorialIdeas } from '@/lib/idea-generation';
import { fingerprintText, getFreeModels, getOpenRouterDailyQuota, getOpinion, internalEngineReviewPrompt, localDateKey, nextOpenRouterUsage, quotaDay, selectFreeModel, type YouTubeSampleVideo } from '@/lib/api';
import { getKey } from '@/lib/vault';
import { ResearchOverviewChart } from '@/components/ResearchOverviewChart';

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
    <Fold title={fa ? 'کیفیت شواهد و گام‌های بعدی' : 'Evidence quality & next steps'}>
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
    setReviewBusy(true);
    setReviewError('');
    setReviewMessage('');
    let reviewSucceeded = false;
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
      setReviewError(error instanceof Error
        ? error.message
        : (fa ? 'دریافت نظر دوم ناموفق بود؛ اتصال یا تنظیمات مدل را بررسی کن.' : 'The second opinion failed. Check connectivity and model settings.'));
    } finally {
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
        <Fold title={fa ? 'نمایش کامل نظر دوم' : 'View full second opinion'}>
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
      <Page title="MOHSEN SCOUT">
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
  const memoryCount = useScout((state) => state.data.researchMemory.length);
  const researchMemory = useScout((state) => state.data.researchMemory);
  const youtubeBudget = useScout((state) => state.data.budget);
  const quotaDate = quotaDay();
  const quotaUsage = youtubeBudget.date === quotaDate
    ? youtubeBudget
    : { date: quotaDate, units: 0, requests: 0, exhausted: false };
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
      try {
        // Fetch this free attention proxy alongside RSS, but never delay the fresh feed preview.
        const wikiPromise = getWikipediaSignal(discoveryTopic, preferences.spaceInterestLanguage ?? 'en').catch(() => undefined);
        const result = await fetchSpaceNews(preferences.spaceNewsSources, fetch, force);
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
        const nextRadarBrief = relevantNews.length || wiki ? buildInternalResearch({
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
        setNicheSuggestions(buildNicheSuggestions(result.items, 8).filter((suggestion) => !suggestion.id.startsWith('story:')));
        setRadarBrief(nextRadarBrief);
        if (force && !result.items.length && result.warnings.length) {
          throw new Error(result.warnings.join(' '));
        }
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
  const deskIdeas = useMemo(() => rankDashboardIdeas(ideas.filter((idea) =>
    idea.engineGenerated && !idea.archived &&
    (showYouTubeResearch ? idea.reportId === latestReport?.id :
      idea.generationKey === rssGenerationKey || Boolean(idea.generationKey?.startsWith(rssGenerationKey + '|memory:'))),
  )), [ideas, showYouTubeResearch, latestReport?.id, rssGenerationKey]);
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
    <Page title="MOHSEN SCOUT">
      <View style={{ gap: 12 }}>
        {bestIdea ? (
          <Panel>
            <BadgeText>{fa ? 'نامزد برتر موتور · ابتدا اعتبارسنجی کن' : 'TOP ENGINE-RANKED IDEA · VALIDATE FIRST'}</BadgeText>
            <Heading>{fa ? 'بهترین ایده بر اساس شواهد فعلی' : 'Best idea from current evidence'}</Heading>
            <SourceHeading>{bestIdea.topic}</SourceHeading>
            <Txt>{bestIdea.concept.slice(0, 420)}</Txt>
            <Txt muted>{fa
              ? 'امتیاز اولویت تحریری: ' + (bestIdea.engineScore ?? 'نامشخص') + '/100 · ' + (bestIdea.engineScoreReason ?? 'شواهد امتیازدهی‌شده کافی نیست.')
              : 'Editorial priority: ' + (bestIdea.engineScore ?? 'unavailable') + '/100 · ' + (bestIdea.engineScoreReason ?? 'Insufficient scored evidence.')}</Txt>
            <Txt muted>{bestIdea.note.slice(0, 220)}</Txt>
            <Action onPress={() => router.push({ pathname: '/detail', params: { idea: bestIdea.id } })}>
              {fa ? 'تکمیل ایده و بررسی شواهد' : 'Develop idea and inspect evidence'}
            </Action>
          </Panel>
        ) : null}

        <Panel>
          <BadgeText>{fa ? 'میزکار تحقیق · تمرکز فعلی' : 'RESEARCH DESK · CURRENT FOCUS'}</BadgeText>
          <SourceHeading>{showYouTubeResearch ? latestReport!.input.topic : nicheTitle}</SourceHeading>
          <Txt muted>{latestReport
            ? (fa ? 'آخرین جست‌وجوی YouTube: ' : 'Latest YouTube research: ') + new Date(latestReport.createdAt).toLocaleString()
            : (fa ? 'هنوز گزارش YouTube ذخیره نشده؛ موضوع را انتخاب و اولین جست‌وجو را اجرا کن.' : 'No YouTube report is saved yet. Choose a topic and run your first search.')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flexGrow: 1, flexBasis: 92, gap: 3 }}>
              <BadgeText>{fa ? 'خبر هم‌موضوع' : 'MATCHED NEWS'}</BadgeText>
              <Heading>{String(audit?.topicMatchedNewsCount ?? 0)}</Heading>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 92, gap: 3 }}>
              <BadgeText>{fa ? 'ویدئوی هم‌موضوع' : 'MATCHED VIDEOS'}</BadgeText>
              <Heading>{String(audit?.matchedVideoCount ?? 0)}</Heading>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 92, gap: 3 }}>
              <BadgeText>{fa ? 'گروه ناشر مستقل' : 'PUBLISHER GROUPS'}</BadgeText>
              <Heading>{String(deskAnalysis?.intelligence.sourceQuality.independentPublishers ?? 0)}</Heading>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 92, gap: 3 }}>
              <BadgeText>{fa ? 'خبرهای یکتا' : 'UNIQUE STORIES'}</BadgeText>
              <Heading>{String(deskAnalysis?.intelligence.sourceQuality.uniqueStories ?? 0)}</Heading>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 92, gap: 3 }}>
              <BadgeText>{fa ? 'خوراک‌های حاضر در تحلیل' : 'FEEDS REPRESENTED'}</BadgeText>
              <Heading>{String(deskAnalysis?.intelligence.sourceQuality.feedsRepresented ?? 0)}</Heading>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 92, gap: 3 }}>
              <BadgeText>{fa ? 'قدیمی یا بی‌تاریخ' : 'STALE / UNDATED'}</BadgeText>
              <Heading>{String((deskAnalysis?.intelligence.sourceQuality.staleItems ?? 0) + (deskAnalysis?.intelligence.sourceQuality.undatedItems ?? 0))}</Heading>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 92, gap: 3 }}>
              <BadgeText>{fa ? 'مشاهدات ماهانه ویکی‌مدیا' : 'WIKIMEDIA MONTHS'}</BadgeText>
              <Heading>{String(audit?.wikimediaMonthlyObservations ?? 0)}</Heading>
            </View>
          </View>
          <Action onPress={() => router.push({ pathname: '/youtube', params: { topic: deskTopic } })}>
            {fa ? 'شروع یا ادامه تحقیق در YouTube' : 'Start or continue YouTube research'}
          </Action>
          {latestReport ? (
            <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: latestReport.input.topic, report: latestReport.id } })}>
              {fa ? 'باز کردن گزارش کامل' : 'Open full report'}
            </Action>
          ) : null}
        </Panel>

        {deskAnalysis ? (
          <Panel>
            <BadgeText>{fa ? 'خلاصه هوشمند · بر پایه شواهد موجود' : 'INTELLIGENCE BRIEF · EVIDENCE-BASED'}</BadgeText>
            <Heading>{fa ? 'مهم‌ترین چیزی که فعلاً می‌دانیم' : 'What the current evidence tells us'}</Heading>
            <Txt>{deskAnalysis.summary}</Txt>
            {sharedTerms.length ? (
              <View style={{ gap: 5 }}>
                <Heading>{fa ? 'هم‌پوشانی متن خبر و YouTube' : 'News and YouTube wording overlap'}</Heading>
                <SourceHeading>{sharedTerms.slice(0, 4).join(fa ? '، ' : ', ')}</SourceHeading>
                <Txt muted>{fa
                  ? 'این واژه‌ها در عنوان بعضی خبرها و ویدئوهای همین نمونه تکرار شده‌اند؛ این فقط هم‌پوشانی متن است، نه اثبات تقاضا یا توافق معنایی.'
                  : 'These words recur in some headlines and video titles in this sample. This is wording overlap, not proof of demand or semantic agreement.'}</Txt>
              </View>
            ) : primaryNews ? (
              <View style={{ gap: 4 }}>
                <Heading>{fa ? 'مرتبط‌ترین خبر دریافت‌شده' : 'Most relevant retrieved publisher item'}</Heading>
                <SourceHeading>{primaryNews.title}</SourceHeading>
                <Txt muted>{primaryNews.sourceName}{primaryNews.publishedAt ? ' · ' + new Date(primaryNews.publishedAt).toLocaleDateString() : ''}</Txt>
              </View>
            ) : (
              <Txt muted>{fa
                ? 'در نمونه فعلی هم‌پوشانی واژگانی قابل نمایش میان خبر و ویدئو وجود ندارد؛ نتیجه را به کل موضوع تعمیم نده.'
                : 'No shared wording was detected between the current news and video sample. Do not generalize this absence to the whole topic.'}</Txt>
            )}
            <View style={{ gap: 5 }}>
              <Heading>{fa ? 'اقدام بعدی پیشنهادی' : 'Recommended next action'}</Heading>
              <Txt>{nextGap ?? (fa
                ? 'خلأ آشکاری در ممیزی خودکار این نمونه ثبت نشده است؛ پیش از تولید، ادعاهای اصلی را در منبع اولیه بررسی کن.'
                : 'No additional gap was flagged by the current audit. Verify key claims against the original sources.')}</Txt>
              {nextQuery ? (
                <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: nextQuery } })}>
                  {fa ? 'بررسی عبارت تکمیلی: ' + nextQuery : 'Research next: ' + nextQuery}
                </Action>
              ) : null}
              <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: deskTopic } })}>
                {fa ? 'تبدیل این سرنخ به تحقیق عمیق' : 'Turn this lead into deep research'}
              </Action>
            </View>
          </Panel>
        ) : (
          <Panel>
            <BadgeText>{fa ? 'هنوز تحلیل اختصاصی ساخته نشده' : 'NO TOPIC-SPECIFIC BRIEF YET'}</BadgeText>
            <Heading>{fa ? 'اول یک نمونه واقعی جمع‌آوری کن' : 'Collect a real sample first'}</Heading>
            <Txt muted>{fa
              ? 'خبرهای عمومی یا آمار کلی به‌تنهایی برای پیشنهاد محتوای قابل اتکا کافی نیستند. یک موضوع مشخص را در YouTube جست‌وجو کن تا گزارش، ویدئوها و خلأهای تحقیق در همین صفحه خلاصه شوند.'
              : 'General news and broad statistics are not enough for a useful recommendation. Search one specific YouTube topic so its sample, videos and research gaps can be summarized here.'}</Txt>
            <Action onPress={() => router.push({ pathname: '/youtube', params: { topic: discoveryTopic } })}>
              {fa ? 'جست‌وجوی موضوع انتخاب‌شده' : 'Research the selected topic'}
            </Action>
          </Panel>
        )}



        <Panel>
          <Fold title={fa ? 'ممیزی شواهد و تحلیل کامل' : 'Evidence audit and full analysis'}>
            {deskAnalysis ? (
              <View style={{ gap: 12 }}>
                {deskAnalysis.evidence
                  .filter((item) => ['publisher-news', 'wikimedia', 'youtube-sample', 'cross-source-overlap'].includes(item.id))
                  .map((item) => (
                    <View key={item.id} style={{ gap: 5 }}>
                      <BadgeText>{item.label}</BadgeText>
                      <Txt muted>{item.detail}</Txt>
                    </View>
                  ))}
                <AnalysisSignals result={deskAnalysis} />
                <Fold title={fa ? 'نقشه ارتباط شواهد' : 'Evidence relationship map'}>
                  <ResearchKnowledgeGraph topic={deskTopic} news={deskNews} videos={deskVideos} analysis={deskAnalysis} language={preferences.uiLanguage ?? 'fa'} generatedIdeas={deskIdeas} />
                </Fold>
                <Fold title={fa ? 'نمودار و روند داده موجود' : 'Charts and available data'}>
                  <ResearchOverviewChart analysis={deskAnalysis} ideas={deskIdeas} videoCount={deskVideos.length} language={preferences.uiLanguage ?? 'fa'} />
                </Fold>
                <Fold title={fa ? 'زاویه‌های محتوا و راستی‌آزمایی' : 'Editorial angles and verification'}>
                  {deskAnalysis.angles.slice(0, 3).map((angle) => (
                    <View key={angle.id} style={{ gap: 5 }}>
                      <Heading>{angle.title}</Heading>
                      <Txt>{angle.hook}</Txt>
                      <Txt muted>{angle.approach}</Txt>
                      <Txt muted>{(fa ? 'راستی‌آزمایی: ' : 'Verify: ') + angle.verification}</Txt>
                    </View>
                  ))}
                </Fold>
              </View>
            ) : (
              <Txt muted>{fa ? 'پس از جمع‌آوری نمونه، جزئیات تحلیل اینجا نمایش داده می‌شود.' : 'Detailed analysis will appear here after a research sample is collected.'}</Txt>
            )}
          </Fold>
        </Panel>

        {deskAnalysis ? (
          <Panel>
            <EngineAIReview topic={deskTopic} result={deskAnalysis} />
          </Panel>
        ) : null}

        <Panel>
          <Fold title={fa ? 'ویدئوها، ایده‌ها و گزارش‌های اخیر' : 'Videos, ideas and recent reports'}>
            <View style={{ gap: 12 }}>
              {feedVideos.length ? (
                <View style={{ gap: 8 }}>
                  <Heading>{fa ? 'ویدئوهای نمونه مرتبط' : 'Related sample videos'}</Heading>
                  {feedVideos.slice(0, 8).map((video) => <VideoRow key={video.id} video={video} topic={feedTopic} />)}
                </View>
              ) : (
                <Txt muted>{fa
                  ? 'ویدئوی ذخیره‌شده و منطبق با موضوع پیدا نشد؛ برای جلوگیری از نمایش نتایج نامرتبط، فهرست خالی است.'
                  : 'No saved video matched this topic, so unrelated results are not shown.'}</Txt>
              )}
              {recommendations.length ? (
                <View style={{ gap: 8 }}>
                  <Heading>{fa ? 'زاویه‌های محتوایی دیگر' : 'Other editorial angles'}</Heading>
                  {recommendations.slice(0, 3).map((idea) => (
                    <View key={idea.id} style={{ gap: 5 }}>
                      <SourceHeading>{idea.topic}</SourceHeading>
                      <Txt muted>{idea.concept.slice(0, 220)}</Txt>
                      <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: idea.id } })}>
                        {fa ? 'بررسی این ایده' : 'Review this idea'}
                      </Action>
                    </View>
                  ))}
                </View>
              ) : null}
              {reports.length ? (
                <View style={{ gap: 7 }}>
                  <Heading>{fa ? 'جست‌وجوهای ذخیره‌شده' : 'Saved research runs'}</Heading>
                  {reports.slice(0, 4).map((report) => (
                    <Action key={report.id} secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: report.input.topic, report: report.id } })}>
                      {report.input.topic + ' · ' + new Date(report.createdAt).toLocaleDateString()}
                    </Action>
                  ))}
                </View>
              ) : null}
              <Action secondary onPress={() => router.push('/opportunities')}>
                {fa ? 'مدیریت همه ایده‌ها' : 'Manage all ideas'}
              </Action>
            </View>
          </Fold>
        </Panel>

        <Panel>
          <Fold title={fa ? 'Space Radar و وضعیت منابع' : 'Space Radar and source status'}>
            <View style={{ gap: 10 }}>
              <Heading>{nicheTitle}</Heading>
              <Txt muted>{niche?.description ?? (fa
                ? 'خوراک‌های رسمی ناشرها برای این موضوع گردآوری می‌شوند؛ خبر به‌تنهایی اثبات ترند یا تقاضا نیست.'
                : 'Selected publisher feeds are grouped by topic; headlines alone do not prove a trend or demand.')}</Txt>
              <View style={[styles.row, { flexWrap: 'wrap' }]}>
                <View style={{ flex: 1, minWidth: 130 }}>
                  <Action busy={scanning || op.busy} onPress={() => void op.run(
                    () => runScan(true),
                    fa ? 'به‌روزرسانی خبرخوان کامل شد.' : 'Publisher feed refresh completed.',
                  )}>
                    {fa ? 'به‌روزرسانی خبرخوان' : 'Refresh publisher feeds'}
                  </Action>
                </View>
              </View>
              <Txt muted>{lastScannedAt
                ? (fa ? 'آخرین بررسی: ' : 'Last source update: ') + new Date(lastScannedAt).toLocaleString()
                : (fa ? 'هنوز زمان به‌روزرسانی این نشست ثبت نشده است.' : 'No source update timestamp is available in this session.') + ' · ' + radarNews.length + (fa ? ' خبر دریافت‌شده' : ' retrieved items')}</Txt>
              {scanning ? <Txt muted>{fa ? 'به‌روزرسانی ادامه دارد؛ می‌توانی به تب‌های دیگر بروی.' : 'Refresh is running; you can continue using other tabs.'}</Txt> : null}
              {warnings.slice(0, 2).map((warning, i) => <Txt muted key={String(i) + warning}>{warning}</Txt>)}
              {nicheSuggestions.length ? (
                <View style={{ gap: 7 }}>
                  <Heading>{fa ? 'موضوعات مرتبط کشف‌شده در خوراک‌ها' : 'Related topics found in feeds'}</Heading>
                  {nicheSuggestions.slice(0, 6).map((suggestion) => (
                    <View key={suggestion.id} style={{ gap: 4 }}>
                      <SourceHeading>{suggestion.title}</SourceHeading>
                      <Txt muted>{suggestion.description}</Txt>
                      <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: suggestion.topic } })}>
                        {fa ? 'تحقیق درباره موضوع' : 'Research this topic'}
                      </Action>
                    </View>
                  ))}
                </View>
              ) : null}
              <Fold title={fa ? 'اطلاعات فنی و سهمیه‌ها' : 'Technical details and quotas'}>
                <Txt muted>{'YouTube quota: ' + quotaUsage.units + ' / ' + preferences.budget + ' units · ' + quotaUsage.requests + ' requests'}</Txt>
                <Txt muted>{memoryCount + (fa ? ' موضوع در حافظه تحقیق محلی' : ' topics in local research memory') + ' · ' + reports.length + ' saved reports'}</Txt>
                <Txt muted>{fa
                  ? 'نظر دوم AI: ' + (preferences.hybridIntelligence ? 'خودکار و روشن' : 'فقط دستی')
                  : 'AI second opinion: ' + (preferences.hybridIntelligence ? 'Automatic and enabled' : 'Manual only')}</Txt>
                <Txt muted>{fa
                  ? 'زمان‌بندی YouTube: ' + (preferences.schedule === 'Manual' ? 'خاموش' : preferences.paused ? 'متوقف' : preferences.schedule)
                  : 'YouTube schedule: ' + (preferences.schedule === 'Manual' ? 'Off' : preferences.paused ? 'Paused' : preferences.schedule)}</Txt>
                <Action secondary onPress={() => router.push('/settings')}>
                  {fa ? 'تنظیم کلیدها و ترجیحات' : 'Configure keys and preferences'}
                </Action>
              </Fold>
            </View>
          </Fold>
        </Panel>

        <Panel>
          <BadgeText>{fa ? 'ابزارهای اصلی' : 'WORKSPACE TOOLS'}</BadgeText>
          <Heading>{fa ? 'دسترسی به بخش‌های برنامه' : 'Open another workspace'}</Heading>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Action secondary onPress={() => router.push('/deep-research')}>{fa ? 'تحقیق عمیق' : 'Deep Research'}</Action>
            <Action secondary onPress={() => router.push('/trend-intelligence')}>{fa ? 'هوشمندی روند' : 'Trend Intelligence'}</Action>
            <Action secondary onPress={() => router.push('/search-demand')}>{fa ? 'شاخص توجه ویکی‌مدیا' : 'Wikimedia attention'}</Action>
            <Action secondary onPress={() => router.push('/notes')}>{fa ? 'یادداشت‌ها' : 'Notes'}</Action>
          </View>
        </Panel>
        {op.error ? <ErrorBox message={op.error} onRetry={op.clear} /> : null}
        {op.message ? <Txt muted>{op.message}</Txt> : null}
      </View>
    </Page>
  );
}
