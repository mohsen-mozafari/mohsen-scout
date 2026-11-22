import { fingerprintText } from './api';
import { deduplicateDisplayIdeas } from './idea-generation';
import { isIdeaDisplayable } from './idea-research';
import { buildUnifiedBrief, type BriefVideoInput } from './engine-v2-adapter';
import type { EngineV2Result, SourceCoverage, StageTiming } from './engine-v2';
import { matchesResearchTerms, scoreResearchText } from './intelligence';
import type { SpaceNewsItem, WikiSignal } from './space';
import { RETENTION_MS, type Idea, type Opinion, type Region, type Report, type Video } from './types';

const assessmentOrder: Record<Idea['assessment'], number> = {
  'Strong Opportunity': 5,
  Promising: 4,
  'Worth Exploring': 3,
  Uncertain: 2,
  'Highly Competitive': 1,
};

function evidenceWeight(idea: Idea): number {
  return (idea.videoIds.length ? idea.videoIds.length : 0) +
    (idea.reportId ? 1 : 0) +
    (idea.sourceUrl ? 1 : 0);
}

/**
 * Local shape handed to the engine adapter. `Video` has no channel columns, but
 * a saved/report record can carry YouTube-sample channel stats at runtime; those
 * fields used to be dropped here, which made outlier scoring fall back to 0.5.
 */
export type EngineVideoEvidence = Omit<
  Pick<Video, 'id' | 'title' | 'description' | 'channel' | 'publishedAt' | 'viewCount' | 'likeCount' | 'fetchedAt' | 'query'>,
  'viewCount' | 'likeCount'
> & {
  viewCount: number | null;
  likeCount: number | null;
  commentCount?: number | null;
  channelId?: string;
  channelTitle?: string;
  channelSubscriberCount?: number | null;
  subscriberCount?: number | null;
  channelVideoCount?: number | null;
  url?: string;
};

type SavedVideoWithStats = Video & {
  channelId?: string | null;
  channelTitle?: string | null;
  channelSubscriberCount?: number | null;
  subscriberCount?: number | null;
  channelVideoCount?: number | null;
  commentCount?: number | null;
  url?: string | null;
};

/** Restored default cap: 1000 items caused measurable lag on the dashboard path. */
export const ENGINE_VIDEO_EVIDENCE_CAP = 300;

export type EngineEvidenceRankingOptions = {
  /** Optional topic: the retained 300 are then the most relevant recent items. */
  topic?: string;
  /** Optional reference time for recency ranking; defaults to the `now` argument. */
  now?: number;
};

/**
 * Merge every retained video already collected by the app. The global metadata index
 * and report snapshots can overlap; one newest copy per video is kept. The cap bounds
 * local analysis cost without discarding the saved source records. All real channel
 * stats, the search bucket, metrics, url, description and publication time survive
 * the mapping so the adapter and engine can use them.
 */
