import { useCallback, useEffect, useRef, useState } from 'react';
import { Newspaper } from 'lucide-react-native';
import { View, Text, FlatList } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Panel, Heading, Txt, Action, Choices, Fold, styles, ErrorBox, useOperation, ScreenIntro, BadgeText, SourceHeading } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { useShallow } from 'zustand/react/shallow';
import {
  SPACE_NICHES, SPACE_NEWS_SOURCES, fetchSpaceNews, getCachedSpaceNews,
  newsForNiche, getWikipediaSignal, buildNicheSuggestions,
  type SpaceNewsItem, type WikiSignal, type SpaceNicheSuggestion,
} from '@/lib/space';
import { buildInternalResearch } from '@/lib/engine';
import { buildPublisherIntelligence, type PublisherIntelligence } from '@/lib/news-intelligence';
import { buildResearchInterestProfile, normalizeResearchText } from '@/lib/intelligence';
import { runSingleFlight } from '@/lib/dashboard';
import { generateEditorialIdeas } from '@/lib/idea-generation';
import { createResearchMemoryEntry } from '@/lib/research-memory';
import { rememberTopicDossier } from '@/lib/topic-dossier';
import { uid } from '@/lib/types';
import { setSelectedIdeaId } from '@/lib/idea-selection';
import { palette as p } from '@/lib/theme';
import { MediaPreview } from '@/components/MediaPreview';
import { recordRuntimeFinish, recordRuntimeStart } from '@/lib/runtime-metrics';
import { openExternalUrl } from '@/lib/external-links';

