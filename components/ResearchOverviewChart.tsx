import { memo, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { Panel, Txt, Action, BadgeText } from '@/components/ScoutUI';
import { ResearchKnowledgeGraph } from '@/components/ResearchKnowledgeGraph';
import { palette as p } from '@/lib/theme';
import { rankDashboardIdeas } from '@/lib/dashboard';
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

      {topRecommendation ? (
        <View style={{ borderRadius: 11, borderWidth: 1, borderColor: p.accent, backgroundColor: p.surface, padding: 11, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <BadgeText>{label('TOP EDITORIAL IDEA', 'ایده تحریری منتخب')}</BadgeText>
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
