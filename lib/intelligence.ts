export type ResearchFeedbackProfile = {
  positiveTopics: string[];
  negativeTopics: string[];
};

export type ResearchDocument = {
  title: string;
  summary?: string;
  sourceName?: string;
  sourceId?: string;
  sourceUrl?: string;
  publishedAt?: string | null;
  sourceCount?: number;
  sourceIds?: string[];
};

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'how', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this',
  'to', 'was', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'with',
  'new', 'latest', 'update', 'updates', 'news', 'video', 'videos', 'guide', 'explained',
  'از', 'با', 'برای', 'به', 'در', 'را', 'و', 'یا', 'این', 'آن', 'یک', 'چه', 'چرا',
  'چگونه', 'های', 'ها', 'است', 'شد', 'شده', 'می', 'که', 'تا', 'بر', 'روی',
]);

const CONCEPT_ALIASES: readonly (readonly string[])[] = [
  ['jwst', 'james webb', 'james webb space telescope', 'webb telescope', 'تلسکوپ جیمز وب', 'جیمز وب'],
  ['exoplanet', 'exoplanets', 'extrasolar planet', 'extrasolar planets', 'extra solar planet', 'سیاره فراخورشیدی', 'سیارات فراخورشیدی'],
  ['moon', 'lunar', 'lunar surface', 'سطح ماه', 'قمر زمین'],
  ['mars', 'planet mars', 'سیاره مریخ', 'مریخ'],
  ['mars rover', 'martian rover', 'perseverance rover', 'curiosity rover', 'مریخ نورد', 'مریخ‌نورد'],
  ['black holes', 'black hole', 'سیاهچاله', 'سیاه چاله'],
  ['solar flare', 'solar flares', 'solar eruption', 'شراره خورشیدی', 'فوران خورشیدی'],
  ['supernova', 'supernovae', 'stellar explosion', 'ابرنواختر'],
  ['neutron star', 'neutron stars', 'ستاره نوترونی', 'ستارگان نوترونی'],
  ['gravitational wave', 'gravitational waves', 'امواج گرانشی'],
  ['dark matter', 'ماده تاریک'],
  ['dark energy', 'انرژی تاریک'],
];

