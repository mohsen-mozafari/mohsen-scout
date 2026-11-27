import { useMemo } from 'react';
import { FlatList, Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Archive, NotebookPen, Youtube, Lightbulb, Link as LinkIcon, type LucideIcon } from 'lucide-react-native';
import { Action, AppHeader, BadgeText, Empty, Heading, Panel, ScreenIntro, SourceText, Txt, styles } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { getIdeaDisplayTitle } from '@/lib/idea-research';
import { type Idea, type Note, type Report, type SavedLink } from '@/lib/types';

type ArchiveItem =
  | { key: string; kind: 'section'; title: string; count: number; description?: string }
  | { key: string; kind: 'report'; value: Report }
  | { key: string; kind: 'deep-note'; value: Note }
  | { key: string; kind: 'idea'; value: Idea }
  | { key: string; kind: 'link'; value: SavedLink }
  | { key: string; kind: 'note'; value: Note }
  | { key: string; kind: 'empty'; title: string; action?: string; icon?: LucideIcon; destination?: 'youtube' | 'deep-research' | 'opportunities' | 'library' };

const isDeepResearchNote = (note: Note) =>
  note.tags.includes('deep-research') ||
  note.title.startsWith('پژوهش فضایی: ') ||
  note.title.startsWith('Space research: ') ||
  note.folder === 'Deep Research' ||
  note.folder === 'تحقیق عمیق';

const Separator = () => <View style={{ height: 10 }} />;

