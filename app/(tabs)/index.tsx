import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { router } from 'expo-router';
import {
  Page, Panel, Heading, Txt, Action, Fold, styles, ErrorBox, useOperation,
  SourceHeading, SourceText, BadgeText,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { uid, type Idea, languages } from '@/lib/types';
import {
  SPACE_NICHES,
  buildDiscoveryOpportunities,
  buildNicheSuggestions,
  fetchSpaceNews,
  type DiscoveryOpportunity,
  type SpaceNicheSuggestion,
  newsForNiche,
  type SpaceNewsItem,
} from '@/lib/space';
import { MediaPreview } from '@/components/MediaPreview';
import { buildInternalResearch, type InternalResearchResult } from '@/lib/engine';
import { buildResearchInterestProfile, normalizeResearchText } from '@/lib/intelligence';
import { rememberTopicDossier } from '@/lib/topic-dossier';
import { ResearchKnowledgeGraph } from '@/components/ResearchKnowledgeGraph';
import { generateEditorialIdeas } from '@/lib/idea-generation';
import type { YouTubeSampleVideo } from '@/lib/api';


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
  const [opportunities, setOpportunities] = useState<DiscoveryOpportunity[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, InternalResearchResult>>({});
  const [nicheSuggestions, setNicheSuggestions] = useState<SpaceNicheSuggestion[]>([]);
  const [radarBrief, setRadarBrief] = useState<InternalResearchResult>();
  const [radarNews, setRadarNews] = useState<SpaceNewsItem[]>([]);
  const listExtraData = useMemo(() => ({ analyses, ideas }), [analyses, ideas]);
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
    const nextOpportunities = buildDiscoveryOpportunities(result.items, preferences.selectedSpaceNiche, Date.now(), preferences.customSpaceNiche);
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
    for (const opportunity of nextOpportunities) {
      const matchingNews = relevantNews.filter((item) => item.url === opportunity.sourceUrl || item.title === opportunity.topic);
      if (matchingNews.length) rememberTopicDossier(opportunity.topic, { news: matchingNews });
    }
    setOpportunities(nextOpportunities);
    setRadarNews(relevantNews);
    setWarnings(result.warnings);
    setLastScannedAt(Date.now());
    setNicheSuggestions(buildNicheSuggestions(result.items, 6));
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

  const saveIdea = (opportunity: DiscoveryOpportunity) => void op.run(async () => {
    const existing = useScout.getState().data.ideas.some((idea) => idea.topic === opportunity.topic && idea.sourceUrl === opportunity.sourceUrl);
    if (existing) return;
    const idea: Idea = {
      id: uid(),
      topic: opportunity.topic,
      concept: opportunity.summary || 'Review the official source and develop an original explanatory angle.',
      note: '',
      status: 'Saved Opportunities',
      decision: '',
      videoIds: [],
      createdAt: Date.now(),
      archived: false,
      assessment: 'Worth Exploring',
      region: preferences.region,
      languages: preferences.languages,
      imageUrl: opportunity.imageUrl,
      sourceUrl: opportunity.sourceUrl,
      sourceName: opportunity.sourceName,
    };
    await useScout.getState().saveIdea(idea);
  }, 'Opportunity saved to Ideas.');

  const runInternalEngine = (opportunity: DiscoveryOpportunity) => {
    const currentData = useScout.getState().data;
    const priorMemory = currentData.researchMemory.find((entry) => normalizeResearchText(entry.topic) === normalizeResearchText(opportunity.topic));
    const result = buildInternalResearch({
      topic: opportunity.topic,
      feedback: buildResearchInterestProfile(currentData.ideas),
      priorMemory,
      language: currentData.preferences.uiLanguage ?? 'fa',
      news: [{
        title: opportunity.topic,
        summary: opportunity.summary,
        sourceName: opportunity.sourceName,
        sourceUrl: opportunity.sourceUrl,
        publishedAt: opportunity.publishedAt,
        sourceCount: opportunity.sourceCount,
      }],
    });
    rememberTopicDossier(opportunity.topic, { internalAnalysis: result });
    setAnalyses((current) => ({ ...current, [opportunity.id]: result }));
  };

  const saveAngle = (opportunity: DiscoveryOpportunity, angle: InternalResearchResult['angles'][number]) =>
    void op.run(async () => {
      const topic = opportunity.topic + ' · ' + angle.title;
      const exists = useScout.getState().data.ideas.some((idea) => idea.topic === topic && idea.sourceUrl === opportunity.sourceUrl);
      if (exists) return;
      const idea: Idea = {
        id: uid(),
        topic,
        concept: angle.hook + '\n\n' + angle.approach,
        note: useScout.getState().data.preferences.uiLanguage === 'fa'
          ? 'تولیدشده توسط موتور تحقیق داخلی. این یک فرضیه محتوایی است؛ هر ادعای علمی را با منبع اصلی بررسی کن.\n\nمنبع: ' + opportunity.sourceUrl
          : 'Generated by the local Internal Research Engine. This is an editorial hypothesis; verify every scientific claim against the original source.\n\nSource: ' + opportunity.sourceUrl,
        status: 'Saved Opportunities',
        decision: '',
        videoIds: [],
        createdAt: Date.now(),
        archived: false,
        assessment: 'Worth Exploring',
        region: preferences.region,
        languages: preferences.languages,
        imageUrl: opportunity.imageUrl,
        sourceUrl: opportunity.sourceUrl,
        sourceName: opportunity.sourceName,
      };
      await useScout.getState().saveIdea(idea);
    }, 'Engine angle saved to Ideas.');

  const saved = (opportunity: DiscoveryOpportunity) => ideas.some((idea) => idea.topic === opportunity.topic && idea.sourceUrl === opportunity.sourceUrl);

  const openOpportunityResearch = (
    opportunity: DiscoveryOpportunity,
    destination: '/trend-intelligence' | '/search-demand' | '/deep-research',
  ) => void op.run(async () => {
    const idea = await useScout.getState().ensureSourceIdea({
      topic: opportunity.topic,
      concept: opportunity.summary || 'Review the original publisher report, verify its claims and develop an original explanatory angle.',
      sourceUrl: opportunity.sourceUrl,
      sourceName: opportunity.sourceName,
      imageUrl: opportunity.imageUrl,
      region: preferences.region,
      languages: preferences.languages,
    });
    const params = { topic: opportunity.topic, idea: idea.id };
    if (destination === '/deep-research') {
      router.push({ pathname: '/deep-research', params: { ...params, niche: preferences.selectedSpaceNiche } });
    } else if (destination === '/search-demand') {
      router.push({ pathname: '/search-demand', params });
    } else {
      router.push({ pathname: '/trend-intelligence', params });
    }
  }, 'Research linked to the same saved idea.');

  return (
    <Page scroll={false}>
      <FlashList
        style={{ flex: 1 }}
        data={opportunities}
        extraData={listExtraData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 18 }}>

        <Text style={styles.title}>MOHSEN SCOUT</Text>
      <View style={{ gap: 7 }}>
        <Text style={[styles.title, { fontSize: 30, lineHeight: 36 }]}>Find your next story.</Text>
        <Txt muted>A source-led discovery desk for your next space video. Choose an opportunity, then decide what deserves deeper research.</Txt>
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
        <Txt muted>News and niche suggestions refresh on entry using a short in-memory cache. No background polling or YouTube quota is used. The local Story Engine analyzes loaded reports without sending them to AI.</Txt>
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
          <Heading>Active topics in official feeds</Heading>
          <Txt muted>These are topics with the most matching stories in the selected publisher feeds—not audience-demand or YouTube trend rankings.</Txt>
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

      {lastScannedAt !== null && opportunities.length === 0 && (
        <Panel>
          <Heading>{warnings.length && !nicheSuggestions.length ? 'Live publisher data is unavailable' : 'No matching opportunities found'}</Heading>
          <Txt muted>{warnings.length && !nicheSuggestions.length
            ? 'The selected feeds could not provide current articles. This does not mean there are no opportunities. Review the source warnings, retry later, or continue with YouTube and Deep Research.'
            : 'Current source items did not match ' + nicheTitle + '. Other space topics remain available above.'}</Txt>
          <Action secondary onPress={() => void op.run(async () => {
            await useScout.getState().commit((data) => ({ ...data, preferences: { ...data.preferences, selectedSpaceNiche: 'all' } }));
          }, 'Discovery scope changed to all space topics.')}>Show all space topics</Action>
          <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: discoveryTopic } })}>Search this niche on YouTube</Action>
          <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: discoveryTopic, niche: preferences.selectedSpaceNiche } })}>Start Deep Research without news</Action>
          <Action secondary onPress={() => router.push('/cosmic-news')}>Open Cosmic News and source status</Action>
        </Panel>
      )}


          </View>
        }
        renderItem={({ item: opportunity }) => (

        <Panel>
          {opportunity.imageUrl ? <MediaPreview uri={opportunity.imageUrl} aspectRatio={16 / 9} viewer alt={opportunity.topic} /> : null}
          <View style={{ gap: 7 }}>
            <SourceText muted>{opportunity.sourceName} · {opportunity.publishedAt ? new Date(opportunity.publishedAt).toLocaleDateString() : 'Date not supplied'}</SourceText>
            <SourceHeading>{opportunity.topic}</SourceHeading>
            {Boolean(opportunity.summary) && <SourceText muted>{opportunity.summary}</SourceText>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {opportunity.labels.map((label) => <BadgeText key={label}>{label}</BadgeText>)}
            </View>
            <Txt muted>{opportunity.reason}</Txt>
            <Txt muted>{opportunity.sourceCount} matching official feed source{opportunity.sourceCount === 1 ? '' : 's'} · No YouTube competition check yet</Txt>
          </View>
          <Action busy={op.busy} onPress={() => openOpportunityResearch(opportunity, '/trend-intelligence')}>Check YouTube Competition</Action>
          <Action secondary busy={op.busy} onPress={() => openOpportunityResearch(opportunity, '/search-demand')}>Compare Public Interest</Action>
          <Action secondary busy={op.busy} onPress={() => openOpportunityResearch(opportunity, '/deep-research')}>Deep Research</Action>
          <Action secondary disabled={saved(opportunity)} onPress={() => saveIdea(opportunity)}>{saved(opportunity) ? 'Saved to Ideas' : 'Save Idea'}</Action>
          <Action secondary onPress={() => runInternalEngine(opportunity)}>Run Internal Story Engine</Action>
          <Action secondary onPress={() => void Linking.openURL(opportunity.sourceUrl).catch(() => {})}>Open original source ↗</Action>
          {analyses[opportunity.id] ? (
            <Panel>
              <Heading>Internal Story Engine</Heading>
              <Txt muted>{analyses[opportunity.id].summary}</Txt>
              {analyses[opportunity.id].evidence.map((item) => (
                <View key={item.id} style={{ gap: 3 }}>
                  <BadgeText>{item.label}</BadgeText>
                  <Txt muted>{item.detail}</Txt>
                </View>
              ))}
              <AnalysisSignals result={analyses[opportunity.id]} />
              {analyses[opportunity.id].angles.map((angle) => (
                <View key={angle.id} style={{ gap: 5 }}>
                  <Heading>{angle.title}</Heading>
                  <Txt>{angle.hook}</Txt>
                  <Txt muted>{angle.approach}</Txt>
                  <Txt muted>Verify: {angle.verification}</Txt>
                  <Action
                    secondary
                    disabled={ideas.some((idea) => idea.topic === opportunity.topic + ' · ' + angle.title && idea.sourceUrl === opportunity.sourceUrl)}
                    onPress={() => saveAngle(opportunity, angle)}
                  >
                    Save this angle to Ideas
                  </Action>
                </View>
              ))}
              <Fold title="Verification questions & limitations">
                {analyses[opportunity.id].verificationQuestions.map((question) => <Txt muted key={question}>{question}</Txt>)}
                {analyses[opportunity.id].limitations.map((limitation) => <Txt muted key={limitation}>{limitation}</Txt>)}
              </Fold>
            </Panel>
          ) : null}
        </Panel>

        )}
        ListFooterComponent={
          <View style={{ gap: 18 }}>
      <Fold title="More research tools">
        <Txt muted>Use these when you already know what you want to investigate.</Txt>
        <Action secondary onPress={() => router.push('/cosmic-news')}>Open Cosmic News</Action>
        <Action secondary onPress={() => router.push('/trend-intelligence')}>Trend Intelligence</Action>
        <Action secondary onPress={() => router.push('/search-demand')}>Compare public interest</Action>
        <Action secondary onPress={() => router.push('/deep-research')}>Start Deep Research manually</Action>
        <Action secondary onPress={() => router.push('/opportunities')}>Open saved Ideas</Action>
      </Fold>
      <Fold title="How opportunities are selected">
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
