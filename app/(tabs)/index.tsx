import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Search } from 'lucide-react-native';

import { router } from 'expo-router';
import {
  Page, Panel, Heading, Txt, Action, Fold, Field, styles, ErrorBox,
  SourceHeading, SourceText, BadgeText, MetricCard,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { palette as p } from '@/lib/theme';
import { useShallow } from 'zustand/react/shallow';
import { uid, type Idea, DEFAULT_SECOND_OPINION_ORDER } from '@/lib/types';
import { SPACE_NICHES, getCachedSpaceNews } from '@/lib/space';
import { buildInternalResearch, rankNewsForTopic, type InternalResearchResult } from '@/lib/engine';
import { buildResearchInterestProfile, normalizeResearchText, scoreResearchText } from '@/lib/intelligence';
import { getTopicDossier } from '@/lib/topic-dossier';
import { VideoRow } from '@/components/VideoRow';
import { collectEngineVideoEvidence, engineReviewCacheKey, findCachedEngineReview, selectDashboardIdeas, selectDashboardVideos } from '@/lib/dashboard';
import { fingerprintText, getFreeModels, getOpenRouterDailyQuota, formatStructuredSecondOpinion, structuredSecondOpinionPrompt, localDateKey, nextOpenRouterUsage, selectFreeModel } from '@/lib/api';
import { getKey } from '@/lib/vault';
import { requestSecondOpinionWithFallback, type SecondOpinionProviderConfig } from '@/lib/ai-gateway';
import { ResearchOverviewChart } from '@/components/ResearchOverviewChart';
import { recordRuntimeFinish, recordRuntimeStart, runtimeErrorHint, useRuntimeMetrics } from '@/lib/runtime-metrics';
import { useSelectedIdeaId } from '@/lib/idea-selection';


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
        ? 'خبرهای هم‌موضوع در نمونه ناشران: ' + audit.topicMatchedNewsCount + ' از ' + audit.uniqueNewsCount + ' · بررسی تاریخ انتشار و هم‌پوشانی منبع برای جلوگیری از دوباره‌شماری انجام شده است.'
        : 'Topic-matched publisher reports: ' + audit.topicMatchedNewsCount + '/' + audit.uniqueNewsCount + ' · Publication dates and source overlap are checked to reduce duplicate counting.'}</Txt>
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
          <Heading>{fa ? 'مفهوم‌های تکرارشده در خبرها و زمینه تحقیق' : 'Recurring concepts in publisher and research context'}</Heading>
          <SourceText>{result.intelligence.sharedConcepts.join(fa ? '، ' : ', ')}</SourceText>
          <Txt muted>{fa
            ? 'این بخش فقط هم‌پوشانی واژگانی منابع ناشر و زمینه تحقیق را نشان می‌دهد، نه تقاضا یا توافق معنایی.'
            : 'This is wording overlap in publisher sources and research context, not proof of semantic agreement or audience demand.'}</Txt>
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

