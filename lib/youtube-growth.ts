import type { Video, YouTubeGrowth, YouTubeSnapshot } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 30 * 60 * 1000;

function median(values: readonly number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

type SnapshotPair = { last?: YouTubeSnapshot; previous?: YouTubeSnapshot };

function buildHistoryIndex(history: readonly YouTubeSnapshot[], capturedAt: number) {
  const byVideo = new Map<string, SnapshotPair>();
  const counts = new Map<string, number>();
  const channelRates = new Map<string, Map<string, number>>();
  for (const item of history) {
    counts.set(item.videoId, (counts.get(item.videoId) ?? 0) + 1);
    if (item.capturedAt >= capturedAt || item.viewCount === null) continue;
    const pair = byVideo.get(item.videoId) ?? {};
    const minimumPreviousAt = capturedAt - MIN_INTERVAL_MS;
    if (!pair.last || item.capturedAt > pair.last.capturedAt) {
      if (pair.last && pair.last.capturedAt <= minimumPreviousAt &&
          (!pair.previous || pair.last.capturedAt > pair.previous.capturedAt)) {
        pair.previous = pair.last;
      }
      pair.last = item;
    } else if (item.capturedAt <= minimumPreviousAt &&
        (!pair.previous || item.capturedAt > pair.previous.capturedAt)) {
      pair.previous = item;
    }
    byVideo.set(item.videoId, pair);
  }
  for (const [videoId, pair] of byVideo) {
    const last = pair.last;
    const previous = pair.previous;
    if (!last || !previous || last.viewCount === null || previous.viewCount === null) continue;
    const elapsed = last.capturedAt - previous.capturedAt;
    if (elapsed < MIN_INTERVAL_MS || last.viewCount < previous.viewCount) continue;
    const rate = (last.viewCount - previous.viewCount) / (elapsed / DAY_MS);
    const channel = last.channel;
    const rates = channelRates.get(channel) ?? new Map<string, number>();
    rates.set(videoId, rate);
    channelRates.set(channel, rates);
  }
  return { byVideo, channelRates, counts };
}

export function captureYouTubeSnapshots(
  videos: readonly Video[],
  history: readonly YouTubeSnapshot[],
  capturedAt = Date.now(),
): { videos: Video[]; snapshots: YouTubeSnapshot[] } {
  const { byVideo, channelRates, counts } = buildHistoryIndex(history, capturedAt);
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
    const prior = byVideo.get(video.id)?.last;
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
