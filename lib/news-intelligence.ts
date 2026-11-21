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
  window: 'current' | 'previous' | null;
  publisherFamilies: string[];
  grams: Set<string>;
};

const MAX_CLUSTERS = 12;
const MAX_EVIDENCE_PER_CLUSTER = 3;
const YIELD_EVERY_DOCUMENTS = 32;
const YIELD_EVERY_TERMS = 128;
const DAY_MS = 86400000;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
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
  const currentStart = safeNow - normalizedWindow * DAY_MS;
  const previousStart = currentStart - normalizedWindow * DAY_MS;
  const deduplicated = deduplicateResearchEvidence(input.map((item) => ({
    ...item,
    sourceUrl: item.url,
  })));
  const documents: CorpusDocument[] = [];
  let datedCount = 0;

  for (let index = 0; index < deduplicated.items.length; index += 1) {
    const item = deduplicated.items[index];
    const parsed = item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN;
    const timestamp = Number.isFinite(parsed) && parsed <= safeNow ? parsed : null;
    if (timestamp !== null) datedCount += 1;
    const window: CorpusDocument['window'] = timestamp === null
      ? null
      : timestamp >= currentStart
        ? 'current'
        : timestamp >= previousStart
          ? 'previous'
          : null;
    const titleTokens = tokenizeResearchText(item.title);
    const summaryTokens = tokenizeResearchText(item.summary ?? '')
      .filter((token) => !CLUSTER_BOILERPLATE_TERMS.has(token));
    // Titles carry the primary clustering signal; only non-boilerplate summary terms add context.
    const tokens = [...titleTokens, ...summaryTokens.slice(0, 18)];
    documents.push({
      item: item as CorpusDocument['item'],
      timestamp,
      window,
      publisherFamilies: publisherGroups(item),
      grams: makeNgrams(tokens),
    });
    if ((index + 1) % YIELD_EVERY_DOCUMENTS === 0) {
      await yieldToEventLoop();
    }
  }

  const termDocuments = new Map<string, number[]>();
  for (let index = 0; index < documents.length; index += 1) {
    for (const gram of documents[index].grams) {
      const previous = termDocuments.get(gram);
      if (previous) previous.push(index);
      else termDocuments.set(gram, [index]);
    }
    if ((index + 1) % YIELD_EVERY_DOCUMENTS === 0) {
      await yieldToEventLoop();
    }
  }

  const ranked: PublisherTopicCluster[] = [];
  const compareClusters = (a: PublisherTopicCluster, b: PublisherTopicCluster) =>
    b.publisherCoverageScore - a.publisherCoverageScore ||
    b.articleCount - a.articleCount ||
    a.title.localeCompare(b.title);
  let processedTerms = 0;

  for (const [phrase, indexes] of termDocuments) {
    if (indexes.length === 0) continue;
    const publisherSet = new Set<string>();
    const topEvidence: CorpusDocument[] = [];
    let currentWindowCount = 0;
    let previousWindowCount = 0;
    let datedRelevant = 0;

    for (const index of indexes) {
      const document = documents[index];
      for (const publisher of document.publisherFamilies) publisherSet.add(publisher);
      if (document.window === 'current') currentWindowCount += 1;
      else if (document.window === 'previous') previousWindowCount += 1;
      if (document.timestamp !== null) datedRelevant += 1;

      // Keep only the latest few records while aggregating; sorting every full
      // cluster was needlessly expensive for common terms in larger RSS samples.
      const timestamp = document.timestamp ?? 0;
      let position = 0;
      while (position < topEvidence.length && (topEvidence[position].timestamp ?? 0) >= timestamp) {
        position += 1;
      }
      if (position < MAX_EVIDENCE_PER_CLUSTER) {
        topEvidence.splice(position, 0, document);
        if (topEvidence.length > MAX_EVIDENCE_PER_CLUSTER) topEvidence.pop();
      }
    }

    const publishers = [...publisherSet].sort();
    const articleCount = indexes.length;
    const momentum = momentumFor(currentWindowCount, previousWindowCount);
    const momentumDelta = currentWindowCount || previousWindowCount
      ? currentWindowCount - previousWindowCount
      : null;
    const freshness = articleCount ? currentWindowCount / articleCount : 0;
    const sourceBreadth = clamp(publishers.length * 25);
    const evidenceBreadth = clamp(articleCount * 18);
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
      articleCount >= 6 && publishers.length >= 3 && datedRelevant >= 3
        ? 'high'
        : articleCount >= 3 && publishers.length >= 2
          ? 'moderate'
          : 'low';
    const reason = articleCount + ' unique publisher report(s) from ' +
      publishers.length + ' publisher group(s); ' +
      currentWindowCount + ' in the latest ' + normalizedWindow + ' days versus ' +
      previousWindowCount + ' in the preceding window. This measures publisher coverage only.';
    const evidence = topEvidence.map(({ item }) => ({
      title: item.title,
      url: item.url,
      sourceName: item.sourceName,
      publishedAt: item.publishedAt,
    }));
    const cluster: PublisherTopicCluster = {
      id: phrase,
      title: phrase,
      articleCount,
      publishers,
      currentWindowCount,
      previousWindowCount,
      momentum,
      momentumDelta,
      publisherCoverageScore,
      confidence,
      reason,
      evidence,
    };

    let insertionIndex = 0;
    while (insertionIndex < ranked.length && compareClusters(ranked[insertionIndex], cluster) <= 0) {
      insertionIndex += 1;
    }
    if (insertionIndex < MAX_CLUSTERS) {
      ranked.splice(insertionIndex, 0, cluster);
      if (ranked.length > MAX_CLUSTERS) ranked.pop();
    }

    processedTerms += 1;
    if (processedTerms % YIELD_EVERY_TERMS === 0) {
      await yieldToEventLoop();
    }
  }

  const uniqueCount = documents.length;
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
