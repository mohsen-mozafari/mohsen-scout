/**
 * Typed bridge between the production research objects and the pure engine v2
 * pipeline. This module has no native/network/storage imports: it only shapes
 * existing objects into `RawEvidenceInput` and maps `GeneratedIdea[]` back into
 * the durable `Idea` type used throughout the app.
 *
 * All output is deterministic for a given input (no `Date.now()`/`Math.random()`
 * in the idea identifiers, generation keys or timestamps), so repeated calls
 * with the same evidence produce identical ideas.
 */

import {
  runEngineV2,
  type EngineV2Result,
  type GeneratedIdea,
  type IdeaEvidenceRef,
  type RawEvidenceInput,
  type SourceCoverage,
  type StageTiming,
} from './engine-v2';
import type { YouTubeSampleVideo } from './api';
import type { SpaceNewsItem, WikiSignal } from './space';
import { regions, type Assessment, type Idea, type Region, type Video } from './types';

/** Structural video shape accepted by the adapter (Video and YouTubeSampleVideo both satisfy it). */
export type BriefVideoInput = {
  id: string;
  title?: string;
  description?: string;
  channel?: string;
  channelTitle?: string;
  channelId?: string;
  channelSubscriberCount?: number | null;
  channelVideoCount?: number | null;
  publishedAt?: string | null;
  thumbnail?: string;
  thumbnailUrl?: string;
  query?: string;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  url?: string;
  tags?: readonly string[];
};

export interface UnifiedBriefInput {
  topic: string;
  news: readonly SpaceNewsItem[];
  videos: readonly (Video | YouTubeSampleVideo | BriefVideoInput)[];
  wiki?: WikiSignal | null;
  now?: number;
  niche?: string;
  language?: string;
  timezoneOffsetMinutes?: number;
  budgetMs?: number;
  previous?: EngineV2Result;
  channelHistory?: Readonly<Record<string, readonly number[]>>;
  /** Optional durable Idea fields; added without changing any required API. */
  region?: Region;
  languages?: readonly string[];
  ideaLimit?: number;
  /** Saved report this brief belongs to, propagated to each published Idea. */
  reportId?: string;
}

export interface UnifiedBrief {
  result: EngineV2Result;
  ideas: Idea[];
  coverage: SourceCoverage[];
  timings: StageTiming[];
  warnings: string[];
  fallback: boolean;
  angles: string[];
}

const PRODUCTION_BUDGET_MS = 4000;
const YOUTUBE_ID = /^[\w-]{11}$/;
const MAX_VIDEO_REFERENCES = 12;
const MAX_NOTE_CHARS = 1200;

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
}

function median(values: readonly number[]): number | undefined {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!clean.length) return undefined;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

/** Local FNV-1a hash: stable across processes and independent of any clock. */
function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function buildChannelMedianViews(
  videos: readonly BriefVideoInput[],
  channelHistory?: Readonly<Record<string, readonly number[]>>,
): Record<string, number> {
  const observations = new Map<string, number[]>();
  const push = (channelId: string | undefined, value: number | undefined): void => {
    if (!channelId || value === undefined) return;
    const list = observations.get(channelId) ?? [];
    list.push(value);
    observations.set(channelId, list);
  };
  for (const video of videos) {
    const channelId = video.channelId?.trim();
    push(channelId, toFiniteNumber(video.viewCount));
  }
  for (const [channelId, history] of Object.entries(channelHistory ?? {})) {
    for (const value of history ?? []) push(channelId, toFiniteNumber(value));
  }
  const result: Record<string, number> = {};
  for (const [channelId, values] of observations) {
    const value = median(values);
    if (value !== undefined && value > 0) result[channelId] = value;
  }
  return result;
}

function mapNewsItem(item: SpaceNewsItem, index: number): RawEvidenceInput {
  const raw = item as Partial<SpaceNewsItem> & { language?: string };
  return {
    source: 'news',
    id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : 'news-' + index,
    title: typeof item?.title === 'string' ? item.title : '',
    summary: typeof item?.summary === 'string' ? item.summary : '',
    sourceName: typeof item?.sourceName === 'string' ? item.sourceName : undefined,
    sourceId: typeof item?.sourceId === 'string' ? item.sourceId : undefined,
    url: typeof item?.url === 'string' ? item.url : undefined,
    sourceUrl: typeof item?.url === 'string' ? item.url : undefined,
    publishedAt: item?.publishedAt ?? null,
    language: typeof raw.language === 'string' ? raw.language : undefined,
    raw: item,
  };
}

