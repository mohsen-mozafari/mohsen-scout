import type { Video, YouTubeGrowth, YouTubeSnapshot } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 30 * 60 * 1000;

function median(values: readonly number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

type SnapshotHistoryIndex = {
  priorForCurrent: Map<string, YouTubeSnapshot>;
  channelRates: Map<string, Map<string, number>>;
  counts: Map<string, number>;
};

function buildHistoryIndex(history: readonly YouTubeSnapshot[], capturedAt: number): SnapshotHistoryIndex {
  const grouped = new Map<string, YouTubeSnapshot[]>();
  const counts = new Map<string, number>();
  for (const item of history) {
    counts.set(item.videoId, (counts.get(item.videoId) ?? 0) + 1);
    if (item.capturedAt >= capturedAt || item.viewCount === null) continue;
    const records = grouped.get(item.videoId) ?? [];
    records.push(item);
    grouped.set(item.videoId, records);
  }

  const priorForCurrent = new Map<string, YouTubeSnapshot>();
  const channelRates = new Map<string, Map<string, number>>();
  for (const [videoId, records] of grouped) {
    records.sort((a, b) => b.capturedAt - a.capturedAt);
    const latest = records[0];
    if (!latest) continue;

    // Use the newest historical point that is at least 30 minutes older than the new sample.
    const eligiblePrior = records.find((item) => item.capturedAt <= capturedAt - MIN_INTERVAL_MS);
    if (eligiblePrior) priorForCurrent.set(videoId, eligiblePrior);

    // Build channel baselines from the latest historical pair with sufficient separation.
    const olderPeerPoint = records.find((item) =>
      item.capturedAt <= latest.capturedAt - MIN_INTERVAL_MS &&
      item.viewCount !== null &&
      latest.viewCount !== null &&
      latest.viewCount >= item.viewCount,
    );
    if (!olderPeerPoint || latest.viewCount === null || olderPeerPoint.viewCount === null) continue;
    const elapsed = latest.capturedAt - olderPeerPoint.capturedAt;
    if (elapsed < MIN_INTERVAL_MS) continue;
    const rate = (latest.viewCount - olderPeerPoint.viewCount) / (elapsed / DAY_MS);
    const rates = channelRates.get(latest.channel) ?? new Map<string, number>();
    rates.set(videoId, rate);
    channelRates.set(latest.channel, rates);
  }

  return { priorForCurrent, channelRates, counts };
}

export function captureYouTubeSnapshots(
  videos: readonly Video[],
  history: readonly YouTubeSnapshot[],
  capturedAt = Date.now(),
): { videos: Video[]; snapshots: YouTubeSnapshot[] } {
  const { priorForCurrent, channelRates, counts } = buildHistoryIndex(history, capturedAt);
  const fresh = videos.map((video) => ({
    id: video.id + ':' + capturedAt,
    videoId: video.id,
    ...(video.channelId ? { channelId: video.channelId } : {}),
    channel: video.channel,
    capturedAt,
    viewCount: video.viewCount ?? null,
    likeCount: video.likeCount ?? null,
    commentCount: video.commentCount ?? null,
  }));
  const enriched = videos.map((video) => {
    const prior = priorForCurrent.get(video.id);
    const elapsed = prior ? capturedAt - prior.capturedAt : 0;
    const currentViews = video.viewCount ?? null;
    const previousViews = prior?.viewCount ?? null;
    const validDelta = Boolean(prior && previousViews !== null && currentViews !== null &&
      elapsed >= MIN_INTERVAL_MS && currentViews >= previousViews);
    const deltaViews = validDelta ? currentViews! - previousViews! : null;
    const viewsPerDay = deltaViews === null ? null : deltaViews / (elapsed / DAY_MS);
    const peerRates = [...(channelRates.get(video.channel) ?? new Map<string, number>())]
      .filter(([videoId]) => videoId !== video.id)
      .map(([, rate]) => rate);
    const baseline = peerRates.length >= 3 ? median(peerRates) : null;
    const growth: YouTubeGrowth = {
      snapshotCount: (counts.get(video.id) ?? 0) + 1,
      deltaViews,
      viewsPerHour: viewsPerDay === null ? null : viewsPerDay / 24,
      viewsPerDay,
      channelBaselineViewsPerDay: baseline,
      channelOutlierRatio: baseline !== null && baseline > 0 && viewsPerDay !== null ? viewsPerDay / baseline : null,
      measuredAt: capturedAt,
      status: deltaViews === null ? 'insufficient-history' : 'measured',
    };
    return { ...video, growth };
  });
  return { videos: enriched, snapshots: fresh };
}
