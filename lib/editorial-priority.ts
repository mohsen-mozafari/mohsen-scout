export const EDITORIAL_PRIORITY_CONFIG = {
  // Platform-aware formula: measured YouTube velocity and channel outliers add a bounded 20% signal.
  weights: {
    relevance: 0.25,
    evidenceBreadth: 0.25,
    freshness: 0.15,
    differentiation: 0.15,
    platformMomentum: 0.20,
  },
  baseWeights: { relevance: 0.30, evidenceBreadth: 0.30, freshness: 0.20, differentiation: 0.20 },
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
  assessment?: string;
  videoIds?: readonly string[];
  reportId?: string;
  sourceUrl?: string;
  archived?: boolean;
  status?: string;
  createdAt?: number;
  engineScoredAt?: number;
};

const assessmentOrder: Record<string, number> = {
  'Strong Opportunity': 5,
  Promising: 4,
  'Worth Exploring': 3,
  Uncertain: 2,
  'Highly Competitive': 1,
};

function evidenceWeight(idea: EditorialPriorityCandidate): number {
  return (idea.videoIds?.length ?? 0) + (idea.reportId ? 1 : 0) + (idea.sourceUrl ? 1 : 0);
}

/** One deterministic ordering shared by the dashboard, featured idea and Ideas list. */
export function compareEditorialPriority<T extends EditorialPriorityCandidate>(left: T, right: T): number {
  return (right.engineScore ?? -1) - (left.engineScore ?? -1) ||
    (assessmentOrder[right.assessment ?? ''] ?? 0) - (assessmentOrder[left.assessment ?? ''] ?? 0) ||
    evidenceWeight(right) - evidenceWeight(left) ||
    (right.engineScoredAt ?? right.createdAt ?? 0) - (left.engineScoredAt ?? left.createdAt ?? 0) ||
    (right.createdAt ?? 0) - (left.createdAt ?? 0);
}

/** Selects the live recommendation rail; completed, rejected and archived ideas never occupy a slot. */
export function selectTopCurrentEditorialPriorities<T extends EditorialPriorityCandidate>(
  ideas: readonly T[],
  limit: number = EDITORIAL_PRIORITY_CONFIG.pinnedIdeas,
): T[] {
  const maximum = Number.isFinite(limit) ? Math.max(0, Math.min(25, Math.floor(limit))) : EDITORIAL_PRIORITY_CONFIG.pinnedIdeas;
  if (!maximum) return [];
  return ideas
    .filter((idea) =>
      !idea.archived &&
      idea.status !== 'Rejected Ideas' &&
      idea.status !== 'Completed Research' &&
      typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore),
    )
    .sort(compareEditorialPriority)
    .slice(0, maximum);
}

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
