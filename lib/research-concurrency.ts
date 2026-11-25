export const MAX_CONCURRENT_RESEARCH_RUNS = 2;

export function availableResearchRunSlots(activeRuns: number): number {
  if (!Number.isFinite(activeRuns)) return MAX_CONCURRENT_RESEARCH_RUNS;
  return Math.max(0, MAX_CONCURRENT_RESEARCH_RUNS - Math.max(0, Math.floor(activeRuns)));
}

export function canStartResearchRun(activeRuns: number): boolean {
  return availableResearchRunSlots(activeRuns) > 0;
}
