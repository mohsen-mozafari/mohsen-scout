export type ResearchFeedbackProfile = {
  positiveTopics: string[];
  negativeTopics: string[];
};

export type ResearchEntityKind = 'organization' | 'mission' | 'instrument' | 'celestial-body' | 'project';
export type ResearchEntityCandidate = {
  id: string;
  name: string;
  kind: ResearchEntityKind;
  aliases: string[];
  mentionCount: number;
  evidenceIds: string[];
  sourceIds: string[];
};
export type ResearchEntityRelation = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: 'co-mentioned';
  evidenceIds: string[];
  evidenceCount: number;
};

const RESEARCH_ENTITY_ALIASES: readonly {
  name: string;
  kind: ResearchEntityKind;
  aliases: readonly string[];
}[] = [
  { name: 'NASA', kind: 'organization', aliases: ['NASA', 'National Aeronautics and Space Administration'] },
  { name: 'ESA', kind: 'organization', aliases: ['ESA', 'European Space Agency'] },
  { name: 'JPL', kind: 'organization', aliases: ['JPL', 'Jet Propulsion Laboratory'] },
  { name: 'CNEOS', kind: 'organization', aliases: ['CNEOS', 'Center for Near-Earth Object Studies'] },
  { name: 'SpaceX', kind: 'organization', aliases: ['SpaceX', 'Space Exploration Technologies'] },
  { name: 'JWST', kind: 'instrument', aliases: ['JWST', 'James Webb Space Telescope', 'Webb telescope', 'تلسکوپ جیمز وب'] },
  { name: 'Hubble Space Telescope', kind: 'instrument', aliases: ['Hubble Space Telescope', 'Hubble telescope', 'هابل'] },
  { name: 'Artemis', kind: 'mission', aliases: ['Artemis', 'Artemis program', 'برنامه آرتمیس'] },
  { name: 'Euclid', kind: 'mission', aliases: ['Euclid', 'Euclid mission', 'ماموریت اقلیدس'] },
  { name: 'Europa Clipper', kind: 'mission', aliases: ['Europa Clipper'] },
  { name: 'Mars', kind: 'celestial-body', aliases: ['Mars', 'planet Mars', 'مریخ'] },
  { name: 'Moon', kind: 'celestial-body', aliases: ['Moon', 'Earth\'s Moon', 'ماه زمین', 'قمر زمین'] },
  { name: 'Jupiter', kind: 'celestial-body', aliases: ['Jupiter', 'مشتری'] },
  { name: 'Saturn', kind: 'celestial-body', aliases: ['Saturn', 'زحل'] },
];

export type ResearchEntityDocument = { id: string; text: string; sourceId?: string };

export function extractResearchEntityCandidates(
  documents: readonly ResearchEntityDocument[],
): ResearchEntityCandidate[] {
  const results: ResearchEntityCandidate[] = [];
  for (const entity of RESEARCH_ENTITY_ALIASES) {
    const evidenceIds: string[] = [];
    const sourceIds = new Set<string>();
    let mentionCount = 0;
    for (const document of documents) {
      const normalizedText = ' ' + normalizeResearchText(document.text) + ' ';
      let documentMentions = 0;
      for (const alias of entity.aliases) {
        const needle = ' ' + normalizeResearchText(alias) + ' ';
        if (needle.trim().length <= 2) continue;
        let offset = 0;
        while ((offset = normalizedText.indexOf(needle, offset)) >= 0) {
          documentMentions += 1;
          offset += needle.length;
        }
      }
      if (documentMentions) {
        mentionCount += documentMentions;
        evidenceIds.push(document.id);
        if (document.sourceId) sourceIds.add(document.sourceId);
      }
    }
    if (evidenceIds.length) results.push({
      id: 'entity:' + entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: entity.name,
      kind: entity.kind,
      aliases: [...entity.aliases],
      mentionCount,
      evidenceIds: [...new Set(evidenceIds)],
      sourceIds: [...sourceIds].sort(),
    });
  }
  return results.sort((a, b) => b.evidenceIds.length - a.evidenceIds.length || b.mentionCount - a.mentionCount || a.name.localeCompare(b.name));
}

export function buildResearchEntityRelations(
  entities: readonly ResearchEntityCandidate[],
): ResearchEntityRelation[] {
  const relations: ResearchEntityRelation[] = [];
  for (let left = 0; left < entities.length; left += 1) {
    for (let right = left + 1; right < entities.length; right += 1) {
      const evidenceIds = entities[left].evidenceIds.filter((id) => entities[right].evidenceIds.includes(id));
      if (!evidenceIds.length) continue;
      relations.push({
        id: 'co-mention:' + entities[left].id + ':' + entities[right].id,
        fromEntityId: entities[left].id,
        toEntityId: entities[right].id,
        type: 'co-mentioned',
        evidenceIds,
        evidenceCount: evidenceIds.length,
      });
    }
  }
  return relations;
}

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

