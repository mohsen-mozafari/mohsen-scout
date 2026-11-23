export type ResearchQueryIntent = 'direct' | 'primary-source' | 'critical-review';

export type PlannedResearchQuery = {
  intent: ResearchQueryIntent;
  query: string;
};

/** Three bounded, independent search angles; no platform-derived signals. */
export function buildResearchQueryPlan(
  topic: string,
  language: 'fa' | 'en' = 'en',
): PlannedResearchQuery[] {
  const cleanTopic = topic.trim().replace(/\s+/g, ' ').slice(0, 160);
  if (!cleanTopic) return [];
  const candidates: PlannedResearchQuery[] = language === 'fa'
    ? [
        { intent: 'direct', query: cleanTopic },
        { intent: 'primary-source', query: cleanTopic + ' منبع اولیه پژوهش رسمی مقاله علمی داده اصلی' },
        { intent: 'critical-review', query: cleanTopic + ' روش‌شناسی محدودیت‌ها شواهد مخالف اختلاف گزارش‌ها توضیح جایگزین' },
      ]
    : [
        { intent: 'direct', query: cleanTopic },
        { intent: 'primary-source', query: cleanTopic + ' primary source official research paper original data' },
        { intent: 'critical-review', query: cleanTopic + ' methodology limitations conflicting evidence alternative explanations' },
      ];
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    const query = candidate.query.trim().replace(/\s+/g, ' ').slice(0, 220);
    const key = query.toLocaleLowerCase();
    if (!query || seen.has(key)) return [];
    seen.add(key);
    return [{ intent: candidate.intent, query }];
  });
}
