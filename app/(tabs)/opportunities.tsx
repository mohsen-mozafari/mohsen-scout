import { memo, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Platform, View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { ArrowUpRight, Plus, Archive, Lightbulb, Activity } from 'lucide-react-native';
import {
  Page,
  styles,
  Choices,
  Field,
  Fold,
  Empty,
  Action,
  ErrorBox,
  useOperation,
  Txt,
  Heading,
  SourceHeading,
  SourceText,
  BadgeText,
  ScreenIntro,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { statuses, uid, type Idea, type ResearchActivityEvent } from '@/lib/types';
import { getIdeaDisplayTitle, isIdeaDisplayable } from '@/lib/idea-research';
import { createManualIdea } from '@/lib/engine';
import { deduplicateDisplayIdeas, generateEditorialIdeas, IDEA_GENERATION_CATEGORIES, type IdeaGenerationCategory } from '@/lib/idea-generation';
import { getTopicDossier } from '@/lib/topic-dossier';
import { fetchSpaceNews, getCachedSpaceNews, SPACE_NICHES } from '@/lib/space';
import { createSearchQuery, indexSearchText, matchesSearchIndex, normalizeSearchText } from '@/lib/search';
import { buildResearchInterestProfile } from '@/lib/intelligence';
import { buildResearchActivityFeedbackProfile, buildResearchActivityResults, buildResearchActivitySourceExclusions, explainResearchActivitySourceExclusion } from '@/lib/research-activity';
import { palette as p } from '@/lib/theme';
import { getEditorialPriorityBand, EDITORIAL_PRIORITY_CONFIG, compareEditorialPriority, type EditorialPriorityBand } from '@/lib/editorial-priority';
import { setSelectedIdeaId } from '@/lib/idea-selection';
import { selectDashboardFeaturedIdeas } from '@/lib/dashboard';
import { recordRuntimeFinish, recordRuntimeStart } from '@/lib/runtime-metrics';
import { MediaPreview } from '@/components/MediaPreview';
function numberLabel(value: number, fa: boolean) {
  return new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(value);
}

function ideaCategoryLabel(value: string | undefined, fa: boolean): string {
  if (!value) return fa ? 'ایده تحریری' : 'Editorial angle';
  const labels: Record<IdeaGenerationCategory, string> = {
    Explainer: 'توضیحی',
    'Evidence audit': 'بررسی شواهد',
    Comparison: 'مقایسه',
    Timeline: 'خط زمانی',
    'Open question': 'پرسش بی‌پاسخ',
    'Cross-source': 'ارتباط میان منابع',
    Storytelling: 'روایت مستند',
  };
  const category = IDEA_GENERATION_CATEGORIES.find((item) => item === value);
  return fa && category ? labels[category] : value;
}

const IdeaListItem = memo(function IdeaListItem({
  item,
  fa,
  language,
}: {
  item: Idea;
  fa: boolean;
  language: 'fa' | 'en';
}) {
  const band = typeof item.engineScore === 'number' && Number.isFinite(item.engineScore)
    ? getEditorialPriorityBand(item.engineScore)
    : undefined;
  const tint = band === 'strong' ? p.success : band === 'moderate' ? p.cyan : p.danger;
  return (
    <View style={[styles.listCard, { marginBottom: 12 }]}>
      {item.imageUrl ? <MediaPreview uri={item.imageUrl} aspectRatio={16 / 9} viewer alt={item.topic} /> : null}
      <Button
        variant="tertiary"
        className="h-auto min-w-0 justify-start rounded-2xl px-4 py-3"
        onPress={() => {
          setSelectedIdeaId(item.id);
          router.push({ pathname: '/detail', params: { idea: item.id } });
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <BadgeText>{(item.engineGenerated
            ? (fa ? 'تولید موتور · ' : 'ENGINE GENERATED · ') + ideaCategoryLabel(item.ideaCategory, fa)
            : (fa ? 'ایده شخصی' : 'PERSONAL IDEA')) + ' · ' + item.status}</BadgeText>
          <SourceHeading>{getIdeaDisplayTitle(item, language)}</SourceHeading>
          {band ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: tint, fontSize: 11, fontWeight: '800' }}>
                  {(band === 'strong' ? (fa ? 'قوی' : 'STRONG') : band === 'moderate' ? (fa ? 'متوسط' : 'MEDIUM') : (fa ? 'ضعیف' : 'WEAK')) + ' · ' + item.engineScore + '/100'}
                </Text>
                <Text style={{ color: p.muted, fontSize: 9 }}>{fa ? 'اولویت تحریری' : 'EDITORIAL PRIORITY'}</Text>
              </View>
              <Text numberOfLines={1} style={{ color: p.muted, fontSize: 10 }}>
                {item.engineScoreReason?.split(';').slice(0, 2).join(' • ') || (fa ? 'شواهد کافی برای دلیل تفصیلی موجود نیست' : 'Detailed rationale unavailable')}
              </Text>
            </>
          ) : (
            <Text style={{ color: p.muted, fontSize: 10 }}>{fa ? 'هنوز امتیاز شواهد ثبت نشده' : 'Not scored · evidence required'}</Text>
          )}
          {item.concept
            ? <SourceText muted numberOfLines={3}>{item.concept}</SourceText>
            : <Txt muted>Concept missing — open the editor to complete this draft before requesting an AI opinion.</Txt>}
          {item.sourceName ? <View style={styles.row}><Txt muted>Source:</Txt><SourceText>{item.sourceName}</SourceText></View> : null}
          {item.decision ? <SourceText muted>{item.decision}</SourceText> : null}
        </View>
        <ArrowUpRight color={p.purple} size={20} />
      </Button>
    </View>
  );
});

const ideaKeyExtractor = (idea: Idea) => idea.id;

export default function Opportunities() {
  const ideas = useScout((s) => s.data.ideas);
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [archive, setArchive] = useState(false);
  const [category, setCategory] = useState('All angles');
  const [sort, setSort] = useState<'Score' | 'Newest' | 'Oldest' | 'A-Z' | 'Z-A'>('Score');
  const [scoreFilter, setScoreFilter] = useState<'all' | EditorialPriorityBand | 'unscored'>('all');
  const [generationMessage, setGenerationMessage] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftTopic, setDraftTopic] = useState('');
  const [draftConcept, setDraftConcept] = useState('');
  const [draftDecision, setDraftDecision] = useState('');
  const preferences = useScout((s) => s.data.preferences);
  const op = useOperation();
  const fa = preferences.uiLanguage === 'fa';
  const allCategoryLabel = fa ? 'همه زاویه‌ها' : 'All angles';
  const categoryLabel = (value?: string) => ideaCategoryLabel(value, fa);
  const categoryOptions = [allCategoryLabel, ...IDEA_GENERATION_CATEGORIES.map((value) => categoryLabel(value))];
  const displayableIdeas = useMemo(() => deduplicateDisplayIdeas(ideas.filter(isIdeaDisplayable)), [ideas]);
  const indexedIdeas = useMemo(() => displayableIdeas.map((idea) => {
    const title = getIdeaDisplayTitle(idea, preferences.uiLanguage ?? 'fa');
    return {
      idea,
      searchIndex: indexSearchText([
        title, idea.concept, idea.note, idea.decision,
        idea.sourceName ?? '', idea.sourceUrl ?? '', idea.ideaCategory ?? '',
      ].join(' ')),
    };
  }), [displayableIdeas, preferences.uiLanguage]);
  const searchQuery = useMemo(() => createSearchQuery(deferredSearch), [deferredSearch]);
  const matchingResult = useMemo(() => {
    const result = {
      ideas: [] as typeof displayableIdeas,
      scoreCounts: { strong: 0, moderate: 0, weak: 0, unscored: 0 },
    };
    for (const entry of indexedIdeas) {
      const idea = entry.idea;
      if (idea.archived !== archive ||
        (status !== 'All' && idea.status !== status) ||
        (category !== 'All angles' && (!idea.engineGenerated || idea.ideaCategory !== category)) ||
        !matchesSearchIndex(entry.searchIndex, searchQuery)) continue;
      result.ideas.push(idea);
      if (typeof idea.engineScore !== 'number' || !Number.isFinite(idea.engineScore)) {
        result.scoreCounts.unscored += 1;
      } else {
        result.scoreCounts[getEditorialPriorityBand(idea.engineScore)] += 1;
      }
    }
    return result;
  }, [indexedIdeas, archive, status, category, searchQuery]);
  const matchingIdeas = matchingResult.ideas;
  const scoreCounts = matchingResult.scoreCounts;
  const filtered = useMemo(() => scoreFilter === 'all'
    ? matchingIdeas
    : matchingIdeas.filter((idea) => {
      const band = typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore)
        ? getEditorialPriorityBand(idea.engineScore) : 'unscored';
      return band === scoreFilter;
    }), [matchingIdeas, scoreFilter]);
  const sortedFiltered = useMemo(() => [...filtered].sort((a, b) => {
    if (sort === 'Score') {
      return compareEditorialPriority(a, b);
    }
    if (sort === 'Newest') return b.createdAt - a.createdAt;
    if (sort === 'Oldest') return a.createdAt - b.createdAt;
    const comparison = getIdeaDisplayTitle(a, preferences.uiLanguage ?? 'fa')
      .localeCompare(getIdeaDisplayTitle(b, preferences.uiLanguage ?? 'fa'), undefined, { numeric: true, sensitivity: 'base' });
    return sort === 'A-Z' ? comparison : -comparison;
  }), [filtered, sort, preferences.uiLanguage]);
  const topOpportunities = useMemo(
    () => selectDashboardFeaturedIdeas(filtered, EDITORIAL_PRIORITY_CONFIG.pinnedIdeas),
    [filtered],
  );
  const topOpportunityIds = useMemo(() => new Set(topOpportunities.map((idea) => idea.id)), [topOpportunities]);
  const featuredIdea = topOpportunities[0];
  const remainingIdeas = useMemo(() => sortedFiltered.filter((idea) => !topOpportunityIds.has(idea.id)), [sortedFiltered, topOpportunityIds]);
  const sortOptions = fa
    ? ['امتیاز اولویت', 'جدیدترین', 'قدیمی‌ترین', 'عنوان صعودی', 'عنوان نزولی']
    : ['Priority score', 'Newest', 'Oldest', 'Title A–Z', 'Title Z–A'];
  const selectedSort = sort === 'Score' ? sortOptions[0] : sort === 'Newest' ? sortOptions[1] : sort === 'Oldest' ? sortOptions[2] : sort === 'A-Z' ? sortOptions[3] : sortOptions[4];
  const selectedGenerationCategory = (): IdeaGenerationCategory | undefined =>
    category === 'All angles'
      ? undefined
      : IDEA_GENERATION_CATEGORIES.find((candidate) => candidate === category);

  const generate = (requestedCategory?: IdeaGenerationCategory) => void op.run(async () => {
    const initial = useScout.getState().data;
    const savedReport = initial.reports[0];
    const niche = SPACE_NICHES.find((item) => item.id === initial.preferences.selectedSpaceNiche);
    const topic = initial.preferences.selectedSpaceNiche === 'custom'
      ? initial.preferences.customSpaceNiche.trim()
      : initial.preferences.selectedSpaceNiche === 'all'
        ? initial.preferences.lastInput?.topic ?? savedReport?.input.topic ?? 'Space science and exploration'
        : niche?.topic ?? initial.preferences.lastInput?.topic ?? 'Space science and exploration';
    if (!topic) throw new Error('Choose a niche or enter a research topic before generating ideas.');

    const savedInput = initial.preferences.lastInput;
    const refreshAttempted = Boolean(savedInput);
    let refreshedNews: Awaited<ReturnType<typeof fetchSpaceNews>> = {
      items: [],
      registry: initial.feedRegistry,
      warnings: [],
    };

    // When a saved research input exists, the store owns the feed refresh and logs it.
    // Avoid making a second, duplicate RSS request before that measured operation.
    if (!savedInput) {
      const feedStartedAt = Date.now();
      recordRuntimeStart('Sources');
      let feedError = '';
      try {
        refreshedNews = await fetchSpaceNews(initial.preferences.spaceNewsSources, fetch, true);
        recordRuntimeFinish('Sources', refreshedNews.warnings.length ? 'partial' : 'success');
      } catch (error) {
        feedError = error instanceof Error ? error.message : String(error);
        refreshedNews = {
          items: [],
          registry: initial.feedRegistry,
          warnings: ['Publisher feed refresh failed: ' + feedError],
        };
        recordRuntimeFinish('Sources', 'error', feedError);
      }
      if (refreshedNews.registry.length) {
        await useScout.getState().commit((data) => ({ ...data, feedRegistry: refreshedNews.registry }));
      }
      const completedAt = Date.now();
      const feedSourceExclusions = buildResearchActivitySourceExclusions(initial.researchActivity);
      const feedActivityResults = refreshedNews.items.map((item) => {
        const exclusion = explainResearchActivitySourceExclusion(item.url, feedSourceExclusions);
        return {
          id: item.id,
          title: item.title,
          summary: item.summary,
          sourceName: item.sourceName,
          url: item.url,
          publishedAt: item.publishedAt,
          sourceAssessment: 'configured-feed' as const,
          includedInAnalysis: !exclusion,
          decisionReason: exclusion ??
            'Fetched from a configured RSS feed and passed to the local evidence screen; relevance is filtered by the editorial engine and publisher claims are not independently verified.',
        };
      });
      const feedEvent: ResearchActivityEvent = {
        id: uid(),
        engine: 'Publisher Feeds',
        query: 'RSS feed refresh (no remote search query); enabled sources: ' +
          initial.preferences.spaceNewsSources.join(', ') + '; local topic filter: ' + topic,
        topic,
        niche: initial.preferences.customSpaceNiche.trim() ||
          (initial.preferences.selectedSpaceNiche !== 'all' ? initial.preferences.selectedSpaceNiche : topic),
        startedAt: feedStartedAt,
        completedAt,
        durationMs: Math.max(0, completedAt - feedStartedAt),
        status: refreshedNews.items.length
          ? (refreshedNews.warnings.length ? 'partial' : 'success')
          : (feedError ? 'error' : refreshedNews.warnings.length ? 'partial' : 'empty'),
        resultCount: refreshedNews.items.length,
        analyzedCount: feedActivityResults.filter((item) => item.includedInAnalysis).length,
        results: buildResearchActivityResults(topic, feedActivityResults),
        warnings: refreshedNews.warnings.slice(0, 12),
        ...(feedError ? { error: feedError.slice(0, 700) } : {}),
        ...(savedReport ? { reportId: savedReport.id } : {}),
      };
      await useScout.getState().recordResearchActivity(feedEvent);
    }

    const current = useScout.getState().data;
    const previousIdeaIds = new Set(current.ideas.map((idea) => idea.id));
    if (savedInput) {
      const refreshInput = {
        ...savedInput,
        topic,
        region: current.preferences.region,
        languages: [...current.preferences.languages],
      };
      const refreshedReport = await useScout.getState().research(
        refreshInput,
        'manual',
        true,
        { ...(requestedCategory ? { category: requestedCategory } : {}), limit: 10 },
      );
      if (refreshedReport) {
        const updated = useScout.getState().data;
        const added = updated.ideas.filter((idea) => idea.engineGenerated && !previousIdeaIds.has(idea.id));
        const warnings = [...new Set([...refreshedNews.warnings, ...refreshedReport.warnings])];
        setGenerationMessage(current.preferences.uiLanguage === 'fa'
          ? (added.length
            ? added.length + ' ایدهٔ تازه از شواهد مستقل وب و ناشران ساخته شد؛ نمونهٔ خام YouTube جداگانه به‌روز شد و ' + refreshedReport.videos.length + ' رکورد ویدئو دریافت شد.'
            : 'نمونهٔ YouTube به‌روز شد، اما ایدهٔ متمایز دیگری با شواهد کافی پیدا نشد؛ پیشنهاد تکراری ساخته نشد.') +
            (warnings.length ? ' بعضی منابع با نسخهٔ ذخیره‌شده جایگزین شدند.' : '')
          : (added.length
            ? added.length + ' new ideas were generated from independent web and publisher evidence; the raw YouTube sample was refreshed separately and ' + refreshedReport.videos.length + ' video records were received.'
            : 'The YouTube sample was refreshed, but no distinct idea met the evidence threshold. Existing ideas were not recycled.') +
            (warnings.length ? ' Some publishers used their last successful cached copy.' : ''));
        return;
      }
    }

    // If the fresh YouTube request cannot complete, fall back to the complete locally retained YouTube history.
    const fallbackData = useScout.getState().data;
    const report = fallbackData.reports.find((item) =>
      normalizeSearchText(item.input.topic) === normalizeSearchText(topic),
    );
    const dossier = getTopicDossier(topic);
    const cachedNews = getCachedSpaceNews(fallbackData.feedRegistry, fallbackData.preferences.spaceNewsSources);
    const mergedNews = new Map(
      [...(dossier?.news ?? []), ...cachedNews, ...refreshedNews.items].map((item) => [item.url, item]),
    );
    const sourceExclusions = buildResearchActivitySourceExclusions(fallbackData.researchActivity);
    const allNews = [...mergedNews.values()].filter((item) =>
      !explainResearchActivitySourceExclusion(item.url, sourceExclusions),
    );
    const activityFeedback = buildResearchActivityFeedbackProfile(fallbackData.researchActivity);
    const savedIdeaFeedback = buildResearchInterestProfile(fallbackData.ideas);
    const feedback = {
      positiveTopics: [...activityFeedback.positiveTopics, ...savedIdeaFeedback.positiveTopics],
      negativeTopics: [...activityFeedback.negativeTopics, ...savedIdeaFeedback.negativeTopics],
    };
    const wikiExcluded = Boolean(dossier?.wiki && explainResearchActivitySourceExclusion(dossier.wiki.articleUrl, sourceExclusions));
    const priorMemory = fallbackData.researchMemory.find((entry) =>
      normalizeSearchText(entry.topic) === normalizeSearchText(topic),
    );
    recordRuntimeStart('Engine');
    let engineRecorded = false;
    try {
      const generated = generateEditorialIdeas({
        topic,
        news: allNews,
        priorMemory,
        context: dossier?.wiki && !wikiExcluded ? [{
          title: dossier.wiki.articleTitle,
          summary: [dossier.wiki.summary, dossier.wiki.monthlyViews.length
            ? 'Monthly Wikipedia article pageviews: ' + dossier.wiki.monthlyViews.map((point) => point.month + '=' + point.views).join(', ')
            : 'No monthly Wikimedia pageview observations were returned.'].filter(Boolean).join('\n'),
          sourceUrl: dossier.wiki.articleUrl,
          sourceName: 'Wikimedia Pageviews · attention proxy',
        }] : [],
        existingIdeas: fallbackData.ideas,
        feedback,
        ...(report ? { reportId: report.id } : {}),
        region: fallbackData.preferences.region,
        languages: fallbackData.preferences.languages,
        language: fallbackData.preferences.uiLanguage ?? 'fa',
        ...(requestedCategory ? { category: requestedCategory } : {}),
        limit: 10,
      });
      if (!generated.length) {
        recordRuntimeFinish('Engine', 'partial');
        engineRecorded = true;
        setGenerationMessage(current.preferences.uiLanguage === 'fa'
          ? 'نمونهٔ ذخیره‌شده شاهد تازه یا زاویهٔ متمایزی برای یک ایدهٔ جدید ندارد. بدون شواهد کافی ایده ساخته نشد.'
          : 'The retained sample has no new independent angle with enough evidence. The engine did not fabricate an idea.');
        return;
      }
      await useScout.getState().commit((data) => ({ ...data, ideas: [...generated, ...data.ideas] }));
      recordRuntimeFinish('Engine', 'success');
      engineRecorded = true;
      setGenerationMessage(current.preferences.uiLanguage === 'fa'
        ? generated.length + ' ایدهٔ تازه از شواهد ذخیره‌شده ساخته شد؛ ' + (refreshAttempted ? 'به‌روزرسانی تازهٔ YouTube کامل نشد و از نمونهٔ ذخیره‌شده استفاده شد.' : 'درخواستی برای YouTube ارسال نشد.')
        : generated.length + ' new ideas were generated from retained local evidence. ' + (refreshAttempted ? 'The fresh YouTube request did not complete; the retained sample was used.' : 'No fresh YouTube request was made.'));
    } catch (error) {
      if (!engineRecorded) recordRuntimeFinish('Engine', 'error', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, 'Research refreshed and evidence-based ideas generated.');

  const openCreate = () => {
    setDraftTopic(preferences.lastInput?.topic ?? '');
    setDraftConcept('');
    setDraftDecision('');
    setDraftOpen(true);
  };
  const create = () => void op.run(async () => {
    const idea = createManualIdea(
      draftTopic,
      draftConcept,
      draftDecision,
      preferences.region,
      preferences.languages,
    );
    await useScout.getState().commit((data) => ({ ...data, ideas: [idea, ...data.ideas] }));
    setDraftOpen(false);
    router.push({ pathname: '/detail', params: { idea: idea.id } });
  }, 'Complete idea saved.');
  return (
    <Page scroll={false}>
      <FlatList
        style={{ flex: 1 }}
        data={remainingIdeas}
        keyExtractor={ideaKeyExtractor}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={32}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 18 }}>
            <ScreenIntro
              eyebrow="IDEA WORKSPACE"
              title="Turn research into next steps"
              subtitle="Refresh the official YouTube sample separately; generate editorial angles from selected publisher feeds, independent web research and Wikimedia evidence."
              icon={Lightbulb}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Action icon={Plus} busy={op.busy} onPress={openCreate}>New idea</Action>
              </View>
              <View style={{ flex: 1 }}>
                <Action secondary busy={op.busy} onPress={() => generate(selectedGenerationCategory())}>
                  {fa ? 'تحقیق تازه و تولید ایده' : 'Refresh research & generate'}
                </Action>
              </View>
            </View>
            <Action secondary icon={Activity} onPress={() => router.push('/research-activity')}>
              Research activity
            </Action>
            <View style={styles.panel}>
              <Field label="Search ideas" value={search} onChange={setSearch} placeholder="Topic or personal decision" />
              <Txt muted>{numberLabel(sortedFiltered.length, fa)} {fa ? 'ایده در این فهرست' : 'ideas in this view'} · {archive ? 'Archived' : 'Active'}</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {([
                  ['all', fa ? 'همه' : 'All', matchingIdeas.length, p.accent],
                  ['strong', fa ? 'قوی' : 'Strong', scoreCounts.strong, p.success],
                  ['moderate', fa ? 'متوسط' : 'Medium', scoreCounts.moderate, p.cyan],
                  ['weak', fa ? 'ضعیف' : 'Weak', scoreCounts.weak, p.danger],
                  ['unscored', fa ? 'بدون امتیاز' : 'Unscored', scoreCounts.unscored, p.muted],
                ] as const).map(([key, label, count, tint]) => {
                  const selected = scoreFilter === key;
                  return (
                    <Pressable key={key} onPress={() => setScoreFilter(key)} accessibilityRole="button" accessibilityState={{ selected }}
                      style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, borderColor: selected ? tint : p.border, backgroundColor: selected ? p.surfaceAlt : p.surface, paddingHorizontal: 9, paddingVertical: 5 }}>
                      <Text style={{ color: selected ? tint : p.muted, fontSize: 10, fontWeight: '700' }}>{label}</Text>
                      <Text style={{ color: p.text, fontSize: 10 }}>{count}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Fold title="Filter and sort ideas" summary={scoreCounts.strong + ' strong · ' + scoreCounts.moderate + ' medium · ' + scoreCounts.weak + ' weak'}>
                <Choices
                  label="Sort by"
                  options={sortOptions}
                  selected={[selectedSort]}
                  onChange={(values) => {
                    const index = sortOptions.indexOf(values[0]);
                    setSort((['Score', 'Newest', 'Oldest', 'A-Z', 'Z-A'] as const)[Math.max(0, index)] ?? 'Score');
                  }}
                />
                <Choices
                  label="Status"
                  options={['All', ...statuses]}
                  selected={[status]}
                  onChange={(values) => setStatus(values[0])}
                />
                <Choices
                  label="Editorial angle"
                  options={categoryOptions}
                  selected={[category === 'All angles' ? allCategoryLabel : categoryLabel(category)]}
                  onChange={(values) => {
                    const selectedIndex = categoryOptions.indexOf(values[0]);
                    const selected = selectedIndex <= 0 ? 'All angles' : IDEA_GENERATION_CATEGORIES[selectedIndex - 1];
                    setCategory(selected);
                  }}
                />
                <Action secondary icon={Archive} onPress={() => setArchive(!archive)}>
                  {archive ? 'Show active ideas' : 'Show archived ideas'}
                </Action>
              </Fold>
            </View>
            {generationMessage ? <Txt muted>{generationMessage}</Txt> : null}
            {featuredIdea ? (
              <Fold
                title={fa ? 'ایده منتخب تحقیق' : 'Featured research idea'}
                summary={getIdeaDisplayTitle(featuredIdea, preferences.uiLanguage ?? 'fa')}
              >
                <View style={{ borderRadius: 13, borderWidth: 1, borderColor: p.accent, backgroundColor: p.surface, padding: 12, gap: 7 }}>
                  <View style={styles.rowBetween}>
                    <BadgeText>{fa ? 'بالاترین اولویت فعال' : 'HIGHEST ACTIVE PRIORITY'}</BadgeText>
                    {typeof featuredIdea.engineScore === 'number' && Number.isFinite(featuredIdea.engineScore) ? (
                      <Text style={{ color: p.accent, fontSize: 13, fontWeight: '800' }}>{numberLabel(featuredIdea.engineScore, fa)}/100</Text>
                    ) : <Text style={{ color: p.muted, fontSize: 10 }}>{fa ? 'بدون امتیاز' : 'NOT SCORED'}</Text>}
                  </View>
                  <SourceHeading>{getIdeaDisplayTitle(featuredIdea, preferences.uiLanguage ?? 'fa')}</SourceHeading>
                  {featuredIdea.engineScoreReason ? <Txt muted>{featuredIdea.engineScoreReason}</Txt> : null}
                  {featuredIdea.concept ? <SourceText muted>{featuredIdea.concept}</SourceText> : null}
                  {featuredIdea.note ? <Txt muted>{featuredIdea.note}</Txt> : null}
                  {featuredIdea.decision ? <Txt muted>{(fa ? 'تصمیم ثبت‌شده: ' : 'Saved decision: ') + featuredIdea.decision}</Txt> : null}
                  {featuredIdea.sourceName ? <Txt muted>{(fa ? 'منبع: ' : 'Source: ') + featuredIdea.sourceName}</Txt> : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                    <View style={{ flexGrow: 1, flexBasis: 140 }}>
                      <Action onPress={() => {
                        setSelectedIdeaId(featuredIdea.id);
                        router.push({ pathname: '/detail', params: { idea: featuredIdea.id } });
                      }}>{fa ? 'بازکردن پرونده کامل ایده' : 'Open complete idea'}</Action>
                    </View>
                    <View style={{ flexGrow: 1, flexBasis: 140 }}>
                      <Action secondary disabled={!featuredIdea.topic.trim()} onPress={() => {
                        setSelectedIdeaId(featuredIdea.id);
                        router.push({ pathname: '/youtube', params: { topic: featuredIdea.topic, idea: featuredIdea.id } });
                      }}>{fa ? 'ادامه تحقیق در YouTube' : 'Continue on YouTube'}</Action>
                    </View>
                  </View>
                </View>
              </Fold>
            ) : null}
            {topOpportunities.length > 1 ? (
              <Fold title={fa ? 'چهار اولویت بعدی' : 'Next active priorities'} summary={String(topOpportunities.length - 1)}>
                <View style={{ gap: 8 }}>
                    {topOpportunities.slice(1).map((idea, index) => {
                      const band = getEditorialPriorityBand(idea.engineScore ?? 0);
                      const tint = band === 'strong' ? p.success : band === 'moderate' ? p.cyan : p.danger;
                      return (
                        <Pressable key={idea.id} onPress={() => {
                          setSelectedIdeaId(idea.id);
                          router.push({ pathname: '/detail', params: { idea: idea.id } });
                        }} accessibilityRole="button"
                          style={{ borderRadius: 12, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, padding: 11, gap: 5 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <Text style={{ color: tint, fontSize: 10, fontWeight: '800' }}>{(fa ? 'پیشنهاد برتر ' : 'TOP PICK #') + (index + 2) + ' · ' + (band === 'strong' ? (fa ? 'قوی' : 'Strong') : band === 'moderate' ? (fa ? 'متوسط' : 'Medium') : (fa ? 'ضعیف' : 'Weak'))}</Text>
                            <Text style={{ color: tint, fontSize: 14, fontWeight: '800' }}>{idea.engineScore}/100</Text>
                          </View>
                          <Text style={{ color: p.text, fontSize: 13, fontWeight: '700' }}>{getIdeaDisplayTitle(idea, preferences.uiLanguage ?? 'fa')}</Text>
                          <Text numberOfLines={1} style={{ color: p.muted, fontSize: 10 }}>{idea.engineScoreReason?.split(';').slice(0, 2).join(' • ')}</Text>
                        </Pressable>
                      );
                    })}
                </View>
              </Fold>
            ) : null}
            {draftOpen ? (
              <View style={styles.panel}>
                <View style={styles.rowBetween}>
                  <Heading>Idea editor</Heading>
                  <Text style={styles.badge}>PERSONAL DRAFT</Text>
                </View>
                <Field label="Topic / working title" value={draftTopic} onChange={setDraftTopic} placeholder="e.g. What JWST reveals about exoplanet atmospheres" />
                <Field label="Video concept" value={draftConcept} onChange={setDraftConcept} multiline placeholder="What is the central question, what will the viewer learn, and what makes your explanation useful?" />
                <Field label="Your initial decision (optional)" value={draftDecision} onChange={setDraftDecision} multiline placeholder="What would make this worth producing?" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Action busy={op.busy} disabled={!draftTopic.trim() || !draftConcept.trim()} onPress={create}>Save idea</Action>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Action secondary disabled={op.busy} onPress={() => setDraftOpen(false)}>Cancel</Action>
                  </View>
                </View>
              </View>
            ) : null}
            {Boolean(op.error) && <ErrorBox message={op.error} onDismiss={op.clear} />}
          </View>

        }
        renderItem={({ item }) => (
          <IdeaListItem item={item} fa={fa} language={preferences.uiLanguage ?? 'fa'} />
        )}
        ListEmptyComponent={sortedFiltered.length ? undefined : displayableIdeas.length ? (
          <Empty
            title="No ideas match this view."
            action="Clear filters"
            onPress={() => {
              setSearch(''); setStatus('All'); setArchive(false); setCategory('All angles'); setScoreFilter('all');
            }}
          />
        ) : (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <Txt muted>Keep your ideas and decisions here. Use the New idea action above to create your first idea.</Txt>
          </View>
        )}
      />
    </Page>
  );
}
