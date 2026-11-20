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
  chartLimit: 24,
  chartDebounceMs: 160,
} as const;

export type EditorialPriorityBand = 'strong' | 'moderate' | 'weak';

export function getEditorialPriorityBand(score: number): EditorialPriorityBand {
  if (score >= EDITORIAL_PRIORITY_CONFIG.thresholds.strong) return 'strong';
  if (score >= EDITORIAL_PRIORITY_CONFIG.thresholds.moderate) return 'moderate';
  return 'weak';
}
