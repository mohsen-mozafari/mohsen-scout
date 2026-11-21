import { SPACE_NICHES } from '../space';
import { tokenizeResearchText } from '../intelligence';
import type { EngineV2IncomeEstimate } from './types';

const NICHE_RPM: Record<string, { low: number; high: number }> = {
  exoplanets: { low: 8, high: 22 },
  'black-holes': { low: 5, high: 16 },
  jwst: { low: 12, high: 30 },
  mars: { low: 8, high: 20 },
  moon: { low: 7, high: 18 },
  astrobiology: { low: 6, high: 15 },
  sun: { low: 4, high: 12 },
  asteroids: { low: 5, high: 14 },
  rockets: { low: 6, high: 18 },
  cosmology: { low: 5, high: 14 },
};

export type EngineV2NicheEconomy = {
  id: string;
  topic: string;
  low: number;
  high: number;
};

export const ENGINE_V2_NICHES: EngineV2NicheEconomy[] = SPACE_NICHES.map((entry) => ({
  id: entry.id,
  topic: entry.topic,
  low: NICHE_RPM[entry.id]?.low ?? 3,
  high: NICHE_RPM[entry.id]?.high ?? 10,
}));

export function findNicheByTopic(topic: string): EngineV2NicheEconomy | null {
  const topicTokens = new Set(tokenizeResearchText(topic));
  let best: EngineV2NicheEconomy | null = null;
  let bestRatio = 0;
  for (const entry of ENGINE_V2_NICHES) {
    const entryTokens = tokenizeResearchText(entry.topic);
    if (!entryTokens.length) continue;
    const matched = entryTokens.filter((token) => topicTokens.has(token)).length;
    const ratio = matched / entryTokens.length;
    if (ratio >= 0.5 && ratio > bestRatio) {
      best = entry;
      bestRatio = ratio;
    }
  }
  return best;
}

export function estimateIncomeByNiche(
  niche: EngineV2NicheEconomy,
  views: number,
  lang: 'fa' | 'en' = 'en',
): EngineV2IncomeEstimate {
  const v = Math.max(0, Math.floor(views));
  const rpm = (niche.low + niche.high) / 2;
  const estimate = Math.max(0, Math.round((v / 1000) * rpm));
  const viewsText = v.toLocaleString();
  return {
    estimate,
    currency: 'USD',
    label: 'estimate',
    assumptions: [
      lang === 'fa'
        ? `پیش‌فرض: RPM متوسط در بازه ${niche.low}-${niche.high} دلار به ازای هر هزار بازدید (بازدید دریافت‌شده ${viewsText}).`
        : `Assumption: approximate RPM range ${niche.low}-${niche.high} USD per 1,000 views (observed views ${viewsText}).`,
      lang === 'fa'
        ? 'مقدار دارای برچسب «تخمین» است؛ فصل و پلتفرم‌های انتشار محدودیت تغییر می‌دهند.'
        : 'The value carries the label "estimate"; seasonality and platform differences apply.',
      lang === 'fa'
        ? 'فرض می‌شود فصل کاهشی بازدید باعث تغییر RPM به نفع آن می‌شود — پیش‌بینی قطعی نیست.'
        : 'A declining season would favor the upper RPM bound — the forecast is not a guarantee.',
    ],
  };
}
