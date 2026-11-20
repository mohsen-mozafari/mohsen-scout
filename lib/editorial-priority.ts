export const EDITORIAL_PRIORITY_CONFIG = {
  // These weights preserve the current engine formula exactly; they do not add signals.
  weights: {
    relevance: 0.30,
    evidenceBreadth: 0.30,
    freshness: 0.20,
    differentiation: 0.20,
  },
  thresholds: {
    strong: 85,
    moderate: 65,
  },
  pinnedIdeas: 5,
  chartLimit: 40,
  chartDebounceMs: 160,
} as const;

export type EditorialPriorityBand = 'strong' | 'moderate' | 'weak';

export function getEditorialPriorityBand(score: number): EditorialPriorityBand {
  if (score >= EDITORIAL_PRIORITY_CONFIG.thresholds.strong) return 'strong';
  if (score >= EDITORIAL_PRIORITY_CONFIG.thresholds.moderate) return 'moderate';
  return 'weak';
}

export type EditorialPriorityCandidate = {
  engineScore?: number | null;
  archived?: boolean;
  status?: string;
};

export type EditorialPrioritySummary = {
  scored: number;
  strong: number;
  moderate: number;
  weak: number;
  unscored: number;
};

/** Count only active ideas using the same bands shown by the dashboard. */
export function summarizeEditorialPriority(
  ideas: readonly EditorialPriorityCandidate[],
): EditorialPrioritySummary {
  const summary: EditorialPrioritySummary = {
    scored: 0,
    strong: 0,
    moderate: 0,
    weak: 0,
    unscored: 0,
  };

  for (const idea of ideas) {
    if (
      idea.archived ||
      idea.status === 'Rejected Ideas' ||
      idea.status === 'Completed Research'
    ) continue;

    const score = idea.engineScore;
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      summary.unscored += 1;
      continue;
    }

    summary.scored += 1;
    summary[getEditorialPriorityBand(score)] += 1;
  }

  return summary;
}
