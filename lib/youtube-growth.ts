import type { Video, YouTubeGrowth, YouTubeSnapshot } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 30 * 60 * 1000;
const median = (values: number[]): number | null => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function latestRateByVideo(snapshots: readonly YouTubeSnapshot[], channel: string, omitVideoId: string): number[] {
  const grouped = new Map<string, YouTubeSnapshot[]>();
  for (const item of snapshots) {
    if (item.channel !== channel || item.videoId === omitVideoId || item.viewCount === null) continue;
    const list = grouped.get(item.videoId) ?? [];
    list.push(item);
    grouped.set(item.videoId, list);
  }
  const rates: number[] = [];
  for (const list of grouped.values()) {
    list.sort((a, b) => a.capturedAt - b.capturedAt);
    const last = list[list.length - 1];
    const previous = [...list].reverse().find((item) => item.capturedAt < last.capturedAt && item.viewCount !== null);
    if (!previous || previous.viewCount === null || last.viewCount === null) continue;
    const elapsed = last.capturedAt - previous.capturedAt;
    if (elapsed < MIN_INTERVAL_MS || last.viewCount < previous.viewCount) continue;
    rates.push((last.viewCount - previous.viewCount) / (elapsed / DAY_MS));
  }
  return rates;
}

export function captureYouTubeSnapshots(
  videos: readonly Video[],
  history: readonly YouTubeSnapshot[],
  capturedAt = Date.now(),
): { videos: Video[]; snapshots: YouTubeSnapshot[] } {
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
    const prior = history
      .filter((item) => item.videoId === video.id && item.viewCount !== null && item.capturedAt < capturedAt)
      .sort((a, b) => b.capturedAt - a.capturedAt)[0];
    const elapsed = prior ? capturedAt - prior.capturedAt : 0;
    const currentViews = video.viewCount ?? null;
    const previousViews = prior?.viewCount ?? null;
    const validDelta = prior !== undefined && previousViews !== null && currentViews !== null &&
      elapsed >= MIN_INTERVAL_MS && currentViews >= previousViews;
    const deltaViews = validDelta ? currentViews - previousViews : null;
    const viewsPerDay = deltaViews === null ? null : deltaViews / (elapsed / DAY_MS);
    const channelRates = latestRateByVideo(history, video.channel, video.id);
    const baseline = channelRates.length >= 3 ? median(channelRates) : null;
    const growth: YouTubeGrowth = {
      snapshotCount: history.filter((item) => item.videoId === video.id).length + 1,
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
