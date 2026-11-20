import { fingerprintText } from './api';
import { matchesResearchTerms } from './intelligence';
import { RETENTION_MS, type Idea, type Opinion, type Report, type Video } from './types';

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

export type EngineVideoEvidence = Pick<
  Video,
  'id' | 'title' | 'description' | 'channel' | 'publishedAt' | 'viewCount' | 'likeCount' | 'fetchedAt'
>;

/**
 * Merge every retained video already collected by the app. The global metadata index
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
    const age = now - video.fetchedAt;
    if (age < 0 || age >= RETENTION_MS) continue;
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
  return ideas
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
}

export function chooseBestIdea(ideas: readonly Idea[]): Idea | undefined {
  return rankDashboardIdeas(ideas)[0];
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
