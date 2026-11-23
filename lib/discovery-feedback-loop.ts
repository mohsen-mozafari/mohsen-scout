import type { DiscoveryQueryPath } from './discovery-query-planner';

export type DiscoveryEvidenceSummary = {
  query: string;
  resultCount: number;
  highRelevanceCount: number;
  freshCount: number;
  uniqueChannelCount: number;
  gapTags?: string[];
};

export type DiscoveryLoopState = {
  visitedQueries: string[];
  summaries: DiscoveryEvidenceSummary[];
  round: number;
};

export type DiscoveryLoopConfig = {
  maxRounds?: number;
  maxQueriesPerRound?: number;
  minFreshResults?: number;
};

/** Pure bounded loop controller; provider calls and metric validation stay outside. */
export function nextDiscoveryRound(
  plan: readonly DiscoveryQueryPath[],
  state: DiscoveryLoopState,
  config: DiscoveryLoopConfig = {},
): DiscoveryQueryPath[] {
  const maxRounds = Math.max(1, Math.min(5, Math.floor(config.maxRounds ?? 3)));
  const maxQueries = Math.max(1, Math.min(8, Math.floor(config.maxQueriesPerRound ?? 4)));
  if (state.round >= maxRounds) return [];
  const visited = new Set(state.visitedQueries.map((q) => q.toLowerCase().trim()));
  const scored = plan.filter((p) => !visited.has(p.query.toLowerCase().trim()));
  const gaps = state.summaries.flatMap((s) => s.gapTags ?? []);
  const gapSet = new Set(gaps.map((g) => g.toLowerCase().trim()));
  return scored.sort((a,b) => {
    const ag = gapSet.has(a.query.toLowerCase().trim()) ? -1 : 0;
    const bg = gapSet.has(b.query.toLowerCase().trim()) ? -1 : 0;
    return ag-bg;
  }).slice(0,maxQueries);
}

export function summarizeDiscoveryRound(
  queries: readonly string[],
  summaries: readonly DiscoveryEvidenceSummary[],
): DiscoveryLoopState {
  const visited = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
  return { visitedQueries: visited, summaries: summaries.slice(0,32), round: 1 };
}
