/**
 * Bounded multi-hop research planning from independent web/news evidence.
 * YouTube API metadata is intentionally not accepted by this module.
 */
export type DiscoveryEvidence = { title: string; summary: string; url: string };
const STOP = new Set([
  'about','after','again','also','among','because','before','being','between','could',
  'from','have','into','more','most','other','over','said','than','that','their',
  'there','these','they','this','those','through','under','using','what','when',
  'where','which','while','with','within','would','your','news','report','reports',
  'latest','update','updates','explained','guide','official','analysis','study',
]);
function terms(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]{4,}|[\u0600-\u06ff]{3,}/g) ?? [])
    .filter((word) => !STOP.has(word));
}
/**
 * Turn independent evidence into at most two focused follow-up searches.
 * The function is deterministic, bounded, and does not infer popularity/demand.
 */
export function planEvidenceFollowUps(
  topic: string,
  evidence: readonly DiscoveryEvidence[],
  alreadyAsked: readonly string[] = [],
): string[] {
  const cleanTopic = topic.trim().replace(/\s+/g, ' ').slice(0, 160);
  if (!cleanTopic || !evidence.length) return [];
  const asked = new Set(alreadyAsked.map((q) => q.toLowerCase().trim()));
  const topicTerms = new Set(terms(cleanTopic));
  // A previous follow-up already explored its terms; do not generate a near-duplicate variant.
  const previouslyExploredTerms = new Set(
    alreadyAsked.flatMap((query) => terms(query)).filter((word) => !topicTerms.has(word)),
  );
  const ranked = evidence
    .filter((item) => /^https?:\/\//i.test(item.url) && item.title.trim())
    .map((item) => {
      const words = [...new Set(terms(item.title + ' ' + item.summary))]
        .filter((word) => !topicTerms.has(word) && !previouslyExploredTerms.has(word));
      return { words, title: item.title };
    })
    .filter((item) => item.words.length > 0)
    .slice(0, 12);
  const frequency = new Map<string, number>();
  for (const item of ranked) for (const word of item.words) {
    frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }
  const candidates = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);
  const output: string[] = [];
  for (let index = 0; index < Math.min(2, candidates.length); index++) {
    const phrase = candidates.slice(index * 3, index * 3 + 3);
    if (!phrase.length) continue;
    const query = (cleanTopic + ' ' + phrase.join(' ')).slice(0, 220);
    const key = query.toLowerCase();
    if (asked.has(key)) continue;
    asked.add(key);
    output.push(query);
  }
  return output;
}
