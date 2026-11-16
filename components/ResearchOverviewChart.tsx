import { Text, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { palette as p } from '@/lib/theme';
import { buildResearchOverview } from '@/lib/research-overview';
import type { LocalData } from '@/lib/types';
type Props = { data: LocalData; language: 'fa' | 'en' };
const series = [
  { key: 'news' as const, color: p.blue, fa: 'خبر', en: 'News' },
  { key: 'videos' as const, color: p.purple, fa: 'ویدئو', en: 'Videos' },
  { key: 'reports' as const, color: p.success, fa: 'تحقیق', en: 'Research' },
  { key: 'ideas' as const, color: p.violet, fa: 'ایده', en: 'Ideas' },
  { key: 'ai' as const, color: p.danger, fa: 'AI دوم', en: 'AI reviews' },
];
export function ResearchOverviewChart({ data, language }: Props) {
  const fa = language === 'fa';
  const overview = buildResearchOverview(data);
  const maxValue = Math.max(1, ...overview.activity.map((point) => point.total));
  const plotBottom = 136, plotHeight = 120, barWidth = 22;
  const xFor = (index: number) => 35 + index * 43;
  const labels = {
    title: fa ? 'نمای کلی هوشمندی و داده‌ها' : 'Research intelligence overview',
    subtitle: fa ? 'فعالیت ثبت‌شده در ۷ روز اخیر؛ فقط داده‌های ذخیره‌شده روی دستگاه.' : 'Recorded activity over the last 7 days; local saved data only.',
    empty: fa ? 'هنوز فعالیت ثبت‌شده‌ای برای این بازه وجود ندارد.' : 'No recorded activity in this period yet.',
    inventory: fa ? 'موجودی فعلی داده‌ها' : 'Current data inventory',
    news: fa ? 'خبر' : 'News', videos: fa ? 'ویدئو' : 'Videos', reports: fa ? 'گزارش' : 'Reports',
    ideas: fa ? 'ایده فعال' : 'Active ideas', links: fa ? 'پیوند' : 'Links', notes: fa ? 'یادداشت' : 'Notes',
    memory: fa ? 'حافظه' : 'Memory', ai: fa ? 'نظر AI' : 'AI reviews',
  };
  const inventory = [
    [labels.news, overview.totals.news], [labels.videos, overview.totals.videos],
    [labels.reports, overview.totals.reports], [labels.ideas, overview.totals.ideas],
    [labels.links, overview.totals.links], [labels.notes, overview.totals.notes],
    [labels.memory, overview.totals.memory], [labels.ai, overview.totals.ai],
  ] as const;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: p.text, fontSize: 17, fontWeight: '700', textAlign: fa ? 'right' : 'left' }}>{labels.title}</Text>
        <Text style={{ color: p.muted, fontSize: 11, lineHeight: 17, textAlign: fa ? 'right' : 'left' }}>{labels.subtitle}</Text>
      </View>
      {overview.hasActivity ? (
        <View style={{ width: '100%' }}>
          <Svg width="100%" height={170} viewBox="0 0 336 170" preserveAspectRatio="xMidYMid meet">
            {[0, 1, 2, 3].map((step) => {
              const y = plotBottom - (plotHeight * step) / 3;
              return <Line key={'grid-' + step} x1={25} x2={330} y1={y} y2={y} stroke={p.border} strokeWidth={1} />;
            })}
            {overview.activity.map((point, index) => {
              let currentY = plotBottom;
              return (
                <G key={point.at}>
                  {series.map((item) => {
                    const count = point[item.key];
                    if (!count) return null;
                    const height = (count / maxValue) * plotHeight;
                    currentY -= height;
                    return <Rect key={item.key} x={xFor(index)} y={currentY} width={barWidth} height={Math.max(2, height)} rx={3} fill={item.color} />;
                  })}
                  <SvgText x={xFor(index) + barWidth / 2} y={157} fill={p.muted} fontSize={9} textAnchor="middle">{new Date(point.at).toLocaleDateString(fa ? 'fa-IR' : 'en-US', { weekday: 'short' })}</SvgText>
                  {point.total > 0 ? <SvgText x={xFor(index) + barWidth / 2} y={Math.max(10, currentY - 4)} fill={p.text} fontSize={9} textAnchor="middle">{String(point.total)}</SvgText> : null}
                </G>
              );
            })}
          </Svg>
        </View>
      ) : <Text style={{ color: p.muted, fontSize: 12, textAlign: fa ? 'right' : 'left' }}>{labels.empty}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {series.map((item) => <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.color }} />
          <Text style={{ color: p.muted, fontSize: 10 }}>{fa ? item.fa : item.en}</Text>
        </View>)}
      </View>
      <View style={{ height: 1, backgroundColor: p.border }} />
      <Text style={{ color: p.text, fontSize: 13, fontWeight: '600', textAlign: fa ? 'right' : 'left' }}>{labels.inventory}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {inventory.map(([label, count]) => <View key={label} style={{ minWidth: '22%', flexGrow: 1, borderRadius: 12, borderWidth: 1, borderColor: p.border, backgroundColor: p.raised, padding: 10, gap: 3 }}>
          <Text style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>{count.toLocaleString(fa ? 'fa-IR' : 'en-US')}</Text>
          <Text style={{ color: p.muted, fontSize: 10 }}>{label}</Text>
        </View>)}
      </View>
      <Text style={{ color: p.muted, fontSize: 10, lineHeight: 15, textAlign: fa ? 'right' : 'left' }}>
        {fa ? 'این نمودار حجم داده و فعالیت ثبت‌شده را نشان می‌دهد؛ نه محبوبیت، رشد بازار یا ترند جهانی.' : 'This chart shows stored data volume and recorded activity, not popularity, market growth or global trends.'}
      </Text>
    </View>
  );
}
