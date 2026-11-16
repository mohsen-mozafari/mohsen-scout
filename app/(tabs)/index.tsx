import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { router } from 'expo-router';
import {
  Page, Panel, Heading, Txt, Action, Fold, styles, ErrorBox, useOperation,
  SourceHeading, SourceText, BadgeText,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { languages, uid } from '@/lib/types';
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
import { ResearchKnowledgeGraph } from '@/components/ResearchKnowledgeGraph';
import { generateEditorialIdeas } from '@/lib/idea-generation';
import { fingerprintText, getFreeModels, getOpinion, internalEngineReviewPrompt, nextOpenRouterUsage, type YouTubeSampleVideo } from '@/lib/api';
import { getKey } from '@/lib/vault';


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
      { label: 'Editorial angles considered', detail: String(result.angles.length) },
      { label: 'Verification questions', detail: String(result.verificationQuestions.length) },
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

  const runReview = () => void op.run(async () => {
    const key = await getKey('openrouter');
    if (!key) throw new Error(fa ? 'ابتدا کلید OpenRouter را در تنظیمات ذخیره کن.' : 'Save your OpenRouter key in Settings first.');
    const current = useScout.getState().data;
    const models = await getFreeModels();
    let model = current.preferences.model;
    if (!model || !models.some((item) => item.id === model)) {
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
    const opinion = {
      id: uid(),
      ideaId: cacheKey,
      text: response,
      model,
      createdAt: Date.now(),
    };
    await useScout.getState().commit((data) => ({ ...data, opinions: [opinion, ...data.opinions].slice(0, 100) }));
    setReviewState({ key: cacheKey, text: response });
  }, fa ? 'بازبینی AI با خروجی موتور داخلی ذخیره شد.' : 'AI review of the internal engine was saved.');

  return (
    <Panel>
      <Heading>{fa ? 'بازبینی هوش مصنوعی روی خروجی موتور داخلی' : 'AI review of the internal engine'}</Heading>
      <Txt muted>{fa
        ? 'با انتخاب این گزینه فقط موضوع و شاخص‌های عددیِ پردازش محلی برای OpenRouter ارسال می‌شود؛ متن خام خبر، URL، نام ناشر، عنوان یا شناسه ویدئو، توضیحات، آمار و کلید API ارسال نمی‌شوند.'
        : 'Choosing this sends only the topic and numeric indicators computed locally to OpenRouter; raw news text, URLs, publisher names, YouTube titles or IDs, descriptions, statistics and API keys are excluded.'}</Txt>
      <Txt muted>{fa
        ? 'این بررسی جایگزین موتور داخلی نیست؛ کیفیت پوشش و محدودیت‌های تحلیل آن را نقد می‌کند. نتیجه بر اساس هش محتوای درخواست و مدل در حافظه محلی کش می‌شود. درخواست فقط با فشردن دکمه ارسال می‌شود و سقف آن ۳۰ درخواست در روز با یک درخواست هم‌زمان است.'
        : 'This does not replace the local engine; it critiques the coverage and limits of its analysis. Results are cached locally by prompt-content hash and model. Nothing is sent until you press the button. The allowance is 30 requests per day, one at a time.'}</Txt>
      <Action busy={op.busy} onPress={runReview}>
        {fa ? 'بازبینی این تحلیل با AI' : 'Review this analysis with AI'}
      </Action>
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={runReview} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
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
    <Page scroll={false}>
      <FlashList
        style={{ flex: 1 }}
        data={[]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 18 }}>

        <Text style={styles.title}>MOHSEN SCOUT</Text>
      <Panel>
        <Text style={styles.badge}>{preferences.uiLanguage === 'fa' ? 'نمای کلی هوشمندی' : 'INTELLIGENCE OVERVIEW'}</Text>
        <Heading>{preferences.uiLanguage === 'fa' ? 'از داده تا تصمیم' : 'From evidence to decisions'}</Heading>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
          <View style={{ minWidth: 88, flex: 1 }}>
            <Heading>{ideas.filter((idea) => !idea.archived).length}</Heading>
            <Txt muted>{preferences.uiLanguage === 'fa' ? 'ایده فعال' : 'Active ideas'}</Txt>
          </View>
          <View style={{ minWidth: 88, flex: 1 }}>
            <Heading>{reports.length}</Heading>
            <Txt muted>{preferences.uiLanguage === 'fa' ? 'گزارش تحقیق' : 'Research reports'}</Txt>
          </View>
          <View style={{ minWidth: 88, flex: 1 }}>
            <Heading>{memoryCount}</Heading>
            <Txt muted>{preferences.uiLanguage === 'fa' ? 'موضوع در حافظه' : 'Topics in memory'}</Txt>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Action secondary onPress={() => router.push('/news')}>{preferences.uiLanguage === 'fa' ? 'اخبار رسمی' : 'Cosmic News'}</Action>
          <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: discoveryTopic } })}>{preferences.uiLanguage === 'fa' ? 'جست‌وجوی دستی' : 'Manual Search'}</Action>
          <Action secondary onPress={() => router.push('/opportunities')}>{preferences.uiLanguage === 'fa' ? 'فضای ایده‌ها' : 'Ideas Workspace'}</Action>
        </View>
      </Panel>
      <View style={{ gap: 7 }}>
        <Text style={[styles.title, { fontSize: 30, lineHeight: 36 }]}>Find your next story.</Text>
        <Txt muted>A source-led discovery desk for your next space video. Review the latest evidence, engine findings and ideas. The full publisher news stream is available in the separate News tab.</Txt>
      </View>
      <Panel>
        <Text style={styles.badge}>ACTIVE NICHE</Text>
        <Heading>{nicheTitle}</Heading>
        <Txt muted>{niche?.description ?? 'The app checks all selected NASA, JPL and ESA feeds, then groups their current reports into research topics.'}</Txt>
        <Txt muted>Research defaults are managed in Settings. Current region: {preferences.region} · Languages: {preferences.languages.map((code) => languages[code] ?? code).join(', ')}</Txt>
        <Action busy={op.busy} onPress={discover}>Refresh Space Radar</Action>
        <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: niche?.topic ?? discoveryTopic } })}>Search Manually</Action>
        <Action secondary onPress={() => router.push('/settings')}>Change discovery settings</Action>
        {lastScannedAt ? <Txt muted>Last scanned {new Date(lastScannedAt).toLocaleString()}</Txt> : <Txt muted>Checking official feeds when Space Radar opens…</Txt>}
        <Txt muted>Publisher evidence refreshes on entry using a short in-memory cache. Raw headlines stay in the separate News tab; this page shows processed findings and ideas. No background polling or YouTube quota is used.</Txt>
      </Panel>

      {warnings.map((warning) => <Txt muted key={warning}>{warning}</Txt>)}

      <Panel>
        <Text style={styles.badge}>LOCAL INTELLIGENCE DESK</Text>
        <Heading>Research output</Heading>
        {deskAnalysis ? (
          <>
            <Heading>{deskTopic}</Heading>
            <Txt muted>{showYouTubeResearch && latestReport
              ? 'Latest YouTube research · ' + new Date(latestReport.createdAt).toLocaleString()
              : lastScannedAt ? 'Latest selected-feed analysis · ' + new Date(lastScannedAt).toLocaleString() : 'Latest local evidence'}</Txt>
            <Txt muted>{deskAnalysis.summary}</Txt>
            <ResearchKnowledgeGraph
              topic={deskTopic}
              news={deskNews}
              videos={deskVideos}
              analysis={deskAnalysis}
              language={preferences.uiLanguage ?? 'fa'}
              generatedIdeas={deskIdeas}
            />
            <Heading>Key engine evidence</Heading>
            {deskAnalysis.evidence.filter((item) => (item.id !== 'publisher-news' || deskNews.length > 0) && (item.id !== 'youtube-sample' || deskVideos.length > 0)).slice(0, 5).map((item) => (
              <View key={item.id} style={{ gap: 3 }}>
                <BadgeText>{item.label}</BadgeText>
                <Txt muted>{item.detail}</Txt>
              </View>
            ))}
            <AnalysisSignals result={deskAnalysis} />
            <EngineAIReview topic={deskTopic} result={deskAnalysis} />
            {deskAnalysis.angles.slice(0, 3).map((angle) => (
              <View key={angle.id} style={{ gap: 5 }}>
                <Heading>{angle.title}</Heading>
                <Txt>{angle.hook}</Txt>
                <Txt muted>{angle.approach}</Txt>
                <Txt muted>Verify: {angle.verification}</Txt>
              </View>
            ))}
            <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: deskTopic } })}>Continue this research</Action>
          </>
        ) : (
          <>
            <Txt muted>No completed research analysis is available yet. Start a YouTube search or refresh the official Space Radar feeds. The desk will show real evidence and findings here.</Txt>
            <Action onPress={() => router.push('/youtube')}>Start a research search</Action>
            <Action secondary onPress={discover}>Refresh official feeds</Action>
          </>
        )}
        <View style={{ gap: 7, borderTopWidth: 1, borderTopColor: '#343047', paddingTop: 12 }}>
          <Heading>Newly generated ideas</Heading>
          {deskIdeas.length ? deskIdeas.map((idea) => (
            <View key={idea.id} style={{ gap: 4 }}>
              <SourceHeading>{idea.topic}</SourceHeading>
              <Txt muted>{idea.ideaCategory ?? 'Generated'} · {idea.concept.slice(0, 260)}</Txt>
              <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: idea.id } })}>Open generated idea</Action>
            </View>
          )) : <Txt muted>No generated ideas yet. Run a research search or refresh the official feed to generate ideas from available evidence.</Txt>}
          <Action secondary onPress={() => router.push('/opportunities')}>Open Ideas workspace</Action>
        </View>
      </Panel>

      {nicheSuggestions.length > 0 && (
        <Panel>
          <Heading>{preferences.uiLanguage === 'fa' ? 'سرنخ‌های کشف‌شده از منابع' : 'Research leads discovered from sources'}</Heading>
          <Txt muted>These are evidence-backed research leads from the selected publisher feeds, not audience-demand or YouTube trend rankings.</Txt>
          {nicheSuggestions.map((suggestion) => (
            <View key={suggestion.id} style={{ gap: 5 }}>
              <Text style={styles.badge}>{suggestion.id.startsWith('story:') ? 'FRESH OFFICIAL STORY' : 'ACTIVE FEED NICHE'}</Text>
              <SourceHeading>{suggestion.title}</SourceHeading>
              <SourceText muted>{suggestion.description}</SourceText>
              <Txt muted>{suggestion.matchedStories} matching publisher stories{suggestion.newestAt ? ' · latest ' + new Date(suggestion.newestAt).toLocaleDateString() : ''}</Txt>
              <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: suggestion.topic } })}>{'Research ' + suggestion.title}</Action>
            </View>
          ))}
        </Panel>
      )}

      {warnings.length > 0 && (
        <Panel>
          <Heading>Some publisher feeds are unavailable</Heading>
          <Txt muted>The News tab shows the health of each feed. Other sources and the local research engine remain available.</Txt>
          <Action secondary onPress={() => void op.run(async () => {
            await useScout.getState().commit((data) => ({ ...data, preferences: { ...data.preferences, selectedSpaceNiche: 'all' } }));
          }, 'Discovery scope changed to all space topics.')}>Show all space topics</Action>
          <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: discoveryTopic } })}>Search this niche on YouTube</Action>
          <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: discoveryTopic, niche: preferences.selectedSpaceNiche } })}>Start Deep Research without news</Action>
          <Action secondary onPress={() => router.push('/news')}>Open Cosmic News and source status</Action>
        </Panel>
      )}


          </View>
        }
        ListFooterComponent={
          <View style={{ gap: 18 }}>
      <Fold title="More research tools">
        <Txt muted>Use these when you already know what you want to investigate.</Txt>
        <Action secondary onPress={() => router.push('/news')}>Open Cosmic News</Action>
        <Action secondary onPress={() => router.push('/trend-intelligence')}>Trend Intelligence</Action>
        <Action secondary onPress={() => router.push('/search-demand')}>Compare public interest</Action>
        <Action secondary onPress={() => router.push('/deep-research')}>Start Deep Research manually</Action>
        <Action secondary onPress={() => router.push('/opportunities')}>Open saved Ideas</Action>
      </Fold>
      <Fold title="How research leads are selected">
        <Txt muted>Recommendations come from title and summary matches in the selected official NASA, JPL and ESA feeds. Multiple Source Coverage means matching headlines appeared in more than one selected feed; it is not a formal independent fact-check. News coverage is not proof of audience demand. Check YouTube and public-interest evidence separately before prioritizing a topic.</Txt>
      </Fold>
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={discover} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}

          </View>
        }
      />
    </Page>
  );
}
