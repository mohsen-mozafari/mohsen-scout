import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { Panel, Heading, Txt, Action, BadgeText } from '@/components/ScoutUI';
import { ResearchKnowledgeGraph } from '@/components/ResearchKnowledgeGraph';
import { palette as p } from '@/lib/theme';
import { rankDashboardIdeas } from '@/lib/dashboard';
import { summarizeEditorialPriority } from '@/lib/editorial-priority';
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
    () => ranked.filter((idea) => typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore)).slice(0, 3),
    [ranked],
  );
  const scored = useMemo(
    () => ranked.filter((idea) => typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore)),
    [ranked],
  );
  const activeIdeaId = selectedIdeaId ?? sharedSelectedIdeaId;
  const bands = useMemo(() => summarizeEditorialPriority(ranked), [ranked]);
  const number = (value: number) => new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(value);
  const evidenceMetrics = [
    { id: 'publisher-reports', title: label('PUBLISHER REPORTS', 'گزارش ناشران'), value: news.length },
    { id: 'youtube-samples', title: label('YOUTUBE SAMPLES', 'نمونه‌های YouTube'), value: videos.length },
    { id: 'wikimedia-months', title: label('WIKIMEDIA MONTHS', 'ماه‌های ویکی‌مدیا'), value: wiki?.monthlyViews.length ?? 0 },
    { id: 'engine-evidence', title: label('ENGINE EVIDENCE', 'شواهد موتور'), value: analysis?.evidence.length ?? 0 },
    { id: 'entities', title: label('ENTITIES', 'موجودیت‌ها'), value: analysis?.entityCandidates.length ?? 0 },
    { id: 'editorial-angles', title: label('EDITORIAL ANGLES', 'زاویه‌های محتوایی'), value: analysis?.angles.length ?? 0 },
    { id: 'verification-checks', title: label('VERIFICATION CHECKS', 'پرسش‌های راستی‌آزمایی'), value: analysis?.verificationQuestions.length ?? 0 },
    { id: 'research-gaps', title: label('RESEARCH GAPS', 'خلأهای تحقیق'), value: (analysis?.intelligence.gaps.length ?? 0) + (analysis?.intelligence.potentialContradictions.length ?? 0) },
  ];
  const maxEvidenceMetric = Math.max(1, ...evidenceMetrics.map((metric) => metric.value));

  return (
    <Panel variant="hero">
      <View style={{ gap: 5 }}>
        <BadgeText>{label('MULTI-SOURCE RESEARCH GRAPH · EVIDENCE ONLY', 'گراف تحقیق چندمنبعی · مبتنی بر شواهد')}</BadgeText>
        <Heading>{label('Research graph: ', 'نمودار تحقیق: ') + topic}</Heading>
        <Txt muted>
          {label(
            'Explore how publisher reports, YouTube samples, Wikimedia observations, entities and editorial hypotheses connect. Priority scores are not audience-demand or view forecasts.',
            'ارتباط گزارش ناشران، نمونه‌های YouTube، مشاهدات ویکی‌مدیا، موجودیت‌ها و فرضیه‌های محتوایی را بررسی کن. امتیاز اولویت، پیش‌بینی تقاضا یا بازدید نیست.',
          )}
        </Txt>
      </View>
      {topRecommendations.length ? (
        <View style={{ gap: 7 }}>
          <Heading>{label('Top evidence-backed ideas', 'ایده‌های برتر بر پایه شواهد')}</Heading>
          <View style={{ borderRadius: 11, borderWidth: 1, borderColor: p.accent, backgroundColor: p.surface, padding: 11, gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <BadgeText>{label('TOP EDITORIAL PICK', 'اولویت نخست تحریری')}</BadgeText>
              <Text style={{ color: p.accent, fontSize: 11, fontWeight: '800' }}>
                {number(topRecommendations[0].engineScore ?? 0) + '/100 · ' + label('editorial priority', 'اولویت تحریری')}
              </Text>
            </View>
            <Text style={{ color: p.text, fontSize: 14, fontWeight: '800' }}>{topRecommendations[0].topic}</Text>
            <Txt muted>{topRecommendations[0].concept}</Txt>
            {topRecommendations[0].engineScoreReason
              ? <Txt muted>{topRecommendations[0].engineScoreReason.split(';').slice(0, 2).join(' · ')}</Txt>
              : null}
            <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: topRecommendations[0].id } })}>
              {label('Review idea and evidence', 'بررسی ایده و شواهد')}
            </Action>
          </View>
          {topRecommendations.length > 1 ? (
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, padding: 10, gap: 7 }}>
              {topRecommendations.slice(1).map((idea, index) => (
                <View key={idea.id} style={{ borderBottomWidth: index === topRecommendations.length - 2 ? 0 : 1, borderBottomColor: p.borderSoft, paddingVertical: 6, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 }}>
                    <BadgeText>{label('PICK', 'اولویت') + ' #' + (index + 2)}</BadgeText>
                    <Text style={{ color: p.muted, fontSize: 10, fontWeight: '700' }}>{number(idea.engineScore ?? 0) + '/100'}</Text>
                  </View>
                  <Text style={{ color: p.text, fontSize: 12, fontWeight: '700' }}>{idea.topic}</Text>
                  <Txt muted>{idea.concept}</Txt>
                  <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: idea.id } })}>
                    {label('Open idea', 'مشاهده ایده')}
                  </Action>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <Txt muted>{label('No scored engine-generated idea is available yet. Complete a research pass to create evidence-backed recommendations.', 'هنوز ایده امتیازدار تولیدشده توسط موتور وجود ندارد. یک مرحله تحقیق را تکمیل کن تا پیشنهادهای مستند ساخته شوند.')}</Txt>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        <View style={{ borderRadius: 10, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ color: p.text, fontSize: 16, fontWeight: '800' }}>{number(scored.length)}</Text>
          <Text style={{ color: p.muted, fontSize: 9 }}>{label('SCORED IDEAS', 'ایده امتیازدار')}</Text>
        </View>
        <View style={{ borderRadius: 10, borderWidth: 1, borderColor: p.successLine, backgroundColor: p.surface, paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ color: p.success, fontSize: 16, fontWeight: '800' }}>{number(bands.strong)}</Text>
          <Text style={{ color: p.muted, fontSize: 9 }}>{label('STRONG', 'قوی')}</Text>
        </View>
        <View style={{ borderRadius: 10, borderWidth: 1, borderColor: p.cyanLine, backgroundColor: p.surface, paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ color: p.cyan, fontSize: 16, fontWeight: '800' }}>{number(bands.moderate)}</Text>
          <Text style={{ color: p.muted, fontSize: 9 }}>{label('MEDIUM', 'متوسط')}</Text>
        </View>
        <View style={{ borderRadius: 10, borderWidth: 1, borderColor: p.dangerLine, backgroundColor: p.surface, paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ color: p.danger, fontSize: 16, fontWeight: '800' }}>{number(bands.weak)}</Text>
          <Text style={{ color: p.muted, fontSize: 9 }}>{label('WEAK', 'ضعیف')}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {evidenceMetrics.map((metric) => (
          <View
            key={metric.id}
            style={{
              flexGrow: 1,
              flexBasis: 100,
              minWidth: 88,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: p.border,
              backgroundColor: p.surface,
              paddingHorizontal: 10,
              paddingVertical: 8,
              gap: 6,
            }}
          >
            <Text style={{ color: p.text, fontSize: 16, fontWeight: '800' }}>{number(metric.value)}</Text>
            <Text style={{ color: p.muted, fontSize: 9 }}>{metric.title}</Text>
            <View style={{ height: 5, borderRadius: 4, backgroundColor: p.surfaceAlt, overflow: 'hidden' }}>
              <View style={{ height: 5, width: Math.round(metric.value / maxEvidenceMetric * 100) + '%', borderRadius: 4, backgroundColor: p.accent }} />
            </View>
          </View>
        ))}
      </View>
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
