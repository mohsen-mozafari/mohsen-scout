import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Archive, NotebookPen, Youtube } from 'lucide-react-native';
import { Action, AppHeader, BadgeText, Empty, Heading, Panel, ScreenIntro, SourceText, Txt, styles } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
export default function ResearchArchive() {
  const data = useScout((state) => state.data);
  const language = useScout((state) => state.data.preferences.uiLanguage ?? 'fa');
  const fa = language === 'fa';
  const reports = [...data.reports].sort((a, b) => b.createdAt - a.createdAt);
  const deepResearchNotes = data.notes.filter((note) =>
    note.tags.includes('deep-research') || note.title.startsWith('پژوهش فضایی: ') || note.title.startsWith('Space research: '))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const date = (value: number) => new Intl.DateTimeFormat(fa ? 'fa-IR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  return (
    <>
      <AppHeader />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingBottom: 30 }]} showsVerticalScrollIndicator={false}>
      <ScreenIntro eyebrow={fa ? 'بایگانی پژوهش' : 'RESEARCH ARCHIVE'} title={fa ? 'گزارش‌ها و پرونده‌های ذخیره‌شده' : 'Saved reports and research briefs'}
        subtitle={fa ? 'گزارش‌های نمونه‌گیری یوتیوب و پرونده‌های تحقیق عمیق ذخیره‌شده را از همین‌جا دوباره باز کن.' : 'Reopen saved YouTube sample reports and your full Deep Research briefs from one place.'} icon={Archive} />
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
      <Action secondary icon={NotebookPen} onPress={() => router.push('/notes')}>{fa ? 'رفتن به همه یادداشت‌ها' : 'Open all Notes'}</Action>
      </ScrollView>
    </>
  );
}
