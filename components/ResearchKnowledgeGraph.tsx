import { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { resolveTextDirection } from '@/lib/i18n';
import { palette as p } from '@/lib/theme';
import { buildResearchGraphModel, type ResearchGraphGroup } from '@/lib/research-graph';
import type { InternalResearchResult } from '@/lib/engine';
import type { SpaceNewsItem, WikiSignal } from '@/lib/space';
import type { YouTubeSampleVideo } from '@/lib/api';

const GRAPH_POSITIONS = [
  { x: 58, y: 126 },
  { x: 170, y: 126 },
  { x: 282, y: 126 },
  { x: 58, y: 264 },
  { x: 170, y: 264 },
  { x: 282, y: 264 },
] as const;
const GRAPH_COLORS = [p.purple, p.blue, '#48B9C8', p.success, '#8293AA', '#6F83A0'];

function DirectionalText({
  value,
  style,
}: {
  value: string;
  style?: StyleProp<TextStyle>;
}) {
  const direction = resolveTextDirection(value);
  return (
    <Text
      style={[
        {
          color: p.text,
          fontSize: 13,
          lineHeight: 20,
          flexShrink: 1,
          writingDirection: direction,
          textAlign: direction === 'rtl' ? 'right' : 'left',
        },
        style,
      ]}
    >
      {value}
    </Text>
  );
}

export function ResearchKnowledgeGraph({
  topic,
  news,
  wiki,
  videos,
  analysis,
  language,
}: {
  topic: string;
  news: readonly SpaceNewsItem[];
  wiki?: WikiSignal;
  videos: readonly YouTubeSampleVideo[];
  analysis: InternalResearchResult;
  language: 'fa' | 'en';
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const graphWidth = Math.max(260, Math.min(340, viewportWidth - 48));
  const graphHeight = graphWidth * (320 / 340);
  const model = useMemo(
    () => buildResearchGraphModel({ topic, news, wiki, videos, analysis, language }),
    [topic, news, wiki, videos, analysis, language],
  );
  const [activeGroupId, setActiveGroupId] = useState<string>();
  const [activeItemId, setActiveItemId] = useState<string>();
  const activeGroup = model.groups.find((group) => group.id === activeGroupId) ?? model.groups[0];
  const selectedItem = activeGroup?.items.find((item) => item.id === activeItemId) ?? activeGroup?.items[0];
  const fa = language === 'fa';
  const label = (english: string, persian: string) => fa ? persian : english;
  const selectGroup = (group: ResearchGraphGroup) => {
    setActiveGroupId(group.id);
    setActiveItemId(undefined);
  };
  const totalItems = model.groups.reduce((total, group) => total + group.items.length, 0);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 5 }}>
        <DirectionalText value={label('Unified research graph', 'نمودار یکپارچه تحقیق')} style={{ fontSize: 17, fontWeight: '700' }} />
        <DirectionalText value={model.summary} style={{ color: p.muted }} />
        <DirectionalText
          value={label(
            'The graph is generated from the same evidence and analysis shown below. Select a node to inspect the original details.',
            'نمودار از همان شواهد و تحلیلی ساخته شده که در ادامه می‌بینی. برای مشاهده جزئیات اصلی، یکی از گره‌ها را انتخاب کن.',
          )}
          style={{ color: p.muted, fontSize: 11 }}
        />
      </View>

      {model.groups.length ? (
        <>
          <View style={{ alignItems: 'center' }}>
            <Svg width={graphWidth} height={graphHeight} viewBox="0 0 340 320">
              {model.groups.map((group, index) => {
                const point = GRAPH_POSITIONS[index];
                return (
                  <Line
                    key={'edge-' + group.id}
                    x1={170}
                    y1={64}
                    x2={point.x}
                    y2={point.y - 24}
                    stroke={p.border}
                    strokeWidth={2}
                  />
                );
              })}
              <Circle cx={170} cy={38} r={26} fill={p.raised} stroke={p.purple} strokeWidth={2} />
              <SvgText x={170} y={42} fill={p.text} fontSize={9} fontWeight="700" textAnchor="middle">
                SCOUT
              </SvgText>
              {model.groups.map((group, index) => {
                const point = GRAPH_POSITIONS[index];
                const color = GRAPH_COLORS[index];
                const selected = activeGroup?.id === group.id;
                return (
                  <Circle
                    key={group.id}
                    cx={point.x}
                    cy={point.y}
                    r={selected ? 27 : 23}
                    fill={color}
                    stroke={selected ? p.text : p.border}
                    strokeWidth={selected ? 2.5 : 1.5}
                    onPress={() => selectGroup(group)}
                  />
                );
              })}
              {model.groups.map((group, index) => {
                const point = GRAPH_POSITIONS[index];
                return (
                  <SvgText
                    key={'count-' + group.id}
                    x={point.x}
                    y={point.y + 5}
                    fill="#0B0F14"
                    fontSize={14}
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {String(group.items.length)}
                  </SvgText>
                );
              })}
            </Svg>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {model.groups.map((group, index) => {
              const selected = activeGroup?.id === group.id;
              return (
                <Pressable
                  key={group.id}
                  onPress={() => selectGroup(group)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? GRAPH_COLORS[index] : p.border,
                    backgroundColor: selected ? p.raised : p.surface,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GRAPH_COLORS[index] }} />
                  <DirectionalText
                    value={group.title + ' · ' + String(group.items.length)}
                    style={{ fontSize: 11, lineHeight: 15 }}
                  />
                </Pressable>
              );
            })}
          </View>

          {activeGroup ? (
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 12 }}>
              <DirectionalText value={activeGroup.title} style={{ fontWeight: '700', fontSize: 15 }} />
              {activeGroup.items.map((item) => {
                const selected = selectedItem?.id === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setActiveItemId(item.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: selected ? p.purple : p.border,
                      backgroundColor: selected ? p.raised : p.surface,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      gap: 3,
                    }}
                  >
                    <DirectionalText value={item.title} style={{ fontWeight: '600' }} />
                    {item.meta ? <DirectionalText value={item.meta} style={{ color: p.muted, fontSize: 10, lineHeight: 15 }} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {selectedItem ? (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: p.border, backgroundColor: p.raised, padding: 14, gap: 8 }}>
              <DirectionalText value={selectedItem.title} style={{ fontWeight: '700', fontSize: 15 }} />
              {selectedItem.meta ? <DirectionalText value={selectedItem.meta} style={{ color: p.muted, fontSize: 11 }} /> : null}
              <DirectionalText value={selectedItem.detail} />
              {selectedItem.url ? (
                <Pressable
                  onPress={() => void Linking.openURL(selectedItem.url!).catch(() => {})}
                  accessibilityRole="button"
                  style={{ alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, borderColor: p.border, paddingHorizontal: 10, paddingVertical: 8 }}
                >
                  <DirectionalText value={label('Open original source ↗', 'بازکردن منبع اصلی ↗')} style={{ color: p.blue, fontWeight: '600' }} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <DirectionalText
            value={label(
              totalItems + ' source and analysis records are available across ' + model.groups.length + ' connected groups.',
              totalItems.toLocaleString('fa') + ' رکورد منبع و تحلیل در ' + model.groups.length.toLocaleString('fa') + ' گروه متصل در دسترس است.',
            )}
            style={{ color: p.muted, fontSize: 10 }}
          />
        </>
      ) : (
        <DirectionalText value={label('No evidence has been supplied to build the graph yet.', 'هنوز شواهدی برای ساخت نمودار ارائه نشده است.')} style={{ color: p.muted }} />
      )}
    </View>
  );
}
