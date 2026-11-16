export type ResearchChartNews = { id: string; url: string; publishedAt: string | null };
export type ResearchChartReport = { createdAt: number; videos: readonly { id: string }[] };
export type ResearchChartInput = {
  news: readonly ResearchChartNews[];
  reports: readonly ResearchChartReport[];
  ideas: readonly { createdAt: number }[];
  opinions: readonly { createdAt: number }[];
};
export type ResearchChartPoint = { day: string; news: number; youtube: number; ideas: number; aiReviews: number };
export type ResearchChartResult = {
  points: ResearchChartPoint[];
  totals: Omit<ResearchChartPoint, 'day'>;
};

function utcDay(value: number): string | undefined {
  if (!Number.isFinite(value) || value < 0) return undefined;
  return new Date(value).toISOString().slice(0, 10);
}

export function buildResearchChartData(input: ResearchChartInput, now = Date.now(), requestedDays = 14): ResearchChartResult {
  const days = Math.max(7, Math.min(30, Math.trunc(requestedDays) || 14));
  const today = utcDay(now) ?? new Date().toISOString().slice(0, 10);
  const end = Date.parse(today + 'T00:00:00.000Z');
  const points: ResearchChartPoint[] = Array.from({ length: days }, (_, index) => {
    const day = new Date(end - (days - index - 1) * 86400000).toISOString().slice(0, 10);
    return { day, news: 0, youtube: 0, ideas: 0, aiReviews: 0 };
  });
  const byDay = new Map(points.map((point) => [point.day, point]));
  const uniqueNews = new Set<string>();

  for (const item of input.news) {
    if (!item.publishedAt) continue;
    const date = Date.parse(item.publishedAt);
    const day = Number.isFinite(date) ? utcDay(date) : undefined;
    const identity = item.url || item.id;
    const bucket = day ? byDay.get(day) : undefined;
    if (!bucket || !identity || uniqueNews.has(identity)) continue;
    uniqueNews.add(identity);
    bucket.news += 1;
  }
  for (const report of input.reports) {
    const bucket = byDay.get(utcDay(report.createdAt) ?? '');
    if (!bucket) continue;
    bucket.youtube += new Set(report.videos.map((video) => video.id).filter(Boolean)).size;
  }
  for (const idea of input.ideas) {
    const bucket = byDay.get(utcDay(idea.createdAt) ?? '');
    if (bucket) bucket.ideas += 1;
  }
  for (const opinion of input.opinions) {
    const bucket = byDay.get(utcDay(opinion.createdAt) ?? '');
    if (bucket) bucket.aiReviews += 1;
  }
  const totals = points.reduce((sum, point) => ({
    news: sum.news + point.news,
    youtube: sum.youtube + point.youtube,
    ideas: sum.ideas + point.ideas,
    aiReviews: sum.aiReviews + point.aiReviews,
  }), { news: 0, youtube: 0, ideas: 0, aiReviews: 0 });
  return { points, totals };
}