export function normalizeResearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[\u200B-\u200F\uFEFF]/g, ' ')
    .replace(/[\u200C]/g, ' ')
    .replace(/&amp;/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeResearchText(value: string): string[] {
  return normalizeResearchText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .map((token) => {
      if (/^[a-z]+$/.test(token)) {
        if (token.endsWith('ies') && token.length > 4) return token.slice(0, -3) + 'y';
        if (token.endsWith('s') && token.length > 4 && !token.endsWith('ss')) return token.slice(0, -1);
      }
      return token;
    });
}

function conceptIndexes(value: string): number[] {
  const normalized = normalizeResearchText(value);
  return CONCEPT_ALIASES
    .map((aliases, index) => aliases.some((alias) => normalized.includes(normalizeResearchText(alias))) ? index : -1)
    .filter((index) => index >= 0);
}

function expandedConceptTokens(value: string): Set<string> {
  const tokens = new Set(tokenizeResearchText(value));
  for (const index of conceptIndexes(value)) tokens.add('__concept_' + index);
  return tokens;
}

function sharesConceptAlias(left: string, right: string): boolean {
  const leftConcepts = new Set(conceptIndexes(left));
  return conceptIndexes(right).some((index) => leftConcepts.has(index));
}

/** Transparent lexical-semantic relevance using normalization and a small, explicit alias map. */
export function scoreResearchText(topic: string, title: string, summary = ''): number {
  const normalizedTopic = normalizeResearchText(topic);
  if (!normalizedTopic) return 0;
  const titleText = normalizeResearchText(title);
  const summaryText = normalizeResearchText(summary);
  const topicTokens = [...expandedConceptTokens(topic)];
  if (!topicTokens.length) return 0;
  const titleTokens = expandedConceptTokens(title);
  const summaryTokens = expandedConceptTokens(summary);
  let score = 0;
  for (const token of topicTokens) {
    if (titleTokens.has(token)) score += 3;
    else if (summaryTokens.has(token)) score += 1;
  }
  if (normalizedTopic.length > 2 && titleText.includes(normalizedTopic)) score += 5;
  if (normalizedTopic.length > 2 && summaryText.includes(normalizedTopic)) score += 2;
  const coverage = topicTokens.filter((token) => titleTokens.has(token) || summaryTokens.has(token)).length;
  if (coverage === topicTokens.length && coverage > 1) score += 2;
  return score;
}

export function matchesResearchTerms(value: string, terms: readonly string[]): boolean {
  const normalizedValue = normalizeResearchText(value);
  if (!normalizedValue) return false;
  const valueTokens = expandedConceptTokens(value);
  return terms.some((term) => {
    const normalizedTerm = normalizeResearchText(term);
    if (!normalizedTerm) return false;
    if (normalizedValue.includes(normalizedTerm) || sharesConceptAlias(value, term)) return true;
    const termTokens = [...expandedConceptTokens(term)];
    if (!termTokens.length) return false;
    const overlap = termTokens.filter((token) => valueTokens.has(token)).length;
    return overlap >= Math.max(1, Math.ceil(termTokens.length * 0.6));
  });
}

function relevanceWithFeedback<T extends ResearchDocument>(
  topic: string,
  item: T,
  feedback?: ResearchFeedbackProfile,
): number {
  let score = scoreResearchText(topic, item.title, item.summary ?? '');
  if (!feedback) return score;
  const text = item.title + ' ' + (item.summary ?? '');
  if (feedback.positiveTopics.some((term) => matchesResearchTerms(text, [term]))) score += 1;
  if (feedback.negativeTopics.some((term) => matchesResearchTerms(text, [term]))) score -= 2;
  return score;
}

function timestamp(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function rankResearchEvidence<T extends ResearchDocument>(
  topic: string,
  items: readonly T[],
  limit = 6,
  feedback?: ResearchFeedbackProfile,
): T[] {
  return items
    .map((item, index) => ({ item, index, score: relevanceWithFeedback(topic, item, feedback) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score ||
      timestamp(b.item.publishedAt) - timestamp(a.item.publishedAt) ||
      a.index - b.index)
    .slice(0, Math.max(0, Math.floor(limit)))
    .map((entry) => entry.item);
}

export function canonicalizeResearchUrl(value?: string): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    url.hash = '';
    const trackingKeys = new Set<string>();
    url.searchParams.forEach((_value, key) => {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid|ref_src)$/i.test(key)) trackingKeys.add(key);
    });
    for (const key of trackingKeys) url.searchParams.delete(key);
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    url.searchParams.sort();
    return url.origin + url.pathname + (url.search ? url.search : '');
  } catch {
    return '';
  }
}

