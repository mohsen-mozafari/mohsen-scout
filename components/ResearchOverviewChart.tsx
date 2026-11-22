import { memo, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { Panel, Txt, Action, BadgeText } from '@/components/ScoutUI';
import { ResearchKnowledgeGraph } from '@/components/ResearchKnowledgeGraph';
import { palette as p } from '@/lib/theme';
import { rankDashboardIdeas } from '@/lib/dashboard';
import { getEditorialPriorityBand } from '@/lib/editorial-priority';
import type { Idea } from '@/lib/types';
import type { InternalResearchResult } from '@/lib/engine';
import type { SpaceNewsItem, WikiSignal } from '@/lib/space';
import type { YouTubeSampleVideo } from '@/lib/api';
import { setSelectedIdeaId, useSelectedIdeaId } from '@/lib/idea-selection';

export const ResearchOverviewChart = memo(function ResearchOverviewChart({
  analysis,
  ideas,
  topic,
  news,
  wiki,
  videos,
  language,
  selectedIdeaId,
  secondOpinion,
}: {
  analysis?: InternalResearchResult;
  ideas: readonly Idea[];
  topic: string;
  news: readonly SpaceNewsItem[];
  wiki?: WikiSignal;
  videos: readonly YouTubeSampleVideo[];
  language: 'fa' | 'en';
  selectedIdeaId?: string;
  secondOpinion?: ReactNode;
}) {
  const fa = language === 'fa';
  const label = (english: string, persian: string) => fa ? persian : english;
  const sharedSelectedIdeaId = useSelectedIdeaId();
  const [showEvidenceMap, setShowEvidenceMap] = useState(false);
  const ranked = useMemo(() => rankDashboardIdeas(ideas), [ideas]);
  const priorityBands = [
    { id: 'strong', label: label('Strong · 85–100', 'قوی · ۸۵ تا ۱۰۰'), count: ranked.filter((idea) => typeof idea.engineScore === 'number' && getEditorialPriorityBand(idea.engineScore) === 'strong').length, tint: p.success },
    { id: 'moderate', label: label('Medium · 65–84', 'متوسط · ۶۵ تا ۸۴'), count: ranked.filter((idea) => typeof idea.engineScore === 'number' && getEditorialPriorityBand(idea.engineScore) === 'moderate').length, tint: p.cyan },
    { id: 'weak', label: label('Low · under 65', 'پایین · کمتر از ۶۵'), count: ranked.filter((idea) => typeof idea.engineScore === 'number' && getEditorialPriorityBand(idea.engineScore) === 'weak').length, tint: p.danger },
  ];
  const scoredIdeaCount = priorityBands.reduce((sum, item) => sum + item.count, 0);
  const topRecommendation = ranked.find((idea) =>
    typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore),
  );
  const activeIdeaId = selectedIdeaId ?? sharedSelectedIdeaId;
  const number = (value: number) => new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(value);

  const metrics = [
    { id: 'reports', label: label('Publisher reports', 'گزارش‌های ناشران'), value: news.length, tint: p.cyan },
    { id: 'entities', label: label('Identified entities', 'موجودیت‌های شناسایی‌شده'), value: analysis?.entityCandidates.length ?? 0, tint: p.purple },
    { id: 'questions', label: label('Open questions', 'پرسش‌های باز'), value: analysis?.intelligence.gaps.length ?? 0, tint: p.warning },
    { id: 'ideas', label: label('Editorial ideas', 'ایده‌های تحریری'), value: ideas.length, tint: p.success },
  ];

  return (
    <Panel variant="hero">
      <View style={{ gap: 3 }}>
        <BadgeText>{label('RESEARCH OVERVIEW', 'خلاصه تحقیق')}</BadgeText>
        <Text style={{ color: p.text, fontSize: 17, fontWeight: '800' }}>{topic}</Text>
        <Txt muted>{label(
          'A quick summary of this research sample. Counts describe collected evidence, not audience demand or future YouTube views.',
          'خلاصه‌ای از نمونه تحقیق فعلی؛ شمارنده‌ها فقط داده‌های جمع‌آوری‌شده را نشان می‌دهند، نه تقاضای مخاطب یا بازدید آینده YouTube.',
        )}</Txt>
      </View>

      {topRecommendation ? (
        <View style={{ borderRadius: 11, borderWidth: 1, borderColor: p.accent, backgroundColor: p.surface, padding: 11, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <BadgeText>{label('TOP IDEA IN THIS RESEARCH', 'ایده برتر همین تحقیق')}</BadgeText>
            <Text style={{ color: p.accent, fontSize: 12, fontWeight: '800' }}>{number(topRecommendation.engineScore ?? 0) + '/100'}</Text>
          </View>
          <Text numberOfLines={2} style={{ color: p.text, fontSize: 14, fontWeight: '800' }}>{topRecommendation.topic}</Text>
          <Txt muted>{(topRecommendation.engineScoreReason?.split(';')[0] || topRecommendation.concept).slice(0, 150)}{(topRecommendation.engineScoreReason?.split(';')[0] || topRecommendation.concept).length > 150 ? '…' : ''}</Txt>
          <Action secondary onPress={() => {
            setSelectedIdeaId(topRecommendation.id);
            router.push({ pathname: '/opportunities', params: { idea: topRecommendation.id } });
          }}>
            {label('Open idea', 'مشاهده ایده')}
          </Action>
        </View>
      ) : (
        <Txt muted>{label('No scored editorial idea yet. Complete a research pass to create evidence-backed recommendations.', 'هنوز ایده امتیازدار وجود ندارد؛ یک مرحله تحقیق را تکمیل کن تا پیشنهاد مستند ساخته شود.')}</Txt>
      )}


      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {metrics.map((metric) => (
          <View key={metric.id} style={{
            flexGrow: 1,
            flexBasis: '46%',
            minWidth: 116,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: p.border,
            backgroundColor: p.surface,
            paddingHorizontal: 11,
            paddingVertical: 10,
            gap: 4,
          }}>
            <Text style={{ color: p.muted, fontSize: 10, fontWeight: '600' }}>{metric.label}</Text>
            <Text style={{ color: metric.tint, fontSize: 21, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{number(metric.value)}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 8, borderRadius: 11, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, padding: 11 }}>
        <Text style={{ color: p.text, fontSize: 11, fontWeight: '800' }}>{label('EDITORIAL PRIORITY DISTRIBUTION', 'توزیع اولویت تحریری')}</Text>
        {scoredIdeaCount ? (
          <>
            <View style={{ height: 9, flexDirection: 'row', borderRadius: 999, overflow: 'hidden', backgroundColor: p.surfaceAlt }}>
              {priorityBands.filter((item) => item.count > 0).map((item) => (
                <View key={item.id} style={{ flex: item.count, backgroundColor: item.tint }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {priorityBands.map((item) => (
                <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.tint }} />
                  <Text style={{ color: p.muted, fontSize: 10 }}>{item.label}: {number(item.count)}</Text>
                </View>
              ))}
            </View>
            <Txt muted>{label('Bands describe the app’s independent-source editorial score, not YouTube view potential or virality.', 'این بازه‌ها امتیاز تحریری برنامه بر پایه منابع مستقل را نشان می‌دهند، نه پتانسیل بازدید یا وایرال‌شدن در YouTube.')}</Txt>
          </>
        ) : <Txt muted>{label('No scored ideas are available in this research sample yet.', 'هنوز ایده امتیازداری در این نمونه تحقیق وجود ندارد.')}</Txt>}
      </View>

      {analysis ? (
        <Action secondary onPress={() => setShowEvidenceMap((current) => !current)}>
          {showEvidenceMap
            ? label('Hide detailed evidence map', 'بستن نقشه تفصیلی شواهد')
            : label('Open detailed evidence map', 'نمایش نقشه تفصیلی شواهد')}
        </Action>
      ) : (
        <Txt muted>{label('The detailed evidence map appears after topic-linked analysis is available.', 'نقشه تفصیلی پس از آماده‌شدن تحلیل موضوع‌محور در دسترس قرار می‌گیرد.')}</Txt>
      )}

      {showEvidenceMap && analysis ? (
        <ResearchKnowledgeGraph
          topic={topic}
          news={news}
          wiki={wiki}
          videos={videos}
          analysis={analysis}
          language={language}
          generatedIdeas={ranked}
          selectedIdeaId={activeIdeaId}
          onSelectIdea={setSelectedIdeaId}
        />
      ) : null}

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
