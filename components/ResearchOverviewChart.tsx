import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { Panel, Txt, Action, BadgeText } from '@/components/ScoutUI';
import { OpportunityMap } from '@/components/OpportunityMap';
import { palette as p } from '@/lib/theme';
import { rankDashboardIdeas } from '@/lib/dashboard';
import type { Idea } from '@/lib/types';
import type { UnifiedBrief } from '@/lib/engine-v2-adapter';
import { setSelectedIdeaId } from '@/lib/idea-selection';

/** The chart only reads the one unified brief; legacy analysis counters are gone. */
export const ResearchOverviewChart = memo(function ResearchOverviewChart({
  brief,
  ideas,
  topic,
  language,
  selectedIdeaId,
  secondOpinion,
}: {
  brief?: UnifiedBrief;
  ideas: readonly Idea[];
  topic: string;
  language: 'fa' | 'en';
  selectedIdeaId?: string;
  secondOpinion?: ReactNode;
}) {
  const fa = language === 'fa';
  const label = (english: string, persian: string) => fa ? persian : english;
  const ranked = useMemo(() => rankDashboardIdeas(ideas), [ideas]);
  const number = (value: number) => new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(value);

  const focusedIdea = selectedIdeaId ? ranked.find((idea) => idea.id === selectedIdeaId) : undefined;
  const topIdea = focusedIdea ?? ranked[0];
  const fullWhy = topIdea
    ? (topIdea.engineV2Why ?? topIdea.engineScoreReason ?? topIdea.concept ?? '').trim()
    : '';
  const evidence = topIdea?.engineV2Evidence ?? [];

  return (
    <Panel variant="hero">
      <Txt muted>{label('Research focus', 'تمرکز تحقیق') + ': ' + topic}</Txt>
      {topIdea ? (
        <View style={{ borderRadius: 11, borderWidth: 1, borderColor: p.accent, backgroundColor: p.surface, padding: 11, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <BadgeText>{focusedIdea
              ? label('SELECTED IDEA', 'ایده انتخابشده')
              : label('TOP IDEA · RANK #1', 'ایده برتر · رتبه ۱')}</BadgeText>
            {typeof topIdea.engineScore === 'number' && Number.isFinite(topIdea.engineScore)
              ? <Text style={{ color: p.accent, fontSize: 12, fontWeight: '800' }}>{number(topIdea.engineScore)}/100</Text>
              : null}
          </View>
          <Text style={{ color: p.text, fontSize: 14, fontWeight: '800' }}>{topIdea.topic}</Text>
          {fullWhy ? (
            <Txt muted>{fullWhy.slice(0, 220)}{fullWhy.length > 220 ? '…' : ''}</Txt>
          ) : null}
          {evidence.slice(0, 2).map((item, index) => {
            const views = typeof item.views === 'number' && Number.isFinite(item.views) && item.views > 0
              ? number(Math.round(item.views)) + (fa ? ' بازدید' : ' views')
              : '';
            const line = [item.title, item.source, views, item.url].filter(Boolean).join(' · ');
            return <Txt muted key={index}>{line}</Txt>;
          })}
          {(topIdea.engineV2Claims ?? []).slice(0, 2).map((claim, index) => (
            <Txt muted key={index}>{label('Claim', 'ادعا') + ': ' + claim.text + ' · ' + claim.source}</Txt>
          ))}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {typeof topIdea.engineV2Confidence === 'number' && Number.isFinite(topIdea.engineV2Confidence)
              ? <BadgeText>{label('Confidence', 'اطمینان') + ' ' + Math.round(topIdea.engineV2Confidence * 100) + '%'}</BadgeText>
              : null}
            {topIdea.engineV2Risk
              ? <BadgeText>{label('Risk', 'ریسک') + ': ' + topIdea.engineV2Risk}</BadgeText>
              : null}
            {topIdea.engineV2BestTime
              ? <BadgeText>{label('Best time', 'بهترین زمان') + ': ' + topIdea.engineV2BestTime}</BadgeText>
              : null}
          </View>
          <Action secondary onPress={() => {
            setSelectedIdeaId(topIdea.id);
            router.push({ pathname: '/opportunities', params: { idea: topIdea.id } });
          }}>
            {label('Open full idea in Ideas', 'مشاهده توضیحات کامل در بخش ایده‌ها')}
          </Action>
        </View>
      ) : (
        <Txt muted>{label('No scored engine-generated idea is available yet. Complete a research pass to create evidence-backed recommendations.', 'هنوز ایده امتیازدار تولیدشده توسط موتور وجود ندارد. یک مرحله تحقیق را تکمیل کن تا پیشنهادهای مستند ساخته شوند.')}</Txt>
      )}
      {brief?.result ? (
        <OpportunityMap
          topics={brief.result.topics}
          scores={brief.result.scores}
          ideas={ranked}
          coverage={brief.coverage}
          language={language}
          onSelectIdea={(id) => {
            setSelectedIdeaId(id);
            router.push({ pathname: '/detail', params: { idea: id } });
          }}
        />
      ) : (
        <Txt muted>{label('The opportunity map fills in as the local engine brief becomes available. Source coverage above stays visible while it loads.', 'نقشه فرصت با آمادهشدن تحلیل موتور محلی تکمیل میشود؛ پوشش منابع تا آن زمان قابل مشاهده است.')}</Txt>
      )}
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
