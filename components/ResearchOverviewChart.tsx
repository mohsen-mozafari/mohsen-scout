import { memo, useMemo } from 'react';
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
}: {
  analysis?: InternalResearchResult;
  ideas: readonly Idea[];
  topic: string;
  news: readonly SpaceNewsItem[];
  wiki?: WikiSignal;
  videos: readonly YouTubeSampleVideo[];
  language: 'fa' | 'en';
  selectedIdeaId?: string;
}) {
  const fa = language === 'fa';
  const label = (english: string, persian: string) => fa ? persian : english;
  const sharedSelectedIdeaId = useSelectedIdeaId();
  const ranked = useMemo(() => rankDashboardIdeas(ideas), [ideas]);
  const prioritySummary = useMemo(() => summarizeEditorialPriority(ideas), [ideas]);
  const activeIdeaId = selectedIdeaId ?? sharedSelectedIdeaId;
  const number = (value: number) => new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(value);
  return (
    <Panel variant="hero">
      <View style={{ gap: 5 }}>
        <BadgeText>{label('IDEA EVIDENCE MAP · NOT A VIEW FORECAST', 'نقشه شواهد ایده‌ها · نه پیش‌بینی بازدید')}</BadgeText>
        <Heading>{label('How this topic is supported: ', 'شواهد پشتیبان این موضوع: ') + topic}</Heading>
        <Txt muted>
          {label(
            'See how the collected sources support the ranked ideas below. Tap any dot to inspect its evidence. These editorial scores do not estimate audience demand or future views.',
            'ببین منابع گردآوری‌شده چگونه از ایده‌های رتبه‌بندی‌شده پشتیبانی می‌کنند. برای دیدن شواهد هر ایده، نقطه‌اش را لمس کن. امتیاز تحریری، تقاضای مخاطب یا بازدید آینده را پیش‌بینی نمی‌کند.',
          )}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        <View style={{ flexGrow: 1, minWidth: 72, borderRadius: 10, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingHorizontal: 11, paddingVertical: 10 }}>
          <Text style={{ color: p.text, fontSize: 23, fontWeight: '800' }}>{number(prioritySummary.scored)}</Text>
          <Text style={{ color: p.muted, fontSize: 10, fontWeight: '700' }}>{label('SCORED IDEAS', 'ایده‌های امتیازدار')}</Text>
        </View>
        <View style={{ flexGrow: 1, minWidth: 65, borderRadius: 10, borderWidth: 1, borderColor: p.successLine, backgroundColor: p.surface, paddingHorizontal: 11, paddingVertical: 10 }}>
          <Text style={{ color: p.success, fontSize: 23, fontWeight: '800' }}>{number(prioritySummary.strong)}</Text>
          <Text style={{ color: p.muted, fontSize: 10, fontWeight: '700' }}>{label('STRONG', 'قوی')}</Text>
        </View>
        <View style={{ flexGrow: 1, minWidth: 65, borderRadius: 10, borderWidth: 1, borderColor: p.cyanLine, backgroundColor: p.surface, paddingHorizontal: 11, paddingVertical: 10 }}>
          <Text style={{ color: p.cyan, fontSize: 23, fontWeight: '800' }}>{number(prioritySummary.moderate)}</Text>
          <Text style={{ color: p.muted, fontSize: 10, fontWeight: '700' }}>{label('MEDIUM', 'متوسط')}</Text>
        </View>
        <View style={{ flexGrow: 1, minWidth: 65, borderRadius: 10, borderWidth: 1, borderColor: p.dangerLine, backgroundColor: p.surface, paddingHorizontal: 11, paddingVertical: 10 }}>
          <Text style={{ color: p.danger, fontSize: 23, fontWeight: '800' }}>{number(prioritySummary.weak)}</Text>
          <Text style={{ color: p.muted, fontSize: 10, fontWeight: '700' }}>{label('WEAK', 'ضعیف')}</Text>
        </View>
      </View>
      <Txt muted>{label(
        'Score bands: Strong 85–100 · Medium 65–84 · Weak below 65. Scores rank editorial readiness from relevance, evidence breadth, freshness and differentiation; they are not view forecasts.',
        'Strong: 85–100 · Medium: 65–84 · Weak: below 65. Scores rank editorial readiness using relevance, evidence breadth, freshness and differentiation; they do not predict views.',
      )}</Txt>
      {prioritySummary.unscored > 0 ? (
        <Txt muted>{number(prioritySummary.unscored) + ' ' + label('active idea(s) have no score yet and are excluded from the four totals.', 'ایده فعال هنوز امتیاز ندارد و در چهار شمارنده بالا محاسبه نشده است.')}</Txt>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {[
          { id: 'reports', value: news.length, title: label('publisher reports', 'گزارش ناشران') },
          { id: 'videos', value: videos.length, title: label('YouTube samples', 'نمونه‌های YouTube') },
          { id: 'wiki', value: wiki?.monthlyViews.length ?? 0, title: label('Wikimedia months', 'ماه‌های ویکی‌مدیا') },
        ].map((metric) => (
          <View key={metric.id} style={{ borderRadius: 8, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingHorizontal: 9, paddingVertical: 6 }}>
            <Text style={{ color: p.text, fontSize: 12, fontWeight: '800' }}>{number(metric.value)} <Text style={{ color: p.muted, fontSize: 9, fontWeight: '600' }}>{metric.title}</Text></Text>
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
      <Action secondary onPress={() => router.push('/opportunities')}>
        {label('Open all ideas', 'مشاهده همه ایده‌ها')}
      </Action>
    </Panel>
  );
});
