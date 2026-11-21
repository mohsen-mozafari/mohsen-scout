import { tokenizeResearchText } from '../intelligence';
import { parseTimeMs } from './features';
import type { EngineV2Feature, EngineV2TopicCluster } from './types';

export function extractDocTerms(text: string): string[] {
  const tokens = tokenizeResearchText(text).filter((token) => token.length >= 2);
  const terms = new Set<string>(tokens);
  for (let i = 0; i + 1 < tokens.length; i++) {
    terms.add(tokens[i] + ' ' + tokens[i + 1]);
  }
  return [...terms];
}

export type TopicDoc = {
  id: string;
  kind: 'youtube' | 'news';
  text: string;
  publishedAt: string | null;
};

export type TopicEngineOptions = {
  minDocsPerTopic?: number;
  ngramBonus?: number;
  recencyWindowDays?: number;
  newsRecencyWindowDays?: number;
  trendWeight?: number;
  newsVelocityWeight?: number;
  baseRecencyWeight?: number;
};

export type TopicEngine = {
  clusters: EngineV2TopicCluster[];
  docTopics: Map<string, string>;
  generalDocIds: string[];
  topicDocs: Map<string, TopicDoc[]>;
};

export type EngineV2Plan = { gapTopics: string[]; riskTopics: string[] };

type InternalTopic = {
  id: string;
  docs: TopicDoc[];
  videoIds: string[];
  newsIds: string[];
};

/**
 * TF-IDF + n-gram (bigram) based topic engine with connected-component clustering:
 * docs that share terms form clusters; rarer, longer terms weigh more.
 */
