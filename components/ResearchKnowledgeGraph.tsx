import { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { resolveTextDirection } from '@/lib/i18n';
import { palette as p } from '@/lib/theme';
import { buildResearchGraphModel, type ResearchGraphGroup, type ResearchGraphNode, type ResearchGraphIdeaInput } from '@/lib/research-graph';
import type { InternalResearchResult } from '@/lib/engine';
import type { SpaceNewsItem, WikiSignal } from '@/lib/space';
import type { YouTubeSampleVideo } from '@/lib/api';

const GRAPH_COLORS = [p.purple, p.blue, '#48B9C8', p.success, '#8293AA', '#6F83A0'];

function DirectionalText({ value, style }: { value: string; style?: StyleProp<TextStyle> }) {
  const direction = resolveTextDirection(value);
  return (
    <Text style={[
      { color: p.text, fontSize: 13, lineHeight: 20, flexShrink: 1, writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' },
      style,
    ]}>{value}</Text>
  );
}

function groupColor(index: number) {
  return GRAPH_COLORS[Math.max(0, index) % GRAPH_COLORS.length];
}

export function ResearchKnowledgeGraph({
  topic,
  news,
  wiki,
  videos,
  analysis,
  language,
  generatedIdeas,
}: {
  topic: string;
  news: readonly SpaceNewsItem[];
  wiki?: WikiSignal;
  videos: readonly YouTubeSampleVideo[];
  analysis: InternalResearchResult;
  language: 'fa' | 'en';
  generatedIdeas?: readonly ResearchGraphIdeaInput[];
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const graphWidth = Math.max(260, Math.min(340, viewportWidth - 48));
  const model = useMemo(
    () => buildResearchGraphModel({ topic, news, wiki, videos, analysis, language, generatedIdeas }),
    [topic, news, wiki, videos, analysis, language, generatedIdeas],
  );
  const [activeGroupId, setActiveGroupId] = useState<string>();
  const [activeNodeId, setActiveNodeId] = useState<string>();
  const activeGroup = model.groups.find((group) => group.id === activeGroupId);
  const graphNodes = model.nodes
    .filter((node) => node.type !== 'topic' && node.type !== 'publisher' && (!activeGroupId || node.groupId === activeGroupId))
    .slice(0, 12);
  const selectedNode = model.nodes.find((node) => node.id === activeNodeId) ?? graphNodes[0];
  const graphHeight = 300;
  const center = { x: 170, y: 150 };
  const positions = graphNodes.map((node, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, graphNodes.length);
    return { id: node.id, x: center.x + Math.cos(angle) * 112, y: center.y + Math.sin(angle) * 100 };
  });
  const positionById = new Map(positions.map((point) => [point.id, point]));
  const visibleEdges = model.edges.filter((edge) =>
    (edge.source === 'topic-root' || positionById.has(edge.source)) &&
    (edge.target === 'topic-root' || positionById.has(edge.target)),
  );
  const groupIndex = (groupId?: string) => model.groups.findIndex((group) => group.id === groupId);
  const fa = language === 'fa';
  const label = (english: string, persian: string) => fa ? persian : english;
  const relatedEdges = selectedNode
    ? model.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
    : [];
  const nodeById = (id: string) => model.nodes.find((node) => node.id === id);
  const selectGroup = (group: ResearchGraphGroup) => {
    setActiveGroupId((current) => current === group.id ? undefined : group.id);
    setActiveNodeId(undefined);
  };
  const colorFor = (node: ResearchGraphNode) =>
    node.type === 'topic' ? p.purple : groupColor(groupIndex(node.groupId));
  const totalItems = model.nodes.filter((node) => node.type !== 'topic' && node.type !== 'publisher').length;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 5 }}>
        <DirectionalText value={label('Connected research graph', 'گراف ارتباطی تحقیق')} style={{ fontSize: 17, fontWeight: '700' }} />
        <DirectionalText value={model.summary} style={{ color: p.muted }} />
        <DirectionalText value={label(
          'Each node is drawn from the current evidence or local analysis. Select one to inspect its source and explicit relationships.',
          'هر گره از شواهد همین تحقیق یا تحلیل محلی ساخته شده است. برای دیدن منبع و رابطه‌های ثبت‌شده، گره را انتخاب کن.',
        )} style={{ color: p.muted, fontSize: 11 }} />
      </View>
      {model.groups.length ? (
        <>
          <View style={{ alignItems: 'center' }}>
            <Svg width={graphWidth} height={graphHeight} viewBox="0 0 340 300">
              {visibleEdges.map((edge) => {
                const source = edge.source === 'topic-root' ? center : positionById.get(edge.source);
                const target = edge.target === 'topic-root' ? center : positionById.get(edge.target);
                if (!source || !target) return null;
                return (
                  <Line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y}
                    stroke={edge.relation.includes('word overlap') ? p.blue : p.border}
                    strokeWidth={edge.relation.includes('word overlap') ? 1.8 : 1.1} />
                );
              })}
              <Circle cx={center.x} cy={center.y} r={30} fill={p.raised} stroke={p.purple} strokeWidth={2} />
              <SvgText x={center.x} y={center.y - 2} fill={p.text} fontSize={9} fontWeight="700" textAnchor="middle">TOPIC</SvgText>
              <SvgText x={center.x} y={center.y + 10} fill={p.muted} fontSize={7} textAnchor="middle">{String(graphNodes.length)}</SvgText>
              {graphNodes.map((node) => {
                const point = positionById.get(node.id);
                if (!point) return null;
                const selected = selectedNode?.id === node.id;
                return <Circle key={'node-' + node.id} cx={point.x} cy={point.y} r={selected ? 23 : 20}
                  fill={colorFor(node)} stroke={selected ? p.text : p.border} strokeWidth={selected ? 2 : 1}
                  onPress={() => setActiveNodeId(node.id)} />;
              })}
              {graphNodes.map((node, index) => {
                const point = positionById.get(node.id);
                if (!point) return null;
                return <SvgText key={'number-' + node.id} x={point.x} y={point.y + 4} fill="#080B10" fontSize={10}
                  fontWeight="700" textAnchor="middle" onPress={() => setActiveNodeId(node.id)}>{String(index + 1)}</SvgText>;
              })}
            </Svg>
          </View>
          <DirectionalText value={label(
            'Visual preview: ' + graphNodes.length + ' of ' + totalItems + ' records. Use the category filters and lists to inspect every record.',
            'پیش‌نمایش بصری: ' + graphNodes.length.toLocaleString('fa') + ' مورد از ' + totalItems.toLocaleString('fa') + ' رکورد؛ برای بررسی همه موارد از فیلتر و فهرست دسته‌ها استفاده کن.',
          )} style={{ color: p.muted, fontSize: 10 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {model.groups.map((group, index) => {
              const selected = activeGroupId === group.id;
              return (
                <Pressable key={group.id} onPress={() => selectGroup(group)} accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, borderWidth: 1,
                    borderColor: selected ? groupColor(index) : p.border, backgroundColor: selected ? p.raised : p.surface,
                    paddingHorizontal: 10, paddingVertical: 7 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: groupColor(index) }} />
                  <DirectionalText value={group.title + ' · ' + String(group.items.length)} style={{ fontSize: 11, lineHeight: 15 }} />
                </Pressable>
              );
            })}
          </View>
          {activeGroup ? (
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 12 }}>
              <DirectionalText value={activeGroup.title} style={{ fontWeight: '700', fontSize: 15 }} />
              {activeGroup.items.map((item) => {
                const selected = selectedNode?.id === item.id;
                return (
                  <Pressable key={item.id} onPress={() => setActiveNodeId(item.id)} accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{ borderRadius: 12, borderWidth: 1, borderColor: selected ? p.purple : p.border,
                      backgroundColor: selected ? p.raised : p.surface, paddingHorizontal: 12, paddingVertical: 10, gap: 3 }}>
                    <DirectionalText value={item.title} style={{ fontWeight: '600' }} />
                    {item.meta ? <DirectionalText value={item.meta} style={{ color: p.muted, fontSize: 10, lineHeight: 15 }} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <DirectionalText value={label('Select a category to browse every record in it.', 'برای دیدن رکوردهای یک دسته، آن را انتخاب کن.')} style={{ color: p.muted, fontSize: 11 }} />
          )}
          {selectedNode ? (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: p.border, backgroundColor: p.raised, padding: 14, gap: 8 }}>
              <DirectionalText value={selectedNode.title} style={{ fontWeight: '700', fontSize: 15 }} />
              {selectedNode.meta ? <DirectionalText value={selectedNode.meta} style={{ color: p.muted, fontSize: 11 }} /> : null}
              <DirectionalText value={selectedNode.detail} />
              {selectedNode.url ? (
                <Pressable onPress={() => void Linking.openURL(selectedNode.url!).catch(() => {})}
                  accessibilityRole="button" style={{ alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1,
                    borderColor: p.border, paddingHorizontal: 10, paddingVertical: 8 }}>
                  <DirectionalText value={label('Open original source ↗', 'بازکردن منبع اصلی ↗')} style={{ color: p.blue, fontWeight: '600' }} />
                </Pressable>
              ) : null}
              {relatedEdges.length ? (
                <View style={{ gap: 7, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 10 }}>
                  <DirectionalText value={label('Explicit relationships', 'ارتباط‌های ثبت‌شده')} style={{ fontWeight: '700' }} />
                  {relatedEdges.slice(0, 16).map((edge) => {
                    const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                    const other = nodeById(otherId);
                    return (
                      <Pressable key={edge.id} onPress={() => {
                        if (other?.groupId) setActiveGroupId(other.groupId);
                        else setActiveGroupId(undefined);
                        setActiveNodeId(other?.id);
                      }} style={{ gap: 2, paddingVertical: 4 }}>
                        <DirectionalText value={edge.relation} style={{ color: p.blue, fontSize: 11 }} />
                        {other ? <DirectionalText value={other.title} style={{ fontSize: 12 }} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <DirectionalText value={label('No evidence has been supplied to build the graph yet.', 'هنوز شواهدی برای ساخت نمودار ارائه نشده است.')} style={{ color: p.muted }} />
      )}
    </View>
  );
}
