import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { Panel, Txt, Action, BadgeText } from '@/components/ScoutUI';
import { palette as p } from '@/lib/theme';
import { rankDashboardIdeas, selectDashboardFeaturedIdeas } from '@/lib/dashboard';
import { summarizeEditorialPriority } from '@/lib/editorial-priority';
import type { Idea } from '@/lib/types';

export const ResearchOverviewChart = memo(function ResearchOverviewChart({
  ideas,
  topic,
  language,
  secondOpinion,
}: {
  ideas: readonly Idea[];
  topic: string;
  language: 'fa' | 'en';
  secondOpinion?: ReactNode;
}) {
  const fa = language === 'fa';
  const label = (english: string, persian: string) => fa ? persian : english;
  const ranked = useMemo(() => rankDashboardIdeas(ideas), [ideas]);
  const priority = useMemo(() => summarizeEditorialPriority(ranked), [ranked]);
  const featuredIdea = useMemo(() => selectDashboardFeaturedIdeas(ideas, 1)[0], [ideas]);
  const number = (value: number) => new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(value);
  const bands = [
    { id: 'strong', title: label('Strong · ≥85', 'قوی · ۸۵ به بالا'), count: priority.strong, color: p.success },
    { id: 'moderate', title: label('Medium · 65–84', 'متوسط · ۶۵ تا ۸۴'), count: priority.moderate, color: p.cyan },
    { id: 'weak', title: label('Low · <65', 'پایین · کمتر از ۶۵'), count: priority.weak, color: p.danger },
  ];

  const rationale = featuredIdea
    ? (featuredIdea.engineV2Why ?? featuredIdea.engineScoreReason ?? featuredIdea.concept ?? '').trim()
    : '';
  const evidence = featuredIdea?.engineV2Evidence ?? [];

  return (
    <Panel variant="hero">
      <View style={{ gap: 4 }}>
        <BadgeText>{label('CURRENT EDITORIAL PRIORITY', 'اولویت تحریری فعلی')}</BadgeText>
        <Text style={{ color: p.text, fontSize: 16, fontWeight: '800' }}>
          {label('Highest-priority active idea', 'ایدهٔ فعال با بالاترین اولویت')}
        </Text>
        <Txt muted>{label(
          'This is the same scored ranking used at the top of the Ideas page. It is an evidence-based editorial priority, not a prediction of YouTube views.',
          'این همان رتبه‌بندی امتیازدار ابتدای صفحهٔ ایده‌هاست؛ اولویت تحریری بر پایهٔ شواهد است، نه پیش‌بینی بازدید YouTube.',
        )}</Txt>
      </View>

      {featuredIdea ? (
        <View style={{ borderRadius: 11, borderWidth: 1, borderColor: p.accent, backgroundColor: p.surface, padding: 11, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <BadgeText>{label('HIGHEST ACTIVE PRIORITY', 'بالاترین اولویت فعال')}</BadgeText>
            <Text style={{ color: p.accent, fontSize: 12, fontWeight: '800' }}>
              {number(featuredIdea.engineScore ?? 0)}/100
            </Text>
          </View>
          <Text numberOfLines={2} style={{ color: p.text, fontSize: 14, fontWeight: '800' }}>
            {featuredIdea.topic}
          </Text>
          {rationale ? (
            <Txt muted>{rationale.slice(0, 170)}{rationale.length > 170 ? '…' : ''}</Txt>
          ) : null}
          {evidence.slice(0, 2).map((item, index) => {
            const views = typeof item.views === 'number' && Number.isFinite(item.views) && item.views > 0
              ? number(Math.round(item.views)) + (fa ? ' بازدید' : ' views')
              : '';
            const line = [item.title, item.source, views].filter(Boolean).join(' · ');
            return line ? <Txt muted key={index}>{line}</Txt> : null;
          })}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {typeof featuredIdea.engineV2Confidence === 'number' && Number.isFinite(featuredIdea.engineV2Confidence)
              ? <BadgeText>{label('Confidence', 'اطمینان') + ' ' + Math.round(featuredIdea.engineV2Confidence * 100) + '%'}</BadgeText>
              : null}
            {featuredIdea.engineV2Risk
              ? <BadgeText>{label('Risk', 'ریسک') + ': ' + featuredIdea.engineV2Risk}</BadgeText>
              : null}
          </View>
          <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: featuredIdea.id } })}>
            {label('Open complete idea', 'مشاهده پرونده کامل ایده')}
          </Action>
        </View>
      ) : (
        <Txt muted>{label(
          'No scored active idea is available yet. Complete a research run to create evidence-backed priorities.',
          'هنوز ایدهٔ فعال امتیازداری موجود نیست. یک تحقیق را تکمیل کن تا اولویت‌های مستند ساخته شوند.',
        )}</Txt>
      )}

      <View style={{ gap: 8, borderRadius: 11, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, padding: 11 }}>
        <Text style={{ color: p.text, fontSize: 11, fontWeight: '800' }}>
          {label('EDITORIAL PRIORITY DISTRIBUTION', 'توزیع اولویت تحریری')}
        </Text>
        <Txt muted>{label(
          number(priority.scored) + ' scored active ideas · ' + number(priority.unscored) + ' unscored active ideas',
          number(priority.scored) + ' ایدهٔ فعال امتیازدار · ' + number(priority.unscored) + ' ایدهٔ فعال بدون امتیاز',
        )}</Txt>
        {priority.scored > 0 ? (
          <>
            <View style={{ height: 9, flexDirection: 'row', borderRadius: 999, overflow: 'hidden', backgroundColor: p.surfaceAlt }}>
              {bands.filter((band) => band.count > 0).map((band) => (
                <View key={band.id} style={{ flex: band.count, backgroundColor: band.color }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {bands.map((band) => (
                <View key={band.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: band.color }} />
                  <Text style={{ color: p.muted, fontSize: 10 }}>{band.title}: {number(band.count)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Txt muted>{label('No scored ideas yet.', 'هنوز ایدهٔ امتیازداری وجود ندارد.')}</Txt>
        )}
        <Txt muted>{label(
          'Scores combine relevance, evidence breadth, freshness and differentiation. They do not estimate views.',
          'امتیاز از ارتباط موضوع، گسترهٔ شواهد، تازگی و تمایز ساخته می‌شود و تخمین بازدید نیست.',
        )}</Txt>
      </View>

      <Txt muted>{label('Research focus: ', 'تمرکز تحقیق: ') + topic}</Txt>
      {secondOpinion ? (
        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: p.borderSoft, paddingTop: 12 }}>
          {secondOpinion}
        </View>
      ) : null}
      <Action secondary onPress={() => router.push('/opportunities')}>
        {label('Open all ideas', 'مشاهده همه ایده‌ها')}
      </Action>
    </Panel>
  );
});