export function buildTopicEngine(docs: readonly TopicDoc[], options: TopicEngineOptions = {}, trendChangePercent?: number | null): TopicEngine {
  const now = Date.now();
  const N = Math.max(1, docs.length);
  const minDocs = Math.max(1, options.minDocsPerTopic ?? 2);

  const perDocTerms: Array<Map<string, number>> = docs.map((doc) => {
    const counts = new Map<string, number>();
    for (const term of extractDocTerms(doc.text)) counts.set(term, (counts.get(term) ?? 0) + 1);
    return counts;
  });
  const df = new Map<string, number>();
  perDocTerms.forEach((counts) => {
    for (const term of counts.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  });
  const ngramBonus = options.ngramBonus ?? 1.2;
  const docTfidf: Array<Map<string, number>> = perDocTerms.map((counts) => {
    const out = new Map<string, number>();
    let sumSq = 0;
    for (const [term, tf] of counts) {
      const d = Math.max(1, df.get(term) ?? 1);
      const score = tf * Math.log((1 + N) / (1 + d)) * (term.includes(' ') ? ngramBonus : 1);
      out.set(term, score);
      sumSq += score * score;
    }
    if (sumSq > 0) {
      for (const [term, score] of out) out.set(term, score / Math.sqrt(sumSq));
    }
    return out;
  });

  const termDocs = new Map<string, number[]>();
  perDocTerms.forEach((counts, index) => {
    for (const term of counts.keys()) {
      const list = termDocs.get(term) ?? [];
      list.push(index);
      termDocs.set(term, list);
    }
  });

  const parent = docs.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootA] = rootB;
  };
  for (const indices of termDocs.values()) {
    for (let i = 1; i < indices.length; i++) union(indices[0], indices[i]);
  }

  const components = new Map<number, number[]>();
  for (let i = 0; i < docs.length; i++) {
    const root = find(i);
    components.set(root, [...(components.get(root) ?? []), i]);
  }

  const topicMomentum = (docsIn: TopicDoc[]): number => {
    const recencyCutoff = now - (options.recencyWindowDays ?? 7) * 86_400_000;
    const newsCutoff = now - (options.newsRecencyWindowDays ?? 14) * 86_400_000;
    const youtubeDocs = docsIn.filter((doc) => doc.kind === 'youtube');
    const recent = youtubeDocs.filter((doc) => parseTimeMs(doc.publishedAt) >= recencyCutoff).length;
    const recencyFraction = youtubeDocs.length ? recent / youtubeDocs.length : 0;
    const newsDocs = docsIn.filter((doc) => doc.kind === 'news');
    const newsRecency = newsDocs.length
      ? newsDocs.filter((doc) => doc.publishedAt && parseTimeMs(doc.publishedAt) >= newsCutoff).length / newsDocs.length
      : 0;
    let trend = 0;
    if (typeof trendChangePercent === 'number' && Number.isFinite(trendChangePercent)) {
      trend = Math.max(-1, Math.min(1, trendChangePercent / 40));
    }
    const baseWeight = options.baseRecencyWeight ?? 0.5;
    const trendWeight = options.trendWeight ?? 0.3;
    const newsVelocityWeight = options.newsVelocityWeight ?? 0.2;
    const denominator = baseWeight + trendWeight + newsVelocityWeight;
    return Math.max(0, Math.min(1, (baseWeight * recencyFraction + trendWeight * (trend + 1) / 2 + newsVelocityWeight * newsRecency) / denominator));
  };

  const topicConfidence = (topic: InternalTopic): 'low' | 'medium' | 'high' => {
    if (topic.videoIds.length >= 3 && topic.newsIds.length >= 1) return 'high';
    if (topic.videoIds.length >= 2 || topic.newsIds.length >= 2) return 'medium';
    return 'low';
  };

  const clusters: EngineV2TopicCluster[] = [];
  const topicDocs = new Map<string, TopicDoc[]>();
  const docTopics = new Map<string, string>();
  const generalDocIds: string[] = [];
  const internals: InternalTopic[] = [];

  for (const component of components.values()) {
    const docsIn = component.map((index) => docs[index]);
    if (docsIn.length < minDocs) {
      for (const doc of docsIn) generalDocIds.push(doc.id);
      continue;
    }
    const componentSet = new Set(component);
    let bestTerm = '';
    let bestScore = -1;
    for (const [term, indices] of termDocs) {
      const inComponent = indices.filter((index) => componentSet.has(index));
      if (!inComponent.length) continue;
      const tfidfSum = inComponent.reduce((sum, index) => sum + (docTfidf[index].get(term) ?? 0), 0);
      const score = inComponent.length * 10 + tfidfSum;
      if (score > bestScore) {
        bestScore = score;
        bestTerm = term;
      }
    }
    const id = bestTerm || `topic-${internals.length}`;
    const internal: InternalTopic = {
      id,
      docs: docsIn,
      videoIds: docsIn.filter((doc) => doc.kind === 'youtube').map((doc) => doc.id),
      newsIds: docsIn.filter((doc) => doc.kind === 'news').map((doc) => doc.id),
    };
    internals.push(internal);
    const termSums = new Map<string, number>();
    for (const index of component) {
      for (const [term, score] of docTfidf[index]) termSums.set(term, (termSums.get(term) ?? 0) + score);
    }
    const termsList = [...termSums.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([term]) => term);
    clusters.push({
      id,
      terms: [...new Set([id, ...termsList])].slice(0, 24),
      videoIds: internal.videoIds,
      newsIds: internal.newsIds,
      momentum: topicMomentum(docsIn),
      confidence: topicConfidence(internal),
    });
    topicDocs.set(id, docsIn);
    for (const doc of docsIn) docTopics.set(doc.id, id);
  }

  return { clusters, docTopics, generalDocIds, topicDocs };
}

export function findGapsAndRisks(
  engine: TopicEngine,
  videoFeatures: ReadonlyMap<string, EngineV2Feature>,
  options?: { gapMinNews?: number; gapMaxVideos?: number; riskMinVideos?: number; riskChannelShare?: number },
): EngineV2Plan {
  const gapMinNews = options?.gapMinNews ?? 2;
  const gapMaxVideos = options?.gapMaxVideos ?? 1;
  const riskMinVideos = options?.riskMinVideos ?? 4;
  const riskChannelShare = options?.riskChannelShare ?? 0.6;
  const gapTopics: string[] = [];
  const riskTopics: string[] = [];
  for (const cluster of engine.clusters) {
    const videoIds = cluster.videoIds.filter((id) => videoFeatures.has(id));
    const uniqueChannels = new Set(videoIds.map((id) => videoFeatures.get(id)?.channel).filter(Boolean)).size;
    if (cluster.newsIds.length >= gapMinNews && videoIds.length <= gapMaxVideos) gapTopics.push(cluster.id);
    if (videoIds.length >= riskMinVideos && videoIds.length > 0 && uniqueChannels / videoIds.length >= riskChannelShare) riskTopics.push(cluster.id);
  }
  return { gapTopics, riskTopics };
}
