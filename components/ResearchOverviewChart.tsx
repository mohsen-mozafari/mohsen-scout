import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { BadgeText, Heading, Panel, Txt, styles } from '@/components/ScoutUI';
import { palette as p } from '@/lib/theme';
import { buildResearchChartData } from '@/lib/research-chart';
import type { FeedRegistryRecord, Idea, Opinion, Report } from '@/lib/types';

type Props = {
  feedRegistry: FeedRegistryRecord[];
  reports: Report[];
  ideas: Idea[];
  opinions: Opinion[];
  language: 'fa' | 'en';
};

export function ResearchOverviewChart({ feedRegistry, reports, ideas, opinions, language }: Props) {
  const fa = language === 'fa';
  const data = useMemo(() => buildResearchChartData({
    news: feedRegistry.flatMap((feed) => feed.cachedItems.map((item) => ({
      id: item.id, url: item.url, publishedAt: item.publishedAt,
    }))),
    reports: reports.map((report) => ({ createdAt: report.createdAt, videos: report.videos })),
    ideas: ideas.map((idea) => ({ createdAt: idea.createdAt })),
    opinions: opinions.map((opinion) => ({ createdAt: opinion.createdAt })),
  }), [feedRegistry, reports, ideas, opinions]);

  const series = [
    { key: 'news' as const, label: fa ? 'خبرهای منتشرشده' : 'Published news', color: p.purple },
    { key: 'youtube' as const, label: fa ? 'نمونه ویدئو' : 'YouTube sample items', color: p.blue },
    { key: 'ideas' as const, label: fa ? 'ایده‌ها' : 'Ideas', color: p.success },
    { key: 'aiReviews' as const, label: fa ? 'نظرهای AI' : 'AI reviews', color: p.danger },
  ];
  const width = 340;
  const height = 190;
  const left = 25;
  const right = 7;
  const top = 9;
  const bottom = 26;
  const chartHeight = height - top - bottom;
  const chartWidth = width - left - right;
  const maxValue = Math.max(1, ...data.points.flatMap((point) => series.map((item) => point[item.key])));
  const groupWidth = chartWidth / data.points.length;
  const barWidth = Math.min(4, Math.max(2, (groupWidth - 4) / 4.4));
  const dayIndices = new Set([0, Math.floor((data.points.length - 1) / 2), data.points.length - 1]);

  return (
    <Panel>
      <BadgeText>RESEARCH ACTIVITY · 14 DAYS</BadgeText>
      <Heading>{fa ? 'نمای یکپارچه فعالیت پژوهش' : 'Unified research activity'}</Heading>
      <Txt muted>{fa
        ? 'شمارش داده‌های جمع‌آوری‌شده و خروجی‌های محلی؛ هر نوع داده جداگانه نمایش داده شده است.'
        : 'Counts of collected records and local outputs. Each data type remains a separate measure.'}</Txt>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel={fa ? 'نمودار فعالیت پژوهش در ۱۴ روز اخیر' : 'Research activity chart for the last 14 days'}>
        {[0, 0.5, 1].map((fraction) => {
          const y = top + chartHeight * fraction;
          return <Line key={fraction} x1={left} y1={y} x2={width - right} y2={y} stroke={p.border} strokeWidth={1} />;
        })}
        {data.points.map((point, index) => {
          const groupX = left + index * groupWidth;
          const clusterWidth = series.length * (barWidth + 1);
          return (
            <G key={point.day}>
              {series.map((item, seriesIndex) => {
                const value = point[item.key];
                const barHeight = value > 0 ? Math.max(2, (value / maxValue) * chartHeight) : 0;
                const x = groupX + (groupWidth - clusterWidth) / 2 + seriesIndex * (barWidth + 1);
                const y = top + chartHeight - barHeight;
                return barHeight > 0 ? <Rect key={item.key} x={x} y={y} width={barWidth} height={barHeight} rx={1} fill={item.color} /> : null;
              })}
              {dayIndices.has(index) ? (
                <SvgText x={groupX + groupWidth / 2} y={height - 7} fontSize={9} fill={p.muted} textAnchor="middle">
                  {new Date(point.day + 'T00:00:00Z').getUTCDate()}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        <SvgText x={left - 5} y={top + 4} fontSize={8} fill={p.muted} textAnchor="end">{maxValue}</SvgText>
        <SvgText x={left - 5} y={top + chartHeight + 2} fontSize={8} fill={p.muted} textAnchor="end">0</SvgText>
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {series.map((item) => (
          <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.color }} />
            <Text style={[styles.muted, { color: p.muted }]}>{item.label} · {data.totals[item.key].toLocaleString()}</Text>
          </View>
        ))}
      </View>
      <Txt muted>{fa
        ? 'منبع: خبرهای تاریخ‌دار در خوراک محلی، ویدئوهای نمونه در گزارش‌های ذخیره‌شده، ایده‌های ثبت‌شده و پاسخ‌های AI. نمودار رشد بازدید یا روند جهانی را ادعا نمی‌کند.'
        : 'Sources: dated items in the local feeds, video samples in saved reports, saved ideas and AI responses. This chart does not claim view growth or global trends.'}</Txt>
    </Panel>
  );
}
