import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { router } from 'expo-router';
import {
  Page, Panel, Heading, Txt, Action, Fold, styles, ErrorBox, useOperation,
  SourceHeading, SourceText, BadgeText,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { uid } from '@/lib/types';
import {
  SPACE_NICHES,
  buildNicheSuggestions,
  fetchSpaceNews,
  type SpaceNicheSuggestion,
  newsForNiche,
  type SpaceNewsItem,
} from '@/lib/space';
import { buildInternalResearch, type InternalResearchResult } from '@/lib/engine';
import { buildResearchInterestProfile, normalizeResearchText } from '@/lib/intelligence';
import { rememberTopicDossier } from '@/lib/topic-dossier';
import { createResearchMemoryEntry } from '@/lib/research-memory';
import { ResearchKnowledgeGraph } from '@/components/ResearchKnowledgeGraph';
import { VideoRow } from '@/components/VideoRow';
import { chooseBestIdea, engineReviewCacheKey, findCachedEngineReview, rankDashboardIdeas as rankDashboardIdeasForHome, runSingleFlight, selectDashboardVideos } from '@/lib/dashboard';
import { generateEditorialIdeas } from '@/lib/idea-generation';
import { fingerprintText, getFreeModels, getOpinion, internalEngineReviewPrompt, localDateKey, nextOpenRouterUsage, quotaDay, selectFreeModel, type YouTubeSampleVideo } from '@/lib/api';
import { getKey } from '@/lib/vault';
import { ResearchOverviewChart } from '@/components/ResearchOverviewChart';

const automaticReviewStarted = new Set<string>();


function AnalysisSignals({ result }: { result: InternalResearchResult }) {
  const language = useScout((state) => state.data.preferences.uiLanguage ?? 'fa');
  const fa = language === 'fa';
  const confidence = result.intelligence.confidence.level;
  const confidenceLabel = fa
    ? confidence === 'high' ? 'بالا' : confidence === 'moderate' ? 'متوسط' : 'پایین'
    : confidence;
  return (
    <Fold title={fa ? 'کیفیت شواهد و گام‌های بعدی' : 'Evidence quality & next steps'} open>
      <Heading>{fa ? 'حد و حدود اطمینان تحلیل' : 'Confidence and evidence scope'}</Heading>
      <BadgeText>{(fa ? 'میزان اطمینان: ' : 'Confidence: ') + confidenceLabel}</BadgeText>
      <Txt muted>{result.intelligence.confidence.reason}</Txt>
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
  const preferences = useScout((state) => state.data.preferences);
  const opinions = useScout((state) => state.data.opinions);
  const fa = preferences.uiLanguage === 'fa';
  const quality = result.intelligence.sourceQuality;
  const prompt = internalEngineReviewPrompt({
    topic,
    summary: fa
      ? 'موتور داخلی موضوع، شواهد پردازش‌شده، خلأها و میزان اطمینان را ارزیابی کرده است. محتوای خام خبر و فراداده ویدئو در این درخواست ارسال نمی‌شود.'
      : 'The local engine assessed the topic, processed evidence signals, research gaps and confidence. Raw news content and video metadata are not included in this request.',
    evidence: [
      { label: 'Evidence records processed', detail: String(result.evidence.length) },
      { label: 'Independent publisher groups', detail: String(quality.independentPublishers) },
      { label: 'Official feeds represented', detail: String(quality.feedsRepresented) },
      { label: 'Duplicate records merged', detail: String(quality.duplicateStoriesMerged) },
      { label: 'Stale / undated records', detail: String(quality.staleItems + quality.undatedItems) },
      { label: 'Research gaps / possible discrepancies', detail: String(result.intelligence.gaps.length + result.intelligence.potentialContradictions.length) },
      { label: 'Evidence relationships', detail: String(result.entityRelations.length) },
      { label: 'Editorial angles generated', detail: String(result.angles.length) },
      { label: 'Verification questions', detail: String(result.verificationQuestions.length) },
      { label: 'Known entity candidates', detail: String(result.entityCandidates.length) },
      ...result.evidence.map((item) => ({ label: item.label, detail: item.detail })),
    ],
    gaps: ['Recorded research gaps: ' + result.intelligence.gaps.length],
    discrepancies: ['Potential discrepancies recorded: ' + result.intelligence.potentialContradictions.length],
    confidence: {
      level: result.intelligence.confidence.level,
      reason: fa
        ? 'این سطح محلی بر اساس پوشش نمونه و تنوع ناشر محاسبه شده و تأیید صحت ادعاها نیست.'
        : 'This local level reflects sample coverage and publisher diversity; it is not factual verification.',
    },
    language: fa ? 'fa' : 'en',
  });
  const researchFingerprint = fingerprintText(
    result.topic + '|' +
    result.evidence.map((item) => item.id + ':' + item.detail).join('|') + '|' +
    result.intelligence.gaps.join('|') + '|' + result.intelligence.potentialContradictions.join('|'),
  );
  const visibleCacheKey = preferences.model
    ? engineReviewCacheKey(preferences.model, prompt, researchFingerprint)
    : '';
  const savedReview = findCachedEngineReview(opinions, preferences.model, prompt, researchFingerprint);
  const [reviewState, setReviewState] = useState({ key: visibleCacheKey, text: savedReview?.text ?? '' });
  const [externalKeyAvailable, setExternalKeyAvailable] = useState<boolean | null>(null);
  const review = reviewState.key === visibleCacheKey ? reviewState.text : savedReview?.text ?? '';
  const op = useOperation();
  const reviewInFlightRef = useRef(false);

  const runReview = async (automaticTriggerKey?: string) => {
    if (reviewInFlightRef.current) {
      if (automaticTriggerKey) automaticReviewStarted.delete(automaticTriggerKey);
      return;
    }
    reviewInFlightRef.current = true;
    let reviewSucceeded = false;
    try {
      await op.run(async () => {
        const key = await getKey('openrouter');
        setExternalKeyAvailable(Boolean(key));
        if (!key) throw new Error(fa ? 'ابتدا کلید OpenRouter را در تنظیمات ذخیره کن.' : 'Save your OpenRouter key in Settings first.');

        const current = useScout.getState().data;
        const storedModel = current.preferences.model;
        const cachedStoredModel = findCachedEngineReview(current.opinions, storedModel, prompt, researchFingerprint);
        if (cachedStoredModel && storedModel) {
          setReviewState({
            key: engineReviewCacheKey(storedModel, prompt, researchFingerprint),
            text: cachedStoredModel.text,
          });
          reviewSucceeded = true;
          return;
        }

        // Saved model IDs can be removed or stop being free. Validate every new
        // generation against the live zero-price catalogue for both auto and manual.
        const models = await getFreeModels();
        const model = selectFreeModel(models, storedModel);
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
          return;
        }

        // getOpinion owns a global in-flight guard and finally release. Generation
        // is called once; this flow intentionally adds no automatic POST retry.
        const response = await getOpinion(key, model, prompt, async () => {
          const currentPreferences = useScout.getState().data.preferences;
          const usage = nextOpenRouterUsage(
            currentPreferences.openRouterUsageDay,
            currentPreferences.openRouterRequestsToday,
            localDateKey(),
          );
          await useScout.getState().commit((data) => ({
            ...data,
            preferences: { ...data.preferences, model, ...usage },
          }));
        });
        const opinion = {
          id: uid(),
          ideaId: cacheKey,
          text: response,
          model,
          createdAt: Date.now(),
        };
        setReviewState({ key: cacheKey, text: response });
        await useScout.getState().commit((data) => ({
          ...data,
          opinions: [opinion, ...data.opinions].slice(0, 100),
        }));
        reviewSucceeded = true;
      }, fa ? 'بازبینی AI با خروجی موتور داخلی ذخیره شد.' : 'AI review of the internal engine was saved.');
    } finally {
      reviewInFlightRef.current = false;
      // Release the duplicate guard after a failed auto attempt, so next launch
      // or a manual retry is not blocked for the remainder of this session.
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
    }).catch(() => {
      automaticReviewStarted.delete(triggerKey);
    });
  }, [preferences.hybridIntelligence, savedReview, prompt, researchFingerprint, externalKeyAvailable]);

  return (
    <Panel>
      <BadgeText>{review ? 'EXTERNAL AI · REVIEW SAVED' : 'EXTERNAL AI · SECOND OPINION'}</BadgeText>
      <Heading>{fa ? 'نقد مستقل هوش مصنوعی' : 'Independent AI second opinion'}</Heading>
      <Txt muted>{fa
        ? 'موتور داخلی شواهد و محدودیت‌ها را استخراج می‌کند؛ AI دوم همان خروجی پردازش‌شده را نقد می‌کند. فقط موضوع و شاخص‌های تجمیعی مجاز ارسال می‌شوند، نه متن خبر یا فراداده خام YouTube.'
        : 'The local engine extracts evidence signals and limitations; the external model independently critiques that processed output. Only the topic and approved aggregate indicators are sent — never raw news or YouTube metadata.'}</Txt>
      {savedReview ? <Txt muted>{'Model: ' + savedReview.model + ' · Reviewed: ' + new Date(savedReview.createdAt).toLocaleString()}</Txt> : null}
      <Txt muted>{op.busy
        ? (fa ? 'تحلیل دوم در حال اجراست…' : 'External second opinion is running…')
        : preferences.hybridIntelligence
          ? externalKeyAvailable === false
            ? (fa ? 'هوش ترکیبی روشن است؛ برای فعال‌شدن نظر دوم خودکار، کلید OpenRouter را در تنظیمات ذخیره کن.' : 'Hybrid intelligence is enabled. Save an OpenRouter key in Settings to activate automatic reviews.')
            : (fa ? 'هوش ترکیبی روشن است؛ پس از تکمیل تحلیل محلی، نظر دوم به‌صورت خودکار درخواست می‌شود. فقط خلاصه و شاخص‌های پردازش‌شده ارسال می‌شوند.' : 'Hybrid intelligence is on. A second opinion runs automatically after local analysis; only processed summaries and aggregate signals are sent.')
          : (fa ? 'اجرای خودکار خاموش است؛ می‌توانی نظر دوم را دستی بگیری.' : 'Automatic review is off. You can still request a manual second opinion.')}</Txt>
      <Action busy={op.busy} onPress={() => void runReview()}>
        {fa ? 'گرفتن نظر دوم از AI خارجی' : 'Ask external AI for its second opinion'}
      </Action>
      {op.error ? <ErrorBox message={op.error} onRetry={() => void runReview()} /> : null}
      {op.message ? <Txt muted>{op.message}</Txt> : null}
      {review ? <Txt>{review}</Txt> : null}
    </Panel>
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
  const localData = useScout((state) => state.data);
  const preferences = localData.preferences;
  const ideas = localData.ideas;
  const reports = localData.reports;
  const memoryCount = localData.researchMemory.length;
  const youtubeBudget = localData.budget;
  const quotaDate = quotaDay();
  const quotaUsage = youtubeBudget.date === quotaDate
    ? youtubeBudget
    : { date: quotaDate, units: 0, requests: 0, exhausted: false };
  const fa = preferences.uiLanguage === 'fa';
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);
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
        const result = await fetchSpaceNews(preferences.spaceNewsSources, fetch, force);
        const relevantNews = preferences.selectedSpaceNiche === 'all'
          ? result.items
          : newsForNiche(result.items, preferences.selectedSpaceNiche, preferences.customSpaceNiche);

        // Show the latest feed preview first and defer CPU-heavy local analysis until
        // gestures/navigation settle, so scroll and tab changes remain responsive.
        setRadarNews(relevantNews);
        setWarnings(result.warnings);
        setLastScannedAt(Date.now());
        // Yield one frame before local CPU work so the native UI can paint and respond.
        await new Promise<void>((resolve) => setTimeout(resolve, 32));

        const currentData = useScout.getState().data;
        const priorMemory = currentData.researchMemory.find(
          (entry) => normalizeResearchText(entry.topic) === normalizeResearchText(discoveryTopic),
        );
        const nextRadarBrief = relevantNews.length ? buildInternalResearch({
          topic: discoveryTopic,
          feedback: buildResearchInterestProfile(currentData.ideas),
          priorMemory,
          language: currentData.preferences.uiLanguage ?? 'fa',
          news: relevantNews.slice(0, 24).map((item) => ({
            title: item.title,
            summary: item.summary,
            sourceName: item.sourceName,
            sourceUrl: item.url,
            publishedAt: item.publishedAt,
            sourceId: item.sourceId,
          })),
        }) : undefined;
        const automaticIdeas = generateEditorialIdeas({
          topic: discoveryTopic,
          news: relevantNews,
          existingIdeas: currentData.ideas,
          region: currentData.preferences.region,
          languages: currentData.preferences.languages,
          language: currentData.preferences.uiLanguage ?? 'fa',
          evidenceKey: 'rss:' + relevantNews.map((item) => item.url).sort().join('|'),
          skipExistingEvidence: true,
          limit: 3,
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

        rememberTopicDossier(discoveryTopic, { news: relevantNews, internalAnalysis: nextRadarBrief });
        setNicheSuggestions(buildNicheSuggestions(result.items, 6).filter((suggestion) => !suggestion.id.startsWith('story:')));
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
        const result = buildInternalResearch({
          topic: report.input.topic,
          videos,
          news: currentNews,
          feedback: buildResearchInterestProfile(useScout.getState().data.ideas),
          language: preferences.uiLanguage ?? 'fa',
        });
        if (active) setReportAnalysisState({ id: report.id, result });
      } catch {
        if (active) setWarnings([fa
          ? 'تحلیل محلی آخرین جست‌وجو کامل نشد؛ گزارش و ویدئوهای ذخیره‌شده همچنان در دسترس‌اند.'
          : 'The latest local analysis could not be completed. The saved report and videos remain available.']);
      }
    }, 0);
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
  const deskNews = radarNews;
  const deskVideos = showYouTubeResearch ? latestReportVideos : [];
  const rssGenerationKey = 'rss:' + deskNews.map((item) => item.url).sort().join('|');
  const deskIdeas = ideas.filter((idea) =>
    idea.engineGenerated && !idea.archived &&
    (showYouTubeResearch ? idea.reportId === latestReport?.id : idea.generationKey === rssGenerationKey),
  ).slice(0, 3);
  const bestIdea = useMemo(() => chooseBestIdea(ideas), [ideas]);
  const rankedIdeas = useMemo(() => rankDashboardIdeasForHome(ideas), [ideas]);
  const recommendations = (deskIdeas.length ? deskIdeas : rankedIdeas)
    .filter((idea) => idea.id !== bestIdea?.id)
    .slice(0, 3);

  const nicheTerms = useMemo<string[]>(() => {
    if (preferences.selectedSpaceNiche === 'custom') {
      return preferences.customSpaceNiche.split(/[,;\n]+/).map((term) => term.trim()).filter(Boolean);
    }
    return preferences.selectedSpaceNiche === 'all' ? [] : niche?.keywords ? [...niche.keywords] : [];
  }, [preferences.selectedSpaceNiche, preferences.customSpaceNiche, niche]);
  const feedTopic = preferences.selectedSpaceNiche === 'all'
    ? latestReport?.input.topic ?? discoveryTopic
    : discoveryTopic;
  const [dashboardNow] = useState(() => Date.now());
  const feedVideos = useMemo(
    () => selectDashboardVideos(latestReportVideoRecords ?? [], feedTopic, nicheTerms, dashboardNow, 5),
    [latestReportVideoRecords, feedTopic, nicheTerms, dashboardNow],
  );

  return (
    <Page title="MOHSEN SCOUT">
      <View style={{ gap: 14 }}>
        <Panel>
          <BadgeText>{fa ? 'خلاصه تصمیم · نقطه شروع' : 'DECISION SUMMARY · START HERE'}</BadgeText>
          <Heading>{fa ? 'وضعیت تحقیق در یک نگاه' : 'Research at a glance'}</Heading>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flexGrow: 1, flexBasis: 110 }}>
              <BadgeText>{fa ? 'گزارش‌های ذخیره‌شده' : 'SAVED REPORTS'}</BadgeText>
              <Heading>{String(reports.length)}</Heading>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 110 }}>
              <BadgeText>{fa ? 'ایده‌های فعال' : 'ACTIVE IDEAS'}</BadgeText>
              <Heading>{String(rankedIdeas.length)}</Heading>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 110 }}>
              <BadgeText>{fa ? 'خبرهای دریافت‌شده' : 'NEWS ITEMS'}</BadgeText>
              <Heading>{String(radarNews.length)}</Heading>
            </View>
          </View>
          <Txt muted>{fa
            ? 'اولویت بعدی، بهترین ایدهٔ قابل بررسی است؛ شواهد و محدودیت‌ها در بخش‌های پایین‌تر آمده‌اند.'
            : 'Start with the best idea to validate. Supporting evidence and limitations are grouped below.'}</Txt>
        </Panel>

        <Panel>
          <BadgeText>{fa ? 'انتخاب اول · ایدهٔ برتر' : 'YOUR NEXT MOVE · TOP IDEA'}
          <Heading>{fa ? 'بهترین ایده برای توسعه' : 'Best idea to develop'}</Heading>
          {bestIdea ? (
            <View style={{ gap: 8 }}>
              <SourceHeading>{bestIdea.topic}</SourceHeading>
              <BadgeText>{bestIdea.assessment}</BadgeText>
              <Txt>{bestIdea.concept.slice(0, 340)}</Txt>
              <Txt muted>{fa
                ? 'شواهد پیوندخورده: ' + (bestIdea.videoIds.length + (bestIdea.reportId ? 1 : 0) + (bestIdea.sourceUrl ? 1 : 0)) + ' مورد · آخرین تغییر: ' + new Date(bestIdea.createdAt).toLocaleDateString()
                : 'Linked evidence references: ' + (bestIdea.videoIds.length + (bestIdea.reportId ? 1 : 0) + (bestIdea.sourceUrl ? 1 : 0)) + ' · Updated: ' + new Date(bestIdea.createdAt).toLocaleDateString()}</Txt>
              <Action onPress={() => router.push({ pathname: '/detail', params: { idea: bestIdea.id } })}>
                {fa ? 'باز کردن ایده و شواهد' : 'Open idea and evidence'}
              </Action>
            </View>
          ) : (
            <>
              <Txt muted>{fa
                ? 'هنوز ایدهٔ فعالی برای اولویت‌بندی وجود ندارد. ابتدا یک موضوع را در YouTube جست‌وجو کن یا از شواهد Space Radar ایده بساز.'
                : 'There is no active idea to prioritize yet. Search a YouTube topic or generate an idea from Space Radar evidence.'}</Txt>
              <Action onPress={() => router.push({ pathname: '/youtube', params: { topic: discoveryTopic } })}>
                {fa ? 'شروع جست‌وجوی موضوع' : 'Start a topic search'}
              </Action>
            </>
          )}
        </Panel>

        <Panel>
          <BadgeText>{fa ? 'تحقیق و تصمیم' : 'RESEARCH · EVIDENCE · DECISION'}</BadgeText>
          <Heading>{fa ? 'نتیجهٔ ترکیبی خبرها و YouTube' : 'Combined news and YouTube assessment'}</Heading>
          <Txt muted>{fa
            ? 'موتور داخلی خبرهای رسمی و نمونه ویدئوها را در یک تحلیل کنار هم قرار می‌دهد؛ هر منبع و آمار همچنان جداگانه قابل بررسی است.'
            : 'The local engine evaluates official news and YouTube samples together while keeping each source and metric individually inspectable.'}</Txt>
          {latestReport ? (
            <View style={{ gap: 7 }}>
              <SourceHeading>{latestReport.input.topic}</SourceHeading>
              <Txt muted>{new Date(latestReport.createdAt).toLocaleString()} · {latestReport.videos.length} {fa ? 'ویدئوی نمونه' : 'sample videos'}</Txt>
              {latestReport.queries.length ? <Txt muted>{(fa ? 'عبارت‌های جست‌وجو: ' : 'Searches: ') + latestReport.queries.slice(0, 4).join(' · ')}</Txt> : null}
              <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: latestReport.input.topic, report: latestReport.id } })}>
                {fa ? 'باز کردن گزارش کامل و همهٔ نتایج' : 'Open full report and results'}
              </Action>
            </View>
          ) : (
            <Txt muted>{fa ? 'هنوز گزارش YouTube ذخیره‌شده‌ای وجود ندارد.' : 'No saved YouTube research report is available yet.'}</Txt>
          )}
          {deskAnalysis ? (
            <View style={{ gap: 8 }}>
              <Heading>{fa ? 'تصمیم موتور داخلی' : 'Internal engine assessment'}</Heading>
              <Txt>{deskAnalysis.summary}</Txt>
              <Txt muted>{fa
                ? 'این جمع‌بندی محلی است؛ تعداد نمونه‌ها به‌تنهایی تقاضا یا محبوبیت مخاطب را اثبات نمی‌کند.'
                : 'This is a local evidence summary; sample counts alone do not establish audience demand or popularity.'}</Txt>
              <Fold title={fa ? 'شواهد اصلی و محدودیت‌ها' : 'Primary evidence and limitations'} open>
                {deskAnalysis.evidence.slice(0, 5).map((item) => (
                  <View key={item.id} style={{ gap: 3 }}>
                    <BadgeText>{item.label}</BadgeText>
                    <Txt muted>{item.detail}</Txt>
                  </View>
                ))}
                <AnalysisSignals result={deskAnalysis} />
                <Fold title={fa ? 'نقشهٔ شواهد و ارتباط‌ها' : 'Evidence map and relationships'}>
                  <ResearchKnowledgeGraph
                    topic={deskTopic}
                    news={deskNews}
                    videos={deskVideos}
                    analysis={deskAnalysis}
                    language={preferences.uiLanguage ?? 'fa'}
                    generatedIdeas={deskIdeas}
                  />
                </Fold>
                <Fold title={fa ? 'زاویه‌های تحریری و راستی‌آزمایی' : 'Editorial angles and verification'}>
                  {deskAnalysis.angles.slice(0, 3).map((angle) => (
                    <View key={angle.id} style={{ gap: 5 }}>
                      <Heading>{angle.title}</Heading>
                      <Txt>{angle.hook}</Txt>
                      <Txt muted>{angle.approach}</Txt>
                      <Txt muted>{(fa ? 'راستی‌آزمایی: ' : 'Verify: ') + angle.verification}</Txt>
                    </View>
                  ))}
                </Fold>
              </Fold>
              <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: deskTopic } })}>
                {fa ? 'ادامه در Deep Research' : 'Continue in Deep Research'}
              </Action>
            </View>
          ) : showYouTubeResearch ? (
            <Txt muted>{fa ? 'گزارش آماده است؛ تحلیل محلی پس از پایان تعاملات صفحه ساخته می‌شود.' : 'The report is ready. Local analysis is being prepared after the screen interaction finishes.'}</Txt>
          ) : radarBrief ? (
            <Txt>{radarBrief.summary}</Txt>
          ) : (
            <Txt muted>{fa
              ? 'برای دیدن تصمیم موتور داخلی، یک جست‌وجوی YouTube اجرا کن یا Space Radar را به‌روز کن.'
              : 'Run a YouTube search or refresh Space Radar to see the local engine assessment here.'}</Txt>
          )}
          {reports.length > 1 ? (
            <Fold title={fa ? 'جست‌وجوهای اخیر' : 'Recent searches'}>
              {reports.slice(0, 5).map((report) => (
                <Action
                  key={report.id}
                  secondary
                  onPress={() => router.push({ pathname: '/youtube', params: { topic: report.input.topic, report: report.id } })}
                >
                  {report.input.topic + ' · ' + new Date(report.createdAt).toLocaleDateString()}
                </Action>
              ))}
            </Fold>
          ) : null}
        </Panel>

        {deskAnalysis ? <EngineAIReview topic={deskTopic} result={deskAnalysis} /> : null}

        <Panel>
          <ResearchOverviewChart
            analysis={deskAnalysis}
            ideas={deskIdeas}
            videoCount={deskVideos.length}
            language={preferences.uiLanguage ?? 'fa'}
          />
        </Panel>

        <Panel>
          <BadgeText>{fa ? 'گام بعدی' : 'NEXT ACTIONS'}</BadgeText>
          <Heading>{fa ? 'ایده‌ها و زاویه‌های پیشنهادی' : 'Recommended ideas and angles'}</Heading>
          {recommendations.length ? recommendations.map((idea) => (
            <View key={idea.id} style={{ gap: 6 }}>
              <SourceHeading>{idea.topic}</SourceHeading>
              <BadgeText>{idea.assessment + ' · ' + (idea.ideaCategory ?? (fa ? 'ایدهٔ ذخیره‌شده' : 'Saved idea'))}</BadgeText>
              <Txt muted>{idea.concept.slice(0, 250)}</Txt>
              <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: idea.id } })}>
                {fa ? 'بررسی این ایده' : 'Review this idea'}
              </Action>
            </View>
          )) : deskAnalysis?.angles.length ? deskAnalysis.angles.slice(0, 3).map((angle) => (
            <View key={angle.id} style={{ gap: 5 }}>
              <SourceHeading>{angle.title}</SourceHeading>
              <Txt muted>{angle.hook}</Txt>
              <Txt muted>{angle.verification}</Txt>
              <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: deskTopic } })}>
                {fa ? 'بررسی این زاویه در YouTube' : 'Research this angle on YouTube'}
              </Action>
            </View>
          )) : (
            <Txt muted>{fa ? 'پس از دریافت شواهد واقعی، پیشنهادهای مرتبط اینجا ظاهر می‌شوند.' : 'Evidence-backed suggestions will appear here after a research sample is available.'}</Txt>
          )}
          <Action secondary onPress={() => router.push('/opportunities')}>
            {fa ? 'مشاهدهٔ همهٔ ایده‌ها و فرصت‌ها' : 'Open all ideas and opportunities'}
          </Action>
        </Panel>

        <Panel>
          <BadgeText>{fa ? 'نمونهٔ واقعی · فقط موضوع انتخاب‌شده' : 'REAL SAMPLE · SELECTED NICHE ONLY'}</BadgeText>
          <Heading>{fa ? 'ویدئوهای مرتبط با موضوع' : 'YouTube videos for this niche'}</Heading>
          <Txt muted>{fa
            ? 'مرتب‌سازی بر اساس تعداد بازدید خام موجود در همین نمونه؛ این ترتیب، سرعت رشد یا احتمال وایرال‌شدن نیست.'
            : 'Sorted by available raw view counts in this saved sample; this is not growth velocity or a prediction of virality.'}</Txt>
          {feedVideos.length ? feedVideos.map((video) => (
            <VideoRow key={video.id} video={video} topic={feedTopic} />
          )) : (
            <>
              <Txt muted>{fa
                ? 'نمونهٔ ذخیره‌شده و منطبق با این موضوع پیدا نشد. برای جلوگیری از نمایش ویدئوهای نامرتبط، فید خالی نگه داشته شده است.'
                : 'No saved video sample matches this niche. Unrelated videos are intentionally not shown.'}</Txt>
              <Action onPress={() => router.push({ pathname: '/youtube', params: { topic: feedTopic } })}>
                {fa ? 'جست‌وجوی ویدئوهای این موضوع' : 'Search YouTube for this niche'}
              </Action>
            </>
          )}
        </Panel>

        <Panel>
          <BadgeText>SPACE RADAR</BadgeText>
          <Heading>{nicheTitle}</Heading>
          <Txt muted>{niche?.description ?? (fa
            ? 'خوراک‌های رسمی ناشرها برای این موضوع گردآوری می‌شوند؛ خبرها به‌تنهایی اثبات ترند یا تقاضا نیستند.'
            : 'Official publisher feeds are grouped into this topic. Headlines alone do not prove a trend or audience demand.')}</Txt>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <View style={{ flex: 1, minWidth: 130 }}>
              <Action busy={scanning || op.busy} onPress={() => void op.run(
                () => runScan(true),
                fa ? 'به‌روزرسانی Space Radar کامل شد.' : 'Space Radar refresh completed.',
              )}>
                {fa ? 'به‌روزرسانی خوراک‌ها' : 'Refresh Space Radar'}
              </Action>
            </View>
            <View style={{ flex: 1, minWidth: 130 }}>
              <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: discoveryTopic } })}>
                {fa ? 'جست‌وجوی YouTube' : 'Search YouTube'}
              </Action>
            </View>
          </View>
          <Txt muted>{lastScannedAt
            ? (fa ? 'آخرین بررسی: ' : 'Last source update: ') + new Date(lastScannedAt).toLocaleString()
            : (fa ? 'در حال بررسی خوراک‌های رسمی انتخاب‌شده…' : 'Checking selected official feeds…')} · {radarNews.length} {fa ? 'گزارش مرتبط' : 'matching reports'}</Txt>
          {scanning ? <Txt muted>{fa ? 'به‌روزرسانی بدون مسدودکردن جابه‌جایی تب‌ها انجام می‌شود؛ می‌توانی به بخش دیگری بروی.' : 'The refresh does not block tab navigation; you can move to another section.'}</Txt> : null}
          {warnings.slice(0, 2).map((warning, index) => <Txt muted key={String(index) + warning}>{warning}</Txt>)}
        </Panel>

        {nicheSuggestions.length ? (
          <Panel>
            <Heading>{fa ? 'سرنخ‌های پژوهشی دیگر' : 'Other research leads'}</Heading>
            {nicheSuggestions.slice(0, 3).map((suggestion: SpaceNicheSuggestion) => (
              <View key={suggestion.id} style={{ gap: 5 }}>
                <SourceHeading>{suggestion.title}</SourceHeading>
                <Txt muted>{suggestion.description}</Txt>
                <Txt muted>{suggestion.matchedStories + (fa ? ' گزارش ناشر منطبق' : ' matching publisher stories') + (suggestion.newestAt ? ' · ' + new Date(suggestion.newestAt).toLocaleDateString() : '')}</Txt>
                <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: suggestion.topic } })}>
                  {fa ? 'تحقیق دربارهٔ این موضوع' : 'Research this lead'}
                </Action>
              </View>
            ))}
          </Panel>
        ) : null}

        <Panel>
          <BadgeText>{fa ? 'دسترسی سریع' : 'QUICK ACCESS'}</BadgeText>
          <Heading>{fa ? 'ابزارهای تحقیق و مدیریت' : 'Research and workspace tools'}</Heading>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Action secondary onPress={() => router.push('/news')}>News</Action>
            <Action secondary onPress={() => router.push('/deep-research')}>Deep Research</Action>
            <Action secondary onPress={() => router.push('/trend-intelligence')}>Trend Intelligence</Action>
            <Action secondary onPress={() => router.push('/search-demand')}>Wikimedia</Action>
            <Action secondary onPress={() => router.push('/notes')}>Notes</Action>
            <Action secondary onPress={() => router.push('/library')}>Library</Action>
            <Action secondary onPress={() => router.push('/opportunities')}>Opportunities</Action>
            <Action secondary onPress={() => router.push('/settings')}>Settings</Action>
          </View>
          <Fold title={fa ? 'وضعیت خودکارسازی و اطلاعات فنی' : 'Automation and technical details'}>
            <Txt muted>{fa
              ? 'جست‌وجوی خودکار YouTube: ' + (preferences.schedule === 'Manual' ? 'خاموش' : preferences.paused ? 'متوقف' : preferences.schedule)
              : 'Automatic YouTube research: ' + (preferences.schedule === 'Manual' ? 'Off' : preferences.paused ? 'Paused' : preferences.schedule)}</Txt>
            <Txt muted>{fa
              ? 'نظر دوم AI: ' + (preferences.hybridIntelligence ? 'خودکار و روشن' : 'فقط دستی')
              : 'External AI second opinion: ' + (preferences.hybridIntelligence ? 'Automatic and enabled' : 'Manual only')}</Txt>
            <Txt muted>{'Today: ' + quotaUsage.units + ' / ' + preferences.budget + ' YouTube quota units · ' + quotaUsage.requests + ' requests.'}</Txt>
            <Txt muted>{memoryCount + (fa ? ' موضوع در حافظهٔ پژوهش محلی' : ' topics in local research memory') + ' · ' + reports.length + ' saved reports'}</Txt>
            <Action secondary onPress={() => router.push('/settings')}>
              {fa ? 'تنظیم کلیدها و خودکارسازی' : 'Configure API keys and automation'}
            </Action>
          </Fold>
        </Panel>
        {op.error ? <ErrorBox message={op.error} onRetry={op.clear} /> : null}
        {op.message ? <Txt muted>{op.message}</Txt> : null}
      </View>
    </Page>
  );
}
