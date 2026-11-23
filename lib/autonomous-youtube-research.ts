import { searchYouTubeSample, type YouTubeOptions, type YouTubeSampleVideo } from './api';
import { createExplorationState, expandExploration, takeExplorationPath, type DiscoveryCandidate } from './youtube-exploration-planner';

export type AutonomousYouTubeResearchResult = {
  videos: YouTubeSampleVideo[];
  queries: string[];
  warnings: string[];
  exploration: { rounds: number; visited: number; queued: number; maxDepth: number };
};

/** Iterative, quota-bounded YouTube exploration: seed sample -> concept expansion -> follow-up samples. */
export async function runAutonomousYouTubeResearch(
  topic: string,
  options: YouTubeOptions,
  filters: { days?: 0 | 7 | 30 | 90; region?: 'United States' | 'Worldwide' | 'Iran' | 'United Kingdom' | 'Germany'; language?: string },
  limits: { rounds?: number; resultsPerQuery?: number } = {},
): Promise<AutonomousYouTubeResearchResult> {
  const rounds = Math.max(1, Math.min(3, Math.floor(limits.rounds ?? 3)));
  const resultsPerQuery = Math.max(5, Math.min(15, Math.floor(limits.resultsPerQuery ?? 10)));
  const state0 = createExplorationState(topic, 2, 8);
  let state = { ...state0, queue: [{ query: topic.trim(), reason: 'Seed topic', depth: 0 }] };
  const all = new Map<string, YouTubeSampleVideo>();
  const queries: string[] = [];
  const warnings: string[] = [];
  let completedRounds = 0;
  for (let round = 0; round < rounds; round++) {
    const next = takeExplorationPath(state);
    state = next.state;
    if (!next.path) break;
    const query = next.path.query;
    queries.push(query);
    try {
      const result = await searchYouTubeSample(query, options, resultsPerQuery, {
        ...filters, order: 'discovery',
      });
      warnings.push(...(result.warning ? [result.warning] : []));
      for (const video of result.videos) all.set(video.id, video);
      completedRounds++;
      const candidates: DiscoveryCandidate[] = result.videos.map((video) => ({
        id: video.id, title: video.title, description: video.description,
        channel: video.channel, views: video.viewCount, publishedAt: video.publishedAt,
      }));
      state = expandExploration(state, candidates);
      // Expand from the entire deduplicated corpus as well, not just the last query.
      state = expandExploration(state, [...all.values()].map((video) => ({
        id: video.id, title: video.title, description: video.description,
        channel: video.channel, views: video.viewCount, publishedAt: video.publishedAt,
      })));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'An exploration query failed.');
      if (round === 0) throw error;
      break;
    }
  }
  return {
    videos: [...all.values()],
    queries,
    warnings: [...new Set(warnings)],
    exploration: { rounds: completedRounds, visited: state.visited.length, queued: state.queue.length, maxDepth: state.maxDepth },
  };
}
