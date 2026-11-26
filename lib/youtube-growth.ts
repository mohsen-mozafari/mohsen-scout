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
type HistoryIndex = {
  byVideo: Map<string, SnapshotPair>;
  channelRates: Map<string, Map<string, number>>;
  counts: Map<string, number>;
};

const historyIndexCache = new WeakMap<readonly YouTubeSnapshot[], HistoryIndex>();
const indexMetrics = { fullBuilds: 0, cacheHits: 0, incrementalUpdates: 0 };

function rateFor(pair: SnapshotPair | undefined): number | undefined {
  const last = pair?.last;
  const previous = pair?.previous;
  if (!last || !previous || last.viewCount === null || previous.viewCount === null) return undefined;
  const elapsed = last.capturedAt - previous.capturedAt;
  if (elapsed < MIN_INTERVAL_MS || last.viewCount < previous.viewCount) return undefined;
  return (last.viewCount - previous.viewCount) / (elapsed / DAY_MS);
}

function buildHistoryIndex(history: readonly YouTubeSnapshot[]): HistoryIndex {
  const byVideo = new Map<string, SnapshotPair>();
  const counts = new Map<string, number>();
  for (const item of history) {
    counts.set(item.videoId, (counts.get(item.videoId) ?? 0) + 1);
    if (item.viewCount === null) continue;
    const pair = byVideo.get(item.videoId) ?? {};
    if (!pair.last || item.capturedAt > pair.last.capturedAt) {
      pair.previous = pair.last;
      pair.last = item;
    } else if (!pair.previous || item.capturedAt > pair.previous.capturedAt) {
      pair.previous = item;
    }
    byVideo.set(item.videoId, pair);
  }

  const channelRates = new Map<string, Map<string, number>>();
  for (const [videoId, pair] of byVideo) {
    const rate = rateFor(pair);
    if (rate === undefined || !pair.last) continue;
    const rates = channelRates.get(pair.last.channel) ?? new Map<string, number>();
    rates.set(videoId, rate);
    channelRates.set(pair.last.channel, rates);
  }
  return { byVideo, channelRates, counts };
}

function cloneHistoryIndex(index: HistoryIndex): HistoryIndex {
  return {
    byVideo: new Map([...index.byVideo].map(([id, pair]) => [id, { ...pair }])),
    counts: new Map(index.counts),
    channelRates: new Map([...index.channelRates].map(([channel, rates]) => [channel, new Map(rates)])),
  };
}

function getHistoryIndex(history: readonly YouTubeSnapshot[]): HistoryIndex {
  const cached = historyIndexCache.get(history);
  if (cached) {
    indexMetrics.cacheHits += 1;
    return cached;
  }
  indexMetrics.fullBuilds += 1;
  const index = buildHistoryIndex(history);
  historyIndexCache.set(history, index);
  return index;
}

function extendHistoryIndex(index: HistoryIndex, fresh: readonly YouTubeSnapshot[]): HistoryIndex {
  const next = cloneHistoryIndex(index);
  for (const snapshot of fresh) {
    next.counts.set(snapshot.videoId, (next.counts.get(snapshot.videoId) ?? 0) + 1);
    // A missing view count is still a retained observation, but it must not erase
    // the last valid velocity used by the channel baseline.
    if (snapshot.viewCount === null) continue;

    const previousPair = next.byVideo.get(snapshot.videoId);
    const previousChannel = previousPair?.last?.channel;
    const previousRate = rateFor(previousPair);
    const pair = previousPair ? { ...previousPair } : {};
    if (!pair.last || snapshot.capturedAt > pair.last.capturedAt) {
      pair.previous = pair.last;
      pair.last = snapshot;
    } else if (!pair.previous || snapshot.capturedAt > pair.previous.capturedAt) {
      pair.previous = snapshot;
    }
    next.byVideo.set(snapshot.videoId, pair);

    if (previousRate !== undefined && previousChannel) {
      next.channelRates.get(previousChannel)?.delete(snapshot.videoId);
    }
    const rate = rateFor(pair);
    if (rate !== undefined && pair.last) {
      const rates = next.channelRates.get(pair.last.channel) ?? new Map<string, number>();
      rates.set(snapshot.videoId, rate);
      next.channelRates.set(pair.last.channel, rates);
    }
  }
  indexMetrics.incrementalUpdates += fresh.length;
  return next;
}

/** Test-visible counters prove that repeated saves reuse the previous history index. */
export function getYouTubeGrowthIndexMetrics(): Readonly<typeof indexMetrics> {
  return { ...indexMetrics };
}

export function captureYouTubeSnapshots(
  videos: readonly Video[],
  history: readonly YouTubeSnapshot[],
  capturedAt = Date.now(),
): { videos: Video[]; snapshots: YouTubeSnapshot[]; history: YouTubeSnapshot[] } {
  const index = getHistoryIndex(history);
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
    const prior = index.byVideo.get(video.id)?.last;
    const elapsed = prior ? capturedAt - prior.capturedAt : 0;
    const currentViews = video.viewCount ?? null;
    const previousViews = prior?.viewCount ?? null;
    const validDelta = Boolean(prior && previousViews !== null && currentViews !== null &&
      elapsed >= MIN_INTERVAL_MS && currentViews >= previousViews);
    const deltaViews = validDelta ? currentViews! - previousViews! : null;
    const viewsPerDay = deltaViews === null ? null : deltaViews / (elapsed / DAY_MS);
    const peerRates = [...(index.channelRates.get(video.channel) ?? new Map<string, number>())]
      .filter(([videoId]) => videoId !== video.id)
      .map(([, rate]) => rate);
    const baseline = peerRates.length >= 3 ? median(peerRates) : null;
    const growth: YouTubeGrowth = {
      snapshotCount: (index.counts.get(video.id) ?? 0) + 1,
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

  const nextHistory = fresh.length ? [...fresh, ...history] : [...history];
  historyIndexCache.set(nextHistory, extendHistoryIndex(index, fresh));
  return { videos: enriched, snapshots: fresh, history: nextHistory };
}