export default function CosmicNews() {
  const params = useLocalSearchParams<{ niche?: string }>();
  const preferences = useScout(useShallow((state) => ({
    uiLanguage: state.data.preferences.uiLanguage ?? 'fa',
    selectedSpaceNiche: state.data.preferences.selectedSpaceNiche,
    customSpaceNiche: state.data.preferences.customSpaceNiche,
    spaceInterestLanguage: state.data.preferences.spaceInterestLanguage ?? 'en',
    spaceNewsSources: state.data.preferences.spaceNewsSources,
    region: state.data.preferences.region,
    languages: state.data.preferences.languages,
  })));
  const feedRegistry = useScout((state) => state.data.feedRegistry);
  const nicheId = typeof params.niche === 'string' ? params.niche : preferences.selectedSpaceNiche;
  const niche = SPACE_NICHES.find((item) => item.id === nicheId);
  const discoveryTopic = preferences.selectedSpaceNiche === 'all'
    ? 'Space science and exploration'
    : preferences.selectedSpaceNiche === 'custom'
      ? preferences.customSpaceNiche
      : SPACE_NICHES.find((item) => item.id === preferences.selectedSpaceNiche)?.topic ?? 'Space science and exploration';
  const [items, setItems] = useState<SpaceNewsItem[]>(() =>
    getCachedSpaceNews(useScout.getState().data.feedRegistry, preferences.spaceNewsSources),
  );
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(() =>
    getCachedSpaceNews(useScout.getState().data.feedRegistry, preferences.spaceNewsSources).length === 0,
  );
  const [scanning, setScanning] = useState(false);
  const [visibleCount, setVisibleCount] = useState(15);
  const [scope, setScope] = useState('All selected feeds');
  const [radarNews, setRadarNews] = useState<SpaceNewsItem[]>([]);
  const [engineNews, setEngineNews] = useState<SpaceNewsItem[]>([]);
  const [radarWiki, setRadarWiki] = useState<WikiSignal>();
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);
  const [nicheSuggestions, setNicheSuggestions] = useState<SpaceNicheSuggestion[]>([]);
  const [publisherAnalysis, setPublisherAnalysis] = useState<PublisherIntelligence>();
  const scanInFlightRef = useRef<Promise<void> | null>(null);
  const op = useOperation();
  const fa = preferences.uiLanguage === 'fa';
  const lastUpdatedAt = feedRegistry.reduce((latest, feed) => Math.max(latest, feed.lastSuccessAt), 0);
  const displayedItems = scope === 'Selected niche'
    ? newsForNiche(items, nicheId, preferences.customSpaceNiche)
    : items;
  const visibleItems = displayedItems.slice(0, visibleCount);

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
        setItems(result.items);
        setVisibleCount(15);
        setLoading(false);
        const relevantNews = preferences.selectedSpaceNiche === 'all'
          ? result.items
          : newsForNiche(result.items, preferences.selectedSpaceNiche, preferences.customSpaceNiche);
        const engineNewsByUrl = new Map<string, SpaceNewsItem>();
        for (const item of [...getCachedSpaceNews(result.registry, preferences.spaceNewsSources), ...result.items]) {
          engineNewsByUrl.set(item.url, item);
        }
        const allEngineNews = [...engineNewsByUrl.values()].sort(
          (a, b) => (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0),
        );

        // Show the latest feed preview first and defer CPU-heavy local analysis until
        // gestures/navigation settle, so scroll and tab changes remain responsive.
        setRadarNews(relevantNews);
        setEngineNews(allEngineNews);
        setWarnings(result.warnings);
        setLastScannedAt(Date.now());
        // Yield one frame before local CPU work so the native UI can paint and respond.
        await new Promise<void>((resolve) => setTimeout(resolve, 96));
        const wiki = await wikiPromise;
        setRadarWiki(wiki);

        const currentData = useScout.getState().data;
        const priorMemory = currentData.researchMemory.find(
          (entry) => normalizeResearchText(entry.topic) === normalizeResearchText(discoveryTopic),
        );
        const hasEngineInput = Boolean(allEngineNews.length || wiki);
        if (hasEngineInput) {
          recordRuntimeStart('Engine');
          engineStarted = true;
        }
        const publisherSignals = await buildPublisherIntelligence(allEngineNews, Date.now(), 7);
        setPublisherAnalysis(publisherSignals);
        const nextRadarBrief = hasEngineInput ? buildInternalResearch({
          topic: discoveryTopic,
          feedback: buildResearchInterestProfile(currentData.ideas),
          priorMemory,
          language: currentData.preferences.uiLanguage ?? 'fa',
          news: allEngineNews.map((item) => ({
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
          news: allEngineNews,
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

        rememberTopicDossier(discoveryTopic, { news: allEngineNews, ...(wiki ? { wiki } : {}), internalAnalysis: nextRadarBrief });
        if (engineStarted) {
          recordRuntimeFinish('Engine', nextRadarBrief ? 'success' : 'partial');
          engineRecorded = true;
        }
        setNicheSuggestions(buildNicheSuggestions(allEngineNews, 8).filter((suggestion) => !suggestion.id.startsWith('story:')));
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
        setLoading(false);
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


  const refresh = () => void op.run(
    () => runScan(true),
    fa ? 'رادار منابع و خبرها به‌روزرسانی شد.' : 'Space Radar and publisher news refreshed.',
  );

  const saveItem = (item: SpaceNewsItem) => void op.run(async () => {
    const note = {
      id: uid(),
      title: ('Space source: ' + item.title).slice(0, 120),
      folder: 'Space Research',
      tags: ['space', item.sourceId],
      updatedAt: Date.now(),
      blocks: [
        { id: uid(), type: 'paragraph' as const, text: item.sourceName + (item.publishedAt ? ' · ' + item.publishedAt : '') },
        { id: uid(), type: 'paragraph' as const, text: item.summary },
        ...(item.imageUrl ? [{ id: uid(), type: 'link' as const, text: 'Image: ' + item.imageUrl }] : []),
        { id: uid(), type: 'link' as const, text: item.url },
      ],
    };
    await useScout.getState().commit((data) => ({ ...data, notes: [note, ...data.notes] }));
  }, 'Source saved to the Space Research folder in Notes.');

  const researchSuggestion = (suggestion: SpaceNicheSuggestion, destination: 'youtube' | 'deep') => void op.run(async () => {
    const sourceCorpus = engineNews.length ? engineNews : items;
    const source = newsForNiche(sourceCorpus, suggestion.id, preferences.customSpaceNiche)
      .slice()
      .sort((a, b) => (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0))[0];
    if (!source) throw new Error('The selected feed no longer contains a source for this topic. Refresh Space Radar and try again.');
    const idea = await useScout.getState().ensureSourceIdea({
      topic: suggestion.topic,
      concept: [suggestion.description, source.title, source.summary].filter(Boolean).join('\n\n'),
      sourceUrl: source.url,
      sourceName: source.sourceName,
      imageUrl: source.imageUrl,
      region: preferences.region,
      languages: preferences.languages,
    });
    setSelectedIdeaId(idea.id);
    if (destination === 'youtube') {
      router.push({ pathname: '/youtube', params: { topic: suggestion.topic, idea: idea.id } });
    } else {
      router.push({ pathname: '/deep-research', params: { topic: suggestion.topic, niche: nicheId, idea: idea.id } });
    }
  }, fa ? 'موضوع به پرونده ایده متصل شد.' : 'Topic connected to a source-backed idea.');

  const researchStory = (item: SpaceNewsItem) => void op.run(async () => {
    const idea = await useScout.getState().ensureSourceIdea({
      topic: item.title,
      concept: item.summary || 'Review the original publisher report, verify its scientific claims and develop an original explanatory angle.',
      sourceUrl: item.url,
      sourceName: item.sourceName,
      imageUrl: item.imageUrl,
      region: preferences.region,
      languages: preferences.languages,
    });
    router.push({ pathname: '/deep-research', params: { topic: item.title, niche: nicheId, idea: idea.id } });
  }, 'Story connected to your personal research ideas.');

  return (
    <Page scroll={false}>
      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 18 }}>
            <ScreenIntro
              eyebrow="SPACE RADAR · OFFICIAL SIGNALS"
              title="News & Space Radar"
              subtitle="One place for official publisher reports, Wikimedia attention signals and topic clusters. Open any story to research it."
              icon={Newspaper}
            />
            <Panel variant="soft">
              <View style={styles.rowBetween}>
                <Heading>{fa ? 'نمای کلی خبرها و توجه عمومی' : 'Publisher news and public-attention overview'}</Heading>
                <BadgeText>{scanning ? 'REFRESHING' : lastScannedAt ? 'UPDATED' : 'NOT REFRESHED'}</BadgeText>
              </View>
              <Txt muted>{fa ? 'این صفحه خبرهای ناشران رسمی را از بازدید ماهانه مقاله ویکی‌مدیا جدا نگه می‌دارد. هیچ‌کدام به‌تنهایی حجم جست‌وجو یا روند YouTube نیستند.' : 'This page keeps official publisher news separate from Wikimedia monthly article pageviews. Neither alone represents search volume or a YouTube trend.'}</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { label: fa ? 'گزارش منطبق' : 'MATCHED', value: radarNews.length },
                  { label: fa ? 'کل نگهداری‌شده' : 'RETAINED', value: engineNews.length },
                  { label: fa ? 'ماه‌های ویکی' : 'WIKI MONTHS', value: radarWiki?.monthlyViews.length ?? 0 },
                  { label: fa ? 'موضوع‌ها' : 'TOPICS', value: nicheSuggestions.length },
                ].map((metric) => (
                  <View key={metric.label} style={{ flexGrow: 1, flexBasis: '21%', minWidth: 62, borderRadius: 9, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingHorizontal: 7, paddingVertical: 6, gap: 2 }}>
                    <Text style={{ color: p.text, fontSize: 15, fontWeight: '800' }}>{metric.value}</Text>
                    <Text style={{ color: p.muted, fontSize: 8, fontWeight: '700' }}>{metric.label}</Text>
                  </View>
                ))}
              </View>
              <Fold title={fa ? 'جزئیات رادار' : 'Radar details'} summary={fa ? (radarWiki ? 'نمونه بازدید مقاله و ' : 'بدون نمونه ویکی‌مدیا · ') + nicheSuggestions.length + ' گروه موضوعی' : (radarWiki ? 'Wikimedia pageview sample · ' : 'No Wikimedia sample · ') + nicheSuggestions.length + ' topic groups'}>
              {radarWiki ? (
                <View style={styles.softCard}>
                  <BadgeText>WIKIMEDIA ARTICLE ATTENTION</BadgeText>
                  <SourceHeading>{radarWiki.articleTitle}</SourceHeading>
                  {radarWiki.monthlyViews.length ? (
                    <Txt muted>{radarWiki.monthlyViews[radarWiki.monthlyViews.length - 1].month + ' · ' +
                      new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(radarWiki.monthlyViews[radarWiki.monthlyViews.length - 1].views) +
                      ' article pageviews'}</Txt>
                  ) : <Txt muted>No monthly pageview observation was returned.</Txt>}
                </View>
              ) : (
                <Txt muted>{scanning ? 'Checking Wikimedia attention data…' : 'No Wikimedia pageview sample is saved for this topic yet.'}</Txt>
              )}
              {publisherAnalysis?.clusters.length ? (
                <View style={{ gap: 8 }}>
                  <Heading>{fa ? 'شتاب پوشش موضوعات در خبرهای ناشران' : 'Publisher-news topic momentum'}</Heading>
                  <Txt muted>{fa
                    ? 'این امتیاز فقط از تعداد و تازگی گزارش‌های RSS محاسبه شده است؛ تقاضای مخاطب یا روند YouTube را اندازه نمی‌گیرد.'
                    : 'This coverage score uses RSS report counts and publication dates only. It is not audience demand or a YouTube trend score.'}</Txt>
                  {publisherAnalysis.clusters.slice(0, 5).map((cluster) => (
                    <View key={cluster.id} style={styles.softCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <SourceHeading>{cluster.title}</SourceHeading>
                        <BadgeText>{(fa ? 'پوشش خبر ' : 'NEWS COVERAGE ') + cluster.publisherCoverageScore + '/100'}</BadgeText>
                      </View>
                      <Txt muted>{cluster.articleCount + (fa ? ' گزارش · ' : ' reports · ') + cluster.publishers.length + (fa ? ' گروه ناشر' : ' publisher groups')}</Txt>
                      <Txt muted>{(fa ? 'شتاب: ' : 'Momentum: ') + cluster.momentum + ' · ' + cluster.currentWindowCount + (fa ? ' گزارش در ۷ روز اخیر در برابر ' : ' reports in the latest 7 days versus ') + cluster.previousWindowCount + (fa ? ' گزارش در ۷ روز قبل' : ' in the preceding 7 days')}</Txt>
                      <Txt muted>{cluster.reason}</Txt>
                      {cluster.evidence.slice(0, 2).map((reference) => (
                        <Button key={reference.url} variant="tertiary" className="h-auto justify-start px-0" onPress={() => void openExternalUrl(reference.url, preferences.uiLanguage)}>
                          <Button.Label>{reference.sourceName + ': ' + reference.title + ' ↗'}</Button.Label>
                        </Button>
                      ))}
                    </View>
                  ))}
                </View>
              ) : null}
              {nicheSuggestions.length ? (
                <View style={{ gap: 7 }}>
                  <Heading>{fa ? 'موضوعات پوشش‌داده‌شده در خوراک‌های انتخابی' : 'Topics covered by selected feeds'}</Heading>
                  <Txt muted>{fa ? 'تعدادها، گزارش‌های منطبق با هر موضوع در خوراک‌های فعال را نشان می‌دهند؛ امتیاز ترند یا تقاضای YouTube نیستند.' : 'Counts are matching publisher reports from your enabled feeds. They are not YouTube trend or audience-demand scores.'}</Txt>
                  {nicheSuggestions.slice(0, 3).map((suggestion) => (
                    <View key={suggestion.id} style={styles.softCard}>
                      <View style={styles.rowBetween}>
                        <SourceHeading>{suggestion.title}</SourceHeading>
                        <BadgeText>{fa ? suggestion.matchedStories + ' گزارش منطبق' : suggestion.matchedStories + ' matching reports'}</BadgeText>
                      </View>
                      <Txt muted>{suggestion.description}</Txt>
                      {suggestion.newestAt ? <Txt muted>{(fa ? 'جدیدترین گزارش: ' : 'Most recent: ') + new Date(suggestion.newestAt).toLocaleDateString(fa ? 'fa-IR' : 'en-US')}</Txt> : null}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                        <Action secondary onPress={() => researchSuggestion(suggestion, 'youtube')}>Research on YouTube</Action>
                        <Action secondary onPress={() => researchSuggestion(suggestion, 'deep')}>Deep Research</Action>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
              </Fold>
            </Panel>
            <Panel>
              <Heading>{fa ? 'خوراک خبرهای ناشران' : 'Publisher feed'}</Heading>
              <Txt muted>{fa ? 'خبرها، فیلتر حوزه و وضعیت تازه‌سازی در این بخش جدا از سیگنال‌های توجه عمومی قرار دارند.' : 'Browse publisher stories, filter by niche and refresh feeds separately from public-attention signals.'}</Txt>
              <View style={styles.rowBetween}>
                <Txt muted>{lastUpdatedAt > 0
                  ? 'Last successful publisher response: ' + new Date(lastUpdatedAt).toLocaleString()
                  : 'No successful publisher response has been recorded yet.'}</Txt>
                <Text style={styles.badge}>{items.length} STORIES</Text>
              </View>
              {scope ? <Choices label="Show stories" options={['All selected feeds', 'Selected niche']} selected={[scope]} onChange={(values) => { setScope(values[0]); setVisibleCount(15); }} /> : null}
              <Txt muted>{niche?.title ?? (nicheId === 'custom' ? 'Custom niche: ' + preferences.customSpaceNiche : 'All space topics')}</Txt>
              <Action busy={scanning || op.busy} onPress={refresh}>Refresh Radar & News</Action>
              {warnings.map((warning) => <Txt muted key={warning}>{warning}</Txt>)}
              <Text style={styles.badge}>{Math.min(visibleCount, displayedItems.length)} / {displayedItems.length} {scope === 'Selected niche' ? 'matching niche reports' : 'source reports'}</Text>
              {loading || scanning ? <Txt muted>Checking enabled publishers… saved stories remain visible where available.</Txt> : null}
            </Panel>
            {!loading && !items.length ? (
              <Panel>
                <Heading>No current publisher items</Heading>
                <Txt muted>No placeholder story is shown when feeds are unavailable. You can still investigate a topic through the other research routes.</Txt>
                <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: niche?.topic ?? (nicheId === 'custom' ? preferences.customSpaceNiche : 'Space science discoveries') } })}>Search this topic on YouTube</Action>
                <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: niche?.topic ?? (nicheId === 'custom' ? preferences.customSpaceNiche : 'Space science discoveries'), niche: nicheId } })}>Start Deep Research</Action>
                {SPACE_NEWS_SOURCES.filter((source) => preferences.spaceNewsSources.includes(source.id)).map((source) => (
                  <Button key={source.id} variant="tertiary" className="h-auto justify-start px-0" onPress={() => void openExternalUrl(source.url, preferences.uiLanguage)}>
                    <Button.Label>{'Open official ' + source.label + ' feed ↗'}</Button.Label>
                  </Button>
                ))}
              </Panel>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Panel>
            {item.imageUrl ? <MediaPreview uri={item.imageUrl} aspectRatio={16 / 9} viewer alt={item.title} /> : null}
            <View style={{ gap: 7 }}>
              <Text style={styles.badge}>{item.sourceName} · {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : 'Publisher did not provide a date'}</Text>
              <Heading>{item.title}</Heading>
              {item.summary ? <Txt muted>{item.summary}</Txt> : null}
            </View>
            <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void openExternalUrl(item.url, preferences.uiLanguage)}>
              <Button.Label>Open original source ↗</Button.Label>
            </Button>
            <Action secondary onPress={() => saveItem(item)} busy={op.busy}>Save source to Notes</Action>
            <Action secondary busy={op.busy} onPress={() => researchStory(item)}>Research this story</Action>
          </Panel>
        )}
        ListFooterComponent={
          <View style={{ gap: 12, marginTop: 14 }}>
            {visibleCount < displayedItems.length ? (
              <Action secondary onPress={() => setVisibleCount((current) => Math.min(current + 15, displayedItems.length))}>
                {'Show More · ' + String(displayedItems.length - visibleCount) + ' remaining'}
              </Action>
            ) : null}
            {op.error ? <ErrorBox message={op.error} onRetry={refresh} /> : null}
            {op.message ? <Txt muted>{op.message}</Txt> : null}
          </View>
        }
      />
    </Page>
  );
}
