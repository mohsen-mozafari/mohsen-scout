import { memo, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ResearchKnowledgeGraph } from '@/components/ResearchKnowledgeGraph';
import { Action, BadgeText, Heading, Panel, Txt } from '@/components/ScoutUI';
import { rankDashboardIdeas } from '@/lib/dashboard';
import { palette as p } from '@/lib/theme';
import type { InternalResearchResult } from '@/lib/engine';
import type { SpaceNewsItem } from '@/lib/space';
import type { Idea } from '@/lib/types';
import type { YouTubeSampleVideo } from '@/lib/api';

type Props = {
  analysis?: InternalResearchResult;
  ideas: readonly Idea[];
  topic: string;
  news: readonly SpaceNewsItem[];
  videos: readonly YouTubeSampleVideo[];
  language: 'fa' | 'en';
};

const assessmentLabel = (assessment: Idea['assessment'], fa: boolean) => {
  if (fa) {
    switch (assessment) {
      case 'Strong Opportunity': return 'فرصت قوی';
      case 'Promising': return 'امیدبخش';
      case 'Worth Exploring': return 'ارزش بررسی';
      case 'Uncertain': return 'نامطمئن';
      case 'Highly Competitive': return 'رقابت سنگین';
    }
  }
  return assessment;
};

const assessmentColor = (assessment: Idea['assessment']) => {
  switch (assessment) {
    case 'Strong Opportunity': return p.success;
    case 'Promising': return p.cyan;
    case 'Worth Exploring': return p.accent;
    case 'Uncertain': return p.warning;
    case 'Highly Competitive': return p.danger;
  }
};

