import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { generateEditorialIdeas } from '@/lib/idea-generation';
import { fingerprintText, getFreeModels, getOpinion, internalEngineReviewPrompt, nextOpenRouterUsage, quotaDay, type YouTubeSampleVideo } from '@/lib/api';
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
    result.evidence.map((item) => item.id).join('|') + '|' +
    result.intelligence.gaps.length + '|' + result.intelligence.potentialContradictions.length,
  );
  const visibleCacheKey = preferences.model
    ? 'engine:' + fingerprintText(preferences.model + '\n' + prompt + '\n' + researchFingerprint)
    : '';
  const savedReview = opinions.find((item) => item.ideaId === visibleCacheKey && item.model === preferences.model);
  const [reviewState, setReviewState] = useState({ key: visibleCacheKey, text: savedReview?.text ?? '' });
  const [externalKeyAvailable, setExternalKeyAvailable] = useState<boolean | null>(null);
  const review = reviewState.key === visibleCacheKey ? reviewState.text : savedReview?.text ?? '';
  const op = useOperation();

  const runReview = () => void op.run(async () => {
    const key = await getKey('openrouter');
    setExternalKeyAvailable(Boolean(key));
    if (!key) throw new Error(fa ? 'ابتدا کلید OpenRouter را در تنظیمات ذخیره کن.' : 'Save your OpenRouter key in Settings first.');
    const current = useScout.getState().data;
    let model = current.preferences.model;
    if (!model) {
      const models = await getFreeModels();
      model = models[0]?.id ?? '';
      if (!model) throw new Error(fa ? 'مدل رایگان قابل استفاده‌ای پیدا نشد.' : 'No available free OpenRouter model was found.');
    }
    const cacheKey = 'engine:' + fingerprintText(model + '\n' + prompt + '\n' + researchFingerprint);
    const cached = useScout.getState().data.opinions.find((item) => item.ideaId === cacheKey && item.model === model);
    if (cached) {
      setReviewState({ key: cacheKey, text: cached.text });
      if (current.preferences.model !== model) {
        await useScout.getState().commit((data) => ({
          ...data,
          preferences: { ...data.preferences, model },
        }));
      }
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
    // Keep the returned answer visible even if local persistence fails; the error below
    // still makes clear that it was not saved and can be retried after storage recovery.
    setReviewState({ key: cacheKey, text: response });
    await useScout.getState().commit((data) => ({ ...data, opinions: [opinion, ...data.opinions].slice(0, 100) }));
  }, fa ? 'بازبینی AI با خروجی موتور داخلی ذخیره شد.' : 'AI review of the internal engine was saved.');

  const runReviewRef = useRef(runReview);
  useEffect(() => {
    runReviewRef.current = runReview;
  });

  useEffect(() => {
    if (!preferences.hybridIntelligence || savedReview || externalKeyAvailable === false || !prompt.trim()) return;
    const triggerKey = fingerprintText(prompt + '\n' + researchFingerprint);
    if (automaticReviewStarted.has(triggerKey)) return;
    automaticReviewStarted.add(triggerKey);
    void getKey('openrouter').then((key) => {
      setExternalKeyAvailable(Boolean(key));
      if (!key) {
        automaticReviewStarted.delete(triggerKey);
        return;
      }
      runReviewRef.current();
    }).catch(() => automaticReviewStarted.delete(triggerKey));
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
      <Action busy={op.busy} onPress={runReview}>
        {fa ? 'گرفتن نظر دوم از AI خارجی' : 'Ask external AI for its second opinion'}
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
  const localData = useScout((state) => state.data);
  const preferences = useScout((state) => state.data.preferences);
  const ideas = useScout((state) => state.data.ideas);
  const reports = useScout((state) => state.data.reports);
  const memoryCount = useScout((state) => state.data.researchMemory.length);
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

        <Panel>
          <Heading>{preferences.uiLanguage === 'fa' ? 'وضعیت خودکارسازی' : 'Automation status'}</Heading>
          <Txt muted>{preferences.uiLanguage === 'fa'
            ? 'جست‌وجوی خودکار YouTube: ' + (preferences.schedule === 'Manual' ? 'خاموش' : preferences.paused ? 'متوقف' : preferences.schedule)
            : 'Automatic YouTube research: ' + (preferences.schedule === 'Manual' ? 'Off' : preferences.paused ? 'Paused' : preferences.schedule)}</Txt>
          <Txt muted>{preferences.uiLanguage === 'fa'
            ? 'نظر دوم AI خارجی: ' + (preferences.hybridIntelligence ? 'خودکار و روشن' : 'فقط با درخواست دستی')
            : 'External AI second opinion: ' + (preferences.hybridIntelligence ? 'Automatic and enabled' : 'Manual only')}</Txt>
          <Action secondary onPress={() => router.push('/settings')}>{preferences.uiLanguage === 'fa' ? 'تنظیم جست‌وجو و هوش ترکیبی' : 'Configure research and hybrid AI'}</Action>
        </Panel>

        <Panel>
          <ResearchOverviewChart data={localData} language={preferences.uiLanguage ?? 'fa'} />
        </Panel>

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
