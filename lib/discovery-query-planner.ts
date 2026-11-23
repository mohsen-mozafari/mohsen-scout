/**
 * Bounded, deterministic research-query expansion for Scout.
 *
 * This planner only proposes query paths; it does not fetch, rank, or infer
 * YouTube-derived metrics. Its inputs are topic text and independently observed
 * evidence gaps, so provider usage remains explicit and quota-accounted.
 */
export type DiscoveryQueryPath = {
  query: string;
  lane: 'core' | 'questions' | 'subtopics' | 'verification' | 'gap';
  reason: string;
};

export type DiscoveryPlanInput = {
  topic: string;
  seedQueries?: readonly string[];
  subtopics?: readonly string[];
  verificationTerms?: readonly string[];
  evidenceGaps?: readonly string[];
  maxQueries?: number;
};

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 220);
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.map(clean).filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Build an ordered, capped, explainable query plan without making network calls. */
export function buildDiscoveryQueryPlan(input: DiscoveryPlanInput): DiscoveryQueryPath[] {
  const topic = clean(input.topic);
  if (!topic) return [];
  const cap = Number.isFinite(input.maxQueries)
    ? Math.max(1, Math.min(24, Math.floor(input.maxQueries!)))
    : 12;
  const paths: DiscoveryQueryPath[] = [
    { query: topic, lane: 'core', reason: 'Baseline topic search' },
    ...unique(input.seedQueries ?? []).filter((q) => q.toLocaleLowerCase() !== topic.toLocaleLowerCase())
      .map((query) => ({ query, lane: 'core' as const, reason: 'Caller-provided related search' }),
    ...unique(['what is ' + topic, 'how does ' + topic + ' work', topic + ' explained'])
      .map((query) => ({ query, lane: 'questions' as const, reason: 'Question-led discovery' })),
    ...unique(input.subtopics ?? []).map((term) => ({
      query: topic + ' ' + term, lane: 'subtopics' as const, reason: 'Explore a candidate subtopic',
    })),
    ...unique(input.verificationTerms ?? []).map((term) => ({
      query: topic + ' ' + term, lane: 'verification' as const, reason: 'Verify or challenge a claim',
    })),
    ...unique(input.evidenceGaps ?? []).map((gap) => ({
      query: topic + ' ' + gap, lane: 'gap' as const, reason: 'Address an observed evidence gap',
    })),
  ];
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = path.query.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, cap);
}