function SuggestionIntelligenceChart({ analysis, ideas, topic, news, videos, language }: Props) {
  const fa = language === 'fa';
  const ranked = useMemo(() => rankDashboardIdeas(ideas), [ideas]);
  const number = useMemo(() => new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US'), [fa]);
  const counts = useMemo(() => {
    const result: Record<Idea['assessment'], number> = {
      'Strong Opportunity': 0,
      Promising: 0,
      'Worth Exploring': 0,
      Uncertain: 0,
      'Highly Competitive': 0,
    };
    ranked.forEach((idea) => { result[idea.assessment] += 1; });
    return result;
  }, [ranked]);

  return (
    <Panel variant="hero">
      <View style={{ gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <BadgeText>{fa ? 'رتبه‌بندی موتور · قوی به ضعیف' : 'ENGINE RANKING · HIGH TO LOW'}</BadgeText>
          <Text style={{ color: p.muted, fontSize: 10 }}>{number.format(ranked.length)} {fa ? 'پیشنهاد فعال' : 'active suggestions'}</Text>
        </View>
        <Heading>{fa ? 'پیشنهادهای برتر' : 'Ranked suggestions'}</Heading>
        <Text numberOfLines={2} style={{ color: p.muted, fontSize: 11, lineHeight: 16, textAlign: fa ? 'right' : 'left' }}>
          {topic}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {([
          ['Strong Opportunity', fa ? 'قوی' : 'Strong', p.success],
          ['Promising', fa ? 'امیدبخش' : 'Promising', p.cyan],
          ['Worth Exploring', fa ? 'بررسی' : 'Explore', p.accent],
          ['Uncertain', fa ? 'نامطمئن' : 'Uncertain', p.warning],
          ['Highly Competitive', fa ? 'ضعیف' : 'Weak', p.danger],
        ] as const).map(([key, label, color]) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9, borderWidth: 1, borderColor: color + '55', backgroundColor: color + '14', paddingHorizontal: 8, paddingVertical: 5 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
            <Text style={{ color: p.text, fontSize: 10, fontWeight: '600' }}>{label} {number.format(counts[key])}</Text>
          </View>
        ))}
      </View>

      {ranked.length ? (
        <View style={{ gap: 7 }}>
          {ranked.slice(0, 6).map((idea, index) => {
            const color = assessmentColor(idea.assessment);
            const score = typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore)
              ? Math.max(0, Math.min(100, Math.round(idea.engineScore)))
              : undefined;
            const sourceLabel = idea.sourceName || (idea.sourceUrl
              ? (fa ? 'منبع پیوندشده' : 'Source linked')
              : idea.videoIds.length
                ? (fa ? 'نمونه ویدئویی پیوندشده' : 'Video examples linked')
                : (fa ? 'بدون منبع پیوندشده' : 'No linked source'));
            const reason = idea.engineScoreReason || idea.decision;
            return (
              <Pressable
                key={idea.id}
                onPress={() => router.push({ pathname: '/detail', params: { idea: idea.id } })}
                accessibilityRole="button"
                accessibilityLabel={idea.topic + ' · ' + assessmentLabel(idea.assessment, fa)}
                style={({ pressed }) => ({
                  minHeight: 64,
                  borderRadius: 13,
                  borderWidth: 1,
                  borderColor: index === 0 ? color + '80' : 'rgba(150, 177, 214, 0.16)',
                  backgroundColor: index === 0 ? 'rgba(8, 18, 34, 0.68)' : 'rgba(8, 18, 34, 0.38)',
                  paddingHorizontal: 10,
                  paddingVertical: 9,
                  gap: 6,
                  opacity: pressed ? 0.78 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '24', borderWidth: 1, borderColor: color + '65' }}>
                    <Text style={{ color, fontSize: 12, fontWeight: '800' }}>{number.format(index + 1)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text numberOfLines={2} style={{ color: p.text, fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: fa ? 'right' : 'left' }}>{idea.topic}</Text>
                    <Text numberOfLines={1} style={{ color, fontSize: 10, fontWeight: '600', textAlign: fa ? 'right' : 'left' }}>
                      {assessmentLabel(idea.assessment, fa)}{idea.ideaCategory ? ' · ' + idea.ideaCategory : ''}
                    </Text>
                  </View>
                  {score !== undefined ? (
                    <View style={{ alignItems: 'flex-end', minWidth: 45 }}>
                      <Text style={{ color, fontWeight: '800', fontSize: 14 }}>{number.format(score)}</Text>
                      <Text style={{ color: p.muted, fontSize: 8 }}>{fa ? 'اولویت / ۱۰۰' : 'PRIORITY / 100'}</Text>
                    </View>
                  ) : null}
                </View>
                {score !== undefined ? (
                  <View style={{ height: 5, borderRadius: 5, backgroundColor: 'rgba(145, 166, 198, 0.20)', overflow: 'hidden' }}>
                    <View style={{ height: 5, width: String(score) + '%', borderRadius: 5, backgroundColor: color }} />
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
                  {reason ? <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: p.muted, fontSize: 9 }}>{reason}</Text> : null}
                  <Text numberOfLines={1} style={{ color: p.muted, fontSize: 9 }}>{sourceLabel}</Text>
                </View>
              </Pressable>
            );
          })}
          {ranked.length > 6 ? <Action secondary onPress={() => router.push('/opportunities')}>{fa ? 'همه پیشنهادها' : 'All suggestions'}</Action> : null}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Txt muted>{fa ? 'هنوز پیشنهاد رتبه‌بندی‌شده‌ای در این موضوع ثبت نشده است.' : 'No ranked suggestions are available for this focus yet.'}</Txt>
          <Action onPress={() => router.push({ pathname: '/youtube', params: { topic } })}>{fa ? 'شروع تحقیق' : 'Start research'}</Action>
        </View>
      )}

      {analysis ? (
        <View style={{ gap: 9, borderTopWidth: 1, borderTopColor: 'rgba(160, 181, 211, 0.22)', paddingTop: 11 }}>
          <Heading>{fa ? 'شبکهٔ شواهد و ارتباط‌ها' : 'Evidence relationship network'}</Heading>
          <ResearchKnowledgeGraph topic={topic} news={news} videos={videos} analysis={analysis} language={language} generatedIdeas={ranked} />
        </View>
      ) : null}
    </Panel>
  );
}

export const ResearchOverviewChart = memo(SuggestionIntelligenceChart);