function EngineAIReview({ topic, idea }: { topic: string; idea?: Idea }) {
  const preferences = useScout(useShallow((state) => ({
    preferredProvider: state.data.preferences.secondOpinionProvider ?? 'gemini',
    providerOrder: state.data.preferences.secondOpinionOrder,
    providerModels: state.data.preferences.secondOpinionModels,
    uiLanguage: state.data.preferences.uiLanguage,
    openRouterUsageDay: state.data.preferences.openRouterUsageDay,
    openRouterRequestsToday: state.data.preferences.openRouterRequestsToday,
  })));
  const opinions = useScout((state) => state.data.opinions);
  const fa = preferences.uiLanguage === 'fa';
  const centralQuestion = idea?.concept.match(/(?:Central question:|پرسش محوری:)\s*([^\n]+)/i)?.[1] ?? '';
  const candidateConcept = idea
    ? [
        'Proposed title: ' + idea.topic,
        idea.ideaCategory ? 'Editorial format: ' + idea.ideaCategory : '',
        centralQuestion ? 'Central question: ' + centralQuestion : '',
      ].filter(Boolean).join('\n')
    : 'Editorial angle to independently assess for the user-provided topic: ' + topic;
  const prompt = candidateConcept.trim()
    ? structuredSecondOpinionPrompt(topic, candidateConcept, fa ? 'fa' : 'en')
    : '';
  const savedOrder = preferences.providerOrder?.length ? preferences.providerOrder : DEFAULT_SECOND_OPINION_ORDER;
  const order = [preferences.preferredProvider, ...savedOrder.filter((provider) => provider !== preferences.preferredProvider)];
  const modelConfig = preferences.providerModels ?? {
    gemini: 'gemini-3.8-flash',
    groq: 'openai/gpt-oss-120b',
    cloudflare: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    openrouter: '',
  };
  const providerIdentity = order.map((provider) => provider + ':' + modelConfig[provider]).join('|');
  const researchFingerprint = fingerprintText(topic + '|' + prompt);
  const visibleCacheKey = prompt.trim()
    ? engineReviewCacheKey(providerIdentity, prompt, researchFingerprint)
    : '';
  const savedReview = findCachedEngineReview(opinions, providerIdentity, prompt, researchFingerprint);
  const [reviewState, setReviewState] = useState({ key: visibleCacheKey, text: savedReview?.text ?? '' });
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const review = reviewState.key === visibleCacheKey ? reviewState.text : savedReview?.text ?? '';
  const reviewInFlightRef = useRef(false);

  const runReview = async () => {
    if (reviewInFlightRef.current || !prompt.trim()) return;
    reviewInFlightRef.current = true;
    recordRuntimeStart('AI');
    setReviewBusy(true);
    setReviewError('');
    setReviewMessage('');
    let reviewSucceeded = false;
    let reviewFromCache = false;
    let reviewFailure = '';
    try {
      const cached = findCachedEngineReview(useScout.getState().data.opinions, providerIdentity, prompt, researchFingerprint);
      if (cached) {
        setReviewState({ key: visibleCacheKey, text: cached.text });
        reviewSucceeded = true;
        reviewFromCache = true;
        setReviewMessage(fa ? 'نظر ذخیره‌شده بارگذاری شد.' : 'Saved second opinion loaded.');
        return;
      }

      const currentPreferences = useScout.getState().data.preferences;
      const savedOrder = currentPreferences.secondOpinionOrder?.length
        ? currentPreferences.secondOpinionOrder
        : DEFAULT_SECOND_OPINION_ORDER;
      const preferredProvider = currentPreferences.secondOpinionProvider ?? savedOrder[0];
      const currentOrder = [preferredProvider, ...savedOrder.filter((provider) => provider !== preferredProvider)];
      const currentModels = currentPreferences.secondOpinionModels ?? modelConfig;
      const configs: SecondOpinionProviderConfig[] = [];
      for (const provider of currentOrder) {
        const kind = provider === 'openrouter' ? 'openrouter' : provider;
        const key = await getKey(kind);
        if (!key) continue;
        if (provider === 'cloudflare') {
          const accountId = await getKey('cloudflare-account-id');
          configs.push({
            provider,
            key,
            accountId: accountId ?? undefined,
            model: currentModels.cloudflare || modelConfig.cloudflare,
          });
          continue;
        }
        if (provider === 'openrouter') {
          let available: Awaited<ReturnType<typeof getFreeModels>> = [];
          try {
            available = await getFreeModels();
          } catch {
            continue;
          }
          const model = selectFreeModel(available, currentModels.openrouter || currentPreferences.model || '');
          if (!model) continue;
          configs.push({ provider, key, model });
          continue;
        }
        configs.push({
          provider,
          key,
          model: currentModels[provider] || modelConfig[provider],
        });
      }
      if (!configs.length) {
        throw new Error(fa
          ? 'هیچ Provider فعالی پیدا نشد. حداقل یک کلید را در تنظیمات ذخیره و آزمایش کن.'
          : 'No configured provider is available. Save and test at least one provider key in Settings.');
      }

      const resultFromProvider = await requestSecondOpinionWithFallback(
        configs,
        prompt,
        fetch,
        async (config) => {
          if (config.provider !== 'openrouter') return;
          const quota = config.model.toLowerCase().endsWith(':free')
            ? await getOpenRouterDailyQuota(config.key).catch(() => undefined)
            : undefined;
          if (quota && quota.remaining <= 0) {
            throw new Error('OpenRouter free-model daily quota is exhausted (' + quota.used + '/' + quota.limit + ' UTC).');
          }
          const latest = useScout.getState().data.preferences;
          const usage = nextOpenRouterUsage(
            latest.openRouterUsageDay,
            latest.openRouterRequestsToday,
            localDateKey(),
            quota?.limit ?? (config.model.toLowerCase().endsWith(':free') ? 50 : 10000),
            quota?.used,
          );
          await useScout.getState().commit((data) => ({
            ...data,
            preferences: {
              ...data.preferences,
              model: config.model,
              secondOpinionModels: {
                ...(data.preferences.secondOpinionModels ?? modelConfig),
                openrouter: config.model,
              },
              ...usage,
              ...(quota ? {
                openRouterDailyLimit: quota.limit,
                openRouterDailyUsed: quota.used + 1,
                openRouterDailyRemaining: Math.max(0, quota.remaining - 1),
                openRouterQuotaCheckedAt: Date.now(),
              } : {}),
            },
          }));
        },
      );
      const providerLabel = resultFromProvider.provider === 'cloudflare'
        ? 'Cloudflare Workers AI'
        : resultFromProvider.provider[0].toUpperCase() + resultFromProvider.provider.slice(1);
      const response = (fa
        ? 'ارائه‌دهنده: ' + providerLabel + ' · مدل: ' + resultFromProvider.model + '\n\n'
        : 'Provider: ' + providerLabel + ' · Model: ' + resultFromProvider.model + '\n\n') +
        formatStructuredSecondOpinion(resultFromProvider.opinion, fa ? 'fa' : 'en');
      const opinionCreatedAt = Date.now();
      const opinion = {
        id: uid(),
        ideaId: visibleCacheKey,
        text: response,
        model: providerIdentity,
        createdAt: opinionCreatedAt,
      };
      setReviewState({ key: visibleCacheKey, text: response });
      await useScout.getState().commit((data) => ({
        ...data,
        opinions: [opinion, ...data.opinions],
      }));
      reviewSucceeded = true;
      const failedCount = resultFromProvider.attempts.filter((attempt) => attempt.status !== 'success' && attempt.status !== 'disabled').length;
      setReviewMessage(fa
        ? providerLabel + ' نظر ساختاریافته را تأیید کرد.' + (failedCount ? ' · ' + failedCount + ' سرویس قبلی ناموفق بود.' : '')
        : providerLabel + ' returned a validated structured opinion.' + (failedCount ? ' · ' + failedCount + ' earlier provider attempt(s) failed.' : ''));
    } catch (error) {
      reviewFailure = error instanceof Error ? error.message : 'Second opinion failed.';
      setReviewError(reviewFailure);
    } finally {
      recordRuntimeFinish('AI', reviewFromCache ? 'partial' : reviewSucceeded ? 'success' : 'error', reviewFailure);
      reviewInFlightRef.current = false;
      setReviewBusy(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <BadgeText>{review ? 'SECOND OPINION · SAVED' : 'SECOND OPINION · MANUAL'}</BadgeText>
      <Heading>{fa ? 'بازبینی مستقل چندارائه‌دهنده‌ای' : 'Independent multi-provider review'}</Heading>
      <Txt muted>{fa
        ? 'فقط موضوع و عنوان/مفهوم پیشنهادی ارسال می‌شود. خبرها، داده YouTube، آمار، امتیاز و تصمیم موتور داخلی ارسال نمی‌شوند. ارسال به سرویس‌ها فقط پس از لمس دکمه انجام می‌شود و ممکن است تا رسیدن اولین پاسخ معتبر، به ارائه‌دهنده بعدی در ترتیب تنظیمات منتقل شود.'
        : 'Only the topic and candidate title/concept are sent. News, YouTube data, statistics, local scores and the engine decision are excluded. Nothing is sent until you press the button; the approved prompt may pass to the next configured provider until one returns a valid response.'}</Txt>
      {savedReview ? <Txt muted>{'Saved review · ' + new Date(savedReview.createdAt).toLocaleString()}</Txt> : null}
      <Txt muted>{reviewBusy
        ? (fa ? 'در حال دریافت و اعتبارسنجی نظر دوم…' : 'Requesting and validating the second opinion…')
        : (fa ? 'اولویت فعلی: ' + order.map((provider) => provider === 'cloudflare' ? 'Cloudflare' : provider).join(' ← ') : 'Fallback order: ' + order.map((provider) => provider === 'cloudflare' ? 'Cloudflare' : provider).join(' → '))}</Txt>
      <Action busy={reviewBusy} disabled={!prompt.trim()} onPress={() => void runReview()}>
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
  const ideas = useScout((state) => state.data.ideas);
  const reports = useScout((state) => state.data.reports);
  const storedVideos = useScout((state) => state.data.videos);
  const feedRegistry = useScout((state) => state.data.feedRegistry);
  const runtimeMetrics = useRuntimeMetrics();
  const selectedIdeaId = useSelectedIdeaId();
  const [healthExpanded, setHealthExpanded] = useState(false);
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
    failures: feedRegistry.reduce((sum, item) => sum + (item.failureCount ?? 0), 0),
    cachedItems: feedRegistry.reduce((sum, item) => sum + item.cachedItems.length, 0),
    lastSuccessAt: feedRegistry.reduce((latest, item) => Math.max(latest, item.lastSuccessAt ?? 0), 0),
  }), [feedRegistry]);
  const fa = preferences.uiLanguage === 'fa';
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dashboardNow] = useState(() => Date.now());
  const [reportAnalysisState, setReportAnalysisState] = useState<{ id: string; result: InternalResearchResult }>();

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
  const topicDossier = getTopicDossier(discoveryTopic);
  const cachedTopicAnalysis = topicDossier?.internalAnalysis;
  const topicWiki = topicDossier?.wiki;

  const latestReport = reports[0];
  const [quickTopicDraft, setQuickTopicDraft] = useState<string | undefined>(undefined);
  const quickTopic = quickTopicDraft ?? preferences.lastInput?.topic ?? latestReport?.input.topic ?? '';
  const latestReportId = latestReport?.id ?? '';
  const latestReportVideoRecords = latestReport?.videos;
  const engineVideoEvidence = useMemo(
    () => collectEngineVideoEvidence(reports, storedVideos),
    [reports, storedVideos],
  );
  useEffect(() => {
    if (!latestReportId) return;
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      const report = useScout.getState().data.reports.find((item) => item.id === latestReportId);
      if (!report) return;
      try {
        const currentNews = engineNews.map((item) => ({
          title: item.title,
          summary: item.summary,
          sourceName: item.sourceName,
          sourceUrl: item.url,
          publishedAt: item.publishedAt,
          sourceId: item.sourceId,
        }));
        const currentData = useScout.getState().data;
        const reportWiki = getTopicDossier(report.input.topic)?.wiki;
        const priorMemory = currentData.researchMemory.find((entry) => normalizeResearchText(entry.topic) === normalizeResearchText(report.input.topic));
        const result = buildInternalResearch({
          topic: report.input.topic,
          news: currentNews,
          feedback: buildResearchInterestProfile(currentData.ideas),
          priorMemory,
          language: preferences.uiLanguage ?? 'fa',
          ...(reportWiki ? { wiki: reportWiki } : {}),
          videoWindowDays: report.input.days,
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
  }, [latestReportId, engineNews, preferences.uiLanguage, fa]);

  const latestReportAnalysis = reportAnalysisState?.id === latestReportId
    ? reportAnalysisState.result
    : undefined;
  const showYouTubeResearch = engineVideoEvidence.length > 0;
  const deskTopic = latestReport?.input.topic ?? preferences.lastInput?.topic ?? discoveryTopic;
  const deskAnalysis = showYouTubeResearch ? latestReportAnalysis : undefined;
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
  const chartAnalysis = latestReportAnalysis ?? cachedTopicAnalysis;
  const chartTopic = latestReportAnalysis ? deskTopic : cachedTopicAnalysis ? discoveryTopic : deskTopic;
  const chartDossier = getTopicDossier(chartTopic);
  const chartWiki = chartDossier?.wiki ?? (chartTopic === discoveryTopic ? topicWiki : undefined);
  const chartNews = useMemo(
    () => rankNewsForTopic(chartTopic, engineNews, Math.max(1, engineNews.length)),
    [chartTopic, engineNews],
  );
  const chartIdeas = useMemo(() => selectDashboardIdeas(ideas, {
    sourceUrls: new Set(chartNews.filter((item) => scoreResearchText(chartTopic, item.title, item.summary) > 0).map((item) => item.url)),
    topic: chartTopic,
  }), [ideas, chartNews, chartTopic]);
  const bestIdea = chartIdeas[0];
  const ideaLinkage = useMemo(() => ({
    active: ideas.filter((idea) => !idea.archived && idea.status !== 'Rejected Ideas' && idea.status !== 'Completed Research').length,
    generated: ideas.filter((idea) => idea.engineGenerated === true).length,
    sourceLinked: ideas.filter((idea) => Boolean(idea.sourceUrl)).length,
    reportLinked: ideas.filter((idea) => Boolean(idea.reportId)).length,
    videoLinked: ideas.filter((idea) => idea.videoIds.length > 0).length,
  }), [ideas]);
  const deskIdeas = chartIdeas;
  const recommendations = chartIdeas.slice(1, 4);

  return (
    <Page
      title={fa ? 'دستیار ترند یوتیوب' : 'YouTube Trend Scout'}
      eyebrow={fa ? 'تحلیل هوشمند YouTube' : 'YOUTUBE INTELLIGENCE'}
      subtitle={fa
        ? 'موضوعی مشخص وارد کن؛ نمونهٔ واقعی نتایج YouTube و محدودیت‌های داده را بررسی کن.'
        : 'Enter a focused topic and inspect real YouTube results, evidence quality and sample limits.'}
    >
      <View style={{ gap: 15 }}>
        <ResearchOverviewChart
          analysis={chartAnalysis}
          ideas={chartIdeas}
          topic={chartTopic}
          news={chartNews}
          wiki={chartWiki}
          videos={[]}
          language={preferences.uiLanguage ?? 'fa'}
          selectedIdeaId={selectedIdeaId}
          secondOpinion={chartAnalysis
            ? <EngineAIReview topic={chartTopic} idea={bestIdea} />
            : undefined}
        />

        <Panel variant="hero">
          <View style={{ gap: 11 }}>
            <BadgeText>{fa ? 'شروع تحقیق' : 'START A RESEARCH RUN'}</BadgeText>
            <Heading>{fa ? 'موضوع ویدئوی بعدی‌ات را پیدا کن' : 'Find your next video topic'}</Heading>
            <Txt muted>{fa
              ? 'جست‌وجو فقط پس از اقدام تو انجام می‌شود. نتایج نامرتبط حذف می‌شوند و موتور ایده فقط از شواهد همین نمونه استفاده می‌کند.'
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
                ? 'هنوز تحقیقی اجرا نشده؛ با بازکردن داشبورد هیچ درخواست YouTube یا مصرف سهمیه‌ای انجام نمی‌شود.'
                : 'No research run yet. Opening the dashboard does not call YouTube or consume API quota.'}</Txt>
            )}
          </View>
        </Panel>

        {showYouTubeResearch ? (
          <Fold
            title={fa ? 'خلاصه تحقیق · نتیجه و محدودیت‌ها' : 'Research brief · Findings and limits'}
            summary={deskAnalysis
              ? (deskAnalysis.intelligence.confidence.level.toUpperCase() + ' confidence · ' +
                deskAnalysis.intelligence.sourceQuality.uniqueStories + ' reports · ' +
                engineVideoEvidence.length + ' retained videos')
              : (fa ? 'در انتظار تکمیل تحلیل نمونه' : 'Waiting for sample analysis')}
          >
            {deskAnalysis ? (
              <View style={{ gap: 10 }}>
                <View style={styles.softCard}>
                  <Text style={styles.label}>{fa ? 'برداشت اصلی از شواهد' : 'WHAT THE EVIDENCE SAYS'}</Text>
                  <Txt>{deskAnalysis.summary}</Txt>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  <MetricCard label={fa ? 'خبر یکتای تحلیل‌شده' : 'UNIQUE REPORTS'} value={deskAnalysis.intelligence.sourceQuality.uniqueStories} />
                  <MetricCard label={fa ? 'خوراک حاضر' : 'FEEDS REPRESENTED'} value={deskAnalysis.intelligence.sourceQuality.feedsRepresented} />
                  <MetricCard label={fa ? 'ویدئوی نگهداری‌شده' : 'RETAINED VIDEOS'} value={engineVideoEvidence.length} />
                  <MetricCard label={fa ? 'پرسش/خلأ باز' : 'OPEN GAPS'} value={deskAnalysis.intelligence.gaps.length + deskAnalysis.intelligence.potentialContradictions.length} />
                </View>
                <View style={styles.softCard}>
                  <Text style={styles.label}>{fa ? 'چه چیزی هنوز معلوم نیست؟' : 'WHAT IS STILL UNKNOWN'}</Text>
                  <Txt muted>{nextGap ?? (fa
                    ? 'خلأ مشخصی ثبت نشده؛ ادعاهای مهم را پیش از تولید با منبع اصلی بررسی کن.'
                    : 'No specific gap was flagged. Verify important claims against original sources before production.')}</Txt>
                </View>
                {sharedTerms.length ? (
                  <Txt muted>{(fa ? 'عبارت‌های تکرارشده در نمونه: ' : 'Repeated wording in this sample: ') + sharedTerms.slice(0, 4).join(fa ? '، ' : ', ') + (fa ? '؛ تکرار به‌تنهایی اثبات روند یا تقاضا نیست.' : '; repetition alone does not prove a trend or audience demand.')}</Txt>
                ) : null}
                {warnings.slice(0, 2).map((warning) => <Txt muted key={warning}>{warning}</Txt>)}
                {nextQuery ? (
                  <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: nextQuery } })}>
                    {fa ? 'بررسی پرسش پیشنهادی در YouTube' : 'Research the suggested question on YouTube'}
                  </Action>
                ) : null}
                <Action onPress={() => router.push({ pathname: '/deep-research', params: { topic: deskTopic } })}>
                  {fa ? 'ادامه در تحقیق عمیق' : 'Continue in Deep Research'}
                </Action>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Txt muted>{fa
                  ? 'نمونه ویدئویی ذخیره شده است، اما تحلیل موضوع‌محور هنوز آماده نیست. گزارش و ویدئوها حفظ شده‌اند.'
                  : 'A saved video sample exists, but its topic-specific analysis is not ready yet. The report and video records remain available.'}</Txt>
                <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: deskTopic } })}>
                  {fa ? 'بازبینی نمونه YouTube' : 'Review the YouTube sample'}
                </Action>
              </View>
            )}
          </Fold>
        ) : null}


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

        <Panel>
          <Heading>{fa ? 'ابزارهای تکمیلی تحقیق' : 'Additional research tools'}</Heading>
          <Txt muted>{fa
            ? 'ابزارهای مستقل برنامه از همین داشبورد هم در دسترس‌اند؛ هرکدام مسیر و خروجی تخصصی خود را دارند.'
            : 'The app’s dedicated research tools are also accessible here, each with its own focused workflow and results.'}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flexGrow: 1, flexBasis: 180 }}>
              <Panel variant="soft">
                <Heading>{fa ? 'تحقیق عمیق' : 'Deep Research'}</Heading>
                <Txt muted>{fa ? 'ساخت پرونده تحقیق با منابع و پرسش‌های قابل پیگیری.' : 'Build a source-linked research brief and follow-up questions.'}</Txt>
                <Action secondary onPress={() => router.push('/deep-research')}>{fa ? 'شروع تحقیق عمیق' : 'Open Deep Research'}</Action>
              </Panel>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 180 }}>
              <Panel variant="soft">
                <Heading>{fa ? 'هوشمندی روندها' : 'Trend Intelligence'}</Heading>
                <Txt muted>{fa ? 'بررسی نشانه‌های موضوعی و زمینه‌های مرتبط.' : 'Inspect topic signals and related context.'}</Txt>
                <Action secondary onPress={() => router.push('/trend-intelligence')}>{fa ? 'بررسی روندها' : 'Open Trend Intelligence'}</Action>
              </Panel>
            </View>
            <View style={{ flexGrow: 1, flexBasis: 180 }}>
              <Panel variant="soft">
                <Heading>{fa ? 'تقاضای جست‌وجو' : 'Search Demand'}</Heading>
                <Txt muted>{fa ? 'مقایسه داده‌های در دسترس جست‌وجو و محدودیت‌های آن.' : 'Compare available search signals and their data limits.'}</Txt>
                <Action secondary onPress={() => router.push('/search-demand')}>{fa ? 'بررسی تقاضا' : 'Open Search Demand'}</Action>
              </Panel>
            </View>
          </View>
        </Panel>

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
                  <Txt muted>{(item.lastStartedAt
                    ? (fa ? 'شروع آخرین تلاش: ' : 'Last attempt started: ') + new Date(item.lastStartedAt).toLocaleString(fa ? 'fa-IR' : 'en-US')
                    : (fa ? 'هنوز اجرا نشده' : 'Not run this session')) + ' · ' +
                    (item.lastCompletedAt
                      ? (fa ? 'آخرین تکمیل: ' : 'Last completed: ') + new Date(item.lastCompletedAt).toLocaleString(fa ? 'fa-IR' : 'en-US')
                      : (fa ? 'تکمیل ثبت نشده' : 'No completed run'))}</Txt>
                  {item.lastError ? <Txt muted>{runtimeErrorHint(item.lastError, fa ? 'fa' : 'en')}</Txt> : null}
                </View>
              );
            })}
            <Heading>{fa ? 'توازن داده و اتصال ایده‌ها' : 'Evidence balance and idea links'}</Heading>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              <MetricCard label={fa ? 'خبرهای در دسترس موتور' : 'ENGINE NEWS'} value={engineNews.length} />
              <MetricCard label={fa ? 'ویدئوهای معتبر نگهداری‌شده' : 'RETAINED VIDEOS'} value={engineVideoEvidence.length} />
              <MetricCard label={fa ? 'ایده‌های فعال' : 'ACTIVE IDEAS'} value={ideaLinkage.active} />
              <MetricCard label={fa ? 'ایده‌های تولیدشده توسط موتور' : 'ENGINE IDEAS'} value={ideaLinkage.generated} />
              <MetricCard label={fa ? 'ایده‌های متصل به منبع' : 'SOURCE-LINKED IDEAS'} value={ideaLinkage.sourceLinked} />
              <MetricCard label={fa ? 'ایده‌های متصل به گزارش' : 'REPORT-LINKED IDEAS'} value={ideaLinkage.reportLinked} />
              <MetricCard label={fa ? 'ایده‌های متصل به ویدئو' : 'VIDEO-LINKED IDEAS'} value={ideaLinkage.videoLinked} />
            </View>
            {engineNews.length + engineVideoEvidence.length > 0 && ideaLinkage.generated === 0 ? (
              <Txt muted>{fa
                ? 'خوراک داده وجود دارد اما هنوز ایده تولیدشده توسط موتور ثبت نشده است؛ پس از تحقیق و اجرای موتور دوباره بررسی کن.'
                : 'Source data is present, but no engine-generated idea is saved yet. Recheck after running research and idea generation.'}</Txt>
            ) : null}
            {ideaLinkage.generated > 0 && ideaLinkage.sourceLinked + ideaLinkage.reportLinked + ideaLinkage.videoLinked === 0 ? (
              <Txt muted>{fa
                ? 'ایده تولیدشده وجود دارد اما پیوند مستقیمی به URL منبع، گزارش یا شناسه ویدئو ثبت نشده است.'
                : 'Engine-generated ideas exist, but none currently carries a direct source URL, report ID or video reference.'}</Txt>
            ) : null}
            <Heading>{fa ? 'نتیجه آخرین نمونه API یوتیوب' : 'Latest YouTube API sample'}</Heading>
            <Txt muted>{latestReport
              ? (fa ? 'نمونه ذخیره‌شده: ' : 'Saved sample: ') + latestReport.videos.length + (fa ? ' ویدئو · ' : ' videos · ') + latestReport.queries.length + (fa ? ' عبارت جست‌وجو · ' : ' search queries · ') + latestReport.warnings.length + (fa ? ' هشدار' : ' warnings') + ' · ' + new Date(latestReport.createdAt).toLocaleString(fa ? 'fa-IR' : 'en-US')
              : (fa ? 'هنوز نمونه‌ای از API یوتیوب ذخیره نشده است.' : 'No YouTube API sample has been saved yet.')}
            </Txt>
            <Heading>{fa ? 'وضعیت خوراک‌های رسمی' : 'Official feed status'}</Heading>
            <Txt muted>{feedHealth.registered + (fa ? ' ثبت‌شده · ' : ' registered · ') + feedHealth.cachedItems + (fa ? ' آیتم کش‌شده · ' : ' cached items · ') + feedHealth.healthy + (fa ? ' سالم · ' : ' healthy · ') + feedHealth.stale + (fa ? ' قدیمی · ' : ' stale · ') + feedHealth.unavailable + (fa ? ' ناموجود · ' : ' unavailable · ') + feedHealth.unknown + (fa ? ' نامشخص · ' : ' unknown · ') + feedHealth.failures + (fa ? ' خطای ثبت‌شده' : ' recorded failures')}</Txt>
            <Txt muted>{feedHealth.lastSuccessAt
              ? (fa ? 'آخرین پاسخ موفق خوراک: ' : 'Last successful feed response: ') + new Date(feedHealth.lastSuccessAt).toLocaleString(fa ? 'fa-IR' : 'en-US')
              : (fa ? 'در رجیستری محلی پاسخ موفقی ثبت نشده است.' : 'No successful feed response has been recorded in the local registry.')}</Txt>
            {feedRegistry.map((feed) => (
              <View key={feed.sourceId} style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: p.borderSoft, gap: 2 }}>
                <Text style={{ color: feed.status === 'healthy' ? p.success : feed.status === 'unavailable' ? p.danger : p.warning, fontSize: 11, fontWeight: '700' }}>{feed.sourceId + ' · ' + feed.status}</Text>
                <Txt muted>{feed.cachedItems.length + ' cached items · ' + feed.failureCount + ' failures · ' + (feed.lastSuccessAt ? new Date(feed.lastSuccessAt).toLocaleString(fa ? 'fa-IR' : 'en-US') : 'no successful response') + ' · ' + (feed.lastCheckedAt ? (fa ? 'آخرین بررسی: ' : 'Last checked: ') + new Date(feed.lastCheckedAt).toLocaleString(fa ? 'fa-IR' : 'en-US') : (fa ? 'بررسی نشده' : 'not checked')) + (feed.retryAt > dashboardNow ? ' · ' + (fa ? 'تلاش مجدد پس از ' : 'retry after ') + new Date(feed.retryAt).toLocaleTimeString(fa ? 'fa-IR' : 'en-US') : '')}</Txt>
                {feed.lastError ? <Txt muted>{runtimeErrorHint(feed.lastError, fa ? 'fa' : 'en')}</Txt> : null}
              </View>
            ))}
            <Txt muted>{fa
              ? 'درصدها فقط از عملیات ثبت‌شده از ابتدای همین نشست محاسبه می‌شوند و آمار تاریخی یا سلامت کلی سرویس‌دهنده نیستند.'
              : 'Session percentages use completed instrumented operations since this app session began. They are not lifetime, server-wide or provider availability statistics.'}</Txt>
            {runtimeMetrics.lastError ? <Txt muted>{(fa ? 'آخرین خطای ثبت‌شده: ' : 'Latest measured error: ') + runtimeErrorHint(runtimeMetrics.lastError, fa ? 'fa' : 'en')}</Txt> : null}
          </Panel>
        ) : null}

      </View>
    </Page>
  );
}
