import { memo, useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { Panel, Heading, Txt, Action, BadgeText } from '@/components/ScoutUI';
import { ResearchKnowledgeGraph } from '@/components/ResearchKnowledgeGraph';
import { palette as p } from '@/lib/theme';
import { rankDashboardIdeas } from '@/lib/dashboard';
import { getEditorialPriorityBand } from '@/lib/editorial-priority';
import type { Idea } from '@/lib/types';
import type { InternalResearchResult } from '@/lib/engine';
import type { SpaceNewsItem, WikiSignal } from '@/lib/space';
import type { YouTubeSampleVideo } from '@/lib/api';
import { setSelectedIdeaId, useSelectedIdeaId } from '@/lib/idea-selection';

function reasonLine(idea: Idea): string {
  return idea.engineScoreReason?.split(';').slice(0, 2).join(' • ') ??
    'Score is based on the available topic match, source mix and dated evidence.';
}

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
  const scored = useMemo(
    () => ranked.filter((idea) => typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore)),
    [ranked],
  );
  const [activeIdeaId, setActiveIdeaId] = useState<string | undefined>(selectedIdeaId ?? sharedSelectedIdeaId);
  useEffect(() => {
    const next = selectedIdeaId ?? sharedSelectedIdeaId;
    if (next) setActiveIdeaId(next);
  }, [selectedIdeaId, sharedSelectedIdeaId]);
  const bestIdea = scored[0];
  const bands = useMemo(() => ({
    strong: scored.filter((idea) => getEditorialPriorityBand(idea.engineScore ?? 0) === 'strong').length,
    moderate: scored.filter((idea) => getEditorialPriorityBand(idea.engineScore ?? 0) === 'moderate').length,
    weak: scored.filter((idea) => getEditorialPriorityBand(idea.engineScore ?? 0) === 'weak').length,
  }), [scored]);
  const number = (value: number) => new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(value);

  return (
    <Panel variant="hero">
      <View style={{ gap: 5 }}>
        <BadgeText>{label('EDITORIAL PRIORITY · EVIDENCE ONLY', 'اولویت تحریری · مبتنی بر شواهد')}</BadgeText>
        <Heading>
          {bestIdea
            ? label('Best editorial lead: ', 'بهترین ایده تحریری: ') + bestIdea.topic
            : label('No scored idea yet', 'هنوز ایده امتیازدار نداریم')}
        </Heading>
        <Txt muted>
          {bestIdea
            ? number(bestIdea.engineScore ?? 0) + '/100 · ' + label('priority score', 'امتیاز اولویت') + ' · ' + reasonLine(bestIdea)
            : label('Run a real research sample to generate explainable, evidence-backed ideas.', 'برای تولید ایده‌های قابل توضیح، ابتدا یک نمونه تحقیق واقعی اجرا کن.')}
        </Txt>
      </View>
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
          onSelectIdea={(id) => {
            setActiveIdeaId(id);
            setSelectedIdeaId(id);
          }}
        />
      ) : (
        <Txt muted>{label('The evidence map appears after a topic-linked research sample is available.', 'نقشه شواهد پس از در دسترس قرار گرفتن نمونه تحقیق موضوع‌محور نمایش داده می‌شود.')}</Txt>
      )}
      <Action secondary onPress={() => router.push('/opportunities')}>
        {label('Open all ideas', 'مشاهده همه ایده‌ها')}
      </Action>
    </Panel>
  );
});
