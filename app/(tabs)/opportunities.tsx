import { useState } from 'react';
import { FlatList, View, Text } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { ArrowUpRight, Plus, Archive } from 'lucide-react-native';
import {
  Page,
  styles,
  Choices,
  Field,
  Empty,
  Action,
  ErrorBox,
  useOperation,
  Txt,
  SourceHeading,
  SourceText,
  BadgeText,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { statuses } from '@/lib/types';
import { getIdeaDisplayTitle, isIdeaDisplayable } from '@/lib/idea-research';
import { createManualIdea, rankNewsForTopic } from '@/lib/engine';
import { deduplicateDisplayIdeas, generateEditorialIdeas, IDEA_GENERATION_CATEGORIES, type IdeaGenerationCategory } from '@/lib/idea-generation';
import { getTopicDossier } from '@/lib/topic-dossier';
import { getCachedSpaceNews, SPACE_NICHES } from '@/lib/space';
import { matchesSearchText } from '@/lib/search';
import { palette as p } from '@/lib/theme';
import { translateText } from '@/lib/i18n';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { MediaPreview } from '@/components/MediaPreview';
export default function Opportunities() {
  const ideas = useScout((s) => s.data.ideas);
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [archive, setArchive] = useState(false);
  const [category, setCategory] = useState('All angles');
  const [sort, setSort] = useState<'Newest' | 'Oldest' | 'A-Z' | 'Z-A'>('Newest');
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
  const displayableIdeas = deduplicateDisplayIdeas(ideas.filter(isIdeaDisplayable));
  const filtered = displayableIdeas.filter((i) => {
    const searchable = [
      getIdeaDisplayTitle(i, preferences.uiLanguage ?? 'fa'),
      i.concept, i.note, i.decision, i.sourceName ?? '', i.sourceUrl ?? '', i.ideaCategory ?? '',
    ].join(' ');
    return i.archived === archive &&
      (status === 'All' || i.status === status) &&
      (category === 'All angles' || (i.engineGenerated && i.ideaCategory === category)) &&
      matchesSearchText(searchable, search);
  });
  const sortedFiltered = [...filtered].sort((a, b) => {
    if (sort === 'Newest') return b.createdAt - a.createdAt;
    if (sort === 'Oldest') return a.createdAt - b.createdAt;
    const comparison = getIdeaDisplayTitle(a, preferences.uiLanguage ?? 'fa')
      .localeCompare(getIdeaDisplayTitle(b, preferences.uiLanguage ?? 'fa'), undefined, { numeric: true, sensitivity: 'base' });
    return sort === 'A-Z' ? comparison : -comparison;
  });
  const sortOptions = fa
    ? ['جدیدترین', 'قدیمی‌ترین', 'عنوان صعودی', 'عنوان نزولی']
    : ['Newest', 'Oldest', 'Title A–Z', 'Title Z–A'];
  const selectedSort = sort === 'Newest' ? sortOptions[0] : sort === 'Oldest' ? sortOptions[1] : sort === 'A-Z' ? sortOptions[2] : sortOptions[3];
  const selectedGenerationCategory = (): IdeaGenerationCategory | undefined =>
    category === 'All angles'
      ? undefined
      : IDEA_GENERATION_CATEGORIES.find((candidate) => candidate === category);

  const generate = (requestedCategory?: IdeaGenerationCategory) => void op.run(async () => {
    const current = useScout.getState().data;
    const latestReport = current.reports[0];
    const niche = SPACE_NICHES.find((item) => item.id === current.preferences.selectedSpaceNiche);
    const topic = latestReport?.input.topic ?? (
      current.preferences.selectedSpaceNiche === 'custom'
        ? current.preferences.customSpaceNiche
        : niche?.topic ?? 'Space science and exploration'
    );
    const dossier = getTopicDossier(topic);
    const reportMatches = latestReport !== undefined && normalizeResearchText(latestReport.input.topic) === normalizeResearchText(topic);
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
      [...(dossier?.news ?? []), ...cachedNews].map((item) => [item.url, item]),
    );
    const relevantNews = rankNewsForTopic(topic, [...mergedNews.values()], 12);
    const generated = generateEditorialIdeas({
      topic,
      news: relevantNews,
      videos,
      context: dossier?.wiki ? [{
        title: dossier.wiki.articleTitle,
        summary: dossier.wiki.summary,
        sourceUrl: dossier.wiki.articleUrl,
        sourceName: 'Wikimedia',
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
      setGenerationMessage(current.preferences.uiLanguage === 'fa'
        ? 'از آخرین تحقیق، شاهد کافی یا زاویه تازه‌ای برای تولید ایده پیدا نشد. ابتدا یک جست‌وجو یا Deep Research انجام بده.'
        : 'No suitable new angle could be generated from the latest evidence. Run a search or Deep Research first.');
      return;
    }
    await useScout.getState().commit((data) => ({ ...data, ideas: [...generated, ...data.ideas] }));
    setGenerationMessage(current.preferences.uiLanguage === 'fa'
      ? generated.length + ' ایده تازه از شواهد محلی تولید شد؛ درخواست جدیدی برای YouTube ارسال نشد.'
      : generated.length + ' new ideas were generated locally from the available evidence. No new YouTube request was made.');
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
        data={sortedFiltered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 18, marginBottom: 20 }}>
            <Text style={styles.title}>{translateText("Your next move.", preferences.uiLanguage ?? "fa")}</Text>
            <Field
              label="Search ideas"
              value={search}
              onChange={setSearch}
              placeholder="Topic or personal decision"
            />
            <Choices
              label={fa ? 'مرتب‌سازی' : 'Sort by'}
              options={sortOptions}
              selected={[selectedSort]}
              onChange={(values) => {
                const index = sortOptions.indexOf(values[0]);
                setSort((['Newest', 'Oldest', 'A-Z', 'Z-A'] as const)[Math.max(0, index)] ?? 'Newest');
              }}
            />
            <Choices
              options={['All', ...statuses]}
              selected={[status]}
              onChange={(v) => setStatus(v[0])}
            />
            <Choices
              label={fa ? 'فیلتر بر اساس زاویه' : 'Filter by angle'}
              options={categoryOptions}
              selected={[category === 'All angles' ? allCategoryLabel : categoryLabel(category)]}
              onChange={(values) => {
                const selectedIndex = categoryOptions.indexOf(values[0]);
                const selected = selectedIndex <= 0 ? 'All angles' : IDEA_GENERATION_CATEGORIES[selectedIndex - 1];
                setCategory(selected);
              }}
            />
            <Action busy={op.busy} onPress={() => generate(selectedGenerationCategory())}>
              {fa ? 'تولید ایده‌های تازه (حداکثر ۸ مورد مستقل)' : 'Generate fresh ideas (up to 8 distinct concepts)'}
            </Action>
            {generationMessage ? <Txt muted>{generationMessage}</Txt> : null}
            {draftOpen && (
              <View style={[styles.panel, { gap: 12 }]}>
                <Text style={styles.heading}>{translateText("Create a complete idea", preferences.uiLanguage ?? "fa")}</Text>
                <Field label="Topic / working title" value={draftTopic} onChange={setDraftTopic} placeholder="e.g. What JWST reveals about exoplanet atmospheres" />
                <Field label="Video concept" value={draftConcept} onChange={setDraftConcept} multiline placeholder="What is the central question, what will the viewer learn, and what makes your explanation useful?" />
                <Field label="Your initial decision (optional)" value={draftDecision} onChange={setDraftDecision} multiline placeholder="What would make this worth producing?" />
                <Txt muted>Ideas are saved only after you provide a real topic and a concept. This prevents empty records from reaching AI Second Opinion.</Txt>
                <Action busy={op.busy} disabled={!draftTopic.trim() || !draftConcept.trim()} onPress={create}>Save idea</Action>
                <Action secondary disabled={op.busy} onPress={() => setDraftOpen(false)}>Cancel</Action>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Action icon={Plus} busy={op.busy} onPress={openCreate}>
                  New idea
                </Action>
              </View>
              <View style={{ flex: 1 }}>
                <Action secondary icon={Archive} onPress={() => setArchive(!archive)}>
                  {archive ? 'Active ideas' : 'Archived'}
                </Action>
              </View>
            </View>
            {Boolean(op.error) && <ErrorBox message={op.error} onRetry={op.clear} />}
          </View>
        }
        renderItem={({ item }) => (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(100)}
            style={[styles.rule, { marginBottom: 18 }]}
          >
            {item.imageUrl ? <MediaPreview uri={item.imageUrl} aspectRatio={16 / 9} viewer alt={item.topic} /> : null}
            <Button
              variant="tertiary"
              className="h-auto min-w-0 justify-start rounded-2xl px-4 py-3"
              onPress={() => router.push({ pathname: '/detail', params: { idea: item.id } })}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                <BadgeText>{(item.engineGenerated ? (fa ? 'تولید موتور · ' : 'ENGINE GENERATED · ') + categoryLabel(item.ideaCategory) : (fa ? 'ایده شخصی' : 'PERSONAL IDEA')) + ' · ' + item.assessment + ' · ' + item.status}</BadgeText>
                <SourceHeading>{getIdeaDisplayTitle(item, preferences.uiLanguage ?? 'fa')}</SourceHeading>
                {item.concept ? <SourceText muted numberOfLines={3}>{item.concept}</SourceText> : <Txt muted>Concept missing — open the editor to complete this draft before requesting an AI opinion.</Txt>}
                {item.sourceName ? <View style={styles.row}><Txt muted>Source:</Txt><SourceText>{item.sourceName}</SourceText></View> : null}
                {item.engineGenerated ? <Txt muted>{fa ? 'بر پایه شواهد موجود تولید شده است. برای دیدن پرسش، دلیل پیشنهاد، دامنه شواهد، مسیر روایت و مراحل راستی‌آزمایی انتخاب کن.' : 'Generated from available research evidence. Select to inspect the complete question, rationale, evidence scope, story path and verification steps.'}</Txt> : null}
                {item.decision ? <SourceText muted>{item.decision}</SourceText> : null}
              </View>
              <ArrowUpRight color={p.purple} size={20} />
            </Button>
          </Animated.View>
        )}
        ListEmptyComponent={
          <Empty
            title={
              displayableIdeas.length ? 'No ideas match this view.' : 'Keep your ideas and decisions here.'
            }
            action={displayableIdeas.length ? 'Clear filters' : 'Create an idea'}
            onPress={
              displayableIdeas.length
                ? () => {
                    setSearch('');
                    setStatus('All');
                    setArchive(false);
                    setCategory('All angles');
                  }
                : openCreate
            }
          />
        }
      />
    </Page>
  );
}
