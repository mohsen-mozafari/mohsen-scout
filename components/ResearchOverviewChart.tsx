import { memo, useMemo } from 'react';
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
  const ranked = useMemo(() => rankDashboardIdeas(ideas), [ideas]);
  const topRecommendations = useMemo(
    () => ranked.filter((idea) => typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore)).slice(0, 1),
    [ranked],
  );
  const activeIdeaId = selectedIdeaId ?? sharedSelectedIdeaId;
  const number = (value: number) => new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(value);
  const topWhy = topRecommendations.length
    ? (topRecommendations[0].engineV2Why ?? topRecommendations[0].engineScoreReason ?? topRecommendations[0].concept ?? '')
        .split(';')[0].trim()
    : '';
  return (
    <Panel variant="hero">
      {topRecommendations.length ? (
        <View style={{ borderRadius: 11, borderWidth: 1, borderColor: p.accent, backgroundColor: p.surface, padding: 11, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <BadgeText>{label('TOP IDEA · RANK #1', 'ایده برتر · رتبه ۱')}</BadgeText>
            <Text style={{ color: p.accent, fontSize: 12, fontWeight: '800' }}>{number(topRecommendations[0].engineScore ?? 0) + '/100'}</Text>
          </View>
          <Text style={{ color: p.text, fontSize: 14, fontWeight: '800' }}>{topRecommendations[0].topic}</Text>
          <Txt muted>{topWhy.slice(0, 150)}{topWhy.length > 150 ? '…' : ''}</Txt>
          <Action secondary onPress={() => {
            setSelectedIdeaId(topRecommendations[0].id);
            router.push({ pathname: '/opportunities', params: { idea: topRecommendations[0].id } });
          }}>
            {label('Open full idea in Ideas', 'مشاهده توضیحات کامل در بخش ایده‌ها')}
          </Action>
        </View>
      ) : (
        <Txt muted>{label('No scored engine-generated idea is available yet. Complete a research pass to create evidence-backed recommendations.', 'هنوز ایده امتیازدار تولیدشده توسط موتور وجود ندارد. یک مرحله تحقیق را تکمیل کن تا پیشنهادهای مستند ساخته شوند.')}</Txt>
      )}
      {analysis ? (
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
      ) : (
        <Txt muted>{label('The visual evidence map fills in as topic-linked analysis becomes available. Source and output counts above remain visible while it loads.', 'نقشه بصری با آماده‌شدن تحلیل موضوع‌محور تکمیل می‌شود؛ شمارنده‌های منابع و خروجی‌ها تا آن زمان هم قابل مشاهده‌اند.')}</Txt>
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
