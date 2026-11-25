import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Archive, NotebookPen, Youtube, Lightbulb, Link as LinkIcon } from 'lucide-react-native';
import { Action, AppHeader, BadgeText, Empty, Heading, Panel, ScreenIntro, SourceText, Txt, styles } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { getIdeaDisplayTitle } from '@/lib/idea-research';
export default function ResearchArchive() {
  const data = useScout((state) => state.data);
  const ready = useScout((state) => state.ready);
  const language = useScout((state) => state.data.preferences.uiLanguage ?? 'fa');
  const fa = language === 'fa';
  const reports = [...data.reports].sort((a, b) => b.createdAt - a.createdAt);
  const ideas = [...data.ideas].sort((a, b) => b.createdAt - a.createdAt);
  const links = [...data.links].sort((a, b) => b.savedAt - a.savedAt);
  const otherNotes = data.notes.filter((note) => !(
    note.tags.includes('deep-research') || note.title.startsWith('پژوهش فضایی: ') || note.title.startsWith('Space research: ') || note.folder === 'Deep Research' || note.folder === 'تحقیق عمیق'
  )).sort((a, b) => b.updatedAt - a.updatedAt);
  const deepResearchNotes = data.notes.filter((note) =>
    note.tags.includes('deep-research') || note.title.startsWith('پژوهش فضایی: ') || note.title.startsWith('Space research: ') || note.folder === 'Deep Research' || note.folder === 'تحقیق عمیق')
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (!ready) return <><AppHeader /><View style={[styles.content, { flex: 1 }]}><Txt>{fa ? 'در حال بارگذاری بایگانی محلی…' : 'Loading your local archive…'}</Txt></View></>;
  const date = (value: number) => new Intl.DateTimeFormat(fa ? 'fa-IR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  return (
    <>
      <AppHeader />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingBottom: 30 }]} showsVerticalScrollIndicator={false}>
      <ScreenIntro eyebrow={fa ? 'بایگانی پژوهش' : 'RESEARCH ARCHIVE'} title={fa ? 'بایگانی یکپارچه پژوهش' : 'Unified research archive'}
        subtitle={fa ? 'گزارش‌ها، پرونده‌های تحقیق عمیق، ایده‌ها، پیوندها و یادداشت‌های شخصی را از یک نقطه مرور کن.' : 'Browse reports, Deep Research briefs, ideas, saved links and personal notes from one place.'} icon={Archive} />
      <Panel>
        <View style={styles.rowBetween}><Heading>{fa ? 'گزارش‌های YouTube' : 'YouTube reports'}</Heading><BadgeText>{String(reports.length)}</BadgeText></View>
        <Txt muted>{fa ? 'نمونه‌های رسمی ذخیره‌شده، همراه موضوع، زمان اجرا و تعداد ویدئوهای دریافتی.' : 'Saved official API samples with their topic, run time and returned video count.'}</Txt>
        {reports.length ? reports.map((report) => (
          <View key={report.id} style={[styles.listCard, { gap: 8 }]}>
            <View style={styles.rowBetween}><BadgeText>{fa ? 'گزارش نمونه‌گیری' : 'YOUTUBE SAMPLE REPORT'}</BadgeText><Text style={styles.muted}>{date(report.createdAt)}</Text></View>
            <SourceText>{report.input.topic}</SourceText>
            <Txt muted>{report.videos.length + (fa ? ' ویدئو' : ' videos') + ' · ' + report.queries.length + (fa ? ' جست‌وجو' : ' queries') + (report.analyzed ? (fa ? ' · تحلیل داخلی انجام شده' : ' · internal analysis completed') : '')}</Txt>
            <Action secondary icon={Youtube} onPress={() => router.push({ pathname: '/youtube', params: { topic: report.input.topic, report: report.id } })}>{fa ? 'بازکردن همین گزارش' : 'Reopen this report'}</Action>
          </View>
        )) : <Empty icon={Youtube} title={fa ? 'هنوز گزارش یوتیوبی ذخیره نشده است.' : 'No saved YouTube reports yet.'} action={fa ? 'شروع نمونه‌گیری یوتیوب' : 'Start a YouTube sample'} onPress={() => router.push('/youtube')} />}
      </Panel>
      <Panel>
        <View style={styles.rowBetween}><Heading>{fa ? 'پرونده‌های تحقیق عمیق' : 'Deep Research briefs'}</Heading><BadgeText>{String(deepResearchNotes.length)}</BadgeText></View>
        <Txt muted>{fa ? 'گزارش کامل تحقیق عمیق پس از ذخیره، در قالب یادداشت ساختاریافته نگهداری می‌شود.' : 'A full Deep Research brief is retained as a structured note after you save it.'}</Txt>
        {deepResearchNotes.length ? deepResearchNotes.map((note) => (
          <View key={note.id} style={[styles.listCard, { gap: 8 }]}>
            <View style={styles.rowBetween}><BadgeText>{fa ? 'پرونده ذخیره‌شده' : 'SAVED BRIEF'}</BadgeText><Text style={styles.muted}>{date(note.updatedAt)}</Text></View>
            <SourceText>{note.title}</SourceText><Txt muted>{note.blocks.length + (fa ? ' بخش محتوایی' : ' content blocks')}</Txt>
            <Action secondary icon={NotebookPen} onPress={() => router.push({ pathname: '/note', params: { id: note.id } })}>{fa ? 'بازکردن پرونده کامل' : 'Open full brief'}</Action>
          </View>
        )) : <Empty icon={NotebookPen} title={fa ? 'هنوز گزارش تحقیق عمیقی به یادداشت‌ها ذخیره نشده است.' : 'No saved Deep Research briefs yet.'} action={fa ? 'شروع تحقیق عمیق' : 'Start Deep Research'} onPress={() => router.push('/deep-research')} />}
      </Panel>
      <Panel>
        <View style={styles.rowBetween}><Heading>{fa ? 'ایده‌های ذخیره‌شده' : 'Saved ideas'}</Heading><BadgeText>{String(ideas.length)}</BadgeText></View>
        <Txt muted>{fa ? 'ایده‌های شخصی و تولیدشده توسط موتور؛ امتیازهای فاقد شواهد نمایش داده نمی‌شوند.' : 'Personal and engine-generated ideas. Missing evidence scores are not fabricated.'}</Txt>
        {ideas.length ? ideas.map((idea) => (
          <View key={idea.id} style={[styles.listCard, { gap: 7 }]}>
            <View style={styles.rowBetween}><BadgeText>{idea.engineGenerated ? (fa ? 'تولید موتور' : 'ENGINE GENERATED') : (fa ? 'ایده شخصی' : 'PERSONAL IDEA')}</BadgeText><Text style={styles.muted}>{idea.status}</Text></View>
            <SourceText>{getIdeaDisplayTitle(idea, language)}</SourceText>
            <Txt muted>{idea.engineScore !== undefined ? (fa ? 'اولویت تحریری: ' : 'Editorial priority: ') + idea.engineScore + '/100' : (fa ? 'بدون امتیاز شواهد' : 'No evidence score')}</Txt>
            <Action secondary icon={Lightbulb} onPress={() => router.push({ pathname: '/detail', params: { idea: idea.id } })}>{fa ? 'بازکردن پرونده ایده' : 'Open idea record'}</Action>
          </View>
        )) : <Empty icon={Lightbulb} title={fa ? 'هنوز ایده‌ای ذخیره نشده است.' : 'No saved ideas yet.'} action={fa ? 'ساخت ایده' : 'Create an idea'} onPress={() => router.push('/opportunities')} />}
      </Panel>
      <Panel>
        <View style={styles.rowBetween}><Heading>{fa ? 'پیوندهای ویدئویی شخصی' : 'Personal video links'}</Heading><BadgeText>{String(links.length)}</BadgeText></View>
        <Txt muted>{fa ? 'پیوندهای انتخابی تو؛ جزئیات موقت API یوتیوب به‌عنوان داده دائمی کپی نمی‌شود.' : 'Links you chose to keep. Temporary YouTube API metadata is not copied as permanent personal data.'}</Txt>
        {links.length ? links.map((link) => (
          <View key={link.id} style={[styles.listCard, { gap: 7 }]}>
            <SourceText>{link.manualTitle.trim() || link.topic || link.url}</SourceText>
            <Txt muted>{link.folder || (fa ? 'بدون پوشه' : 'Unfiled')}</Txt>
            <Action secondary icon={LinkIcon} onPress={() => router.push({ pathname: '/detail', params: { video: link.id } })}>{fa ? 'بازکردن پیوند ذخیره‌شده' : 'Open saved link'}</Action>
          </View>
        )) : <Empty icon={LinkIcon} title={fa ? 'پیوند شخصی ذخیره نشده است.' : 'No personal links saved yet.'} action={fa ? 'افزودن پیوند' : 'Add a link'} onPress={() => router.push('/library')} />}
      </Panel>
      <Panel>
        <View style={styles.rowBetween}><Heading>{fa ? 'یادداشت‌های شخصی' : 'Personal notes'}</Heading><BadgeText>{String(otherNotes.length)}</BadgeText></View>
        {otherNotes.length ? otherNotes.map((note) => (
          <View key={note.id} style={[styles.listCard, { gap: 7 }]}>
            <SourceText>{note.title}</SourceText>
            <Txt muted>{date(note.updatedAt)}</Txt>
            <Action secondary icon={NotebookPen} onPress={() => router.push({ pathname: '/note', params: { id: note.id } })}>{fa ? 'بازکردن یادداشت' : 'Open note'}</Action>
          </View>
        )) : <Txt muted>{fa ? 'یادداشت شخصی دیگری برای نمایش وجود ندارد.' : 'No additional personal notes to show.'}</Txt>}
      </Panel>
      <Action secondary icon={NotebookPen} onPress={() => router.push('/notes')}>{fa ? 'رفتن به همه یادداشت‌ها' : 'Open all Notes'}</Action>
      </ScrollView>
    </>
  );
}
