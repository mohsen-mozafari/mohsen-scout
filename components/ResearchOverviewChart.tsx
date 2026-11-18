import { Text, View } from 'react-native';
import { palette as p } from '@/lib/theme';
import type { InternalResearchResult } from '@/lib/engine';
import type { Idea } from '@/lib/types';

type Props = {
  analysis?: InternalResearchResult;
  ideas: readonly Idea[];
  videoCount: number;
  language: 'fa' | 'en';
};

export function ResearchOverviewChart({ analysis, ideas, videoCount, language }: Props) {
  const fa = language === 'fa';
  const activeIdeas = ideas.filter((idea) => !idea.archived && idea.status !== 'Rejected Ideas' && idea.status !== 'Completed Research');
  const good = activeIdeas.filter((idea) =>
    idea.assessment === 'Strong Opportunity' ||
    idea.assessment === 'Promising' ||
    idea.assessment === 'Worth Exploring',
  ).length;
  const uncertain = activeIdeas.filter((idea) => idea.assessment === 'Uncertain').length;
  const weak = activeIdeas.filter((idea) => idea.assessment === 'Highly Competitive').length;
  const evidenceBacked = activeIdeas.filter((idea) =>
    idea.videoIds.length > 0 || Boolean(idea.reportId) || Boolean(idea.sourceUrl),
  ).length;
  const confidence = analysis?.intelligence.confidence.level ?? 'unknown';
  const confidenceLabel = fa
    ? confidence === 'high' ? 'بالا' : confidence === 'moderate' ? 'متوسط' : confidence === 'low' ? 'پایین' : 'نامشخص'
    : confidence === 'unknown' ? 'Not assessed' : confidence;
  const evidenceRecords = analysis?.evidence.length ?? 0;
  const publisherGroups = analysis?.intelligence.sourceQuality.independentPublishers ?? 0;
  const gaps = analysis?.intelligence.gaps.length ?? 0;
  const maxCount = Math.max(1, good, uncertain, weak);
  const categories = [
    { key: 'good', label: fa ? 'نشانهٔ مثبت' : 'Positive editorial signals', count: good, color: p.success },
    { key: 'uncertain', label: fa ? 'نامطمئن' : 'Uncertain', count: uncertain, color: p.purple },
    { key: 'weak', label: fa ? 'رقابت یا ضعف' : 'Competitive / weak signal', count: weak, color: p.danger },
  ];
  const nextAction = !analysis
    ? (fa ? 'یک جست‌وجوی YouTube اجرا کن یا Space Radar را به‌روز کن.' : 'Run a YouTube search or refresh Space Radar.')
    : confidence === 'low' || gaps > 0
      ? (fa ? 'خلأهای تحقیق را با جست‌وجوی تکمیلی و بررسی منبع اصلی ببند.' : 'Close the research gaps with follow-up searches and primary-source checks.')
      : (fa ? 'ایدهٔ برتر را با منبع اصلی و یک نمونهٔ مستقل دیگر راستی‌آزمایی کن.' : 'Validate the leading idea against a primary source and another independent sample.');

  return (
    <View style={{ gap: 13 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: p.text, fontSize: 17, fontWeight: '700', textAlign: fa ? 'right' : 'left' }}>
          {fa ? 'خلاصهٔ تصمیم‌گیری' : 'Decision snapshot'}
        </Text>
        <Text style={{ color: p.muted, fontSize: 11, lineHeight: 17, textAlign: fa ? 'right' : 'left' }}>
          {fa ? 'کیفیت شواهد و وضعیت ایده‌های همین تحقیق؛ نه شمارندهٔ فایل‌های ذخیره‌شده.' : 'Evidence quality and idea status for this research — not a stored-file inventory.'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flexGrow: 1, flexBasis: 95, borderRadius: 13, borderWidth: 1, borderColor: p.border, backgroundColor: p.raised, padding: 11, gap: 4 }}>
          <Text style={{ color: p.muted, fontSize: 10 }}>{fa ? 'اطمینان شواهد' : 'Evidence confidence'}</Text>
          <Text style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>{confidenceLabel}</Text>
          <Text style={{ color: p.muted, fontSize: 10 }}>{evidenceRecords} {fa ? 'رکورد شاهد' : 'evidence records'}</Text>
        </View>
        <View style={{ flexGrow: 1, flexBasis: 95, borderRadius: 13, borderWidth: 1, borderColor: p.border, backgroundColor: p.raised, padding: 11, gap: 4 }}>
          <Text style={{ color: p.muted, fontSize: 10 }}>{fa ? 'پوشش ناشر مستقل' : 'Independent publishers'}</Text>
          <Text style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>{publisherGroups}</Text>
          <Text style={{ color: p.muted, fontSize: 10 }}>{videoCount} {fa ? 'نمونهٔ ویدئو' : 'video samples'}</Text>
        </View>
        <View style={{ flexGrow: 1, flexBasis: 95, borderRadius: 13, borderWidth: 1, borderColor: p.border, backgroundColor: p.raised, padding: 11, gap: 4 }}>
          <Text style={{ color: p.muted, fontSize: 10 }}>{fa ? 'ایدهٔ متکی به شاهد' : 'Evidence-backed ideas'}</Text>
          <Text style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>{evidenceBacked}</Text>
          <Text style={{ color: p.muted, fontSize: 10 }}>{activeIdeas.length} {fa ? 'ایدهٔ فعال در این مجموعه' : 'active ideas in this set'}</Text>
        </View>
      </View>

      <View style={{ gap: 9 }}>
        <Text style={{ color: p.text, fontSize: 13, fontWeight: '600', textAlign: fa ? 'right' : 'left' }}>
          {fa ? 'ترکیب وضعیت ایده‌ها' : 'Idea assessment mix'}
        </Text>
        {categories.map((category) => (
          <View key={category.key} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: p.muted, fontSize: 11 }}>{category.label}</Text>
              <Text style={{ color: p.text, fontSize: 12, fontWeight: '700' }}>{category.count}</Text>
            </View>
            <View style={{ height: 7, width: '100%', overflow: 'hidden', borderRadius: 6, backgroundColor: p.border }}>
              <View style={{ height: 7, width: String((category.count / maxCount) * 100) + '%', borderRadius: 6, backgroundColor: category.color }} />
            </View>
          </View>
        ))}
      </View>

      <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 10 }}>
        <Text style={{ color: p.text, fontSize: 12, fontWeight: '600', textAlign: fa ? 'right' : 'left' }}>
          {fa ? 'خلأهای باقی‌مانده' : 'Open research gaps'} · {gaps}
        </Text>
        <Text style={{ color: p.muted, fontSize: 11, lineHeight: 17, textAlign: fa ? 'right' : 'left' }}>
          {analysis?.intelligence.gaps.slice(0, 2).join(' · ') || (analysis
            ? (fa ? 'خلأ مشخصی در این خروجی ثبت نشده است؛ صحت ادعاها همچنان نیازمند منبع اصلی است.' : 'No explicit gap was recorded; claims still require primary-source verification.')
            : (fa ? 'هنوز تحلیلی برای این موضوع ساخته نشده است.' : 'No analysis is available for this topic yet.'))}
        </Text>
        <Text style={{ color: p.text, fontSize: 12, fontWeight: '600', textAlign: fa ? 'right' : 'left' }}>
          {fa ? 'اقدام بعدی پیشنهادی' : 'Suggested next action'}
        </Text>
        <Text style={{ color: p.muted, fontSize: 11, lineHeight: 17, textAlign: fa ? 'right' : 'left' }}>{nextAction}</Text>
      </View>

      <Text style={{ color: p.muted, fontSize: 10, lineHeight: 15, textAlign: fa ? 'right' : 'left' }}>
        {fa
          ? 'این نمودار امتیاز احتمال ویوی بالا یا درصد وایرال‌شدن نیست. برآورد احتمالی بدون دادهٔ معتبر مخاطب و زمان انتشار ارائه نمی‌شود.'
          : 'This is not a high-view probability or viral percentage. No likelihood is estimated without valid audience and publication-time data.'}
      </Text>
    </View>
  );
}
