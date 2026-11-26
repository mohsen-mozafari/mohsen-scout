import { EDITORIAL_PRIORITY_CONFIG } from './editorial-priority';
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

export type EmergentResearchConcept = {
  id: string;
  term: string;
  mentionCount: number;
  evidenceIds: string[];
  sourceCount: number;
};

export type EmergentConceptRelation = {
  id: string;
  fromConceptId: string;
  toConceptId: string;
  evidenceIds: string[];
  cooccurrenceCount: number;
};

export function extractResearchEntityCandidates(
  documents: readonly ResearchEntityDocument[],
): ResearchEntityCandidate[] {
  const results: ResearchEntityCandidate[] = [];
  // Normalization is invariant for this extraction pass. Prepare each document
  // once instead of repeating Unicode normalization for every known entity.
  const searchableDocuments = documents.map((document) => ({
    ...document,
    normalizedText: ' ' + normalizeResearchText(document.text) + ' ',
  }));
  for (const entity of RESEARCH_ENTITY_ALIASES) {
    const evidenceIds: string[] = [];
    const sourceIds = new Set<string>();
    const aliases = entity.aliases
      .map((alias) => ' ' + normalizeResearchText(alias) + ' ')
      .filter((needle) => needle.length > 4);
    let mentionCount = 0;
    for (const document of searchableDocuments) {
      const normalizedText = document.normalizedText;
      let documentMentions = 0;
      for (const needle of aliases) {
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
  const evidenceSets = entities.map((entity) => new Set(entity.evidenceIds));
  for (let left = 0; left < entities.length; left += 1) {
    for (let right = left + 1; right < entities.length; right += 1) {
      const rightEvidence = evidenceSets[right];
      const evidenceIds = entities[left].evidenceIds.filter((id) => rightEvidence.has(id));
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

/**
 * Extracts recurring non-topic terms from the actual evidence set. Counts are
 * document-based, not corpus-wide claims; callers must label the bounded sample.
 */
export function extractEmergentResearchConcepts(
  documents: readonly ResearchEntityDocument[],
  topic: string,
  minimumDocumentCount = 2,
  limit = 10,
): EmergentResearchConcept[] {
  const topicTerms = new Set(tokenizeResearchText(topic).filter((term) => term.length > 2));
  const aggregates = new Map<string, {
    mentionCount: number;
    evidenceIds: Set<string>;
    sourceIds: Set<string>;
  }>();
  for (const document of documents) {
    const counts = new Map<string, number>();
    for (const term of tokenizeResearchText(document.text)) {
      if (term.length < 3 || STOP_WORDS.has(term) || topicTerms.has(term) || term.startsWith('__concept_')) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
    for (const [term, count] of counts) {
      const aggregate = aggregates.get(term) ?? {
        mentionCount: 0,
        evidenceIds: new Set<string>(),
        sourceIds: new Set<string>(),
      };
      aggregate.mentionCount += count;
      aggregate.evidenceIds.add(document.id);
      aggregate.sourceIds.add(document.sourceId?.trim() || document.id);
      aggregates.set(term, aggregate);
    }
  }
  const minimum = Math.max(1, Math.floor(minimumDocumentCount) || 1);
  const maximum = Math.max(0, Math.min(30, Math.floor(limit) || 0));
  return [...aggregates.entries()]
    .filter(([, item]) => item.evidenceIds.size >= minimum)
    .map(([term, item]) => ({
      id: 'concept:' + term.replace(/[^\\p{L}\\p{N}]+/gu, '-').slice(0, 90),
      term,
      mentionCount: item.mentionCount,
      evidenceIds: [...item.evidenceIds].sort(),
      sourceCount: item.sourceIds.size,
    }))
    .sort((a, b) =>
      b.evidenceIds.length - a.evidenceIds.length ||
      b.sourceCount - a.sourceCount ||
      b.mentionCount - a.mentionCount ||
      a.term.localeCompare(b.term),
    )
    .slice(0, maximum);
}

/** Links recurring concepts only when they co-occur in multiple retrieved documents. */
export function buildEmergentConceptRelations(
  concepts: readonly EmergentResearchConcept[],
  minimumSharedDocuments = 2,
): EmergentConceptRelation[] {
  const relations: EmergentConceptRelation[] = [];
  const evidenceSets = concepts.map((concept) => new Set(concept.evidenceIds));
  const minimum = Math.max(1, Math.floor(minimumSharedDocuments) || 1);
  for (let left = 0; left < concepts.length; left += 1) {
    for (let right = left + 1; right < concepts.length; right += 1) {
      const evidenceIds = concepts[left]!.evidenceIds.filter((id) => evidenceSets[right]!.has(id));
      if (evidenceIds.length < minimum) continue;
      relations.push({
        id: 'concept-cooccurrence:' + concepts[left]!.id + ':' + concepts[right]!.id,
        fromConceptId: concepts[left]!.id,
        toConceptId: concepts[right]!.id,
        evidenceIds,
        cooccurrenceCount: evidenceIds.length,
      });
    }
  }
  return relations.sort((a, b) => b.cooccurrenceCount - a.cooccurrenceCount || a.id.localeCompare(b.id));
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

/**
 * Stronger topic gate for idea generation. Known acronyms are useful entity
 * anchors, but an acronym alone cannot qualify a multi-concept topic.
 */
export function matchesStrongResearchTopic(value: string, topic: string): boolean {
  const topicTokens = [...new Set(tokenizeResearchText(topic).filter((token) => token.length > 2))];
  if (!topicTokens.length) return false;
  const rawTokens = topic.match(/[\p{L}\p{N}]+/gu) ?? [];
  const acronymTokens = new Set(rawTokens
    .filter((token) => token.length >= 2 && token.length <= 5 && token === token.toUpperCase())
    .map((token) => tokenizeResearchText(token)[0])
    .filter((token): token is string => Boolean(token)));
  const coreTokens = topicTokens.filter((token) => !acronymTokens.has(token));
  if (!coreTokens.length) return matchesAnyResearchTerms(value, [topic]);
  const evidenceTokens = new Set(tokenizeResearchText(value));
  const overlap = coreTokens.filter((token) => evidenceTokens.has(token)).length;
  const required = acronymTokens.size ? 1 : Math.max(1, Math.ceil(coreTokens.length * 0.6));
  return overlap >= required;
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

function publisherFamilies(item: ResearchDocument): string[] {
  const sourceIds = item.sourceIds?.length
    ? item.sourceIds
    : [item.sourceId].filter((id): id is string => Boolean(id));
  if (!sourceIds.length) return [publisherFamily(item)];
  return [...new Set(sourceIds.map((sourceId) => publisherFamily({ ...item, sourceId })))]
    .filter((family) => family !== 'unknown');
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
    /** Always null: this score is not a forecast of audience size or demand. */
    audienceSignal: null;
    differentiation: number;
    /** Bounded score from measured snapshot velocity and channel-relative outlier data only. */
    platformMomentum: number;
  };
  reason: string;
};

/**
 * Explainable editorial prioritization from the supplied research sample.
 * This is a relative editorial decision aid, never a prediction of views,
 * revenue, audience demand or virality. Lifetime view counts are excluded;
 * platform momentum uses measured snapshot velocity and channel-relative history only.
 */
export type EditorialOpportunityScorerInput = {
  topic: string;
  news: readonly ResearchDocument[];
  historicalNews?: readonly ResearchDocument[];
  context?: readonly ResearchDocument[];
  videos: readonly { title: string; description?: string; channel?: string; publishedAt?: string; viewCount?: number | null; viewsPerHour?: number | null; viewsPerDay?: number | null; channelOutlierRatio?: number | null }[];
  now?: number;
};

type IndexedEditorialDocument = {
  date: number;
  families: readonly string[];
  kind: 'news' | 'history' | 'video' | 'context';
  channel: string;
  momentum: number;
};

/**
 * Builds a reusable, in-memory inverted index for editorial scoring.
 * Each source document is normalized and compared with the topic once; candidate
 * anchors then look up matching evidence instead of tokenizing the whole corpus
 * again. The index is scoped to one generation call and is never persisted.
 */
export function createEditorialOpportunityScorer(
  input: EditorialOpportunityScorerInput,
): (anchor: string) => EditorialOpportunitySignals {
  const now = input.now ?? Date.now();
  const sourceDocuments: {
    text: string;
    date: number;
    families: readonly string[];
    kind: IndexedEditorialDocument['kind'];
    channel: string;
    momentum: number;
  }[] = [
    ...input.news.map((item) => ({
      text: item.title + ' ' + (item.summary ?? ''),
      date: timestamp(item.publishedAt),
      families: publisherFamilies(item),
      kind: 'news' as const,
      channel: '', momentum: 0,
    })),
    ...(input.historicalNews ?? []).map((item) => ({
      text: item.title + ' ' + (item.summary ?? ''),
      date: timestamp(item.publishedAt),
      families: publisherFamilies(item),
      kind: 'history' as const,
      channel: '', momentum: 0,
    })),
    ...(input.context ?? []).map((item) => ({
      text: item.title + ' ' + (item.summary ?? ''),
      date: timestamp(item.publishedAt),
      families: [] as string[],
      kind: 'context' as const,
      channel: '', momentum: 0,
    })),
    // YouTube contributes platform relevance/freshness, never independent-publisher corroboration.
    ...input.videos.map((item) => {
      const rate = item.viewsPerHour ?? (item.viewsPerDay == null ? null : item.viewsPerDay / 24);
      const velocityScore = rate !== null && Number.isFinite(rate) && rate > 0
        ? Math.min(100, Math.log10(1 + rate) * 22) : 0;
      const outlierScore = item.channelOutlierRatio !== null && item.channelOutlierRatio !== undefined &&
        Number.isFinite(item.channelOutlierRatio) && item.channelOutlierRatio > 0
        ? Math.min(100, Math.log10(1 + item.channelOutlierRatio) * 35) : 0;
      return {
        text: item.title + ' ' + (item.description ?? ''), date: timestamp(item.publishedAt),
        families: [] as string[], kind: 'video' as const, channel: item.channel ?? '',
        momentum: Math.round(velocityScore * 0.7 + outlierScore * 0.3),
      };
    }),
  ];

  const documents: IndexedEditorialDocument[] = [];
  const tokenIndex = new Map<string, number[]>();
  const topicRelevantDocuments = new Set<number>();

  for (const source of sourceDocuments) {
    const tokens = new Set(tokenizeResearchText(source.text));
    const index = documents.length;
    documents.push({
      date: source.date,
      families: source.families,
      kind: source.kind,
      channel: source.channel,
      momentum: source.momentum,
    });

    if (scoreResearchText(input.topic, source.text) > 0) topicRelevantDocuments.add(index);
    // Index every record, then select evidence by the individual editorial anchor.
    // This keeps anchor-specific context (e.g. Wikimedia article data) while
    // preventing unrelated parent-topic videos from bleeding into another angle.
    for (const token of tokens) {
      const posting = tokenIndex.get(token);
      if (posting) posting.push(index);
      else tokenIndex.set(token, [index]);
    }
  }

  return (anchor: string): EditorialOpportunitySignals => {
    const anchorTokens = new Set(tokenizeResearchText(anchor));
    const anchorDocuments = new Set<number>();
    for (const token of anchorTokens) {
      for (const index of tokenIndex.get(token) ?? []) anchorDocuments.add(index);
    }

    // A subtopic score uses documents that match this anchor. Parent-topic context
    // is only a fallback when no directly matching records exist.
    const relevantIndexes = anchorDocuments.size
      ? new Set(anchorDocuments)
      : new Set(topicRelevantDocuments);

    const relevant: IndexedEditorialDocument[] = [];
    for (const index of relevantIndexes) relevant.push(documents[index]);

    const overlap = anchorTokens.size
      ? anchorDocuments.size / Math.max(1, relevant.length)
      : 0;
    const relevance = Math.round(Math.min(100, overlap * 70 + (relevant.length ? 30 : 0)));
    const publisherGroups = new Set<string>();
    const kinds = new Set<IndexedEditorialDocument['kind']>();
    for (const document of relevant) {
      kinds.add(document.kind);
      if (document.kind !== 'context' && document.kind !== 'video') {
        for (const family of document.families) publisherGroups.add(family);
      }
    }
    const evidenceBreadth = Math.round(Math.min(100,
      publisherGroups.size * 22 + kinds.size * 18));
    const dated = relevant.filter((item) => item.date > 0);
    const fresh = dated.filter((item) =>
      now - item.date <= 30 * 86400000 && now >= item.date - 86400000).length;
    // Missing dates are missing evidence, not a neutral or invented freshness score.
    const freshness = dated.length ? Math.round(100 * fresh / dated.length) : 0;
    const audienceSignal = null;
    const platformVideos = relevant.filter((item) => item.kind === 'video');
    const platformMomentum = platformVideos.length
      ? Math.round(platformVideos.reduce((sum, item) => sum + item.momentum, 0) / platformVideos.length)
      : 0;
    const anchorFrequency = anchorDocuments.size;
    const differentiation = Math.round(Math.max(0, Math.min(100,
      100 - Math.min(65, Math.max(0, anchorFrequency - 1) * 7))));
    const measuredMomentumAvailable = platformVideos.some((item) => item.momentum > 0);
    const activeWeights = measuredMomentumAvailable
      ? EDITORIAL_PRIORITY_CONFIG.weights
      : EDITORIAL_PRIORITY_CONFIG.baseWeights;
    const weighted = [
      { value: relevance, weight: activeWeights.relevance },
      { value: evidenceBreadth, weight: activeWeights.evidenceBreadth },
      { value: freshness, weight: activeWeights.freshness },
      { value: differentiation, weight: activeWeights.differentiation },
      ...(measuredMomentumAvailable
        ? [{ value: platformMomentum, weight: EDITORIAL_PRIORITY_CONFIG.weights.platformMomentum }]
        : []),
    ];
    const score = Math.round(weighted.reduce((sum, part) => sum + part.value * part.weight, 0));
    const freshnessRatio = dated.length ? fresh / dated.length : 0;
    const confidence: EditorialOpportunitySignals['confidence'] =
      relevant.length >= 12 && publisherGroups.size >= 3 && fresh >= 3 && freshnessRatio >= 0.25
        ? 'high'
        : relevant.length >= 5 && publisherGroups.size >= 2 && (fresh >= 1 || dated.length === 0)
          ? 'moderate' : 'low';
    const currentPublisherItems = relevant.filter((item) => item.kind === 'news').length;
    const historicalPublisherItems = relevant.filter((item) => item.kind === 'history').length;
    const supportingContextItems = relevant.filter((item) => item.kind === 'context').length;
    const reason = [
      relevance >= 65 ? 'strong topic/anchor alignment' : 'limited direct topic alignment',
      publisherGroups.size ? publisherGroups.size + ' publisher group(s) across current and saved research' : 'no directly relevant publisher group',
      currentPublisherItems + ' current and ' + historicalPublisherItems + ' historical publisher record(s) matched',
      supportingContextItems + ' supporting context record(s) matched',
      platformVideos.length + ' YouTube platform observation(s) matched',
      platformVideos.length ? 'measured platform momentum ' + platformMomentum + '/100 from view velocity and channel-relative outliers; not a demand forecast' : 'no measured platform-momentum sample',
      fresh ? fresh + ' fresh dated evidence record(s)' : 'no fresh dated evidence record',
      'lifetime view counts are not used as demand; platform momentum uses measured snapshot velocity only',
    ].join('; ');
    return {
      score,
      confidence,
      components: { relevance, evidenceBreadth, freshness, audienceSignal, differentiation, platformMomentum },
      reason,
    };
  };
}

/**
 * Explainable editorial prioritization from the supplied research sample.
 * This is a relative editorial decision aid, never a prediction of views,
 * revenue, audience demand, growth or virality. Raw view counts are deliberately
 * excluded from the calculation; missing evidence is not fabricated.
 */
export function scoreEditorialOpportunity(
  input: EditorialOpportunityScorerInput & { anchor: string },
): EditorialOpportunitySignals {
  const { anchor, ...scorerInput } = input;
  return createEditorialOpportunityScorer(scorerInput)(anchor);
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
