import { useState } from 'react';
import { router } from 'expo-router';
import { View, Text } from 'react-native';
import { Activity, BookOpen, Compass, Globe, TrendingUp, Youtube } from 'lucide-react-native';
import { Page, Panel, Heading, Txt, Action, ScreenIntro, Field, styles } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { palette as p } from '@/lib/theme';

export default function Discover() {
  const language = useScout((state) => state.data.preferences.uiLanguage ?? 'fa');
  const lastInput = useScout((state) => state.data.preferences.lastInput);
  const reports = useScout((state) => state.data.reports);
  const ideas = useScout((state) => state.data.ideas);
  const notes = useScout((state) => state.data.notes);
  const latestDossier = notes
    .filter((note) => note.tags.includes('deep-research') || note.title.startsWith('پژوهش فضایی: ') || note.title.startsWith('Space research: ') || note.folder === 'Deep Research' || note.folder === 'تحقیق عمیق')
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const [topic, setTopic] = useState(lastInput?.topic ?? reports[0]?.input.topic ?? '');
  const fa = language === 'fa';
  const latestReport = reports[0];

  return (
    <Page>
      <ScreenIntro
        eyebrow={fa ? 'میز پژوهش یکپارچه' : 'UNIFIED RESEARCH WORKSPACE'}
        title={fa ? 'موضوع را پیدا کن؛ شواهد را بررسی کن؛ ایده را بساز' : 'Discover a topic, verify the evidence, develop the idea'}
        subtitle={fa
          ? 'اکتشاف YouTube، خبرها و وب در یک جریان پژوهشی هماهنگ انجام می‌شوند.'
          : 'YouTube discovery, publisher feeds and independent web research feed one coordinated pipeline.'}
        icon={Compass}
      />

      <Panel variant="hero">
        <View style={{ gap: 10 }}>
          <Text style={styles.badge}>{fa ? 'شروع یک پژوهش تازه' : 'START A RESEARCH RUN'}</Text>
          <Heading>{fa ? 'موضوع یا پرسش ویدئوی بعدی' : 'Your next video topic or research question'}</Heading>
          <Txt muted>
            {fa
              ? 'یک بار موضوع را وارد کن؛ نمونه‌گیری YouTube، جست‌وجوی مستقل، بررسی فرضیه‌ها و ساخت ایده از همین مسیر آغاز می‌شوند.'
              : 'Enter the topic once. YouTube sampling, independent search, hypothesis review and idea generation start from this single entry point.'}
          </Txt>
          <Field
            label={fa ? 'موضوع یا پرسش تحقیق' : 'Research topic or question'}
            value={topic}
            onChange={setTopic}
            placeholder={fa ? 'مثلاً ابزارهای تازه هوش مصنوعی برای ساخت ویدئو' : 'e.g. Emerging AI tools for video production'}
          />
          <Action icon={BookOpen} disabled={!topic.trim()} onPress={() => router.push({ pathname: '/deep-research', params: { topic: topic.trim() } })}>
            {fa ? 'شروع تحقیق جامع و اکتشافی' : 'Start full Deep Research'}
          </Action>
          <Action secondary icon={Youtube} disabled={!topic.trim()} onPress={() => router.push({ pathname: '/youtube', params: { topic: topic.trim() } })}>
            {fa ? 'نمونه‌گیری و تحلیل YouTube' : 'Sample and analyze YouTube'}
          </Action>
          {latestReport ? (
            <View style={{ gap: 5, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 10 }}>
              <Text style={styles.badge}>{fa ? 'آخرین گزارش ذخیره‌شده یوتیوب' : 'LATEST SAVED YOUTUBE REPORT'}</Text>
              <Heading>{latestReport.input.topic}</Heading>
              <Txt muted>
                {latestReport.videos.length + (fa ? ' ویدئو · ' : ' videos · ') +
                  latestReport.queries.length + (fa ? ' جست‌وجو · ' : ' searches · ') +
                  new Date(latestReport.createdAt).toLocaleString(fa ? 'fa-IR' : 'en-US')}
              </Txt>
              <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: latestReport.input.topic, report: latestReport.id } })}>
                {fa ? 'بازکردن همان گزارش یوتیوب' : 'Open latest YouTube report'}
              </Action>
              <Action secondary onPress={() => latestDossier
                ? router.push({ pathname: '/note', params: { id: latestDossier.id } })
                : router.push({ pathname: '/deep-research', params: { topic: latestReport.input.topic } })}>
                {latestDossier ? (fa ? 'بازکردن پرونده ذخیره‌شده تحقیق عمیق' : 'Reopen saved Deep Research brief') : (fa ? 'اجرای تحقیق عمیق دوباره برای همین موضوع' : 'Run Deep Research for this topic')}
              </Action>
            </View>
          ) : (
            <Txt muted>{fa ? 'هنوز گزارشی ثبت نشده است. با واردکردن موضوع، نخستین تحقیق را آغاز کن.' : 'No report is saved yet. Enter a topic to start the first research run.'}</Txt>
          )}
        </View>
      </Panel>

      <Heading>{fa ? 'ابزارهای تکمیلی' : 'Research tools'}</Heading>
      <Panel>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: fa ? 'row-reverse' : 'row', alignItems: 'center', gap: 9 }}>
            <BookOpen color={p.accentStrong} size={20} />
            <View style={{ flex: 1, gap: 2 }}>
              <Heading>{fa ? 'پروندهٔ تحقیق و راستی‌آزمایی' : 'Research dossier and verification'}</Heading>
              <Txt muted>{fa ? 'فرضیه‌ها، نقل‌قول‌ها، شواهد موافق و مخالف و خلأهای باقی‌مانده در نتیجهٔ تحقیق بالا نمایش داده می‌شوند.' : 'Hypotheses, quotations, supporting and challenging evidence, and unresolved gaps appear in the research brief above.'}</Txt>
            </View>
          </View>
          <Action secondary icon={BookOpen} onPress={() => latestDossier
            ? router.push({ pathname: '/note', params: { id: latestDossier.id } })
            : router.push({ pathname: '/deep-research', params: { topic: topic.trim() || latestReport?.input.topic || '' } })}>
            {latestDossier ? (fa ? 'بازکردن آخرین پرونده ذخیره‌شده' : 'Open latest saved dossier') : (fa ? 'شروع پرونده تحقیق عمیق' : 'Start a Deep Research dossier')}
          </Action>
          <View style={{ height: 1, backgroundColor: p.border, marginVertical: 4 }} />
          <View style={{ flexDirection: fa ? 'row-reverse' : 'row', alignItems: 'center', gap: 9 }}>
            <Globe color={p.accentStrong} size={20} />
            <View style={{ flex: 1, gap: 2 }}>
              <Heading>{fa ? 'مرور مستقیم منابع وب' : 'Direct source inspection'}</Heading>
              <Txt muted>{fa ? 'بازکردن صفحات ناشران و بررسی مستقیم منابع اصلی' : 'Open publisher pages and inspect original web sources directly'}</Txt>
            </View>
          </View>
          <Action secondary onPress={() => router.push('/browser')}>{fa ? 'بازکردن مرورگر پژوهشی' : 'Open research browser'}</Action>
        </View>
      </Panel>

      <Heading>{fa ? 'روندها و توجه عمومی' : 'Trends and public interest'}</Heading>
      <Panel>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: fa ? 'row-reverse' : 'row', alignItems: 'center', gap: 9 }}>
            <TrendingUp color={p.accentStrong} size={20} />
            <View style={{ flex: 1, gap: 2 }}>
              <Heading>{fa ? 'هوشمندی روندها' : 'Trend intelligence'}</Heading>
              <Txt muted>{fa ? 'بررسی تغییرات زمانی و موضوعات در حال رشد' : 'Explore multiple official YouTube search lanes with pagination; this is not continuous trend monitoring.'}</Txt>
            </View>
          </View>
          <Action secondary onPress={() => router.push('/trend-intelligence')}>{fa ? 'اجرای ترکیب اکتشافی' : 'Run Discovery Mix'}</Action>
          <View style={{ height: 1, backgroundColor: p.border }} />
          <View style={{ flexDirection: fa ? 'row-reverse' : 'row', alignItems: 'center', gap: 9 }}>
            <Activity color={p.accentStrong} size={20} />
            <View style={{ flex: 1, gap: 2 }}>
              <Heading>{fa ? 'توجه عمومی و سیگنال‌های جست‌وجو' : 'Public interest and search signals'}</Heading>
              <Txt muted>{fa ? 'بازدید ویکی‌مدیا شاخص توجه مقاله است؛ نه حجم جست‌وجوی گوگل یا بازدید YouTube.' : 'Wikimedia pageviews are an article-attention proxy, not Google search volume or YouTube views.'}</Txt>
            </View>
          </View>
          <Action secondary onPress={() => router.push('/search-demand')}>{fa ? 'بررسی سیگنال‌های توجه' : 'Inspect attention signals'}</Action>
        </View>
      </Panel>

      <Heading>{fa ? 'پیگیری و نتایج' : 'Follow-up and results'}</Heading>
      <Panel>
        <View style={{ gap: 9 }}>
          <View style={{ flexDirection: fa ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Heading>{fa ? 'پژوهش‌های ذخیره‌شده' : 'Saved research'}</Heading>
              <Txt muted>{fa ? 'گزارش‌ها و ایده‌های حفظ‌شده روی همین دستگاه' : 'Reports and ideas retained on this device'}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={{ color: p.accentStrong, fontSize: 21, fontWeight: '800' }}>{reports.length}</Text>
              <Txt muted>{fa ? 'گزارش' : 'reports'}</Txt>
            </View>
          </View>
          <Action secondary icon={Activity} onPress={() => router.push('/research-activity')}>
            {fa ? 'فعالیت‌ها و اجرای اخیر پژوهش' : 'Research activity and recent runs'}
          </Action>
          <Action secondary icon={BookOpen} onPress={() => router.push('/opportunities')}>
            {fa ? 'ایده‌ها و نتایج ذخیره‌شده · ' + ideas.length : 'Saved ideas and results · ' + ideas.length}
          </Action>
          <Action secondary icon={Compass} onPress={() => router.push('/')}>
            {fa ? 'بازگشت به داشبورد' : 'Return to dashboard'}
          </Action>
        </View>
      </Panel>
    </Page>
  );
}
