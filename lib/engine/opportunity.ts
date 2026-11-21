import { percentile } from './features';
import type { EngineV2Feature, EngineV2Weights } from './types';

export type EngineV2OpportunityCtx = {
  weights: EngineV2Weights;
  lang: 'fa' | 'en';
  populations: {
    growthRates: number[];
    outlierScores: number[];
    engagementRatios: number[];
    recencies: number[];
    channelSizeRatios: number[];
  };
  resolve: (feature: EngineV2Feature) => {
    gap: boolean;
    risk: boolean;
    topicMomentum: number;
    topicTerms: string[];
    clusterId: string;
  };
};

export type EngineV2ScoredFeature = {
  feature: EngineV2Feature;
  score: number;
  componentScores: Partial<Record<keyof EngineV2Weights, number>>;
  reasons: string[];
};

function reasonText(lang: 'fa' | 'en', fa: string, en: string): string {
  return lang === 'fa' ? fa : en;
}

export function scoreFeatures(features: readonly EngineV2Feature[], ctx: EngineV2OpportunityCtx): EngineV2ScoredFeature[] {
  const { weights, lang } = ctx;
  const pop = ctx.populations;
  const out: EngineV2ScoredFeature[] = [];
  for (const feature of features) {
    const resolved = ctx.resolve(feature);
    const gap = resolved.gap;
    const risk = resolved.risk;
    const componentScores: Partial<Record<keyof EngineV2Weights, number>> = {};
    const reasons: string[] = [];
    const momentum = Math.round((resolved.topicMomentum ?? 0) * 100);
    const growth = percentile(pop.growthRates, feature.growthRate);
    const outlier = percentile(pop.outlierScores, feature.outlierScore ?? 0);
    const engagement = percentile(pop.engagementRatios, feature.engagementRatio);
    const titleScore = Math.min(100,
      (feature.titlePatterns.hasDigit ? 40 : 0) +
      (feature.titlePatterns.isQuestion ? 30 : 0) +
      (feature.titlePatterns.words > 15 ? 0 : 15));
    const channelSize = percentile(pop.channelSizeRatios, feature.channelSizeRatio ?? 0);
    const gapComp = gap ? 100 : 0;
    const freshness = percentile(pop.recencies, feature.recencyHours);
    const riskComp = risk ? -100 : 0;

    componentScores.momentum = momentum;
    componentScores.growth = growth;
    componentScores.outlier = outlier;
    componentScores.engagement = engagement;
    componentScores.titlePattern = titleScore;
    componentScores.channelSize = channelSize;
    componentScores.newsGap = gapComp;
    componentScores.freshness = freshness;
    componentScores.riskPenalty = riskComp;

    const score = Math.max(0, Math.min(100,
      (weights.momentum * momentum +
        weights.growth * growth +
        weights.outlier * outlier +
        weights.engagement * engagement +
        weights.titlePattern * titleScore +
        weights.channelSize * channelSize +
        weights.newsGap * gapComp +
        weights.freshness * freshness +
        weights.riskPenalty * Math.max(0, -riskComp)) / 100));
    if (resolved.topicMomentum > 60) reasons.push(reasonText(lang, 'مومنتوم بالا: این موضوع تازه فعال است.', 'Strong momentum: the topic is currently active.'));
    if (growth > 60) reasons.push(reasonText(lang, 'نرخ رشد بالا: ویو بیشتر از میانه‌ی نمونه است.', 'High growth: views are above the sample median.'));
    if (outlier > 60) reasons.push(reasonText(lang, 'امتیاز outlier بالاست: این ویدئو از میانه‌ی کانالش فاصله می‌اندازد.', 'Outlier score is high: this video stands out from its channel average.'));
    if (engagement > 60) reasons.push(reasonText(lang, 'کیفیت تعامل بالا (لایک+کامنت بر بازدید).', 'Strong engagement (likes + comments per view).'));
    if (titleScore >= 40) reasons.push(reasonText(lang, 'عنوان دارای عدد یا سؤال — پتانسیل کلیک بالاتر.', 'Title uses digits or a question, a common click driver.'));
    if (channelSize > 60) reasons.push(reasonText(lang, 'کانال بزرگتر از میانه‌ی نمونه است.', 'The channel is larger than the sample median.'));
    if (gap) reasons.push(reasonText(lang, 'شکاف خبری: این موضوع گرم اخبار است اما در نمونه یوتیوب کم وجود دارد.', 'News gap: this topic is hot in news but little covered in the YouTube sample.'));
    if (freshness > 60) reasons.push(reasonText(lang, 'فرصت فعلی: انتشار تازه است.', 'Fresh opportunity: recently published.'));
    if (risk) reasons.push(reasonText(lang, 'ریسک بالا: رقابت شدید در این موضوع.', 'High risk: strong competition in this topic.'));
    if (score < 30) reasons.push(reasonText(lang, 'امتیاز کلی پایین — با احتیاط ادامه دهید.', 'Overall score is low — proceed with caution.'));
    if (reasons.length === 0) reasons.push(reasonText(lang, 'نقطه متعادل: شواهد محدودی داریم.', 'Balanced: limited evidence so far.'));
    out.push({ feature, score, componentScores, reasons });
  }
  return out;
}

export { percentile };