const NORMALIZED_TEXT_CACHE_LIMIT = 4096;
const normalizedTextCache = new Map<string, string>();
const tokenizedTextCache = new Map<string, readonly string[]>();
const TOKENIZED_TEXT_CACHE_LIMIT = 4096;
const expandedTokenCache = new Map<string, ReadonlySet<string>>();
const EXPANDED_TOKEN_CACHE_LIMIT = 2048;

export function normalizeResearchText(value: string): string {
  if (value.length <= 4096) {
    const cached = normalizedTextCache.get(value);
    if (cached !== undefined) {
      normalizedTextCache.delete(value);
      normalizedTextCache.set(value, cached);
      return cached;
    }
  }
  const normalized = value
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
  if (value.length <= 4096) {
    normalizedTextCache.set(value, normalized);
    if (normalizedTextCache.size > NORMALIZED_TEXT_CACHE_LIMIT) {
      const oldest = normalizedTextCache.keys().next().value;
      if (oldest !== undefined) normalizedTextCache.delete(oldest);
    }
  }
  return normalized;
}

export function tokenizeResearchText(value: string): string[] {
  const normalized = normalizeResearchText(value);
  if (normalized.length <= 4096) {
    const cached = tokenizedTextCache.get(normalized);
    if (cached) {
      tokenizedTextCache.delete(normalized);
      tokenizedTextCache.set(normalized, cached);
      return [...cached];
    }
  }
  const tokens = normalized
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .map((token) => {
      if (/^[a-z]+$/.test(token)) {
        if (token.endsWith('ies') && token.length > 4) return token.slice(0, -3) + 'y';
        if (token.endsWith('s') && token.length > 4 && !token.endsWith('ss')) return token.slice(0, -1);
      }
      return token;
    });
  if (normalized.length <= 4096) {
    tokenizedTextCache.set(normalized, tokens);
    if (tokenizedTextCache.size > TOKENIZED_TEXT_CACHE_LIMIT) {
      const oldest = tokenizedTextCache.keys().next().value;
      if (oldest !== undefined) tokenizedTextCache.delete(oldest);
    }
  }
  // A caller may sort or mutate its returned list; do not expose the cached array.
  return [...tokens];
}

function conceptIndexes(value: string): number[] {
  const normalized = normalizeResearchText(value);
  return CONCEPT_ALIASES
    .map((aliases, index) => aliases.some((alias) => normalized.includes(normalizeResearchText(alias))) ? index : -1)
    .filter((index) => index >= 0);
}

