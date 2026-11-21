import type { EngineV2Feature, EngineV2VideoInput } from './types';

export function percentile(values: number[], p: number): number {
  const list = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!list.length) return 0;
  const rank = (p / 100) * (list.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const t = rank - lo;
  return list[lo] + (list[hi] - list[lo]) * t;
}

export function median(values: number[]): number {
  return percentile(values, 50);
}

export function parseTimeMs(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

export function computeVideoFeatures(
  video: EngineV2VideoInput,
  ctx: { now: number; channelMedianViews: Map<string, number>; channelMedianSubs: Map<string, number> },
): EngineV2Feature {
  const publishedMs = parseTimeMs(video.publishedAt);
  const hoursSincePublish = publishedMs > 0 ? Math.max(0, (ctx.now - publishedMs) / 3_600_000) : 0;
  const viewCount = video.viewCount;
  const hasViewStats = viewCount != null;
  const growthRate = hasViewStats ? viewCount / Math.max(0.001, hoursSincePublish) : 0;
  const engagementRatio = viewCount != null && viewCount > 0 && video.likeCount != null
    ? (video.likeCount + (video.commentCount ?? 0)) / viewCount
    : 0;
  const words = video.title.trim().split(/\s+/).filter(Boolean).length;
  const channelId = video.channelId || '';
  const medianViews = channelId ? ctx.channelMedianViews.get(channelId) ?? null : null;
  const outlierScore = video.viewCount != null && medianViews != null && medianViews > 0
    ? video.viewCount / medianViews
    : null;
  const medianSubs = channelId ? ctx.channelMedianSubs.get(channelId) ?? null : null;
  const channelSizeRatio = video.channelSubscriberCount != null && medianSubs != null && medianSubs > 0
    ? video.channelSubscriberCount / medianSubs
    : null;
  return {
    videoId: video.id,
    title: video.title,
    channel: video.channel,
    channelId,
    publishedAt: video.publishedAt,
    hoursSincePublish,
    growthRate,
    engagementRatio,
    commentCount: video.commentCount ?? 0,
    viewCount,
    likeCount: video.likeCount,
    hasStats: hasViewStats,
    titlePatterns: {
      hasDigit: /\d/.test(video.title),
      isQuestion: /[?؟]/.test(video.title),
      words,
    },
    recencyHours: hoursSincePublish,
    channelSizeRatio,
    outlierScore,
  };
}
