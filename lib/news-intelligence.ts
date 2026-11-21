import {
  deduplicateResearchEvidence,
  normalizeResearchText,
  tokenizeResearchText,
} from './intelligence';
import type { SpaceNewsItem } from './space';

export type PublisherMomentum = 'emerging' | 'rising' | 'steady' | 'cooling' | 'insufficient-data';

export type PublisherTopicCluster = {
  id: string;
  title: string;
  articleCount: number;
  publishers: string[];
  currentWindowCount: number;
  previousWindowCount: number;
  momentum: PublisherMomentum;
  momentumDelta: number | null;
  publisherCoverageScore: number;
  confidence: 'low' | 'moderate' | 'high';
  reason: string;
  evidence: Array<Pick<SpaceNewsItem, 'title' | 'url' | 'sourceName' | 'publishedAt'>>;
};

export type PublisherIntelligence = {
  inputCount: number;
  uniqueCount: number;
  duplicatesMerged: number;
  datedCount: number;
  undatedCount: number;
  processingMs: number;
  windowDays: number;
  clusters: PublisherTopicCluster[];
  limitations: string[];
};

type CorpusDocument = {
  item: SpaceNewsItem & { sourceCount?: number; sourceIds?: string[] };
  timestamp: number | null;
  grams: Set<string>;
};

const MAX_CLUSTERS = 12;
const MAX_EVIDENCE_PER_CLUSTER = 3;
const YIELD_EVERY_DOCUMENTS = 32;
const DAY_MS = 86400000;
const CLUSTER_BOILERPLATE_TERMS = new Set([
  'independent', 'publisher', 'publishers', 'report', 'reports', 'article', 'articles',
  'source', 'sources', 'context', 'official', 'press', 'release', 'released',
  'newsletter', 'subscribe', 'subscription', 'read', 'share', 'sharing', 'email',
  'copyright', 'credit', 'image', 'photo', 'video', 'videos', 'update', 'updates',
]);
const PUBLISHER_FAMILY: Record<string, string> = {
  nasa: 'NASA',
  jpl: 'NASA',
  cneos: 'NASA',
  'esa-space': 'ESA',
  'esa-science': 'ESA',
};

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function makeNgrams(tokens: readonly string[]): Set<string> {
  const output = new Set<string>();
  const words = tokens.filter((token) => token.length >= 2);
  for (let width = 1; width <= 3; width += 1) {
    for (let start = 0; start + width <= words.length; start += 1) {
      const phrase = words.slice(start, start + width).join(' ');
      if (phrase.length >= 3) output.add(phrase);
    }
  }
  return output;
}

function momentumFor(current: number, previous: number): PublisherMomentum {
  if (current === 0 && previous === 0) return 'insufficient-data';
  if (previous === 0) return 'emerging';
  if (current > previous) return 'rising';
  if (current < previous) return 'cooling';
  return 'steady';
}

function publisherGroups(item: CorpusDocument['item']): string[] {
  const ids = item.sourceIds?.length ? item.sourceIds : [item.sourceId];
  return [...new Set(ids.filter((id): id is string => Boolean(id)).map((id) =>
    PUBLISHER_FAMILY[id] ?? normalizeResearchText(id),
  ).filter(Boolean))];
}

/**
 * Builds explainable topic clusters from publisher RSS records only.
 * It deliberately does not accept or inspect YouTube API data, pageviews,
 * engagement counts, or any other platform metrics.
 *
 * Work is yielded in small batches so a large feed corpus does not monopolize
 * the React Native JavaScript event loop for one uninterrupted pass.
 */