function titleSimilarity(left: string, right: string): number {
  const a = new Set(tokenizeResearchText(left));
  const b = new Set(tokenizeResearchText(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function publisherFamily(item: ResearchDocument): string {
  const id = item.sourceId?.toLowerCase() ?? '';
  if (id === 'nasa' || id === 'jpl') return 'nasa';
  if (id.startsWith('esa')) return 'esa';
  const name = normalizeResearchText(item.sourceName ?? '');
  return name || (canonicalizeResearchUrl(item.sourceUrl).split('/')[2] ?? 'unknown');
}

export function deduplicateResearchEvidence<T extends ResearchDocument>(
  items: readonly T[],
): { items: (T & Pick<ResearchDocument, 'sourceCount' | 'sourceIds'>)[]; duplicatesMerged: number } {
  const result: (T & Pick<ResearchDocument, 'sourceCount' | 'sourceIds'>)[] = [];
  let duplicatesMerged = 0;
  for (const item of items) {
    const canonicalUrl = canonicalizeResearchUrl(item.sourceUrl);
    const normalizedTitle = normalizeResearchText(item.title);
    const duplicateIndex = result.findIndex((existing) => {
      const existingUrl = canonicalizeResearchUrl(existing.sourceUrl);
      if (canonicalUrl && existingUrl && canonicalUrl === existingUrl) return true;
      const existingTitle = normalizeResearchText(existing.title);
      if (normalizedTitle && normalizedTitle === existingTitle) return true;
      return tokenizeResearchText(item.title).length >= 4 &&
        titleSimilarity(item.title, existing.title) >= 0.94;
    });
    if (duplicateIndex < 0) {
      result.push(item);
      continue;
    }
    const previous = result[duplicateIndex];
    const names = [...new Set([
      ...(previous.sourceName ?? '').split('·').map((part) => part.trim()),
      ...(item.sourceName ?? '').split('·').map((part) => part.trim()),
    ].filter(Boolean))];
    const previousSourceIds = (previous as T & { sourceIds?: string[] }).sourceIds ??
      [previous.sourceId].filter((id): id is string => Boolean(id));
    const sourceIds = [...new Set([...previousSourceIds, item.sourceId].filter((id): id is string => Boolean(id)))];
    result[duplicateIndex] = {
      ...previous,
      sourceName: names.join(' · ') || previous.sourceName,
      sourceIds,
      sourceCount: Math.max(
        (previous as T & { sourceCount?: number }).sourceCount ?? 0,
        sourceIds.length,
      ),
    } as T;
    duplicatesMerged++;
  }
  return { items: result, duplicatesMerged };
}

export type SourceQuality = {
  feedsRepresented: number;
  independentPublishers: number;
  duplicateStoriesMerged: number;
  undatedItems: number;
  staleItems: number;
  uniqueStories: number;
};

export function analyzeSourceQuality(
  items: readonly ResearchDocument[],
  duplicateStoriesMerged = 0,
  now = Date.now(),
): SourceQuality {
  const feedIds = items.flatMap((item) => item.sourceIds?.length
    ? item.sourceIds
    : [item.sourceId ?? item.sourceName ?? '']);
  const feeds = new Set(feedIds.filter(Boolean));
  const families = new Set(items.flatMap((item) => {
    const ids = item.sourceIds?.length ? item.sourceIds : [item.sourceId];
    return ids.filter((id): id is string => Boolean(id))
      .map((id) => publisherFamily({ ...item, sourceId: id }));
  }).filter((family) => family !== 'unknown'));
  const undatedItems = items.filter((item) => !timestamp(item.publishedAt)).length;
  const staleItems = items.filter((item) => {
    const date = timestamp(item.publishedAt);
    return date > 0 && now - date > 90 * 24 * 60 * 60 * 1000;
  }).length;
  return {
    feedsRepresented: feeds.size,
    independentPublishers: families.size,
    duplicateStoriesMerged,
    undatedItems,
    staleItems,
    uniqueStories: items.length,
  };
}

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

export type MonthlyTrend = {
  direction: 'rising' | 'falling' | 'stable' | 'insufficient-data';
  observations: number;
  changePercent: number | null;
  anomaly: 'spike' | 'drop' | null;
  latestMonth?: string;
  latestViews?: number;
  scenarios: string[];
};

export function analyzeMonthlyViews(
  observations: readonly { month: string; views: number }[],
): MonthlyTrend {
  const byMonth = new Map<string, number>();
  for (const point of observations) {
    if (/^\d{4}-\d{2}$/.test(point.month) && Number.isFinite(point.views) && point.views >= 0) {
      byMonth.set(point.month, point.views);
    }
  }
  const series = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  const latest = series[series.length - 1];
  if (series.length < 4 || series.every(([, value]) => value === 0)) {
    return {
      direction: 'insufficient-data',
      observations: series.length,
      changePercent: null,
      anomaly: null,
      ...(latest ? { latestMonth: latest[0], latestViews: latest[1] } : {}),
      scenarios: [],
    };
  }
  const values = series.map(([, value]) => value);
  const split = Math.floor(values.length / 2);
  const baseline = mean(values.slice(0, split));
  const recent = mean(values.slice(split));
  const changePercent = baseline > 0 ? ((recent - baseline) / baseline) * 100 : null;
  const direction = changePercent === null ? 'insufficient-data'
    : changePercent >= 15 ? 'rising'
      : changePercent <= -15 ? 'falling'
        : 'stable';
  const previous = values.slice(0, -1);
  const reference = median(previous);
  let anomaly: 'spike' | 'drop' | null = null;
  if (previous.length >= 3 && reference > 0 && latest) {
    if (latest[1] >= reference * 2.5) anomaly = 'spike';
    else if (latest[1] <= reference * 0.4) anomaly = 'drop';
  }
  const scenarios = series.length >= 6 && changePercent !== null
    ? [
        'If the recent direction continues, attention may remain near the current range; this is conditional, not a forecast.',
        'If activity returns toward its earlier average, the recent change may fade.',
        'If the series changes direction, the current pattern should not be extrapolated.',
      ]
    : [];
  return {
    direction,
    observations: series.length,
    changePercent: changePercent === null ? null : Math.round(changePercent * 10) / 10,
    anomaly,
    ...(latest ? { latestMonth: latest[0], latestViews: latest[1] } : {}),
    scenarios,
  };
}

export type ResearchVideoSort = 'Newest' | 'Oldest' | 'Most Views' | 'Least Views' | 'Most Likes' | 'Least Likes' | 'Most Relevant' | 'A-Z' | 'Z-A';

export function sortResearchVideos<T extends {
  id?: string;
  title: string;
  publishedAt: string;
  viewCount?: number | null;
  likeCount?: number | null;
}>(
  videos: readonly T[],
  sort: ResearchVideoSort,
  topic = '',
): T[] {
  return [...videos].sort((a, b) => {
    let primary = 0;
    if (sort === 'Most Relevant') {
      primary = scoreResearchText(topic, b.title) - scoreResearchText(topic, a.title);
    } else if (sort === 'Most Views' || sort === 'Least Views' ||
      sort === 'Most Likes' || sort === 'Least Likes') {
      const field = sort === 'Most Views' || sort === 'Least Views' ? 'viewCount' : 'likeCount';
      const first = a[field];
      const second = b[field];
      if (first == null && second != null) return 1;
      if (first != null && second == null) return -1;
      if (first != null && second != null && first !== second) {
        const descending = sort === 'Most Views' || sort === 'Most Likes';
        primary = descending ? second - first : first - second;
      }
    } else if (sort === 'A-Z' || sort === 'Z-A') {
      primary = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
      if (sort === 'Z-A') primary *= -1;
    } else {
      const firstDate = timestamp(a.publishedAt);
      const secondDate = timestamp(b.publishedAt);
      primary = sort === 'Newest' ? secondDate - firstDate : firstDate - secondDate;
    }
    if (primary) return primary;
    const dateDifference = timestamp(b.publishedAt) - timestamp(a.publishedAt);
    if (dateDifference) return dateDifference;
    const titleDifference = a.title.localeCompare(b.title);
    if (titleDifference) return titleDifference;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}

export function buildResearchInterestProfile(
  ideas: readonly { topic: string; status: string }[],
): ResearchFeedbackProfile {
  const positiveTopics = ideas
    .filter((idea) => ['Saved Opportunities', 'Strong Opportunities', 'Promising Topics', 'Completed Research'].includes(idea.status))
    .slice(0, 40)
    .map((idea) => idea.topic);
  const negativeTopics = ideas
    .filter((idea) => idea.status === 'Rejected Ideas')
    .slice(0, 20)
    .map((idea) => idea.topic);
  return { positiveTopics, negativeTopics };
}


export type PublicationFreshness = {
  status: 'fresh' | 'recent' | 'stale' | 'undated' | 'future-dated';
  ageDays: number | null;
};

/** Publication age is a transparent label, never a proxy for factual validity. */
export function classifyPublicationFreshness(
  publishedAt: string | null | undefined,
  now = Date.now(),
): PublicationFreshness {
  if (!publishedAt) return { status: 'undated', ageDays: null };
  const published = Date.parse(publishedAt);
  if (!Number.isFinite(published)) return { status: 'undated', ageDays: null };
  const delta = now - published;
  if (delta < -24 * 60 * 60 * 1000) return { status: 'future-dated', ageDays: null };
  const ageDays = Math.max(0, delta / (24 * 60 * 60 * 1000));
  if (ageDays <= 7) return { status: 'fresh', ageDays };
  if (ageDays <= 30) return { status: 'recent', ageDays };
  return { status: 'stale', ageDays };
}
