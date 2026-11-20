import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { router } from 'expo-router';
import { resolveTextDirection } from '@/lib/i18n';
import { palette as p } from '@/lib/theme';
import { buildResearchGraphModel, type BuildResearchGraphInput, type ResearchGraphNode } from '@/lib/research-graph';
import { EDITORIAL_PRIORITY_CONFIG, getEditorialPriorityBand } from '@/lib/editorial-priority';
import type { InternalResearchResult } from '@/lib/engine';
import type { SpaceNewsItem, WikiSignal } from '@/lib/space';
import type { YouTubeSampleVideo } from '@/lib/api';
import type { Idea } from '@/lib/types';
import { Action } from '@/components/ScoutUI';
import { setSelectedIdeaId } from '@/lib/idea-selection';

type PriorityFilter = 'all' | 'strong' | 'moderate' | 'weak';

type IdeaConnections = {
  nodes: ResearchGraphNode[];
  directEvidenceCount: number;
  relationKinds: number;
};

function DirectionalText({ value, style }: { value: string; style?: StyleProp<TextStyle> }) {
  const direction = resolveTextDirection(value);
  return (
    <Text style={[
      { color: p.text, fontSize: 13, lineHeight: 20, flexShrink: 1, writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' },
      style,
    ]}>{value}</Text>
  );
}

const BAND_COLORS = {
  strong: p.success,
  moderate: p.cyan,
  weak: p.danger,
} as const;

export function ResearchKnowledgeGraph({
  topic,
  news,
  wiki,
  videos,
  analysis,
  language,
  generatedIdeas,
  selectedIdeaId,
  onSelectIdea,
}: {
  topic: string;
  news: readonly SpaceNewsItem[];
  wiki?: WikiSignal;
  videos: readonly YouTubeSampleVideo[];
  analysis: InternalResearchResult;
  language: 'fa' | 'en';
  generatedIdeas?: readonly Idea[];
  selectedIdeaId?: string;
  onSelectIdea?: (id: string) => void;
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const fa = language === 'fa';
  const label = (english: string, persian: string) => fa ? persian : english;
  const [filter, setFilter] = useState<PriorityFilter>('all');
  const [localSelectedId, setLocalSelectedId] = useState<string>();
  const number = (value: number) => new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US').format(value);

  const scoredIdeas = useMemo(
    () => (generatedIdeas ?? [])
      .filter((idea) => typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore))
      .slice()
      .sort((a, b) => (b.engineScore ?? -1) - (a.engineScore ?? -1) || b.createdAt - a.createdAt),
    [generatedIdeas],
  );
  const counts = useMemo(() => ({
    strong: scoredIdeas.filter((idea) => getEditorialPriorityBand(idea.engineScore ?? 0) === 'strong').length,
    moderate: scoredIdeas.filter((idea) => getEditorialPriorityBand(idea.engineScore ?? 0) === 'moderate').length,
    weak: scoredIdeas.filter((idea) => getEditorialPriorityBand(idea.engineScore ?? 0) === 'weak').length,
  }), [scoredIdeas]);
  const filteredIdeas = useMemo(
    () => filter === 'all'
      ? scoredIdeas
      : scoredIdeas.filter((idea) => getEditorialPriorityBand(idea.engineScore ?? 0) === filter),
    [filter, scoredIdeas],
  );
  const plottedIdeas = useMemo(
    () => filteredIdeas.slice(0, EDITORIAL_PRIORITY_CONFIG.chartLimit),
    [filteredIdeas],
  );
  const groupedIdeas = useMemo(() => filteredIdeas.slice(EDITORIAL_PRIORITY_CONFIG.chartLimit), [filteredIdeas]);
  const groupedCounts = useMemo(() => ({
    strong: groupedIdeas.filter((idea) => getEditorialPriorityBand(idea.engineScore ?? 0) === 'strong').length,
    moderate: groupedIdeas.filter((idea) => getEditorialPriorityBand(idea.engineScore ?? 0) === 'moderate').length,
    weak: groupedIdeas.filter((idea) => getEditorialPriorityBand(idea.engineScore ?? 0) === 'weak').length,
  }), [groupedIdeas]);
  const graphWidth = Math.max(260, Math.min(720, viewportWidth - 64));
  const monthlyChart = useMemo(() => {
    const series = (wiki?.monthlyViews ?? [])
      .filter((point) => Number.isFinite(point.views) && point.views >= 0 && /^\d{4}-\d{2}$/.test(point.month))
      .slice(-18);
    if (!series.length) return undefined;
    const left = 42;
    const right = 12;
    const top = 14;
    const bottom = 92;
    const maxValue = Math.max(1, ...series.map((point) => point.views));
    const points = series.map((point, index) => ({
      ...point,
      x: left + (series.length === 1 ? 0 : index / (series.length - 1)) * (graphWidth - left - right),
      y: bottom - (point.views / maxValue) * (bottom - top),
    }));
    return {
      points,
      maxValue,
      path: points.map((point, index) => (index ? 'L ' : 'M ') + point.x.toFixed(2) + ' ' + point.y.toFixed(2)).join(' '),
      tickIndexes: [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])],
    };
  }, [wiki, graphWidth]);
  const topVideoSamples = useMemo(
    () => videos
      .filter((video) => typeof video.viewCount === 'number' && Number.isFinite(video.viewCount) && video.viewCount >= 0)
      .slice()
      .sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1) || a.id.localeCompare(b.id))
      .slice(0, 6),
    [videos],
  );
  const maxVideoViews = Math.max(1, ...topVideoSamples.map((video) => video.viewCount ?? 0));

  // The graph is deliberately bounded and its rebuild is debounced. Positions are
  // calculated once per input change; there is no physics loop or animated layout.
  const graphInput = useMemo<BuildResearchGraphInput>(() => ({
    topic,
    news,
    wiki,
    videos,
    analysis,
    language,
    generatedIdeas: scoredIdeas,
  }), [topic, news, wiki, videos, analysis, language, scoredIdeas]);
  const [debouncedInput, setDebouncedInput] = useState<BuildResearchGraphInput>(() => graphInput);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInput(graphInput), EDITORIAL_PRIORITY_CONFIG.chartDebounceMs);
    return () => clearTimeout(timer);
  }, [graphInput]);
  const model = useMemo(() => buildResearchGraphModel(debouncedInput), [debouncedInput]);

  const connectionsByIdea = useMemo(() => {
    const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
    const adjacency = new Map<string, Set<string>>();
    const connect = (from: string, to: string) => {
      const neighbors = adjacency.get(from) ?? new Set<string>();
      neighbors.add(to);
      adjacency.set(from, neighbors);
    };
    for (const edge of model.edges) {
      connect(edge.source, edge.target);
      connect(edge.target, edge.source);
    }
    const output = new Map<string, IdeaConnections>();
    for (const idea of plottedIdeas) {
      const ideaNodeId = 'idea-' + idea.id;
      const directIds = new Set(adjacency.get(ideaNodeId) ?? []);
      // One adjacency hop preserves every stored publisher, evidence, entity,
      // finding, editorial-angle and cross-source relationship without rescanning edges.
      const relatedIds = new Set(directIds);
      for (const id of directIds) {
        const type = nodeById.get(id)?.type;
        // Generic evidence summary nodes connect every idea to the whole corpus.
        // The Wikimedia summary is a specific exception: it points to one article.
        if (!['news', 'youtube', 'context', 'entity', 'publisher'].includes(type ?? '') && id !== 'evidence-wikimedia') continue;
        for (const otherId of adjacency.get(id) ?? []) {
          if (otherId !== ideaNodeId && otherId !== 'topic-root' && !otherId.startsWith('idea-')) {
            relatedIds.add(otherId);
          }
        }
      }
      // Preserve explicit co-mention edges between entities one hop beyond the
      // evidence/source node that introduced the entity to this idea.
      const linkedEntities = [...relatedIds].filter((id) => nodeById.get(id)?.type === 'entity');
      for (const entityId of linkedEntities) {
        for (const otherId of adjacency.get(entityId) ?? []) {
          if (nodeById.get(otherId)?.type === 'entity') relatedIds.add(otherId);
        }
      }
      const nodes = [...relatedIds]
        .map((id) => nodeById.get(id))
        .filter((node): node is ResearchGraphNode => Boolean(node))
        .filter((node) => node.type !== 'topic');
      const directEvidenceCount = [...directIds]
        .map((id) => nodeById.get(id))
        .filter((node) => node && ['news', 'youtube', 'context'].includes(node.type)).length;
      output.set(idea.id, {
        nodes,
        directEvidenceCount,
        relationKinds: new Set(nodes
          .filter((node) => ['news', 'youtube', 'context', 'entity', 'publisher'].includes(node.type))
          .map((node) => node.type)).size,
      });
    }
    return output;
  }, [model, plottedIdeas]);

  const graphEdgePairs = useMemo(() => {
    const pairs = new Set<string>();
    for (const edge of model.edges) {
      pairs.add(edge.source + '\\u0000' + edge.target);
      pairs.add(edge.target + '\\u0000' + edge.source);
    }
    return pairs;
  }, [model.edges]);

  const chart = useMemo(() => {
    const left = 34;
    const right = 12;
    const top = 18;
    const bottom = 196;
    const plotWidth = graphWidth - left - right;
    const maxRelationshipTypes = Math.max(1, ...[...connectionsByIdea.values()].map((item) => item.relationKinds));
    const points = plottedIdeas.map((idea, index) => {
      const score = Math.max(0, Math.min(100, idea.engineScore ?? 0));
      const connections = connectionsByIdea.get(idea.id);
      const diversity = Math.max(1, connections?.relationKinds ?? 1);
      const x = left + ((diversity - 1) / Math.max(1, maxRelationshipTypes - 1)) * plotWidth;
      const y = top + (1 - score / 100) * (bottom - top);
      const evidenceCount = connections?.directEvidenceCount ?? 0;
      const radius = Math.max(8, Math.min(16, 8 + Math.sqrt(evidenceCount) * 2.1));
      return { idea, index, x, y, radius, evidenceCount, diversity, color: BAND_COLORS[getEditorialPriorityBand(score)] };
    });
    const positionById = new Map(points.map((point) => [point.idea.id, point]));
    const lines: { id: string; x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length && lines.length < 64; j++) {
        const first = (connectionsByIdea.get(points[i].idea.id)?.nodes ?? [])
          .filter((node) => ['news', 'youtube', 'context', 'entity', 'publisher'].includes(node.type));
        const second = (connectionsByIdea.get(points[j].idea.id)?.nodes ?? [])
          .filter((node) => ['news', 'youtube', 'context', 'entity', 'publisher'].includes(node.type));
        const firstIds = new Set(first.map((node) => node.id));
        const secondIds = new Set(second.map((node) => node.id));
        let sharedType: string | undefined;
        for (const node of first) {
          if (secondIds.has(node.id)) {
            sharedType = node.type;
            break;
          }
        }
        if (!sharedType) {
          let crossRelationship = false;
          for (const firstId of firstIds) {
            for (const secondId of secondIds) {
              if (graphEdgePairs.has(firstId + '\\u0000' + secondId)) {
                crossRelationship = true;
                break;
              }
            }
            if (crossRelationship) break;
          }
          if (crossRelationship) sharedType = 'relationship';
        }
        if (!sharedType) continue;
        const a = positionById.get(points[i].idea.id);
        const b = positionById.get(points[j].idea.id);
        if (!a || !b) continue;
        lines.push({
          id: points[i].idea.id + ':' + points[j].idea.id,
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          color: sharedType === 'entity' ? p.cyan : p.borderSoft,
        });
      }
    }
    return { points, lines, left, right, top, bottom, maxRelationshipTypes };
  }, [plottedIdeas, connectionsByIdea, graphWidth, graphEdgePairs]);

  const hasSelectedProp = Boolean(selectedIdeaId && plottedIdeas.some((idea) => idea.id === selectedIdeaId));
  const selectedId = hasSelectedProp
    ? selectedIdeaId
    : localSelectedId && plottedIdeas.some((idea) => idea.id === localSelectedId)
      ? localSelectedId
      : plottedIdeas[0]?.id;
  const selectedIdea = plottedIdeas.find((idea) => idea.id === selectedId);
  const selectedConnections = selectedIdea ? connectionsByIdea.get(selectedIdea.id) : undefined;
  const selectedReason = selectedIdea?.engineScoreReason?.split(';').slice(0, 2).join(' • ');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsVisible = detailsOpen || Boolean(selectedIdeaId);

  const chooseIdea = (id: string) => {
    setLocalSelectedId(id);
    setSelectedIdeaId(id);
    setDetailsOpen(true);
    onSelectIdea?.(id);
  };
  const selectFilter = (next: PriorityFilter) => {
    setFilter(next);
    setLocalSelectedId(undefined);
    setDetailsOpen(false);
  };
  const unscoredCount = (generatedIdeas?.length ?? 0) - scoredIdeas.length;

  const filters: { id: PriorityFilter; title: string; count: number }[] = [
    { id: 'all', title: label('All', 'همه'), count: scoredIdeas.length },
    { id: 'strong', title: label('Strong', 'قوی'), count: counts.strong },
    { id: 'moderate', title: label('Medium', 'متوسط'), count: counts.moderate },
    { id: 'weak', title: label('Weak', 'ضعیف'), count: counts.weak },
  ];

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <DirectionalText value={label('Editorial evidence map', 'نقشه شواهد و اولویت تحریری')} style={{ fontSize: 17, fontWeight: '700' }} />
        <DirectionalText
          value={label(
            'Vertical: editorial score · horizontal: linked relationship types · bubble area: direct evidence count.',
            'محور عمودی: امتیاز تحریری · محور افقی: تنوع نوع ارتباط‌ها · مساحت حباب: تعداد شواهد مستقیم متصل.',
          )}
          style={{ color: p.muted, fontSize: 11 }}
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {filters.map((item) => {
          const selected = filter === item.id;
          const tint = item.id === 'strong' ? p.success : item.id === 'moderate' ? p.cyan : item.id === 'weak' ? p.danger : p.accent;
          return (
            <Pressable key={item.id} onPress={() => selectFilter(item.id)} accessibilityRole="button" accessibilityState={{ selected }}
              style={{ minHeight: 32, borderRadius: 999, borderWidth: 1, borderColor: selected ? tint : p.border, backgroundColor: selected ? p.raised : p.surface, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ color: selected ? tint : p.muted, fontSize: 11, fontWeight: '700' }}>{item.title}</Text>
              <Text style={{ color: p.text, fontSize: 10, fontWeight: '700' }}>{number(item.count)}</Text>
            </Pressable>
          );
        })}
      </View>
      {plottedIdeas.length ? (
        <>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: graphWidth, height: 232 }}>
              <Svg width={graphWidth} height={232}>
                {[0, 50, 100].map((tick) => {
                  const y = chart.top + (1 - tick / 100) * (chart.bottom - chart.top);
                  return (
                    <Line key={'y-' + tick} x1={chart.left} y1={y} x2={graphWidth - chart.right} y2={y}
                      stroke={p.borderSoft} strokeWidth={1} strokeDasharray="3 5" />
                  );
                })}
                {[1, Math.ceil(chart.maxRelationshipTypes / 2), chart.maxRelationshipTypes].filter((tick, index, values) => values.indexOf(tick) === index).map((tick) => {
                  const x = chart.left + ((tick - 1) / Math.max(1, chart.maxRelationshipTypes - 1)) * (graphWidth - chart.left - chart.right);
                  return <Line key={'x-' + tick} x1={x} y1={chart.top} x2={x} y2={chart.bottom} stroke={p.borderSoft} strokeWidth={0.7} opacity={0.55} />;
                })}
                {chart.lines.map((line) => (
                  <Line key={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                    stroke={line.color} strokeWidth={1.15} opacity={0.58} />
                ))}
                <SvgText x={chart.left - 7} y={chart.top + 4} fill={p.muted} fontSize={9} textAnchor="end">100</SvgText>
                <SvgText x={chart.left - 7} y={(chart.top + chart.bottom) / 2 + 3} fill={p.muted} fontSize={9} textAnchor="end">50</SvgText>
                <SvgText x={chart.left - 7} y={chart.bottom + 3} fill={p.muted} fontSize={9} textAnchor="end">0</SvgText>
                <Circle cx={chart.left} cy={chart.bottom} r={2} fill={p.muted} />
              </Svg>
              {chart.points.map((point) => {
                const selected = point.idea.id === selectedId;
                return (
                  <Pressable key={point.idea.id} onPress={() => chooseIdea(point.idea.id)}
                    accessibilityRole="button"
                    accessibilityLabel={label(
                      point.idea.topic + ', editorial score ' + point.idea.engineScore,
                      point.idea.topic + '، امتیاز تحریری ' + point.idea.engineScore,
                    )}
                    accessibilityState={{ selected }}
                    style={{
                      position: 'absolute',
                      left: point.x - point.radius,
                      top: point.y - point.radius,
                      width: point.radius * 2,
                      height: point.radius * 2,
                      borderRadius: point.radius,
                      borderWidth: selected ? 2.5 : 1.2,
                      borderColor: selected ? p.text : point.color,
                      backgroundColor: point.color,
                      opacity: selected ? 0.96 : 0.68,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Text style={{ color: p.background, fontSize: 9, fontWeight: '800' }}>{selected ? point.idea.engineScore : point.index + 1}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -5 }}>
            <DirectionalText value={label('1 relationship type', '۱ نوع ارتباط')} style={{ color: p.muted, fontSize: 10 }} />
            <DirectionalText value={number(chart.maxRelationshipTypes) + ' ' + label('relationship types', 'نوع ارتباط')} style={{ color: p.muted, fontSize: 10 }} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {model.groups.map((group) => (
              <View key={group.id} style={{ borderRadius: 8, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingHorizontal: 7, paddingVertical: 4 }}>
                <DirectionalText value={group.title + ' · ' + number(group.items.length)} style={{ color: p.muted, fontSize: 9, lineHeight: 13 }} />
              </View>
            ))}
            <View style={{ borderRadius: 8, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingHorizontal: 7, paddingVertical: 4 }}>
              <DirectionalText value={label('Publishers', 'ناشرها') + ' · ' + number(model.nodes.filter((node) => node.type === 'publisher').length)} style={{ color: p.muted, fontSize: 9, lineHeight: 13 }} />
            </View>
            <View style={{ borderRadius: 8, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingHorizontal: 7, paddingVertical: 4 }}>
              <DirectionalText value={label('Graph relations retained', 'روابط حفظ‌شده در گراف') + ' · ' + number(model.edges.length)} style={{ color: p.muted, fontSize: 9, lineHeight: 13 }} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {(['strong', 'moderate', 'weak'] as const).map((band) => (
              <View key={band} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BAND_COLORS[band] }} />
                <DirectionalText value={band === 'strong' ? label('Strong', 'قوی') : band === 'moderate' ? label('Medium', 'متوسط') : label('Weak', 'ضعیف')} style={{ color: p.muted, fontSize: 10 }} />
              </View>
            ))}
            <DirectionalText value={label('Lines = shared evidence / graph relation', 'خطوط = شاهد مشترک یا رابطه ثبت‌شده در گراف')} style={{ color: p.muted, fontSize: 10 }} />
          </View>
          {monthlyChart ? (
            <View style={{ gap: 7, borderTopWidth: 1, borderTopColor: p.borderSoft, paddingTop: 12 }}>
              <DirectionalText value={label('Wikimedia monthly article pageviews', 'بازدید ماهانه مقاله در ویکی‌مدیا')} style={{ fontSize: 14, fontWeight: '700' }} />
              <DirectionalText value={label('Raw observations from this language edition · zero-based vertical scale · no forecast', 'مشاهدات خام همین نسخه زبانی · محور عمودی از صفر · بدون پیش‌بینی')} style={{ color: p.muted, fontSize: 10 }} />
              <View style={{ alignItems: 'center' }}>
                <Svg width={graphWidth} height={112}>
                  {[0, 0.5, 1].map((fraction) => {
                    const y = 92 - fraction * 78;
                    return <Line key={'monthly-grid-' + fraction} x1={42} y1={y} x2={graphWidth - 12} y2={y} stroke={p.borderSoft} strokeWidth={0.8} strokeDasharray="3 5" />;
                  })}
                  <Path d={monthlyChart.path} fill="none" stroke={p.cyan} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                  {monthlyChart.points.map((point) => (
                    <Circle key={point.month} cx={point.x} cy={point.y} r={3.3} fill={p.cyan} />
                  ))}
                  <SvgText x={36} y={16} fill={p.muted} fontSize={8} textAnchor="end">{number(monthlyChart.maxValue)}</SvgText>
                  <SvgText x={36} y={95} fill={p.muted} fontSize={8} textAnchor="end">0</SvgText>
                  {monthlyChart.tickIndexes.map((index) => {
                    const point = monthlyChart.points[index];
                    return <SvgText key={point.month} x={point.x} y={108} fill={p.muted} fontSize={8} textAnchor="middle">{point.month.slice(2)}</SvgText>;
                  })}
                </Svg>
              </View>
              <DirectionalText
                value={label(
                  'Latest observed month: ' + monthlyChart.points[monthlyChart.points.length - 1].month + ' · ' + number(monthlyChart.points[monthlyChart.points.length - 1].views) + ' article pageviews',
                  'آخرین ماه مشاهده‌شده: ' + monthlyChart.points[monthlyChart.points.length - 1].month + ' · ' + number(monthlyChart.points[monthlyChart.points.length - 1].views) + ' بازدید مقاله',
                )}
                style={{ color: p.muted, fontSize: 10 }}
              />
            </View>
          ) : null}
          {topVideoSamples.length ? (
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: p.borderSoft, paddingTop: 12 }}>
              <DirectionalText value={label('Highest raw-view counts in the retained YouTube sample', 'بیشترین تعداد خام بازدید در نمونه نگهداری‌شده YouTube')} style={{ fontSize: 14, fontWeight: '700' }} />
              <DirectionalText value={label('Each bar is scaled against the largest returned sample count; this is not a views-per-hour or growth metric.', 'طول هر میله نسبت به بیشترین عدد نمونه دریافت‌شده مقیاس شده است؛ این سنجه بازدید ساعتی یا رشد نیست.')} style={{ color: p.muted, fontSize: 10 }} />
              {topVideoSamples.map((video) => {
                const views = video.viewCount ?? 0;
                return (
                  <View key={video.id} style={{ gap: 4 }}>
                    <DirectionalText value={video.title} style={{ fontSize: 11, fontWeight: '600' }} />
                    <View style={{ height: 8, borderRadius: 5, backgroundColor: p.surfaceAlt, overflow: 'hidden' }}>
                      <View style={{ height: 8, width: Math.max(2, views / maxVideoViews * 100) + '%', borderRadius: 5, backgroundColor: p.accent }} />
                    </View>
                    <DirectionalText value={number(views) + ' ' + label('views', 'بازدید') + (video.channel ? ' · ' + video.channel : '')} style={{ color: p.muted, fontSize: 10 }} />
                  </View>
                );
              })}
            </View>
          ) : null}
          {groupedIdeas.length ? (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, padding: 11, gap: 7 }}>
              <DirectionalText
                value={label(
                  groupedIdeas.length + ' additional ideas are grouped instead of being individually drawn.',
                  groupedIdeas.length + ' ایدهٔ دیگر برای جلوگیری از شلوغی به‌صورت خوشه نگه داشته شده‌اند.',
                )}
                style={{ fontWeight: '700', fontSize: 11 }}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {([
                  ['strong', groupedCounts.strong, p.success],
                  ['moderate', groupedCounts.moderate, p.cyan],
                  ['weak', groupedCounts.weak, p.danger],
                ] as const).map(([band, count, tint]) => (
                  <View key={band} style={{ borderRadius: 999, borderWidth: 1, borderColor: tint, backgroundColor: p.raised, paddingHorizontal: 8, paddingVertical: 5 }}>
                    <DirectionalText
                      value={(band === 'strong' ? label('Strong', 'قوی') : band === 'moderate' ? label('Medium', 'متوسط') : label('Weak', 'ضعیف')) + ' · ' + number(count)}
                      style={{ color: tint, fontSize: 10, fontWeight: '700', lineHeight: 14 }}
                    />
                  </View>
                ))}
              </View>
              <Action secondary onPress={() => router.push('/opportunities')}>
                {label('Open every ranked idea', 'مشاهدهٔ همهٔ ایده‌های رتبه‌بندی‌شده')}
              </Action>
            </View>
          ) : null}
          {detailsVisible && selectedIdea ? (
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: p.border, backgroundColor: p.raised, padding: 13, gap: 8 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <DirectionalText value={label('Selected idea', 'ایده انتخاب‌شده')} style={{ color: p.muted, fontSize: 10 }} />
                <DirectionalText value={number(selectedIdea.engineScore ?? 0) + '/100'} style={{ color: BAND_COLORS[getEditorialPriorityBand(selectedIdea.engineScore ?? 0)], fontWeight: '800', fontSize: 15 }} />
              </View>
              <DirectionalText value={selectedIdea.topic} style={{ fontSize: 15, fontWeight: '700' }} />
              {selectedReason ? <DirectionalText value={selectedReason} style={{ color: p.muted, fontSize: 11 }} /> : null}
              <DirectionalText
                value={label(
                  (selectedConnections?.directEvidenceCount ?? 0) + ' direct evidence item(s) · ' + (selectedConnections?.nodes.length ?? 0) + ' connected graph node(s)',
                  (selectedConnections?.directEvidenceCount ?? 0) + ' شاهد مستقیم · ' + (selectedConnections?.nodes.length ?? 0) + ' گره مرتبط',
                )}
                style={{ color: p.muted, fontSize: 11 }}
              />
              {selectedConnections?.nodes.length ? (
                <View style={{ gap: 5, borderTopWidth: 1, borderTopColor: p.borderSoft, paddingTop: 8 }}>
                  <DirectionalText value={label('Mapped source / entity relations', 'منابع و موجودیت‌های مرتبط')} style={{ fontWeight: '700', fontSize: 11 }} />
                  {selectedConnections.nodes.slice(0, 8).map((node) => (
                    <Pressable key={node.id} onPress={() => node.url ? void Linking.openURL(node.url).catch(() => {}) : undefined}
                      accessibilityRole={node.url ? 'link' : 'text'} style={{ paddingVertical: 2 }}>
                      <DirectionalText value={(node.type === 'news' ? label('Publisher report', 'گزارش ناشر') : node.type === 'youtube' ? 'YouTube' : node.type === 'entity' ? label('Entity', 'موجودیت') : node.type === 'context' ? label('Context', 'زمینه') : node.type === 'publisher' ? label('Publisher', 'ناشر') : node.type === 'evidence' ? label('Engine evidence', 'شاهد موتور') : node.type === 'finding' ? label('Finding / gap', 'یافته / شکاف') : label('Relation', 'ارتباط')) + ' · ' + node.title}
                        style={{ color: node.url ? p.accent : p.muted, fontSize: 11 }} />
                    </Pressable>
                  ))}
                  {selectedConnections.nodes.length > 8 ? (
                    <DirectionalText value={label('+' + (selectedConnections.nodes.length - 8) + ' more connected nodes are retained in the graph model.', '+' + (selectedConnections.nodes.length - 8) + ' گره مرتبط دیگر در مدل گراف حفظ شده‌اند.')} style={{ color: p.muted, fontSize: 10 }} />
                  ) : null}
                </View>
              ) : null}
              <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: selectedIdea.id } })}>
                {label('Open idea and full evidence', 'بازکردن ایده و همه شواهد')}
              </Action>
            </View>
          ) : null}
        </>
      ) : (
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, padding: 14 }}>
          <DirectionalText value={filter === 'all'
            ? label('No scored ideas are available for the map yet. Run a research sample first.', 'هنوز ایده امتیازدار برای نقشه وجود ندارد. ابتدا یک نمونه تحقیق اجرا کن.')
            : label('No ideas match this priority filter.', 'ایده‌ای با این برچسب وجود ندارد.')} style={{ color: p.muted }} />
        </View>
      )}
      {unscoredCount > 0 ? (
        <DirectionalText value={label(
          unscoredCount + ' unscored idea(s) are not plotted as zero; no score is invented for manual or legacy drafts.',
          unscoredCount + ' ایده بدون امتیاز، به‌جای صفر ساختگی از نمودار کنار گذاشته شده‌اند و در فهرست کامل باقی می‌مانند.',
        )} style={{ color: p.muted, fontSize: 10 }} />
      ) : null}
      <DirectionalText
        value={label(
          'This is an evidence-based editorial ranking, not trend acceleration, audience demand or a view forecast; those measurements are not stored by this app.',
          'این نقشه رتبه‌بندی تحریری بر پایه شواهد است، نه شتاب رشد، تقاضای مخاطب یا پیش‌بینی بازدید؛ این سنجه‌ها در داده فعلی برنامه ذخیره نمی‌شوند.',
        )}
        style={{ color: p.muted, fontSize: 10 }}
      />
    </View>
  );
}