export async function buildPublisherIntelligence(
  input: readonly SpaceNewsItem[],
  now = Date.now(),
  windowDays = 7,
): Promise<PublisherIntelligence> {
  const startedAt = Date.now();
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const normalizedWindow = Number.isFinite(windowDays)
    ? Math.max(1, Math.min(30, Math.floor(windowDays)))
    : 7;
  const deduplicated = deduplicateResearchEvidence(input.map((item) => ({
    ...item,
    sourceUrl: item.url,
  })));
  const documents: CorpusDocument[] = [];

  for (let index = 0; index < deduplicated.items.length; index += 1) {
    const item = deduplicated.items[index];
    const parsed = item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN;
    const timestamp = Number.isFinite(parsed) && parsed <= safeNow ? parsed : null;
    const titleTokens = tokenizeResearchText(item.title);
    const summaryTokens = tokenizeResearchText(item.summary ?? '')
      .filter((token) => !CLUSTER_BOILERPLATE_TERMS.has(token));
    // Titles carry the primary clustering signal; only non-boilerplate summary terms add context.
    const tokens = [...titleTokens, ...summaryTokens.slice(0, 18)];
    documents.push({
      item: item as CorpusDocument['item'],
      timestamp,
      grams: makeNgrams(tokens),
    });
    if ((index + 1) % YIELD_EVERY_DOCUMENTS === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  const termDocuments = new Map<string, number[]>();
  for (let index = 0; index < documents.length; index += 1) {
    for (const gram of documents[index].grams) {
      const previous = termDocuments.get(gram);
      if (previous) previous.push(index);
      else termDocuments.set(gram, [index]);
    }
  }

  const currentStart = safeNow - normalizedWindow * DAY_MS;
  const previousStart = currentStart - normalizedWindow * DAY_MS;
  const ranked: PublisherTopicCluster[] = [];

  for (const [phrase, indexes] of termDocuments) {
    if (indexes.length === 0) continue;
    const relevant = indexes.map((index) => documents[index]);
    const publishers = [...new Set(relevant.flatMap(({ item }) => publisherGroups(item)))].sort();
    const currentWindowCount = relevant.filter(({ timestamp }) =>
      timestamp !== null && timestamp >= currentStart,
    ).length;
    const previousWindowCount = relevant.filter(({ timestamp }) =>
      timestamp !== null && timestamp >= previousStart && timestamp < currentStart,
    ).length;
    const momentum = momentumFor(currentWindowCount, previousWindowCount);
    const momentumDelta = currentWindowCount || previousWindowCount
      ? currentWindowCount - previousWindowCount
      : null;
    const datedRelevant = relevant.filter(({ timestamp }) => timestamp !== null).length;
    const freshness = relevant.length ? currentWindowCount / relevant.length : 0;
    const sourceBreadth = clamp(publishers.length * 25);
    const evidenceBreadth = clamp(relevant.length * 18);
    const momentumSignal = momentum === 'insufficient-data'
      ? 0
      : previousWindowCount === 0
        ? clamp(currentWindowCount * 28)
        : clamp(50 + ((currentWindowCount - previousWindowCount) / Math.max(1, previousWindowCount)) * 35);
    const publisherCoverageScore = Math.round(
      sourceBreadth * 0.35 +
      evidenceBreadth * 0.20 +
      freshness * 100 * 0.20 +
      momentumSignal * 0.25,
    );
    const confidence: PublisherTopicCluster['confidence'] =
      relevant.length >= 6 && publishers.length >= 3 && datedRelevant >= 3
        ? 'high'
        : relevant.length >= 3 && publishers.length >= 2
          ? 'moderate'
          : 'low';
    const reason = relevant.length + ' unique publisher report(s) from ' +
      publishers.length + ' publisher group(s); ' +
      currentWindowCount + ' in the latest ' + normalizedWindow + ' days versus ' +
      previousWindowCount + ' in the preceding window. This measures publisher coverage only.';
    const evidence = relevant
      .slice()
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      .slice(0, MAX_EVIDENCE_PER_CLUSTER)
      .map(({ item }) => ({
        title: item.title,
        url: item.url,
        sourceName: item.sourceName,
        publishedAt: item.publishedAt,
      }));
    ranked.push({
      id: phrase,
      title: phrase,
      articleCount: relevant.length,
      publishers,
      currentWindowCount,
      previousWindowCount,
      momentum,
      momentumDelta,
      publisherCoverageScore,
      confidence,
      reason,
      evidence,
    });
  }

  ranked.sort((a, b) =>
    b.publisherCoverageScore - a.publisherCoverageScore ||
    b.articleCount - a.articleCount ||
    a.title.localeCompare(b.title),
  );

  const uniqueCount = documents.length;
  const datedCount = documents.filter((document) => document.timestamp !== null).length;
  return {
    inputCount: input.length,
    uniqueCount,
    duplicatesMerged: Math.max(0, input.length - uniqueCount),
    datedCount,
    undatedCount: Math.max(0, uniqueCount - datedCount),
    processingMs: Math.max(0, Date.now() - startedAt),
    windowDays: normalizedWindow,
    clusters: ranked.slice(0, MAX_CLUSTERS),
    limitations: [
      'Clusters and momentum are calculated from the selected publisher feeds only.',
      'They measure changes in publisher coverage, not YouTube demand, search volume, views, virality, or audience size.',
      'A missing or undated publication date is not treated as evidence of freshness.',
      'A small feed sample can miss stories and should not be interpreted as total market coverage.',
    ],
  };
}
