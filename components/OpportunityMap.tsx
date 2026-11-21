import { memo, useCallback, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Panel, Txt, BadgeText } from '@/components/ScoutUI';
import { palette as p } from '@/lib/theme';
import type { OpportunityScore, SourceCoverage, Topic } from '@/lib/engine-v2';
import type { Idea } from '@/lib/types';

/**
 * Bounded, real-data opportunity map. Every number shown here is taken from the
 * one unified brief (topic scores + source coverage); no graph of raw evidence
 * is built and no value is fabricated when an input is missing.
 */
export type OpportunityMapProps = {
  topics: readonly Topic[];
  scores: readonly OpportunityScore[];
  ideas: readonly Idea[];
  coverage: readonly SourceCoverage[];
  language: 'fa' | 'en';
  onSelectIdea?: (id: string) => void;
};

const ratioToPercent = (value: number | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(0, Math.min(1, value)) * 100)
    : undefined;

export const OpportunityMap = memo(function OpportunityMap({
  topics,
  scores,
  ideas,
  coverage,
  language,
  onSelectIdea,
}: OpportunityMapProps) {
  const fa = language === 'fa';
  const label = useCallback((english: string, persian: string) => fa ? persian : english, [fa]);
  const number = useCallback(
    (value: number) => new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(value),
    [fa],
  );

  const scoreByTopic = useMemo(
    () => new Map(scores.map((score) => [score.topicId, score])),
    [scores],
  );

  const rows = useMemo(() => {
    return [...topics]
      .map((topic) => {
        const score = scoreByTopic.get(topic.id);
        return {
          topic,
          score: score && Number.isFinite(score.value) ? score.value : undefined,
        };
      })
      .filter((row) => row.score !== undefined)
      .sort((left, right) =>
        (right.score ?? 0) - (left.score ?? 0) || left.topic.id.localeCompare(right.topic.id))
      .slice(0, 6)
      .map((row) => {
        const terms = [...row.topic.keywords, row.topic.label]
          .map((term) => term.trim().toLowerCase())
          .filter(Boolean);
        const idea = terms.length
          ? ideas.find((candidate) => {
            const haystack = (candidate.topic + ' ' + candidate.concept).toLowerCase();
            return terms.some((term) => haystack.includes(term));
          })
          : undefined;
        return { ...row, idea };
      });
  }, [topics, scoreByTopic, ideas]);

  const coverageLine = useMemo(() => coverage
    .map((entry) => {
      const name = entry.source === 'news'
        ? label('News', 'خبر')
        : entry.source === 'youtube'
          ? 'YouTube'
          : label('Wiki', 'ویکی');
      const fetched = Number.isFinite(entry.fetched) ? entry.fetched : 0;
      const normalized = Number.isFinite(entry.normalized) ? entry.normalized : 0;
      return name + ' ' + number(normalized) + '/' + number(fetched);
    })
    .filter(Boolean)
    .join(' · '), [coverage, label, number]);

  return (
    <Panel variant="soft">
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <BadgeText>{label('OPPORTUNITY MAP · REAL DATA', 'نقشه فرصت · داده واقعی')}</BadgeText>
        </View>
        <Txt muted>{coverageLine || label('No source coverage recorded for this brief.', 'برای این تحلیل پوشش منبعی ثبت نشده است.')}</Txt>
        {rows.length ? rows.map(({ topic, score, idea }) => {
          const width = Math.max(0, Math.min(100, score ?? 0));
          const momentum = ratioToPercent(topic.momentum);
          const supplyGap = ratioToPercent(topic.supplyGap);
          const evidenceCount = Array.isArray(topic.itemIds) ? topic.itemIds.length : undefined;
          const evidence = (idea?.engineV2Evidence ?? []).slice(0, 2);
          const facts = [
            momentum !== undefined ? label('momentum', 'روند') + ' ' + momentum + '%' : '',
            supplyGap !== undefined ? label('supply gap', 'کمبود عرضه') + ' ' + supplyGap + '%' : '',
            evidenceCount !== undefined ? label('evidence', 'شاهد') + ' ' + number(evidenceCount) : '',
          ].filter(Boolean);
          return (
            <Pressable
              key={topic.id}
              onPress={idea && onSelectIdea ? () => onSelectIdea(idea.id) : undefined}
              disabled={!idea || !onSelectIdea}
              accessibilityRole={idea && onSelectIdea ? 'button' : undefined}
              style={{ borderRadius: 10, borderWidth: 1, borderColor: p.borderSoft, backgroundColor: p.surface, padding: 10, gap: 6 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <Text style={{ color: p.text, fontSize: 13, fontWeight: '800', flexShrink: 1 }}>{topic.label}</Text>
                {score !== undefined
                  ? <Text style={{ color: p.accent, fontSize: 12, fontWeight: '800' }}>{number(Math.round(score))}/100</Text>
                  : null}
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: p.surfaceAlt, overflow: 'hidden' }}>
                <View style={{ width: width + '%', height: 6, borderRadius: 3, backgroundColor: p.accent }} />
              </View>
              {facts.length ? <Txt muted>{facts.join(' · ')}</Txt> : null}
              {evidence.map((item, index) => {
                const views = typeof item.views === 'number' && Number.isFinite(item.views) && item.views > 0
                  ? number(Math.round(item.views)) + (fa ? ' بازدید' : ' views')
                  : '';
                const line = [item.title, item.source, views].filter(Boolean).join(' · ');
                return <Txt muted key={index}>{line}</Txt>;
              })}
              {!idea
                ? <Txt muted>{label('No directly linked idea for this topic yet.', 'هنوز ایدهای مستقیم برای این موضوع ثبت نشده است.')}</Txt>
                : null}
            </Pressable>
          );
        }) : (
          <Txt muted>{label('No scored topics are available in this brief.', 'در این تحلیل موضوع امتیازداری در دسترس نیست.')}</Txt>
        )}
      </View>
    </Panel>
  );
});
