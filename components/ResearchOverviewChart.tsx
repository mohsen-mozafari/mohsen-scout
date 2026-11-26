import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { Panel, Txt, Action, BadgeText } from '@/components/ScoutUI';
import { palette as p } from '@/lib/theme';
import { rankDashboardIdeas } from '@/lib/dashboard';
import { getEditorialPriorityBand } from '@/lib/editorial-priority';
import type { Idea } from '@/lib/types';
import type { InternalResearchResult } from '@/lib/engine';

export const ResearchOverviewChart = memo(function ResearchOverviewChart({
  analysis,
  ideas,
  topic,
  language,
  secondOpinion,
  showFeaturedIdea = true,
}: {
  analysis?: InternalResearchResult;
  ideas: readonly Idea[];
  topic: string;
  language: 'fa' | 'en';
  secondOpinion?: ReactNode;
  showFeaturedIdea?: boolean;
}) {
  const fa = language === 'fa';
  const label = (english: string, persian: string) => fa ? persian : english;
  const ranked = useMemo(() => rankDashboardIdeas(ideas), [ideas]);
  const priorityBands = [
    { id: 'strong', label: label('Strong · 85–100', 'قوی · ۸۵ تا ۱۰۰'), count: ranked.filter((idea) => typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore) && getEditorialPriorityBand(idea.engineScore) === 'strong').length, tint: p.success },
    { id: 'moderate', label: label('Medium · 65–84', 'متوسط · ۶۵ تا ۸۴'), count: ranked.filter((idea) => typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore) && getEditorialPriorityBand(idea.engineScore) === 'moderate').length, tint: p.cyan },
    { id: 'weak', label: label('Low · below 65', 'پایین · کمتر از ۶۵'), count: ranked.filter((idea) => typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore) && getEditorialPriorityBand(idea.engineScore) === 'weak').length, tint: p.danger },
  ];
  const scored = priorityBands.reduce((sum, item) => sum + item.count, 0);
  const unscored = ranked.length - scored;
  const top = ranked.find((idea) => typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore));
  const audit = analysis?.intelligence.selfEvaluation;
  const youtubeEvidence = analysis?.evidence.find((item) => item.id === 'youtube-sample');
  const number = (value: number) => new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(value);

  return (
    <Panel variant="hero">
      {showFeaturedIdea ? (
        <>
      <View style={{ gap: 4 }}>
        <BadgeText>{label('CURRENT EDITORIAL PRIORITY', 'اولویت تحریری فعلی')}</BadgeText>
        <Text style={{ color: p.text, fontSize: 17, fontWeight: '800' }}>{label('Highest-priority active idea', 'ایدهٔ فعال با بالاترین اولویت')}</Text>
        <Txt muted>{label(
          'This is the same active ranking used at the top of the Ideas page. It is an editorial evidence score, not a forecast of YouTube views.',
          'این همان رتبه‌بندی ایده‌های فعال در ابتدای صفحهٔ ایده‌هاست. امتیاز تحریری بر پایهٔ شواهد است، نه پیش‌بینی بازدید YouTube.',
        )}</Txt>
      </View>

      {top ? (
        <View style={{ borderRadius: 11, borderWidth: 1, borderColor: p.accent, backgroundColor: p.surface, padding: 11, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <BadgeText>{label('HIGHEST ACTIVE PRIORITY', 'بالاترین اولویت فعال')}</BadgeText>
            <Text style={{ color: p.accent, fontSize: 12, fontWeight: '800' }}>{number(top.engineScore ?? 0) + '/100'}</Text>
          </View>
          <Text numberOfLines={2} style={{ color: p.text, fontSize: 14, fontWeight: '800' }}>{top.topic}</Text>
          <Txt muted>{(top.engineScoreReason?.split(';')[0] || top.concept).slice(0, 150)}{(top.engineScoreReason?.split(';')[0] || top.concept).length > 150 ? '…' : ''}</Txt>
          <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: top.id } })}>
            {label('Open idea details', 'مشاهده پرونده ایده')}
          </Action>
        </View>
      ) : (
        <Txt muted>{label('No active idea has an editorial score yet. Run a research pass with independent evidence to create a ranked idea.', 'هنوز ایدهٔ فعالی امتیاز تحریری ندارد. برای ساخت رتبه‌بندی، تحقیق با شواهد مستقل اجرا کن.')}</Txt>
      )}

        </>
      ) : null}

      <View style={{ gap: 8, borderRadius: 11, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, padding: 11 }}>
        <Text style={{ color: p.text, fontSize: 11, fontWeight: '800' }}>{label('EDITORIAL PRIORITY DISTRIBUTION', 'توزیع اولویت تحریری')}</Text>
        <Txt muted>{label(
          number(scored) + ' scored active ideas · ' + number(unscored) + ' unscored active ideas',
          number(scored) + ' ایدهٔ فعال امتیازدار · ' + number(unscored) + ' ایدهٔ فعال بدون امتیاز',
        )}</Txt>
        {scored > 0 ? (
          <>
            <View style={{ height: 9, flexDirection: 'row', borderRadius: 999, overflow: 'hidden', backgroundColor: p.surfaceAlt }}>
              {priorityBands.filter((item) => item.count > 0).map((item) => <View key={item.id} style={{ flex: item.count, backgroundColor: item.tint }} />)}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {priorityBands.map((item) => (
                <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.tint }} />
                  <Text style={{ color: p.muted, fontSize: 10 }}>{item.label}: {number(item.count)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : <Txt muted>{label('No scored ideas are available yet.', 'هنوز ایدهٔ امتیازداری موجود نیست.')}</Txt>}
        <Txt muted>{label(
          'Bands: strong ≥85 · medium 65–84 · low below 65. Scores use publisher, web and Wikimedia evidence only.',
          'بازه‌ها: قوی ۸۵ به بالا · متوسط ۶۵ تا ۸۴ · پایین کمتر از ۶۵. امتیاز فقط از شواهد ناشران، وب و ویکی‌مدیا استفاده می‌کند.',
        )}</Txt>
        {audit ? (
          <Txt muted>{label(
            'Engine inputs: ' + number(audit.inputNewsCount) + ' publisher records → ' + number(audit.uniqueNewsCount) + ' unique, ' + number(audit.topicMatchedNewsCount) + ' topic matches · Wikimedia: ' + number(audit.wikimediaMonthlyObservations) + ' monthly observations · YouTube: ' + number(audit.youtubeSampleCount) + ' raw records received (kept separate; not scored) · recurring concepts: ' + number(audit.emergentConceptCount) + ' · multi-document concept links: ' + number(audit.conceptRelationCount) + '.',
            'ورودی موتور: ' + number(audit.inputNewsCount) + ' خبر دریافتی ← ' + number(audit.uniqueNewsCount) + ' خبر یکتا، ' + number(audit.topicMatchedNewsCount) + ' هم‌موضوع · ویکی‌مدیا: ' + number(audit.wikimediaMonthlyObservations) + ' مشاهدهٔ ماهانه · YouTube: ' + number(audit.youtubeSampleCount) + ' رکورد خام دریافت‌شده (جدا نگه داشته می‌شود و امتیاز نمی‌گیرد) · مفهوم‌های پرتکرار: ' + number(audit.emergentConceptCount) + ' · پیوندهای چندسندی مفاهیم: ' + number(audit.conceptRelationCount) + '.',
          )}</Txt>
        ) : <Txt muted>{label('Source counts appear after a completed analysis.', 'شمارنده‌های منابع پس از تکمیل تحلیل نمایش داده می‌شوند.')}</Txt>}
        {youtubeEvidence ? <Txt muted>{youtubeEvidence.detail}</Txt> : null}
        <Txt muted>{label('Research topic: ', 'موضوع تحقیق: ') + topic}</Txt>
      </View>

      {secondOpinion ? <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: p.borderSoft, paddingTop: 12 }}>{secondOpinion}</View> : null}
      <Action secondary onPress={() => router.push('/opportunities')}>
        {label('Open all ideas', 'مشاهده همه ایده‌ها')}
      </Action>
    </Panel>
  );
});