function expandedConceptTokens(value: string): ReadonlySet<string> {
  const cached = expandedTokenCache.get(value);
  if (cached) {
    expandedTokenCache.delete(value);
    expandedTokenCache.set(value, cached);
    return cached;
  }
  const tokens = new Set(tokenizeResearchText(value));
  for (const index of conceptIndexes(value)) tokens.add('__concept_' + index);
  expandedTokenCache.set(value, tokens);
  if (expandedTokenCache.size > EXPANDED_TOKEN_CACHE_LIMIT) {
    const oldest = expandedTokenCache.keys().next().value;
    if (oldest !== undefined) expandedTokenCache.delete(oldest);
  }
  return tokens;
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

export function matchesAnyResearchTerms(value: string, terms: readonly string[]): boolean {
  const normalizedValue = normalizeResearchText(value);
  if (!normalizedValue || !terms.length) return false;
  const valueTokens = expandedConceptTokens(value);
  for (const term of terms) {
    const normalizedTerm = normalizeResearchText(term);
    if (!normalizedTerm) continue;
    if (normalizedValue.includes(normalizedTerm)) return true;
    const termTokens = expandedConceptTokens(term);
    for (const token of termTokens) {
      if (token.startsWith('__concept_') && valueTokens.has(token)) return true;
    }
    let overlap = 0;
    for (const token of termTokens) {
      if (valueTokens.has(token)) overlap += 1;
    }
    if (overlap >= Math.max(1, Math.ceil(termTokens.size * 0.6))) return true;
  }
  return false;
}

export function matchesResearchTerms(value: string, terms: readonly string[]): boolean {
  return matchesAnyResearchTerms(value, terms);
}

function relevanceWithFeedback<T extends ResearchDocument>(
  topic: string,
  item: T,
  feedback?: ResearchFeedbackProfile,
): number {
  let score = scoreResearchText(topic, item.title, item.summary ?? '');
  if (!feedback) return score;
  const text = item.title + ' ' + (item.summary ?? '');
  if (matchesAnyResearchTerms(text, feedback.positiveTopics)) score += 1;
  if (matchesAnyResearchTerms(text, feedback.negativeTopics)) score -= 2;
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

function titleTokenSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function publisherFamily(item: ResearchDocument): string {
  const id = item.sourceId?.toLowerCase() ?? '';
  if (id === 'nasa' || id === 'jpl' || id === 'cneos') return 'nasa';
  if (id.startsWith('esa')) return 'esa';
  if (id === 'space-com' || id === 'phys-space' || id === 'universe-today' || id === 'sky-telescope') return id;
  const name = normalizeResearchText(item.sourceName ?? '');
  return name || (canonicalizeResearchUrl(item.sourceUrl).split('/')[2] ?? 'unknown');
}

export function deduplicateResearchEvidence<T extends ResearchDocument>(
  items: readonly T[],
): { items: (T & Pick<ResearchDocument, 'sourceCount' | 'sourceIds'>)[]; duplicatesMerged: number } {
  const result: (T & Pick<ResearchDocument, 'sourceCount' | 'sourceIds'>)[] = [];
  const canonicalUrlIndex = new Map<string, number>();
  const normalizedTitleIndex = new Map<string, number>();
  const tokenIndex = new Map<string, number[]>();
  const titleTokenSets: Set<string>[] = [];
  let duplicatesMerged = 0;

  for (const item of items) {
    const canonicalUrl = canonicalizeResearchUrl(item.sourceUrl);
    const normalizedTitle = normalizeResearchText(item.title);
    const titleTokens = new Set(tokenizeResearchText(item.title));
    let duplicateIndex = Number.MAX_SAFE_INTEGER;
    const urlMatch = canonicalUrl ? canonicalUrlIndex.get(canonicalUrl) : undefined;
    const titleMatch = normalizedTitle ? normalizedTitleIndex.get(normalizedTitle) : undefined;
    if (urlMatch !== undefined) duplicateIndex = Math.min(duplicateIndex, urlMatch);
    if (titleMatch !== undefined) duplicateIndex = Math.min(duplicateIndex, titleMatch);

    // At Jaccard >= 0.94, title token sets share almost all of their tokens.
    // Probe a rare 7%+ subset, avoiding a full scan of the existing collection.
    if (titleTokens.size >= 4) {
      const postings = [...titleTokens]
        .map((token) => tokenIndex.get(token))
        .filter((list): list is number[] => Boolean(list))
        .sort((a, b) => a.length - b.length);
      const probeCount = Math.min(postings.length, Math.floor(titleTokens.size * 0.07) + 1);
      const candidates = new Set<number>();
      for (let postingIndex = 0; postingIndex < probeCount; postingIndex += 1) {
        for (const candidate of postings[postingIndex]) {
          if (candidate < duplicateIndex) candidates.add(candidate);
        }
      }
      for (const candidate of candidates) {
        if (titleTokenSimilarity(titleTokens, titleTokenSets[candidate]) >= 0.94) {
          duplicateIndex = Math.min(duplicateIndex, candidate);
        }
      }
    }

    if (duplicateIndex === Number.MAX_SAFE_INTEGER) {
      const index = result.length;
      result.push(item);
      titleTokenSets.push(titleTokens);
      if (canonicalUrl) canonicalUrlIndex.set(canonicalUrl, index);
      if (normalizedTitle) normalizedTitleIndex.set(normalizedTitle, index);
      for (const token of titleTokens) {
        const posting = tokenIndex.get(token);
        if (posting) posting.push(index);
        else tokenIndex.set(token, [index]);
      }
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


export type EditorialOpportunitySignals = {
  score: number;
  confidence: 'low' | 'moderate' | 'high';
  components: {
    relevance: number;
    evidenceBreadth: number;
    freshness: number;
    /** Always null: raw lifetime views are not converted into demand or growth estimates. */
    audienceSignal: null;
    differentiation: number;
  };
  reason: string;
};

/**
 * Explainable editorial prioritization from the supplied research sample.
 * This is a relative editorial decision aid, never a prediction of views,
 * revenue, audience demand, growth or virality. Raw view counts are deliberately
 * excluded from the calculation; missing evidence is not fabricated.
 */
export function scoreEditorialOpportunity(input: {
  topic: string;
  anchor: string;
  news: readonly ResearchDocument[];
  historicalNews?: readonly ResearchDocument[];
  videos: readonly { title: string; description?: string; channel?: string; publishedAt?: string; viewCount?: number | null }[];
  now?: number;
}): EditorialOpportunitySignals {
  const now = input.now ?? Date.now();
  const anchorTokens = new Set(tokenizeResearchText(input.anchor));
  const documents = [
    ...input.news.map((item) => ({
      text: item.title + ' ' + (item.summary ?? ''),
      date: timestamp(item.publishedAt),
      family: publisherFamily(item),
      kind: 'news' as const,
      channel: '',
    })),
    ...(input.historicalNews ?? []).map((item) => ({
      text: item.title + ' ' + (item.summary ?? ''),
      date: timestamp(item.publishedAt),
      family: publisherFamily(item),
      kind: 'history' as const,
      channel: '',
    })),
    ...input.videos.map((item) => ({
      text: item.title + ' ' + (item.description ?? ''),
      date: timestamp(item.publishedAt),
      family: 'youtube',
      kind: 'video' as const,
      channel: item.channel ?? '',
    })),
  ];
  const relevant = documents.filter((document) => {
    const tokens = new Set(tokenizeResearchText(document.text));
    return (anchorTokens.size > 0 && [...anchorTokens].some((token) => tokens.has(token))) ||
      scoreResearchText(input.topic, document.text) > 0;
  });
  const overlap = anchorTokens.size
    ? relevant.filter((document) => {
        const tokens = new Set(tokenizeResearchText(document.text));
        return [...anchorTokens].some((token) => tokens.has(token));
      }).length / Math.max(1, relevant.length)
    : 0;
  const relevance = Math.round(Math.min(100, overlap * 70 + (relevant.length ? 30 : 0)));
  const publisherFamilies = new Set(
    relevant.filter((item) => item.kind !== 'video' && item.family !== 'unknown').map((item) => item.family),
  );
  const videoChannels = new Set(relevant.filter((item) => item.kind === 'video' && item.channel).map((item) => item.channel));
  const kinds = new Set(relevant.map((item) => item.kind));
  const evidenceBreadth = Math.round(Math.min(100,
    publisherFamilies.size * 18 + videoChannels.size * 7 + kinds.size * 18));
  const dated = relevant.filter((item) => item.date > 0);
  const fresh = dated.filter((item) => now - item.date <= 30 * 86400000 && now >= item.date - 86400000).length;
  const freshness = dated.length ? Math.round(100 * fresh / dated.length) : 35;
  const audienceSignal = null;
  const anchorFrequency = documents.filter((item) => {
    const tokens = new Set(tokenizeResearchText(item.text));
    return anchorTokens.size > 0 && [...anchorTokens].some((token) => tokens.has(token));
  }).length;
  const saturation = input.videos.filter((item) =>
    scoreResearchText(input.topic, item.title, item.description ?? '') > 0).length;
  const differentiation = Math.round(Math.max(0, Math.min(100,
    100 - Math.min(65, Math.max(0, anchorFrequency - 1) * 7) -
    Math.min(35, Math.max(0, saturation - 2) * 3))));
  const weighted = [
    { value: relevance, weight: 0.30 },
    { value: evidenceBreadth, weight: 0.30 },
    { value: freshness, weight: 0.20 },
    { value: differentiation, weight: 0.20 },
  ];
  const score = Math.round(weighted.reduce((sum, part) => sum + part.value * part.weight, 0));
  const freshnessRatio = dated.length ? fresh / dated.length : 0;
  const confidence: EditorialOpportunitySignals['confidence'] =
    relevant.length >= 12 && publisherFamilies.size >= 3 && videoChannels.size >= 3 && fresh >= 3 && freshnessRatio >= 0.25
      ? 'high'
      : relevant.length >= 5 && (publisherFamilies.size >= 2 || videoChannels.size >= 2) && (fresh >= 1 || dated.length === 0)
        ? 'moderate' : 'low';
  const currentPublisherItems = relevant.filter((item) => item.kind === 'news').length;
  const historicalPublisherItems = relevant.filter((item) => item.kind === 'history').length;
  const reason = [
    relevance >= 65 ? 'strong topic/anchor alignment' : 'limited direct topic alignment',
    publisherFamilies.size ? publisherFamilies.size + ' publisher group(s) across current and saved research' : 'no directly relevant publisher group',
    currentPublisherItems + ' current and ' + historicalPublisherItems + ' historical publisher record(s) matched',
    videoChannels.size ? videoChannels.size + ' relevant YouTube channel(s)' : 'no relevant YouTube channel sample',
    fresh ? fresh + ' fresh dated evidence record(s)' : 'no fresh dated evidence record',
    'raw view counts are not treated as demand or growth indicators',
  ].join('; ');
  return {
    score,
    confidence,
    components: { relevance, evidenceBreadth, freshness, audienceSignal, differentiation },
    reason,
  };
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
