import { fingerprintText } from './api';
import { compareEditorialPriority, selectTopCurrentEditorialPriorities } from './editorial-priority';
import { deduplicateDisplayIdeas } from './idea-generation';
import { isIdeaDisplayable } from './idea-research';
import { matchesResearchTerms } from './intelligence';
import { type Idea, type Opinion, type Report, type Video } from './types';

export type EngineVideoEvidence = Omit<
  Pick<Video, 'id' | 'title' | 'description' | 'channel' | 'publishedAt' | 'viewCount' | 'likeCount' | 'fetchedAt'>,
  'viewCount' | 'likeCount'
> & {
  viewCount: number | null;
  likeCount: number | null;
};

/**
 * Merge all locally retained videos already collected by the app. The global metadata index
 * and report snapshots can overlap; one newest copy per video is kept. The cap bounds
 * local analysis cost without discarding the saved source records.
 */
export function collectEngineVideoEvidence(
  reports: readonly Pick<Report, 'videos'>[],
  videos: readonly Video[],
  now = Date.now(),
  limit = 300,
): EngineVideoEvidence[] {
  const byId = new Map<string, EngineVideoEvidence>();
  for (const video of [...videos, ...reports.flatMap((report) => report.videos)]) {
    if (!video.id || !video.title.trim() || !Number.isFinite(video.fetchedAt)) continue;
    if (video.fetchedAt > now) continue;
    const previous = byId.get(video.id);
    if (!previous || video.fetchedAt > previous.fetchedAt) {
      byId.set(video.id, {
        id: video.id,
        title: video.title,
        description: video.description,
        channel: video.channel,
        publishedAt: video.publishedAt,
        viewCount: video.viewCount ?? null,
        likeCount: video.likeCount ?? null,
        fetchedAt: video.fetchedAt,
      });
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.fetchedAt - a.fetchedAt || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, Math.min(300, Math.floor(limit))));
}

/** Highest editorial assessment first, then linked evidence, then recency. */
export function rankDashboardIdeas(ideas: readonly Idea[]): Idea[] {
  return deduplicateDisplayIdeas(ideas.filter(isIdeaDisplayable))
    .filter((idea) =>
      !idea.archived &&
      idea.status !== 'Rejected Ideas' &&
      idea.status !== 'Completed Research',
    )
    .sort(compareEditorialPriority);
}

/** Shared source of truth for the scored active priorities shown on both screens. */
export function selectDashboardFeaturedIdeas(ideas: readonly Idea[], limit = 5): Idea[] {
  return selectTopCurrentEditorialPriorities(rankDashboardIdeas(ideas), limit);
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
      if (video.fetchedAt > now) return false;
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
