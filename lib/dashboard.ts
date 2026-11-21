import { fingerprintText } from './api';
import { matchesResearchTerms } from './intelligence';
import { RETENTION_MS, type Idea, type Opinion, type Report, type Video, type VideoCoverageData } from './types';

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

export type EngineVideoEvidence = Omit<
  Pick<Video, 'id' | 'title' | 'description' | 'channel' | 'channelId' | 'publishedAt' | 'viewCount' | 'likeCount' | 'commentCount' | 'fetchedAt'>,
  'viewCount' | 'likeCount' | 'commentCount'
> & {
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
};

export type EngineVideoCoverageData = VideoCoverageData;

export const ENGINE_VIDEO_EVIDENCE_LIMIT = 500;

export type EngineVideoCoverageOut = {
  videos: EngineVideoEvidence[];
  coverage: VideoCoverageData;
};

/**
 * Merge every retained video already collected by the app. The global metadata index
 * and report snapshots can overlap; one newest copy per video is kept. The cap bounds
 * local analysis cost without discarding the saved source records.
 */
export function collectEngineVideoEvidenceDetailed(
  reports: readonly Pick<Report, 'videos'>[],
  videos: readonly Video[],
  now = Date.now(),
  limit = ENGINE_VIDEO_EVIDENCE_LIMIT,
): EngineVideoCoverageOut {
  const byId = new Map<string, EngineVideoEvidence>();
  const storedSeen = new Set<string>();
  let videosFromStored = 0;
  let videosFromReports = 0;
  let droppedMissingFields = 0;
  let droppedAsExpired = 0;
  const add = (video: Video) => {
    byId.set(video.id, {
      id: video.id,
      title: video.title,
      description: video.description,
      channel: video.channel,
      channelId: video.channelId ?? '',
      publishedAt: video.publishedAt,
      viewCount: video.viewCount ?? null,
      likeCount: video.likeCount ?? null,
      commentCount: video.commentCount ?? null,
      fetchedAt: video.fetchedAt,
    });
  };
  for (const video of videos) {
    if (!video.id || !video.title.trim() || !Number.isFinite(video.fetchedAt)) {
      droppedMissingFields++;
      continue;
    }
    storedSeen.add(video.id);
    if (byId.has(video.id)) continue;
    const age = now - video.fetchedAt;
    if (age < 0 || age >= RETENTION_MS) {
      droppedAsExpired++;
      continue;
    }
    add(video);
  }
  videosFromStored = storedSeen.size;
  for (const video of reports.flatMap((report) => report.videos)) {
    if (!video.id || !video.title.trim() || !Number.isFinite(video.fetchedAt)) {
      droppedMissingFields++;
      continue;
    }
    if (!storedSeen.has(video.id)) videosFromReports++;
    if (byId.has(video.id)) continue;
    const age = now - video.fetchedAt;
    if (age < 0 || age >= RETENTION_MS) {
      droppedAsExpired++;
      continue;
    }
    add(video);
  }
  const retained = [...byId.values()]
    .sort((a, b) => b.fetchedAt - a.fetchedAt || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, Math.min(ENGINE_VIDEO_EVIDENCE_LIMIT, Math.floor(limit))));
  return { videos: retained, coverage: { videosFromStored, videosFromReports, uniqueVideos: byId.size, droppedMissingFields, droppedAsExpired, coverageLimit: Math.max(0, Math.floor(limit)) } };
}

export function collectEngineVideoEvidence(
  reports: readonly Pick<Report, 'videos'>[],
  videos: readonly Video[],
  now = Date.now(),
  limit = ENGINE_VIDEO_EVIDENCE_LIMIT,
): EngineVideoEvidence[] {
  return collectEngineVideoEvidenceDetailed(reports, videos, now, limit).videos;
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