export function collectEngineVideoEvidence(
  reports: readonly Pick<Report, 'videos'>[],
  videos: readonly Video[],
  now = Date.now(),
  limit = 300,
  options: EngineEvidenceRankingOptions = {},
): EngineVideoEvidence[] {
  const byId = new Map<string, EngineVideoEvidence>();
  for (const saved of [...videos, ...reports.flatMap((report) => report.videos)]) {
    if (!saved.id || !saved.title.trim() || !Number.isFinite(saved.fetchedAt)) continue;
    const age = now - saved.fetchedAt;
    if (age < 0 || age >= RETENTION_MS) continue;
    const previous = byId.get(saved.id);
    if (!previous || saved.fetchedAt > previous.fetchedAt) {
      const video = saved as SavedVideoWithStats;
      const channelId = typeof video.channelId === 'string' && video.channelId.trim()
        ? video.channelId.trim() : undefined;
      const channelTitle = typeof video.channelTitle === 'string' && video.channelTitle.trim()
        ? video.channelTitle.trim()
        : typeof video.channel === 'string' && video.channel.trim() ? video.channel.trim() : undefined;
      byId.set(video.id, {
        id: video.id,
        title: video.title,
        description: video.description,
        channel: video.channel,
        publishedAt: video.publishedAt,
        fetchedAt: video.fetchedAt,
        query: video.query,
        ...(channelId ? { channelId } : {}),
        ...(channelTitle ? { channelTitle } : {}),
        ...(video.channelSubscriberCount != null ? { channelSubscriberCount: video.channelSubscriberCount } : {}),
        ...(video.subscriberCount != null ? { subscriberCount: video.subscriberCount } : {}),
        ...(video.channelVideoCount != null ? { channelVideoCount: video.channelVideoCount } : {}),
        ...(video.commentCount != null ? { commentCount: video.commentCount } : {}),
        ...(typeof video.url === 'string' && video.url.trim() ? { url: video.url.trim() } : {}),
        viewCount: video.viewCount ?? null,
        likeCount: video.likeCount ?? null,
      });
    }
  }

  const referenceNow = typeof options.now === 'number' && Number.isFinite(options.now)
    ? options.now : now;
  const topic = typeof options.topic === 'string' ? options.topic.trim() : '';
  const cap = Math.max(0, Math.min(ENGINE_VIDEO_EVIDENCE_CAP, Math.floor(limit)));
  const all = [...byId.values()];
  if (!topic) {
    return all
      .sort((a, b) => b.fetchedAt - a.fetchedAt || a.id.localeCompare(b.id))
      .slice(0, cap);
  }

  // Relevance pre-ranking: only the best `cap` items for this topic are retained.
  const recency = (item: EngineVideoEvidence): number => {
    const published = Date.parse(item.publishedAt);
    if (!Number.isFinite(published) || published <= 0 || referenceNow < published) return 0;
    return 1 / (1 + (referenceNow - published) / (30 * 86400000));
  };
  return all
    .map((item) => ({
      item,
      relevant: matchesResearchTerms(item.title + ' ' + item.description, [topic]) ? 1 : 0,
      score: scoreResearchText(topic, item.title, item.description),
      fresh: recency(item),
    }))
    .sort((left, right) =>
      right.relevant - left.relevant ||
      right.score - left.score ||
      right.fresh - left.fresh ||
      right.item.fetchedAt - left.item.fetchedAt ||
      left.item.id.localeCompare(right.item.id))
    .slice(0, cap)
    .map((entry) => entry.item);
}

export type UnifiedDashboardBriefOptions = {
  wiki?: WikiSignal | null;
  now?: number;
  niche?: string;
  language?: string;
  timezoneOffsetMinutes?: number;
  budgetMs?: number;
  region?: Region;
  languages?: readonly string[];
  previous?: EngineV2Result;
  ideaLimit?: number;
  reportId?: string;
};

export type UnifiedDashboardBrief = {
  ideas: Idea[];
  coverage: SourceCoverage[];
  warnings: string[];
  timings: StageTiming[];
  fallback: boolean;
  /** Additive: the underlying v2 result so the AI complement uses one source of truth. */
  result?: EngineV2Result;
  angles?: string[];
};

/**
 * One engine-v2 brief for the dashboard ideas and chart path. Callers keep
 * their legacy ideas path as a fallback when `ideas` is empty or `fallback`.
 */
export function buildUnifiedDashboardBrief(
  topic: string,
  news: readonly SpaceNewsItem[],
  videos: readonly BriefVideoInput[],
  opts: UnifiedDashboardBriefOptions = {},
): UnifiedDashboardBrief {
  const brief = buildUnifiedBrief({
    topic,
    news,
    videos,
    ...opts,
  });
  return {
    ideas: brief.ideas,
    coverage: brief.coverage,
    warnings: brief.warnings,
    timings: brief.timings,
    fallback: brief.fallback,
    result: brief.result,
    angles: brief.angles,
  };
}

/** Highest editorial assessment first, then linked evidence, then recency. */
export function rankDashboardIdeas(ideas: readonly Idea[]): Idea[] {
  const ranked = ideas
    .filter(isIdeaDisplayable)
    .filter((idea) =>
      !idea.archived &&
      idea.status !== 'Rejected Ideas' &&
      idea.status !== 'Completed Research',
    )
    .slice()
    .sort((a, b) =>
      (b.engineScore ?? -1) - (a.engineScore ?? -1) ||
      assessmentOrder[b.assessment] - assessmentOrder[a.assessment] ||
      evidenceWeight(b) - evidenceWeight(a) ||
      b.createdAt - a.createdAt,
    );

  // Deduplicate after ranking so the strongest evidence-backed card survives.
  return deduplicateDisplayIdeas(ranked);
}