function mapVideoItem(video: BriefVideoInput, index: number): RawEvidenceInput {
  const id = typeof video?.id === 'string' && video.id.trim() ? video.id.trim() : '';
  const channelTitle = video.channelTitle ?? video.channel;
  return {
    source: 'youtube',
    id: id || 'video-' + index,
    videoId: id || undefined,
    title: typeof video?.title === 'string' ? video.title : '',
    description: typeof video?.description === 'string' ? video.description : '',
    channel: typeof channelTitle === 'string' && channelTitle ? channelTitle : undefined,
    channelTitle: typeof channelTitle === 'string' && channelTitle ? channelTitle : undefined,
    channelId: video.channelId?.trim() || undefined,
    channelSubscriberCount: toFiniteNumber(video.channelSubscriberCount),
    channelVideoCount: toFiniteNumber(video.channelVideoCount),
    viewCount: toFiniteNumber(video.viewCount),
    likeCount: toFiniteNumber(video.likeCount),
    commentCount: toFiniteNumber(video.commentCount),
    publishedAt: video.publishedAt ?? null,
    // The original search-bucket label survives into the engine as `bucket`.
    query: typeof video.query === 'string' && video.query.trim() ? video.query.trim() : undefined,
    tags: video.tags,
    url: typeof video.url === 'string' && video.url.trim()
      ? video.url.trim()
      : id ? 'https://www.youtube.com/watch?v=' + id : undefined,
    raw: video,
  };
}

function mapWikiSignal(wiki: WikiSignal): RawEvidenceInput {
  const title = typeof wiki?.articleTitle === 'string' && wiki.articleTitle.trim()
    ? wiki.articleTitle.trim() : '';
  const url = typeof wiki?.articleUrl === 'string' && wiki.articleUrl.trim()
    ? wiki.articleUrl.trim() : undefined;
  return {
    source: 'wikimedia',
    provider: 'wikimedia-pageviews',
    id: 'wiki:' + stableHash(title || url || 'article'),
    articleTitle: title,
    title,
    summary: typeof wiki?.summary === 'string' ? wiki.summary : '',
    articleUrl: url,
    url,
    language: typeof wiki?.language === 'string' ? wiki.language : undefined,
    monthlyViews: Array.isArray(wiki?.monthlyViews) ? wiki.monthlyViews : [],
    raw: wiki,
  };
}

function emptyResult(warnings: string[]): EngineV2Result {
  const coverage: SourceCoverage[] = (['news', 'youtube', 'wikimedia'] as const).map((source) => ({
    source,
    fetched: 0,
    normalized: 0,
    deduped: 0,
  }));
  return {
    items: [],
    features: new Map(),
    topics: [],
    scores: [],
    ideas: [],
    insufficientIdeas: [],
    coverage,
    dropped: 0,
    timings: [],
    warnings,
    fallback: true,
    now: 0,
  };
}

function resolveRegion(value: Region | undefined): Region {
  return value && (regions as readonly string[]).includes(value) ? value : 'Worldwide';
}

function assessmentFor(idea: GeneratedIdea): Assessment {
  if (!idea.dataSufficient) return 'Uncertain';
  if (idea.risk === 'high') return 'Highly Competitive';
  if (idea.risk === 'medium') return 'Worth Exploring';
  return idea.score.value >= 70 ? 'Strong Opportunity' : 'Promising';
}

function categoryFor(idea: GeneratedIdea): string {
  if (!idea.dataSufficient) return 'Open question';
  if (idea.risk === 'high') return 'Evidence audit';
  if (idea.risk === 'medium') return 'Comparison';
  return 'Explainer';
}

/** Extracts only an id that is actually present in the supplied evidence. */
function extractVideoId(reference: IdeaEvidenceRef, knownIds: ReadonlySet<string>): string | undefined {
  if (reference.source !== 'youtube') return undefined;
  const prefix = /^youtube:([\w-]{11})$/.exec(reference.id ?? '');
  const candidates: string[] = [];
  if (prefix) candidates.push(prefix[1]);
  if (YOUTUBE_ID.test(reference.id ?? '')) candidates.push(reference.id);
  const url = typeof reference.url === 'string' ? reference.url : '';
  for (const pattern of [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /\/(?:embed|v|shorts)\/([\w-]{11})/,
  ]) {
    const match = pattern.exec(url);
    if (match) candidates.push(match[1]);
  }
  for (const candidate of candidates) {
    if (YOUTUBE_ID.test(candidate) && (knownIds.size === 0 || knownIds.has(candidate))) return candidate;
  }
  return undefined;
}

