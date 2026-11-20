import { useMemo, useState } from 'react';
import { FlatList, View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { ArrowUpRight, Plus, Archive, Lightbulb } from 'lucide-react-native';
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
import { statuses } from '@/lib/types';
import { getIdeaDisplayTitle, isIdeaDisplayable } from '@/lib/idea-research';
import { createManualIdea } from '@/lib/engine';
import { deduplicateDisplayIdeas, generateEditorialIdeas, IDEA_GENERATION_CATEGORIES, type IdeaGenerationCategory } from '@/lib/idea-generation';
import { getTopicDossier } from '@/lib/topic-dossier';
import { fetchSpaceNews, getCachedSpaceNews, SPACE_NICHES } from '@/lib/space';
import { matchesSearchText, normalizeSearchText } from '@/lib/search';
import { palette as p } from '@/lib/theme';
import { getEditorialPriorityBand, EDITORIAL_PRIORITY_CONFIG, type EditorialPriorityBand } from '@/lib/editorial-priority';
import { setSelectedIdeaId } from '@/lib/idea-selection';
import { recordRuntimeFinish, recordRuntimeStart } from '@/lib/runtime-metrics';
import { MediaPreview } from '@/components/MediaPreview';
function numberLabel(value: number, fa: boolean) {
  return new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(value);
}

export default function Opportunities() {
  const ideas = useScout((s) => s.data.ideas);
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
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
  const faCategoryLabels: Record<IdeaGenerationCategory, string> = {
    Explainer: 'توضیحی',
    'Evidence audit': 'بررسی شواهد',
    Comparison: 'مقایسه',
    Timeline: 'خط زمانی',
    'Open question': 'پرسش بی‌پاسخ',
    'Cross-source': 'ارتباط میان منابع',
    Storytelling: 'روایت مستند',
  };
  const allCategoryLabel = fa ? 'همه زاویه‌ها' : 'All angles';
  const categoryLabel = (value?: string) => {
    if (!value) return fa ? 'ایده تحریری' : 'Editorial angle';
    const matchingCategory = IDEA_GENERATION_CATEGORIES.find((option) => option === value);
    return fa && matchingCategory ? faCategoryLabels[matchingCategory] : value;
  };
  const categoryOptions = [allCategoryLabel, ...IDEA_GENERATION_CATEGORIES.map((value) => categoryLabel(value))];
  const displayableIdeas = useMemo(() => deduplicateDisplayIdeas(ideas.filter(isIdeaDisplayable)), [ideas]);
  const matchingIdeas = useMemo(() => displayableIdeas.filter((i) => {
    const searchable = [
      getIdeaDisplayTitle(i, preferences.uiLanguage ?? 'fa'),
      i.concept, i.note, i.decision, i.sourceName ?? '', i.sourceUrl ?? '', i.ideaCategory ?? '',
    ].join(' ');
    return i.archived === archive &&
      (status === 'All' || i.status === status) &&
      (category === 'All angles' || (i.engineGenerated && i.ideaCategory === category)) &&
      matchesSearchText(searchable, search);
  }), [displayableIdeas, archive, status, category, search, preferences.uiLanguage]);
  const scoreCounts = useMemo(() => ({
    strong: matchingIdeas.filter((idea) => typeof idea.engineScore === 'number' && getEditorialPriorityBand(idea.engineScore) === 'strong').length,
    moderate: matchingIdeas.filter((idea) => typeof idea.engineScore === 'number' && getEditorialPriorityBand(idea.engineScore) === 'moderate').length,
    weak: matchingIdeas.filter((idea) => typeof idea.engineScore === 'number' && getEditorialPriorityBand(idea.engineScore) === 'weak').length,
    unscored: matchingIdeas.filter((idea) => typeof idea.engineScore !== 'number' || !Number.isFinite(idea.engineScore)).length,
  }), [matchingIdeas]);
  const filtered = useMemo(() => scoreFilter === 'all'
    ? matchingIdeas
    : matchingIdeas.filter((idea) => {
      const band = typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore)
        ? getEditorialPriorityBand(idea.engineScore) : 'unscored';
      return band === scoreFilter;
    }), [matchingIdeas, scoreFilter]);
  const sortedFiltered = useMemo(() => [...filtered].sort((a, b) => {
    if (sort === 'Score') {
      const scoreA = typeof a.engineScore === 'number' && Number.isFinite(a.engineScore) ? a.engineScore : -1;
      const scoreB = typeof b.engineScore === 'number' && Number.isFinite(b.engineScore) ? b.engineScore : -1;
      return scoreB - scoreA || b.createdAt - a.createdAt;
    }
    if (sort === 'Newest') return b.createdAt - a.createdAt;
    if (sort === 'Oldest') return a.createdAt - b.createdAt;
    const comparison = getIdeaDisplayTitle(a, preferences.uiLanguage ?? 'fa')
      .localeCompare(getIdeaDisplayTitle(b, preferences.uiLanguage ?? 'fa'), undefined, { numeric: true, sensitivity: 'base' });
    return sort === 'A-Z' ? comparison : -comparison;
  }), [filtered, sort, preferences.uiLanguage]);
  const pinnedIdeas = useMemo(() => filtered
    .filter((idea) => typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore))
    .sort((a, b) => (b.engineScore ?? -1) - (a.engineScore ?? -1) || b.createdAt - a.createdAt)
    .slice(0, EDITORIAL_PRIORITY_CONFIG.pinnedIdeas), [filtered]);
  const pinnedIds = useMemo(() => new Set(pinnedIdeas.map((idea) => idea.id)), [pinnedIdeas]);
  const remainingIdeas = useMemo(() => sortedFiltered.filter((idea) => !pinnedIds.has(idea.id)), [sortedFiltered, pinnedIds]);
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
    recordRuntimeStart('Sources');
    let refreshedNews: Awaited<ReturnType<typeof fetchSpaceNews>>;
    try {
      refreshedNews = await fetchSpaceNews(initial.preferences.spaceNewsSources, fetch, true);
      recordRuntimeFinish('Sources', refreshedNews.warnings.length ? 'partial' : 'success');
    } catch (error) {
      recordRuntimeFinish('Sources', 'error', error instanceof Error ? error.message : String(error));
      throw error;
    }
    if (refreshedNews.registry.length) {
      await useScout.getState().commit((data) => ({ ...data, feedRegistry: refreshedNews.registry }));
    }
    const current = useScout.getState().data;
    const latestReport = current.reports[0];
    const niche = SPACE_NICHES.find((item) => item.id === current.preferences.selectedSpaceNiche);
    const topic = latestReport?.input.topic ?? (
      current.preferences.selectedSpaceNiche === 'custom'
        ? current.preferences.customSpaceNiche
        : niche?.topic ?? 'Space science and exploration'
    );
    const dossier = getTopicDossier(topic);
    const reportMatches = latestReport !== undefined && normalizeSearchText(latestReport.input.topic) === normalizeSearchText(topic);
    const reportVideos = reportMatches && latestReport ? latestReport.videos : [];
    const dossierVideos = dossier?.videos ?? [];
    const mergedVideos = new Map([...dossierVideos, ...reportVideos].map((video) => [video.id, video]));
    const now = Date.now();
    const videoWindowMs = 30 * 24 * 60 * 60 * 1000;
    const videos = [...mergedVideos.values()]
      .filter((video) => {
        const published = Date.parse(video.publishedAt);
        const age = now - published;
        return Number.isFinite(published) && age >= 0 && age <= videoWindowMs;
      })
      .map((video) => ({
        id: video.id,
        title: video.title,
        description: video.description,
        channel: video.channel,
        publishedAt: video.publishedAt,
        viewCount: video.viewCount ?? null,
        likeCount: video.likeCount ?? null,
      }));
    const cachedNews = getCachedSpaceNews(current.feedRegistry, current.preferences.spaceNewsSources);
    const mergedNews = new Map(
      [...(dossier?.news ?? []), ...cachedNews, ...refreshedNews.items].map((item) => [item.url, item]),
    );
    const allNews = [...mergedNews.values()];
    const priorMemory = current.researchMemory.find((entry) => normalizeSearchText(entry.topic) === normalizeSearchText(topic));
    recordRuntimeStart('Engine');
    let engineRecorded = false;
    try {
    const generated = generateEditorialIdeas({
      topic,
      news: allNews,
      priorMemory,
      videos,
      context: dossier?.wiki ? [{
        title: dossier.wiki.articleTitle,
        summary: [dossier.wiki.summary, dossier.wiki.monthlyViews.length
          ? 'Monthly Wikipedia article pageviews: ' + dossier.wiki.monthlyViews.map((point) => point.month + '=' + point.views).join(', ')
          : 'No monthly Wikimedia pageview observations were returned.'].filter(Boolean).join('\n'),
        sourceUrl: dossier.wiki.articleUrl,
        sourceName: 'Wikimedia Pageviews · attention proxy',
      }] : [],
      existingIdeas: current.ideas,
      ...(reportMatches && latestReport && videos.length ? { reportId: latestReport.id } : {}),
      region: current.preferences.region,
      languages: current.preferences.languages,
      language: current.preferences.uiLanguage ?? 'fa',
      ...(requestedCategory ? { category: requestedCategory } : {}),
      limit: 8,
    });
    if (!generated.length) {
      recordRuntimeFinish('Engine', 'partial');
      engineRecorded = true;
      setGenerationMessage(current.preferences.uiLanguage === 'fa'
        ? 'از آخرین تحقیق، شاهد کافی یا زاویه تازه‌ای برای تولید ایده پیدا نشد. ابتدا یک جست‌وجو یا Deep Research انجام بده.'
        : 'No suitable new angle could be generated from the latest evidence. Run a search or Deep Research first.');
      return;
    }
    await useScout.getState().commit((data) => ({ ...data, ideas: [...generated, ...data.ideas] }));
    recordRuntimeFinish('Engine', 'success');
    engineRecorded = true;
    setGenerationMessage(current.preferences.uiLanguage === 'fa'
      ? generated.length + ' ایده تازه از شواهد به‌روز یا نسخه ذخیره‌شده تولید شد؛ درخواست جدیدی برای YouTube ارسال نشد.' + (refreshedNews.warnings.length ? ' بعضی خوراک‌ها به‌روز نشدند و از نسخه ذخیره‌شده استفاده شد.' : '')
      : generated.length + ' new ideas were generated locally from refreshed or last-good evidence. No new YouTube request was made.' + (refreshedNews.warnings.length ? ' Some feeds could not refresh; last-good cached copies were retained.' : ''));
    } catch (error) {
      if (!engineRecorded) recordRuntimeFinish('Engine', 'error', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, 'New evidence-based ideas generated.');

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
        data={remainingIdeas}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 18 }}>
            <ScreenIntro
              eyebrow="IDEA WORKSPACE"
              title="Turn research into next steps"
              subtitle="Capture your own concepts or generate new editorial angles from the evidence already collected."
              icon={Lightbulb}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Action icon={Plus} busy={op.busy} onPress={openCreate}>New idea</Action>
              </View>
              <View style={{ flex: 1 }}>
                <Action secondary busy={op.busy} onPress={() => generate(selectedGenerationCategory())}>
                  Generate ideas
                </Action>
              </View>
            </View>
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
            {pinnedIdeas.length ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Heading>{fa ? '۵ ایده برتر سنجاق‌شده' : 'Top 5 pinned ideas'}</Heading>
                  <BadgeText>{String(pinnedIdeas.length)}</BadgeText>
                </View>
                {pinnedIdeas.map((idea, index) => {
                  const band = getEditorialPriorityBand(idea.engineScore ?? 0);
                  const tint = band === 'strong' ? p.success : band === 'moderate' ? p.cyan : p.danger;
                  return (
                    <Pressable key={idea.id} onPress={() => {
                      setSelectedIdeaId(idea.id);
                      router.push({ pathname: '/detail', params: { idea: idea.id } });
                    }} accessibilityRole="button"
                      style={{ borderRadius: 12, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, padding: 11, gap: 5 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={{ color: tint, fontSize: 10, fontWeight: '800' }}>{(fa ? 'سنجاق‌شدهٔ ' : 'PINNED #') + (index + 1) + ' · ' + (band === 'strong' ? (fa ? 'قوی' : 'Strong') : band === 'moderate' ? (fa ? 'متوسط' : 'Medium') : (fa ? 'ضعیف' : 'Weak'))}</Text>
                        <Text style={{ color: tint, fontSize: 14, fontWeight: '800' }}>{idea.engineScore}/100</Text>
                      </View>
                      <Text style={{ color: p.text, fontSize: 13, fontWeight: '700' }}>{getIdeaDisplayTitle(idea, preferences.uiLanguage ?? 'fa')}</Text>
                      <Text numberOfLines={1} style={{ color: p.muted, fontSize: 10 }}>{idea.engineScoreReason?.split(';').slice(0, 2).join(' • ')}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {draftOpen ? (
              <View style={styles.panel}>
                <View style={styles.rowBetween}>
                  <Heading>Create a complete idea</Heading>
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
            {Boolean(op.error) && <ErrorBox message={op.error} onRetry={op.clear} />}
          </View>

        }
        renderItem={({ item }) => (
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
                <BadgeText>{(item.engineGenerated ? (fa ? 'تولید موتور · ' : 'ENGINE GENERATED · ') + categoryLabel(item.ideaCategory) : (fa ? 'ایده شخصی' : 'PERSONAL IDEA')) + ' · ' + item.status}</BadgeText>
                <SourceHeading>{getIdeaDisplayTitle(item, preferences.uiLanguage ?? 'fa')}</SourceHeading>
                {typeof item.engineScore === 'number' && Number.isFinite(item.engineScore) ? (
                  <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ color: getEditorialPriorityBand(item.engineScore) === 'strong' ? p.success : getEditorialPriorityBand(item.engineScore) === 'moderate' ? p.cyan : p.danger, fontSize: 11, fontWeight: '800' }}>
                      {(getEditorialPriorityBand(item.engineScore) === 'strong' ? (fa ? 'قوی' : 'STRONG') : getEditorialPriorityBand(item.engineScore) === 'moderate' ? (fa ? 'متوسط' : 'MEDIUM') : (fa ? 'ضعیف' : 'WEAK')) + ' · ' + item.engineScore + '/100'}
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
                {item.concept ? <SourceText muted numberOfLines={3}>{item.concept}</SourceText> : <Txt muted>Concept missing — open the editor to complete this draft before requesting an AI opinion.</Txt>}
                {item.sourceName ? <View style={styles.row}><Txt muted>Source:</Txt><SourceText>{item.sourceName}</SourceText></View> : null}
                {item.decision ? <SourceText muted>{item.decision}</SourceText> : null}
              </View>
              <ArrowUpRight color={p.purple} size={20} />
            </Button>
          </View>
        )}
        ListEmptyComponent={sortedFiltered.length ? undefined : (
          <Empty
            title={displayableIdeas.length ? 'No ideas match this view.' : 'Keep your ideas and decisions here.'}
            action={displayableIdeas.length ? 'Clear filters' : 'Create an idea'}
            onPress={displayableIdeas.length ? () => {
              setSearch(''); setStatus('All'); setArchive(false); setCategory('All angles'); setScoreFilter('all');
            } : openCreate}
          />
        )}
      />
    </Page>
  );
}
