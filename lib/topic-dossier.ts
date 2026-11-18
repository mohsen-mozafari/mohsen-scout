import { buildInternalResearch, type InternalResearchResult } from './engine';
import type { YouTubeSampleVideo } from './api';
import type { SpaceNewsItem, WikiSignal } from './space';
import type { Region } from './types';

export const TOPIC_DOSSIER_TTL_MS = 10 * 60 * 1000;
const MAX_DOSSIERS = 40;

export type TopicVideoCriteria = {
  days: 0 | 7 | 30 | 90;
  region: Region;
  language: string;
  order: 'date' | 'viewCount' | 'relevance';
};

export type TopicDossier = {
  topic: string;
  updatedAt: number;
  news: SpaceNewsItem[];
  wiki?: WikiSignal;
  videos: YouTubeSampleVideo[];
  videoCriteria?: TopicVideoCriteria;
  internalAnalysis: InternalResearchResult;
};

export type TopicDossierInput = {
  news?: SpaceNewsItem[];
  wiki?: WikiSignal;
  videos?: YouTubeSampleVideo[];
  videoCriteria?: TopicVideoCriteria;
  internalAnalysis?: InternalResearchResult;
};

const cache = new Map<string, TopicDossier>();

function normalizeTopic(topic: string): string {
  return topic.trim().toLocaleLowerCase().replace(/\s+/g, ' ').slice(0, 140);
}

function makeAnalysis(topic: string, news: SpaceNewsItem[], wiki?: WikiSignal, videos: YouTubeSampleVideo[] = []) {
  return buildInternalResearch({
    topic,
    news: news.map((item) => ({
      title: item.title,
      summary: item.summary,
      sourceName: item.sourceName,
      sourceUrl: item.url,
      publishedAt: item.publishedAt,
      sourceId: item.sourceId,
    })),
    wiki,
    videos,
  });
}

export function getTopicDossier(topic: string, now = Date.now()): TopicDossier | undefined {
  const key = normalizeTopic(topic);
  if (!key) return undefined;
  const dossier = cache.get(key);
  if (!dossier) return undefined;
  if (now - dossier.updatedAt > TOPIC_DOSSIER_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  // Refresh insertion order for bounded LRU eviction without extending evidence freshness.
  cache.delete(key);
  cache.set(key, dossier);
  return dossier;
}

export function rememberTopicDossier(
  topic: string,
  input: TopicDossierInput,
  now = Date.now(),
): TopicDossier | undefined {
  const key = normalizeTopic(topic);
  if (!key) return undefined;
  const previous = getTopicDossier(topic, now);
  const news = input.news ?? previous?.news ?? [];
  const wiki = input.wiki ?? previous?.wiki;
  const videos = input.videos ?? previous?.videos ?? [];
  const videoCriteria = input.videos
    ? input.videoCriteria
    : input.videoCriteria ?? previous?.videoCriteria;
  const dossier: TopicDossier = {
    topic: topic.trim().slice(0, 140),
    updatedAt: now,
    news,
    ...(wiki ? { wiki } : {}),
    videos,
    ...(videoCriteria ? { videoCriteria } : {}),
    internalAnalysis: input.internalAnalysis ?? makeAnalysis(topic, news, wiki, videos),
  };
  cache.delete(key);
  cache.set(key, dossier);
  while (cache.size > MAX_DOSSIERS) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
  return dossier;
}
