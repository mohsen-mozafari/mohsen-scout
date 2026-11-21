import type { EngineV2Opportunity } from './types';

/**
 * Diversifies and limits the scored opportunities: at most two ideas per topic
 * cluster and a bounded output list (default 5, max 10). Sorted by score desc.
 */
export function generateEngineV2Opportunities(input: {
  opportunities: EngineV2Opportunity[];
  limit?: number;
}): EngineV2Opportunity[] {
  const limit = Math.max(1, Math.min(10, input.limit ?? 5));
  const byCluster = new Map<string, number>();
  const out: EngineV2Opportunity[] = [];
  for (const opp of [...input.opportunities].sort((a, b) => b.score - a.score)) {
    if (out.length >= limit) break;
    const used = byCluster.get(opp.angleId) ?? 0;
    if (used >= 2) continue;
    byCluster.set(opp.angleId, used + 1);
    out.push(opp);
  }
  return out;
}