export default function ResearchArchive() {
  const reports = useScout((state) => state.data.reports);
  const ideas = useScout((state) => state.data.ideas);
  const links = useScout((state) => state.data.links);
  const notes = useScout((state) => state.data.notes);
  const ready = useScout((state) => state.ready);
  const language = useScout((state) => state.data.preferences.uiLanguage ?? 'fa');
  const fa = language === 'fa';

  const sortedReports = useMemo(() => [...reports].sort((a, b) => b.createdAt - a.createdAt), [reports]);
  const sortedIdeas = useMemo(() => [...ideas].sort((a, b) => b.createdAt - a.createdAt), [ideas]);
  const sortedLinks = useMemo(() => [...links].sort((a, b) => b.savedAt - a.savedAt), [links]);
  const { deepResearchNotes, otherNotes } = useMemo(() => ({
    deepResearchNotes: notes.filter(isDeepResearchNote).sort((a, b) => b.updatedAt - a.updatedAt),
    otherNotes: notes.filter((note) => !isDeepResearchNote(note)).sort((a, b) => b.updatedAt - a.updatedAt),
  }), [notes]);

  const items = useMemo<ArchiveItem[]>(() => {
    const rows: ArchiveItem[] = [];
    rows.push({ key: 'section-reports', kind: 'section', title: fa ? 'گزارش‌های YouTube' : 'YouTube reports', count: sortedReports.length, description: fa ? 'نمونه‌های رسمی ذخیره‌شده، همراه موضوع، زمان اجرا و تعداد ویدئوهای دریافتی.' : 'Saved official API samples with their topic, run time and returned video count.' });
    if (sortedReports.length) rows.push(...sortedReports.map((value) => ({ key: 'report-' + value.id, kind: 'report' as const, value })));
    else rows.push({ key: 'empty-reports', kind: 'empty', icon: Youtube, title: fa ? 'هنوز گزارش یوتیوبی ذخیره نشده است.' : 'No saved YouTube reports yet.', action: fa ? 'شروع نمونه‌گیری یوتیوب' : 'Start a YouTube sample', destination: 'youtube' });

    rows.push({ key: 'section-deep', kind: 'section', title: fa ? 'پرونده‌های تحقیق عمیق' : 'Deep Research briefs', count: deepResearchNotes.length, description: fa ? 'گزارش کامل تحقیق عمیق پس از ذخیره، در قالب یادداشت ساختاریافته نگهداری می‌شود.' : 'A full Deep Research brief is retained as a structured note after you save it.' });
    if (deepResearchNotes.length) rows.push(...deepResearchNotes.map((value) => ({ key: 'deep-' + value.id, kind: 'deep-note' as const, value })));
    else rows.push({ key: 'empty-deep', kind: 'empty', icon: NotebookPen, title: fa ? 'هنوز گزارش تحقیق عمیقی به یادداشت‌ها ذخیره نشده است.' : 'No saved Deep Research briefs yet.', action: fa ? 'شروع تحقیق عمیق' : 'Start Deep Research', destination: 'deep-research' });

    rows.push({ key: 'section-ideas', kind: 'section', title: fa ? 'ایده‌های ذخیره‌شده' : 'Saved ideas', count: sortedIdeas.length, description: fa ? 'ایده‌های شخصی و تولیدشده توسط موتور؛ امتیازهای فاقد شواهد نمایش داده نمی‌شوند.' : 'Personal and engine-generated ideas. Missing evidence scores are not fabricated.' });
    if (sortedIdeas.length) rows.push(...sortedIdeas.map((value) => ({ key: 'idea-' + value.id, kind: 'idea' as const, value })));
    else rows.push({ key: 'empty-ideas', kind: 'empty', icon: Lightbulb, title: fa ? 'هنوز ایده‌ای ذخیره نشده است.' : 'No saved ideas yet.', action: fa ? 'ساخت ایده' : 'Create an idea', destination: 'opportunities' });

    rows.push({ key: 'section-links', kind: 'section', title: fa ? 'پیوندهای ویدئویی شخصی' : 'Personal video links', count: sortedLinks.length, description: fa ? 'پیوندهای انتخابی تو؛ جزئیات موقت API یوتیوب به‌عنوان داده دائمی کپی نمی‌شود.' : 'Links you chose to keep. Temporary YouTube API metadata is not copied as permanent personal data.' });
    if (sortedLinks.length) rows.push(...sortedLinks.map((value) => ({ key: 'link-' + value.id, kind: 'link' as const, value })));
    else rows.push({ key: 'empty-links', kind: 'empty', icon: LinkIcon, title: fa ? 'پیوند شخصی ذخیره نشده است.' : 'No personal links saved yet.', action: fa ? 'افزودن پیوند' : 'Add a link', destination: 'library' });

    rows.push({ key: 'section-notes', kind: 'section', title: fa ? 'یادداشت‌های شخصی' : 'Personal notes', count: otherNotes.length });
    if (otherNotes.length) rows.push(...otherNotes.map((value) => ({ key: 'note-' + value.id, kind: 'note' as const, value })));
    else rows.push({ key: 'empty-notes', kind: 'empty', title: fa ? 'یادداشت شخصی دیگری برای نمایش وجود ندارد.' : 'No additional personal notes to show.' });
    return rows;
  }, [sortedReports, deepResearchNotes, sortedIdeas, sortedLinks, otherNotes, fa]);

  if (!ready) return <><AppHeader safeArea={false} /><View style={[styles.content, { flex: 1 }]}><Txt>{fa ? 'در حال بارگذاری بایگانی محلی…' : 'Loading your local archive…'}</Txt></View></>;

  const date = (value: number) => new Intl.DateTimeFormat(fa ? 'fa-IR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const openEmptyDestination = (destination?: 'youtube' | 'deep-research' | 'opportunities' | 'library') => {
    if (destination === 'youtube') router.push('/youtube');
    else if (destination === 'deep-research') router.push('/deep-research');
    else if (destination === 'opportunities') router.push('/opportunities');
    else if (destination === 'library') router.push('/library');
  };

  const renderItem = ({ item }: { item: ArchiveItem }) => {
    if (item.kind === 'section') {
      return <Panel><View style={styles.rowBetween}><Heading>{item.title}</Heading><BadgeText>{String(item.count)}</BadgeText></View>{item.description ? <Txt muted>{item.description}</Txt> : null}</Panel>;
    }
    if (item.kind === 'empty') {
      return item.action
        ? <Empty icon={item.icon} title={item.title} action={item.action} onPress={() => openEmptyDestination(item.destination)} />
        : <Txt muted>{item.title}</Txt>;
    }
    if (item.kind === 'report') {
      const report = item.value;
      return (
        <View style={[styles.listCard, { gap: 8 }]}>
          <View style={styles.rowBetween}><BadgeText>{fa ? 'گزارش نمونه‌گیری' : 'YOUTUBE SAMPLE REPORT'}</BadgeText><Text style={styles.muted}>{date(report.createdAt)}</Text></View>
          <SourceText>{report.input.topic}</SourceText>
          <Txt muted>{report.videos.length + (fa ? ' ویدئو' : ' videos') + ' · ' + report.queries.length + (fa ? ' جست‌وجو' : ' queries') + (report.analyzed ? (fa ? ' · تحلیل داخلی انجام شده' : ' · internal analysis completed') : '')}</Txt>
          <Action secondary icon={Youtube} onPress={() => router.push({ pathname: '/youtube', params: { topic: report.input.topic, report: report.id } })}>{fa ? 'بازکردن همین گزارش' : 'Reopen this report'}</Action>
        </View>
      );
    }
    if (item.kind === 'deep-note') {
      const note = item.value;
      return <View style={[styles.listCard, { gap: 8 }]}><View style={styles.rowBetween}><BadgeText>{fa ? 'پرونده ذخیره‌شده' : 'SAVED BRIEF'}</BadgeText><Text style={styles.muted}>{date(note.updatedAt)}</Text></View><SourceText>{note.title}</SourceText><Txt muted>{note.blocks.length + (fa ? ' بخش محتوایی' : ' content blocks')}</Txt><Action secondary icon={NotebookPen} onPress={() => router.push({ pathname: '/note', params: { id: note.id } })}>{fa ? 'بازکردن پرونده کامل' : 'Open full brief'}</Action></View>;
    }
    if (item.kind === 'idea') {
      const idea = item.value;
      return <View style={[styles.listCard, { gap: 7 }]}><View style={styles.rowBetween}><BadgeText>{idea.engineGenerated ? (fa ? 'تولید موتور' : 'ENGINE GENERATED') : (fa ? 'ایده شخصی' : 'PERSONAL IDEA')}</BadgeText><Text style={styles.muted}>{idea.status}</Text></View><SourceText>{getIdeaDisplayTitle(idea, language)}</SourceText><Txt muted>{idea.engineScore !== undefined ? (fa ? 'اولویت تحریری: ' : 'Editorial priority: ') + idea.engineScore + '/100' : (fa ? 'بدون امتیاز شواهد' : 'No evidence score')}</Txt><Action secondary icon={Lightbulb} onPress={() => router.push({ pathname: '/detail', params: { idea: idea.id } })}>{fa ? 'بازکردن پرونده ایده' : 'Open idea record'}</Action></View>;
    }
    if (item.kind === 'link') {
      const link = item.value;
      return <View style={[styles.listCard, { gap: 7 }]}><SourceText>{link.manualTitle.trim() || link.topic || link.url}</SourceText><Txt muted>{link.folder || (fa ? 'بدون پوشه' : 'Unfiled')}</Txt><Action secondary icon={LinkIcon} onPress={() => router.push({ pathname: '/detail', params: { video: link.id } })}>{fa ? 'بازکردن پیوند ذخیره‌شده' : 'Open saved link'}</Action></View>;
    }
    const note = item.value;
    return <View style={[styles.listCard, { gap: 7 }]}><SourceText>{note.title}</SourceText><Txt muted>{date(note.updatedAt)}</Txt><Action secondary icon={NotebookPen} onPress={() => router.push({ pathname: '/note', params: { id: note.id } })}>{fa ? 'بازکردن یادداشت' : 'Open note'}</Action></View>;
  };

  return (
    <>
      <AppHeader safeArea={false} />
      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={[styles.content, { paddingBottom: 30 }]}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <ScreenIntro eyebrow={fa ? 'بایگانی پژوهش' : 'RESEARCH ARCHIVE'} title={fa ? 'بایگانی یکپارچه پژوهش' : 'Unified research archive'}
            subtitle={fa ? 'گزارش‌ها، پرونده‌های تحقیق عمیق، ایده‌ها، پیوندها و یادداشت‌های شخصی را از یک نقطه مرور کن.' : 'Browse reports, Deep Research briefs, ideas, saved links and personal notes from one place.'} icon={Archive} />
        }
        ListFooterComponent={<Action secondary icon={NotebookPen} onPress={() => router.push('/notes')}>{fa ? 'رفتن به همه یادداشت‌ها' : 'Open all Notes'}</Action>}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </>
  );
}
