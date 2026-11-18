import type { LocalData } from './types';
export type ResearchActivityPoint = { at: number; label: string; news: number; videos: number; reports: number; ideas: number; links: number; notes: number; memory: number; ai: number; total: number };
export type ResearchOverview = { totals: { news: number; videos: number; reports: number; ideas: number; links: number; notes: number; memory: number; ai: number }; activity: ResearchActivityPoint[]; hasActivity: boolean };
/** Aggregates only records already stored locally; it never invents trend or demand data. */
export function buildResearchOverview(data: LocalData, now = Date.now()): ResearchOverview {
  const newsById = new Map<string, { publishedAt: string | null }>();
  for (const source of data.feedRegistry) for (const item of source.cachedItems) if (!newsById.has(item.id)) newsById.set(item.id, { publishedAt: item.publishedAt });
  const totals = {
    news: newsById.size, videos: new Set(data.videos.map((video) => video.id)).size,
    reports: data.reports.length, ideas: data.ideas.filter((idea) => !idea.archived).length,
    links: data.links.length, notes: data.notes.length, memory: data.researchMemory.length, ai: data.opinions.length,
  };
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
  const activity = Array.from({ length: 7 }, (_, index) => {
    const at = start.getTime() + index * 86400000;
    return { at, label: new Date(at).toLocaleDateString('en-US', { weekday: 'short' }), news: 0, videos: 0, reports: 0, ideas: 0, links: 0, notes: 0, memory: 0, ai: 0, total: 0 };
  });
  const add = (timestamp: number, key: 'news' | 'videos' | 'reports' | 'ideas' | 'links' | 'notes' | 'memory' | 'ai') => {
    if (!Number.isFinite(timestamp)) return;
    const index = Math.floor((timestamp - start.getTime()) / 86400000);
    if (index < 0 || index >= 7) return;
    activity[index][key] += 1; activity[index].total += 1;
  };
  for (const item of newsById.values()) add(item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN, 'news');
  for (const video of data.videos) add(video.fetchedAt, 'videos');
  for (const report of data.reports) add(report.createdAt, 'reports');
  for (const idea of data.ideas) if (!idea.archived) add(idea.createdAt, 'ideas');
  for (const link of data.links) add(link.savedAt, 'links');
  for (const note of data.notes) add(note.updatedAt, 'notes');
  for (const item of data.researchMemory) add(item.updatedAt, 'memory');
  for (const opinion of data.opinions) add(opinion.createdAt, 'ai');
  return { totals, activity, hasActivity: activity.some((point) => point.total > 0) };
}