type IdeaContext = {
  topic: string;
  now: number;
  region: Region;
  languages: string[];
  knownVideoIds: ReadonlySet<string>;
  reportId?: string;
};

function formatViews(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function mapIdea(idea: GeneratedIdea, context: IdeaContext): Idea {
  // Only real evidence refs are published; at most three are shown on page one.
  const topRefs = idea.evidence.slice(0, 3);
  const newsRef = idea.evidence.find((item) => item.source === 'news' && item.url) ??
    idea.supportingNews.find((item) => item.url);
  const sourceUrl = newsRef && typeof newsRef.url === 'string' ? newsRef.url : undefined;
  const digestLines = topRefs.map((item, index) =>
    (index + 1) + '. ' + item.title + ' · ' + (item.sourceName || item.source) +
    (item.views != null && item.views > 0 ? ' · ' + formatViews(item.views) + ' views' : '') +
    (item.url ? ' · ' + item.url : ''));
  const note = (idea.why + '\nEvidence (real refs):\n' +
    (digestLines.length ? digestLines.join('\n') : 'none referenced.')).slice(0, MAX_NOTE_CHARS + 400);
  const refsKey = idea.evidence.map((item) => item.id).join('|');
  const videoIds = [...new Set(
    idea.evidence
      .map((item) => extractVideoId(item, context.knownVideoIds))
      .filter((id): id is string => Boolean(id)),
  )].sort().slice(0, MAX_VIDEO_REFERENCES);
  const revenue = idea.score.estRevenue;
  const revenueLabel = revenue.high > 0
    ? '$' + revenue.low + '–$' + revenue.high + ' estimate (not a forecast)'
    : 'No estimate: insufficient observed view counts';

  return {
    id: 'v2:' + stableHash([context.topic, idea.titleSuggestion, idea.angle, refsKey].join('|')),
    topic: idea.titleSuggestion.slice(0, 180),
    concept: idea.angle,
    note,
    status: 'New Discoveries',
    decision: idea.why,
    videoIds,
    createdAt: context.now,
    archived: false,
    assessment: assessmentFor(idea),
    region: context.region,
    languages: context.languages,
    engineGenerated: true,
    ideaCategory: categoryFor(idea),
    generationKey: 'v2:' + stableHash([context.topic, idea.topicId, refsKey, idea.score.value].join('|')),
    engineScore: idea.score.value,
    // Full data-driven explanation; the UI may shorten it at the ';' boundary.
    engineScoreReason: idea.why,
    engineV2Score: idea.score.value,
    engineV2Confidence: idea.confidence,
    engineV2Why: idea.why,
    engineV2Evidence: topRefs.map((item) => ({
      title: item.title,
      ...(item.url ? { url: item.url } : {}),
      ...(item.views !== undefined ? { views: item.views } : {}),
      source: item.source,
    })),
    engineV2Risk: idea.risk,
    engineV2BestTime: idea.bestTimeToPublish,
    engineV2RevenueLabel: revenueLabel,
    engineV2Claims: idea.claims ? idea.claims.slice(0, 3) : [],
    dataSufficient: idea.dataSufficient,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(context.reportId ? { reportId: context.reportId } : {}),
  };
}

/** Angles come from the topic keywords and evidence counts actually returned by the engine. */
function buildAngles(result: EngineV2Result, limit = 6): string[] {
  const scoreByTopic = new Map(result.scores.map((score) => [score.topicId, score]));
  return [...result.topics]
    .sort((left, right) =>
      (scoreByTopic.get(right.id)?.value ?? -1) - (scoreByTopic.get(left.id)?.value ?? -1) ||
      left.id.localeCompare(right.id))
    .slice(0, Math.max(0, Math.min(12, Math.floor(limit))))
    .map((topic) => {
      const keywords = topic.keywords.slice(0, 3).join(', ') || topic.label;
      const score = scoreByTopic.get(topic.id);
      return topic.label + ': ' + keywords + ' (' + topic.newsCount + ' news, ' +
        topic.videoCount + ' video, ' + topic.itemIds.length + ' evidence item(s)' +
        (score ? ', score ' + score.value + '/100' : '') + ')';
    });
}

/**
 * Builds one unified brief, falling back to empty ideas whenever the engine
 * reports a fallback or produces no ideas, so callers can keep their legacy path.
 * Never throws.
 */
export function buildUnifiedBrief(input: UnifiedBriefInput): UnifiedBrief {
  const warnings: string[] = [];
  let result: EngineV2Result;
  try {
    const news = Array.isArray(input?.news) ? input.news : [];
    const videos = Array.isArray(input?.videos) ? input.videos : [];
    const videoInputs: BriefVideoInput[] = videos
      .filter((video): video is BriefVideoInput => Boolean(video) && typeof video === 'object')
      .map((video) => video as BriefVideoInput);
    const evidence: RawEvidenceInput[] = [
      ...news
        .filter((item): item is SpaceNewsItem => Boolean(item) && typeof item === 'object')
        .map((item, index) => mapNewsItem(item, index)),
      ...videoInputs.map((video, index) => mapVideoItem(video, index)),
    ];
    if (input?.wiki && typeof input.wiki === 'object') evidence.push(mapWikiSignal(input.wiki));

    result = runEngineV2(
      {
        now: input.now,
        evidence,
        niche: input.niche,
        language: input.language,
        timezoneOffsetMinutes: input.timezoneOffsetMinutes,
        channelMedianViews: buildChannelMedianViews(videoInputs, input.channelHistory),
        channelHistory: input.channelHistory,
      },
      {
        budgetMs: typeof input.budgetMs === 'number' && Number.isFinite(input.budgetMs) && input.budgetMs > 0
          ? input.budgetMs : PRODUCTION_BUDGET_MS,
        previous: input.previous,
        ideaLimit: input.ideaLimit,
      },
    );
    warnings.push(...result.warnings);
  } catch (error) {
    warnings.push('Unified brief could not be built: ' + (error instanceof Error ? error.message : String(error)));
    result = emptyResult(warnings);
  }

  const coverage = Array.isArray(result.coverage) ? result.coverage : emptyResult([]).coverage;
  const timings = Array.isArray(result.timings) ? result.timings : [];
  const angles = buildAngles(result);
  if (result.fallback) warnings.push('Unified brief used fallback evidence; use the legacy generation path when no ideas are produced.');

  // Defense in depth: never publish a placeholder, even from a fallback result.
  const sufficient = result.ideas.filter((idea) => idea.dataSufficient !== false);
  if (result.fallback || !sufficient.length) {
    if (!result.fallback) {
      warnings.push('No data-sufficient engine ideas were available; no placeholder idea was published.');
    }
    return { result, ideas: [], coverage, timings, warnings, fallback: true, angles };
  }

  try {
    const knownVideoIds = new Set<string>(
      (Array.isArray(input?.videos) ? input.videos : [])
        .map((video) => (video as BriefVideoInput)?.id)
        .filter((id): id is string => typeof id === 'string' && YOUTUBE_ID.test(id)),
    );
    const language = typeof input?.language === 'string' && input.language.trim()
      ? input.language.trim().slice(0, 16) : 'en';
    const languages = Array.isArray(input?.languages) && input.languages.length
      ? input.languages.filter((item): item is string => typeof item === 'string').slice()
      : [language];
    const context: IdeaContext = {
      topic: typeof input.topic === 'string' ? input.topic.trim().slice(0, 180) : '',
      now: typeof result.now === 'number' && Number.isFinite(result.now) && result.now > 0 ? result.now : 0,
      region: resolveRegion(input.region),
      languages,
      knownVideoIds,
      reportId: typeof input.reportId === 'string' && input.reportId.trim()
        ? input.reportId.trim() : undefined,
    };
    const ideas = sufficient
      .map((idea) => mapIdea(idea, context))
      .sort((left, right) => (right.engineScore ?? 0) - (left.engineScore ?? 0) || left.id.localeCompare(right.id));
    return { result, ideas, coverage, timings, warnings, fallback: false, angles };
  } catch (error) {
    warnings.push('Unified idea mapping failed: ' + (error instanceof Error ? error.message : String(error)));
    return { result, ideas: [], coverage, timings, warnings, fallback: true, angles };
  }
}
