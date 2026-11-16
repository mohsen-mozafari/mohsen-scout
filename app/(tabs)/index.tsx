import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

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
import { ResearchOverviewChart } from '@/components/ResearchOverviewChart';
import { generateEditorialIdeas } from '@/lib/idea-generation';
import { fingerprintText, getFreeModels, getOpinion, internalEngineReviewPrompt, nextOpenRouterUsage, quotaDay, type YouTubeSampleVideo } from '@/lib/api';
import { getKey } from '@/lib/vault';

const automaticYoutubeRuns = new Set<string>();
const automaticReviewAttempts = new Set<string>();

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
  const hybridEnabled = preferences.hybridIntelligenceEnabled ?? false;
  const fa = preferences.uiLanguage === 'fa';
  const quality = result.intelligence.sourceQuality;
  const prompt = internalEngineReviewPrompt({
    topic,
    summary: fa
      ? 'موتور داخلی موضوع، شواهد پردازش‌شده، خلأها و میزان اطمینان را ارزیابی کرده است. محتوای خام خبر و فراداده ویدئو در این درخواست ارسال نمی‌شود.'
      : 'The local engine assessed the topic, processed evidence signals, research gaps and confidence. Raw news content and video metadata are not included in this request.',
    evidence: [
      { label: 'Evidence records processed', detail: String(result.evidence.length) },
      { label: 'Editorial angles considered', detail: String(result.angles.length) },
      { label: 'Verification questions', detail: String(result.verificationQuestions.length) },
      { label: 'Known entity candidates', detail: String(result.entityCandidates.length) },
      { label: 'Evidence co-mention links', detail: String(result.entityRelations.length) },
      { label: 'Local engine processing time (ms)', detail: String(result.intelligence.selfEvaluation.processingMs) },
      { label: 'Feeds represented', detail: String(quality.feedsRepresented) },
      { label: 'Independent publisher groups', detail: String(quality.independentPublishers) },
      { label: 'Duplicate records merged', detail: String(quality.duplicateStoriesMerged) },
      { label: 'Undated records', detail: String(quality.undatedItems) },
      { label: 'Stale records', detail: String(quality.staleItems) },
      { label: 'Research gaps recorded', detail: String(result.intelligence.gaps.length) },
      { label: 'Potential discrepancies recorded', detail: String(result.intelligence.potentialContradictions.length) },
    ],
    confidence: {
      level: result.intelligence.confidence.level,
      reason: fa
        ? 'این سطح محلی بر اساس پوشش نمونه و تنوع ناشر محاسبه شده و تأیید صحت ادعاها نیست.'
        : 'This local level reflects sample coverage and publisher diversity; it is not factual verification.',
    },
    language: fa ? 'fa' : 'en',
  });
  const visibleCacheKey = preferences.model
    ? 'engine:' + fingerprintText(preferences.model + '\n' + prompt)
    : '';
  const savedReview = opinions.find((item) => item.ideaId === visibleCacheKey && item.model === preferences.model);
  const [reviewState, setReviewState] = useState({ key: visibleCacheKey, text: savedReview?.text ?? '' });
  const review = reviewState.key === visibleCacheKey ? reviewState.text : savedReview?.text ?? '';
  const op = useOperation();

  const runReview = (automatic = false) => void op.run(async () => {
    const current = useScout.getState().data;
    let model = current.preferences.model;
    if (model) {
      const existingKey = 'engine:' + fingerprintText(model + '\n' + prompt);
      const existing = current.opinions.find((item) => item.ideaId === existingKey && item.model === model);
      if (existing) {
        setReviewState({ key: existingKey, text: existing.text });
        return;
      }
    }
    const key = await getKey('openrouter');
    if (!key) throw new Error(fa ? 'برای نظر دوم خودکار، ابتدا کلید OpenRouter را در تنظیمات ذخیره کن.' : 'Save your OpenRouter key in Settings before requesting an automatic review.');
    if (!model) {
      const models = await getFreeModels();
      model = models[0]?.id ?? '';
      if (!model) throw new Error(fa ? 'مدل رایگان قابل استفاده‌ای پیدا نشد.' : 'No available free OpenRouter model was found.');
      await useScout.getState().commit((data) => ({
        ...data,
        preferences: { ...data.preferences, model },
      }));
    }
    const cacheKey = 'engine:' + fingerprintText(model + '\n' + prompt);
    const cached = useScout.getState().data.opinions.find((item) => item.ideaId === cacheKey && item.model === model);
    if (cached) {
      setReviewState({ key: cacheKey, text: cached.text });
      return;
    }
    const response = await getOpinion(key, model, prompt, async () => {
      const currentPreferences = useScout.getState().data.preferences;
      const day = new Date().toLocaleDateString('en-CA');
      const usage = nextOpenRouterUsage(
        currentPreferences.openRouterUsageDay,
        currentPreferences.openRouterRequestsToday,
        day,
      );
      await useScout.getState().commit((data) => ({
        ...data,
        preferences: { ...data.preferences, ...usage },
      }));
    });
    const opinion = { id: uid(), ideaId: cacheKey, text: response, model, createdAt: Date.now() };
    await useScout.getState().commit((data) => ({ ...data, opinions: [opinion, ...data.opinions].slice(0, 100) }));
    setReviewState({ key: cacheKey, text: response });
  }, automatic
    ? (fa ? 'بازبینی خودکار AI ذخیره شد.' : 'Automatic AI review saved.')
    : (fa ? 'بازبینی AI با خروجی موتور داخلی ذخیره شد.' : 'AI review of the internal engine was saved.'));
  useEffect(() => {
    if (!hybridEnabled || review) return;
    const attemptKey = 'engine:auto:' + fingerprintText(prompt);
    if (automaticReviewAttempts.has(attemptKey)) return;
    automaticReviewAttempts.add(attemptKey);
    if (automaticReviewAttempts.size > 50) {
      const oldest = automaticReviewAttempts.values().next().value;
      if (oldest) automaticReviewAttempts.delete(oldest);
    }
    runReview(true);
  }, [hybridEnabled, review, prompt, runReview]);

  return (
    <Panel>
      <BadgeText>{review ? 'EXTERNAL AI · REVIEW SAVED' : 'EXTERNAL AI · SECOND OPINION'}</BadgeText>
      <Heading>{fa ? 'نقد مستقل هوش مصنوعی' : 'Independent AI second opinion'}</Heading>
      <Txt muted>{fa
        ? 'موتور داخلی شواهد و محدودیت‌ها را استخراج می‌کند؛ AI دوم همان خروجی پردازش‌شده را نقد می‌کند. فقط موضوع و شاخص‌های تجمیعی مجاز ارسال می‌شوند، نه متن خبر یا فراداده خام YouTube.'
        : 'The local engine extracts evidence signals and limitations; the external model independently critiques that processed output. Only the topic and approved aggregate indicators are sent — never raw news or YouTube metadata.'}</Txt>
      {savedReview ? <Txt muted>{'Model: ' + savedReview.model + ' · Reviewed: ' + new Date(savedReview.createdAt).toLocaleString()}</Txt> : null}
      <Action secondary busy={op.busy} onPress={() => void op.run(async () => {
        await useScout.getState().commit((data) => ({
          ...data,
          preferences: { ...data.preferences, hybridIntelligenceEnabled: !hybridEnabled },
        }));
      })}>
        {hybridEnabled
          ? (fa ? 'توقف نظر دوم خودکار' : 'Pause automatic AI second opinion')
          : (fa ? 'فعال‌سازی نظر دوم خودکار' : 'Enable automatic AI second opinion')}
      </Action>
      <Txt muted>{hybridEnabled
        ? (fa ? 'فعال است: پس از تحلیل محلیِ تازه، یک‌بار AI بیرونی به‌صورت خودکار نقد می‌کند. فقط موضوع و شاخص‌های تجمیعی ارسال می‌شوند؛ داده خام خبر و YouTube ارسال نمی‌شود.' : 'Enabled: after a new local analysis, external AI runs once automatically. Only the topic and processed aggregate signals are sent — never raw news or YouTube data.')
        : (fa ? 'خاموش است. با فعال‌سازی بالا، به برنامه اجازه می‌دهی پس از تحلیل محلی برای نظر مستقل از OpenRouter استفاده کند.' : 'Paused. Enabling this gives the app permission to request an independent OpenRouter review after local analysis.')}
      </Txt>
      {!review && !op.busy ? <Txt muted>{fa
        ? 'برای نظر دوم دستی نیز می‌توانی همین‌جا درخواست بدهی؛ پاسخ‌های موفق روی دستگاه ذخیره و برای همان تحلیل دوباره استفاده می‌شوند.'
        : 'You can also request a manual review here. Successful responses are stored locally and reused for the same analysis.'}</Txt> : null}
      <Action busy={op.busy} onPress={() => runReview(false)}>
        {fa ? 'گرفتن / به‌روزرسانی نظر دوم از AI خارجی' : 'Request / refresh external AI second opinion'}
      </Action>
      {op.error ? <ErrorBox message={op.error} onRetry={runReview} /> : null}
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
  const preferences = useScout((state) => state.data.preferences);
  const ideas = useScout((state) => state.data.ideas);
  const reports = useScout((state) => state.data.reports);
  const memoryCount = useScout((state) => state.data.researchMemory.length);
  const feedRegistry = useScout((state) => state.data.feedRegistry);
  const opinions = useScout((state) => state.data.opinions);
  const youtubeBudget = useScout((state) => state.data.budget);
  const quotaDate = quotaDay();
  const quotaUsage = youtubeBudget.date === quotaDate
    ? youtubeBudget
    : { date: quotaDate, units: 0, requests: 0, exhausted: false };
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);
  const [nicheSuggestions, setNicheSuggestions] = useState<SpaceNicheSuggestion[]>([]);
  const [radarBrief, setRadarBrief] = useState<InternalResearchResult>();
  const [radarNews, setRadarNews] = useState<SpaceNewsItem[]>([]);
  const [automaticSearchMessage, setAutomaticSearchMessage] = useState('');
  const op = useOperation();
  const niche = SPACE_NICHES.find((item) => item.id === preferences.selectedSpaceNiche);
  const nicheTitle = preferences.selectedSpaceNiche === 'all'
    ? 'All space topics'
    : preferences.selectedSpaceNiche === 'custom'
      ? (preferences.customSpaceNiche.trim() || 'Custom niche')
      : niche?.title ?? 'All space topics';
  const discoveryTopic = preferences.selectedSpaceNiche === 'all'
    ? 'Space science and exploration'
    : preferences.selectedSpaceNiche === 'custom'
      ? preferences.customSpaceNiche
      : niche?.topic ?? 'Space science and exploration';
  const applyScan = useCallback(async (result: Awaited<ReturnType<typeof fetchSpaceNews>>) => {
    await useScout.getState().commit((data) => ({ ...data, feedRegistry: result.registry }));
    const relevantNews = preferences.selectedSpaceNiche === 'all'
      ? result.items
      : newsForNiche(result.items, preferences.selectedSpaceNiche, preferences.customSpaceNiche);
    const currentData = useScout.getState().data;
    const priorMemory = currentData.researchMemory.find((entry) => normalizeResearchText(entry.topic) === normalizeResearchText(discoveryTopic));
    const nextRadarBrief = relevantNews.length ? buildInternalResearch({
      topic: discoveryTopic,
      feedback: buildResearchInterestProfile(currentData.ideas),
      priorMemory,
      language: currentData.preferences.uiLanguage ?? 'fa',
      news: relevantNews.slice(0, 24).map((item) => ({
        title: item.title, summary: item.summary, sourceName: item.sourceName,
        sourceUrl: item.url, publishedAt: item.publishedAt, sourceId: item.sourceId,
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
    if (automaticIdeas.length) {
      await useScout.getState().commit((data) => ({ ...data, ideas: [...automaticIdeas, ...data.ideas] }));
    }
    if (nextRadarBrief) {
      const nextMemory = createResearchMemoryEntry({
        topic: discoveryTopic,
        news: relevantNews,
        analysis: nextRadarBrief,
        previous: priorMemory,
        now: Date.now(),
        language: currentData.preferences.uiLanguage ?? 'fa',
      });
      if (nextMemory) {
        await useScout.getState().commit((data) => ({
          ...data,
          researchMemory: [
            nextMemory,
            ...data.researchMemory.filter((entry) => normalizeResearchText(entry.topic) !== normalizeResearchText(discoveryTopic)),
          ].slice(0, 40),
        }));
      }
    }
    rememberTopicDossier(discoveryTopic, { news: relevantNews, internalAnalysis: nextRadarBrief });
    setRadarNews(relevantNews);
    setWarnings(result.warnings);
    setLastScannedAt(Date.now());
    setNicheSuggestions(buildNicheSuggestions(result.items, 6).filter((suggestion) => !suggestion.id.startsWith('story:')));
    setRadarBrief(nextRadarBrief);
  }, [preferences.selectedSpaceNiche, preferences.customSpaceNiche, discoveryTopic]);

  const latestReport = reports[0];
  const latestReportVideos = useMemo<YouTubeSampleVideo[]>(() => latestReport?.videos.map((video) => ({
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
  })) ?? [], [latestReport]);
  const latestReportAnalysis = useMemo(() => latestReport ? buildInternalResearch({
    topic: latestReport.input.topic,
    videos: latestReportVideos,
    language: preferences.uiLanguage ?? 'fa',
  }) : undefined, [latestReport, latestReportVideos, preferences.uiLanguage]);
  const showYouTubeResearch = Boolean(latestReport && latestReportVideos.length > 0 && latestReportAnalysis);
  const deskTopic = showYouTubeResearch ? latestReport!.input.topic : discoveryTopic;
  const deskAnalysis = showYouTubeResearch ? latestReportAnalysis : radarBrief;
  const deskNews = showYouTubeResearch ? [] : radarNews;
  const deskVideos = showYouTubeResearch ? latestReportVideos : [];
  const rssGenerationKey = 'rss:' + deskNews.map((item) => item.url).sort().join('|');
  const deskIdeas = ideas.filter((idea) => idea.engineGenerated && !idea.archived && (showYouTubeResearch ? idea.reportId === latestReport?.id : idea.generationKey === rssGenerationKey)).slice(0, 3);
  useEffect(() => {
    if (!preferences.automaticYoutubeDiscoveryEnabled) {
      setAutomaticSearchMessage('');
      return;
    }
    const currentPreferences = useScout.getState().data.preferences;
    const lastAt = currentPreferences.automaticYoutubeLastAt ?? 0;
    const completedForTopic = currentPreferences.automaticYoutubeLastTopic === discoveryTopic;
    if (completedForTopic && lastAt > 0 && Date.now() - lastAt < 24 * 60 * 60 * 1000) {
      setAutomaticSearchMessage(preferences.uiLanguage === 'fa'
        ? 'نمونه خودکار این موضوع در ۲۴ ساعت گذشته جمع‌آوری شده است.'
        : 'An automatic sample for this topic was already collected in the last 24 hours.');
      return;
    }
    const runKey = normalizeResearchText(discoveryTopic) + ':' + Math.floor(Date.now() / 86400000);
    if (automaticYoutubeRuns.has(runKey)) return;
    automaticYoutubeRuns.add(runKey);
    let active = true;
    void getKey('youtube').then(async (apiKey) => {
      if (!active) return;
      if (!apiKey) {
        setAutomaticSearchMessage(preferences.uiLanguage === 'fa'
          ? 'برای جست‌وجوی خودکار، ابتدا کلید YouTube API را در تنظیمات ذخیره کن.'
          : 'Save a YouTube API key in Settings to enable automatic sampling.');
        automaticYoutubeRuns.delete(runKey);
        return;
      }
      setAutomaticSearchMessage(preferences.uiLanguage === 'fa'
        ? 'جست‌وجوی خودکار YouTube در حال اجراست…'
        : 'Automatic YouTube research is running…');
      const report = await useScout.getState().research({
        topic: discoveryTopic,
        region: currentPreferences.region,
        languages: currentPreferences.languages,
        days: currentPreferences.defaultResearchDays ?? 30,
        duration: 'any',
        category: 'any',
        maxResults: 30,
      }, 'automatic');
      if (!active) return;
      if (!report) {
        const error = useScout.getState().error;
        if (!error) automaticYoutubeRuns.delete(runKey);
        setAutomaticSearchMessage(error || (preferences.uiLanguage === 'fa'
          ? 'جست‌وجوی خودکار کامل نشد؛ از جست‌وجوی دستی استفاده کن.'
          : 'Automatic sampling did not complete; start a manual search.'));
        return;
      }
      await useScout.getState().commit((data) => ({
        ...data,
        preferences: { ...data.preferences, automaticYoutubeLastAt: Date.now(), automaticYoutubeLastTopic: discoveryTopic },
      }));
      if (active) setAutomaticSearchMessage(preferences.uiLanguage === 'fa'
        ? 'نمونه YouTube با بودجه خودکار جمع‌آوری و به ایده‌ها و داشبورد پیوند شد.'
        : 'The YouTube sample was collected from the automatic quota budget and linked to ideas and the dashboard.');
    }).catch(() => {
      if (active) setAutomaticSearchMessage(preferences.uiLanguage === 'fa'
        ? 'جست‌وجوی خودکار به خطا خورد؛ کلید و اتصال را بررسی کن.'
        : 'Automatic research failed; check the API key and connection.');
    });
    return () => { active = false; };
  }, [
    preferences.automaticYoutubeDiscoveryEnabled,
    preferences.uiLanguage,
    preferences.region,
    preferences.languages,
    preferences.defaultResearchDays,
    discoveryTopic,
  ]);

  useEffect(() => {
    let active = true;
    void fetchSpaceNews(preferences.spaceNewsSources).then((result) => {
      if (active) void applyScan(result).catch(() => setWarnings(['Local research output could not be saved. Check device storage and retry.']));
    }).catch(() => {
      if (active) setWarnings(['Official news feeds could not be reached. Check the network and retry.']);
    });
    return () => { active = false; };
  }, [preferences.spaceNewsSources, applyScan]);
  const discover = () => void op.run(async () => {
    const result = await fetchSpaceNews(preferences.spaceNewsSources, fetch, true);
    await applyScan(result);
    if (!result.items.length && result.warnings.length) throw new Error(result.warnings.join(' '));
  }, 'Discovery scan completed from selected official feeds without spending YouTube quota.');

  return (
    <Page title="MOHSEN SCOUT">
      <View style={{ gap: 16 }}>
        <Panel>
          <Text style={styles.badge}>SPACE RADAR · ACTIVE TOPIC</Text>
          <Heading>{nicheTitle}</Heading>
          <Txt muted>{niche?.description ?? 'Official publisher feeds are grouped into a focused research topic.'}</Txt>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Action busy={op.busy} onPress={discover}>Refresh Space Radar</Action>
            </View>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: discoveryTopic } })}>Search YouTube</Action>
            </View>
          </View>
          <Txt muted>{lastScannedAt ? 'Last source update: ' + new Date(lastScannedAt).toLocaleString() : 'Checking selected official feeds…'} · {radarNews.length} matching reports</Txt>
          <Action secondary onPress={() => void useScout.getState().commit((data) => ({
            ...data,
            preferences: { ...data.preferences, automaticYoutubeDiscoveryEnabled: !(data.preferences.automaticYoutubeDiscoveryEnabled ?? false) },
          }))}>
            {preferences.automaticYoutubeDiscoveryEnabled
              ? (preferences.uiLanguage === 'fa' ? 'توقف جست‌وجوی خودکار YouTube' : 'Pause automatic YouTube research')
              : (preferences.uiLanguage === 'fa' ? 'فعال‌سازی جست‌وجوی خودکار YouTube' : 'Enable automatic YouTube research')}
          </Action>
          <Txt muted>{preferences.automaticYoutubeDiscoveryEnabled
            ? (preferences.uiLanguage === 'fa' ? 'با فعال‌بودن این گزینه، پس از بازشدن برنامه برای موضوع انتخاب‌شده حداکثر یک نمونه در هر ۲۴ ساعت از سهمیه automatic استفاده می‌شود؛ اسکن پس‌زمینه‌ای انجام نمی‌شود.' : 'When enabled, one sample per selected topic per 24 hours may run from the automatic quota after the app opens. No background scanning is used.')
            : (preferences.uiLanguage === 'fa' ? 'این قابلیت به‌صورت پیش‌فرض خاموش است و فقط پس از فعال‌سازی، سهمیه YouTube مصرف می‌کند.' : 'Off by default. YouTube quota is used only after you enable it.')}
          </Txt>
          {automaticSearchMessage ? <Txt muted>{automaticSearchMessage}</Txt> : null}
          {warnings.slice(0, 2).map((warning) => <Txt muted key={warning}>{warning}</Txt>)}
        </Panel>

        <Panel>
          <Heading>Your workspace</Heading>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Heading>{ideas.filter((idea) => !idea.archived).length}</Heading>
              <Txt muted>Active ideas</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Heading>{reports.length}</Heading>
              <Txt muted>Research reports</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Heading>{memoryCount}</Heading>
              <Txt muted>Topics remembered</Txt>
            </View>
          </View>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Action secondary onPress={() => router.push('/news')}>News</Action>
            <Action secondary onPress={() => router.push('/opportunities')}>Ideas</Action>
            <Action secondary onPress={() => router.push('/library')}>Library</Action>
          </View>
          <Fold title="YouTube API usage and technical details">
            <Txt muted>{'Today: ' + quotaUsage.units + ' / ' + preferences.budget + ' quota units · ' + quotaUsage.requests + ' requests. The counter follows the app’s Pacific-time quota day.'}</Txt>
          </Fold>
        </Panel>

        <ResearchOverviewChart feedRegistry={feedRegistry} reports={reports} ideas={ideas} opinions={opinions} language={preferences.uiLanguage ?? 'fa'} />

        {deskAnalysis ? (
          <>
            <Panel>
              <BadgeText>LOCAL ENGINE · PROCESSED FINDINGS</BadgeText>
              <Heading>{deskTopic}</Heading>
              <Txt>{deskAnalysis.summary}</Txt>
              <Txt muted>{showYouTubeResearch && latestReport
                ? 'Based on the latest saved YouTube research sample · ' + new Date(latestReport.createdAt).toLocaleString()
                : 'Based on selected official publisher feeds and local research memory.'}</Txt>
            </Panel>

            <EngineAIReview topic={deskTopic} result={deskAnalysis} />

            <Panel>
              <Fold title="Local engine findings, confidence and gaps">
                <AnalysisSignals result={deskAnalysis} />
                <Heading>Key evidence</Heading>
                {deskAnalysis.evidence
                  .filter((item) => (item.id !== 'publisher-news' || deskNews.length > 0) && (item.id !== 'youtube-sample' || deskVideos.length > 0))
                  .slice(0, 5)
                  .map((item) => (
                    <View key={item.id} style={{ gap: 3 }}>
                      <BadgeText>{item.label}</BadgeText>
                      <Txt muted>{item.detail}</Txt>
                    </View>
                  ))}
              </Fold>
              <Fold title="Evidence map and relationships">
                <ResearchKnowledgeGraph
                  topic={deskTopic}
                  news={deskNews}
                  videos={deskVideos}
                  analysis={deskAnalysis}
                  language={preferences.uiLanguage ?? 'fa'}
                  generatedIdeas={deskIdeas}
                />
              </Fold>
              <Fold title="Editorial angles and verification">
                {deskAnalysis.angles.slice(0, 3).map((angle) => (
                  <View key={angle.id} style={{ gap: 5 }}>
                    <Heading>{angle.title}</Heading>
                    <Txt>{angle.hook}</Txt>
                    <Txt muted>{angle.approach}</Txt>
                    <Txt muted>{'Verify: ' + angle.verification}</Txt>
                  </View>
                ))}
              </Fold>
              <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: deskTopic } })}>Continue in Deep Research</Action>
            </Panel>
          </>
        ) : (
          <Panel>
            <BadgeText>DUAL-ENGINE WORKSPACE</BadgeText>
            <Heading>Start with evidence, then request an independent AI review</Heading>
            <Txt muted>No completed local analysis is available yet. Refresh Space Radar or run a YouTube search; the external AI review appears beside the resulting engine analysis.</Txt>
            <Action onPress={() => router.push('/youtube')}>Start research</Action>
          </Panel>
        )}

        <Panel>
          <Heading>Next ideas</Heading>
          {deskIdeas.length ? deskIdeas.map((idea) => (
            <View key={idea.id} style={{ gap: 5 }}>
              <SourceHeading>{idea.topic}</SourceHeading>
              <Txt muted>{idea.ideaCategory ?? 'Generated'} · {idea.concept.slice(0, 220)}</Txt>
              <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: idea.id } })}>Open idea</Action>
            </View>
          )) : <Txt muted>No new idea has been generated from this evidence set yet.</Txt>}
          <Action secondary onPress={() => router.push('/opportunities')}>Open Ideas workspace</Action>
        </Panel>

        {nicheSuggestions.length ? (
          <Panel>
            <Heading>Other research leads</Heading>
            {nicheSuggestions.slice(0, 3).map((suggestion) => (
              <View key={suggestion.id} style={{ gap: 5 }}>
                <SourceHeading>{suggestion.title}</SourceHeading>
                <Txt muted>{suggestion.description}</Txt>
                <Txt muted>{suggestion.matchedStories + ' matching publisher stories' + (suggestion.newestAt ? ' · latest ' + new Date(suggestion.newestAt).toLocaleDateString() : '')}</Txt>
                <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: suggestion.topic } })}>Research this lead</Action>
              </View>
            ))}
          </Panel>
        ) : null}

        <View style={{ gap: 8 }}>
          <Action secondary onPress={() => router.push('/settings')}>Research settings and API keys</Action>
          {op.error ? <ErrorBox message={op.error} onRetry={op.clear} /> : null}
          {op.message ? <Txt muted>{op.message}</Txt> : null}
        </View>
      </View>
    </Page>
  );
}