/** Canonical scored active priorities shared by the dashboard and Ideas page. */
export function selectDashboardFeaturedIdeas(
  ideas: readonly Idea[],
  limit = 5,
): Idea[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (!safeLimit) return [];
  return rankDashboardIdeas(ideas)
    .filter((idea) => typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore))
    .slice(0, safeLimit);
}

export function chooseBestIdea(ideas: readonly Idea[]): Idea | undefined {
  return rankDashboardIdeas(ideas)[0];
}

/** Select active engine ideas linked to the current research evidence. */
export function selectDashboardIdeas(
  ideas: readonly Idea[],
  options: {
    reportId?: string;
    videoIds?: ReadonlySet<string>;
    sourceUrls?: ReadonlySet<string>;
    topic?: string;
  } = {},
): Idea[] {
  const generated = rankDashboardIdeas(ideas.filter((idea) => idea.engineGenerated === true));
  if (!generated.length) return [];

  const linked = generated.filter((idea) =>
    Boolean(options.reportId && idea.reportId === options.reportId) ||
    Boolean(options.videoIds?.size && idea.videoIds.some((id) => options.videoIds?.has(id))) ||
    Boolean(options.sourceUrls?.size && idea.sourceUrl && options.sourceUrls.has(idea.sourceUrl)),
  );
  if (linked.length) return linked;

  const topic = options.topic?.trim();
  return topic
    ? generated.filter((idea) => matchesResearchTerms(idea.topic + ' ' + idea.concept, [topic]))
    : generated;
}

/**
 * Builds a dashboard feed only from unexpired videos already present in a saved report.
 * Niche terms are strict: there is no fallback to unrelated videos.
 */
export function selectDashboardVideos(
  videos: readonly Video[],
  topic: string,
  nicheTerms: readonly string[] = [],
  now = Date.now(),
  limit = 12,
): Video[] {
  const terms = nicheTerms.map((term) => term.trim()).filter(Boolean);
  const effectiveTerms = terms.length ? terms : topic.trim() ? [topic.trim()] : [];
  if (!effectiveTerms.length || limit <= 0) return [];

  return videos
    .filter((video) => {
      if (!video.id || !Number.isFinite(video.fetchedAt)) return false;
      const age = now - video.fetchedAt;
      if (age < 0 || age >= RETENTION_MS) return false;
      const published = Date.parse(video.publishedAt);
      const publicationAge = now - published;
      if (!Number.isFinite(published) || publicationAge < 0 || publicationAge > 30 * 24 * 60 * 60 * 1000) return false;
      // Recommendations must match the title itself, not an unrelated description or query.
      return effectiveTerms.some((term) => matchesResearchTerms(video.title, [term]));
    })
    .slice()
    .sort((a, b) =>
      (b.viewCount ?? -1) - (a.viewCount ?? -1) ||
      b.fetchedAt - a.fetchedAt ||
      a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, Math.min(24, Math.floor(limit))));
}

/** Cache identity mirrors the persisted engine-opinion key, so reviews survive relaunches. */
export function engineReviewCacheKey(model: string, prompt: string, researchFingerprint: string): string {
  return 'engine:' + fingerprintText(model + '\n' + prompt + '\n' + researchFingerprint);
}

export function findCachedEngineReview(
  opinions: readonly Opinion[],
  model: string,
  prompt: string,
  researchFingerprint: string,
): Opinion | undefined {
  if (!model.trim()) return undefined;
  const cacheKey = engineReviewCacheKey(model, prompt, researchFingerprint);
  return opinions.find((opinion) => opinion.ideaId === cacheKey && opinion.model === model);
}


/** Shares one pending refresh across concurrent callers and always releases the slot. */
export function runSingleFlight<T>(
  slot: { current: Promise<T> | null },
  work: () => Promise<T>,
): Promise<T> {
  if (slot.current) return slot.current;
  let shared: Promise<T>;
  shared = Promise.resolve()
    .then(work)
    .finally(() => {
      if (slot.current === shared) slot.current = null;
    });
  slot.current = shared;
  return shared;
}
