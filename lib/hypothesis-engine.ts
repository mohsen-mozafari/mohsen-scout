import { normalizeResearchText } from './intelligence';

export type HypothesisEvidence = {
  id: string;
  title: string;
  summary: string;
  url: string;
  sourceName?: string;
  publishedAt?: string;
};

export type ResearchHypothesis = {
  id: string;
  statement: string;
  focus: string;
  status: 'supported' | 'contested' | 'insufficient-evidence';
  confidence: 'low' | 'moderate' | 'high';
  supportingEvidenceIds: string[];
  challengingEvidenceIds: string[];
  contextEvidenceIds: string[];
  independentHostCount: number;
  rationale: string;
};

export type ResearchDirection = {
  query: string;
  hypothesisId: string;
  purpose: 'independent-confirmation' | 'counterevidence' | 'mechanism';
  priority: number;
  reason: string;
};

export type HypothesisReview = {
  hypotheses: ResearchHypothesis[];
  nextDirections: ResearchDirection[];
  usableEvidenceCount: number;
  independentHostCount: number;
  limitations: string[];
};

const STOP = new Set([
  'about','after','again','also','among','because','before','being','between','could',
  'from','have','into','more','most','other','over','said','than','that','their',
  'there','these','they','this','those','through','under','using','what','when',
  'where','which','while','with','within','would','your','news','report','reports',
  'latest','update','updates','explained','guide','official','analysis','study',
  'with','from','into','over','under','about','after','before','the','and','for',
  'are','was','were','has','had','have','not','but','its','their','than','then',
  'همه','برای','های','هایی','این','آن','است','هست','بود','شد','شده','می','که',
  'را','از','به','در','با','یا','و','بر','تا','یک','هر','چه','چرا','چگونه',
]);

const SUPPORT_CUES = [
  'confirms','confirmed','supports','supported','demonstrates','demonstrated',
  'evidence for','consistent with','shows that','found that','تأیید می‌کند',
  'تایید می‌کند','نشان می‌دهد','حمایت می‌کند','شواهدی برای',
];
const CHALLENGE_CUES = [
  'contradicts','contradicted','disputes','disputed','refutes','refuted',
  'no evidence','failed to','does not support','not supported','unlikely',
  'uncertain','controversy','limitation','limitations','criticism','criticized',
  'رد می‌کند','رد شد','تردید','ابهام','شواهدی وجود ندارد','محدودیت','نقض می‌کند',
];

function words(value: string): string[] {
  return normalizeResearchText(value)
    .match(/[a-z0-9]{3,}|[\u0600-\u06ff]{3,}/g)
    ?.filter((word) => !STOP.has(word)) ?? [];
}

function hostFamily(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtube.com' || host.endsWith('.youtube.com') ||
        host === 'youtu.be' || host.endsWith('.googlevideo.com')) return undefined;
    const labels = host.split('.');
    if (labels.length < 2) return host;
    const suffix = labels.slice(-2).join('.');
    const multiPartSuffixes = new Set(['co.uk','org.uk','ac.uk','com.au','net.au','co.jp','com.br','co.in']);
    return multiPartSuffixes.has(suffix) && labels.length >= 3
      ? labels.slice(-3).join('.')
      : suffix;
  } catch {
    return undefined;
  }
}

function hasCue(text: string, cues: readonly string[]): boolean {
  const normalized = normalizeResearchText(text);
  return cues.some((cue) => normalized.includes(normalizeResearchText(cue)));
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function cleanEvidence(items: readonly HypothesisEvidence[]): HypothesisEvidence[] {
  const seen = new Set<string>();
  const output: HypothesisEvidence[] = [];
  for (const item of items) {
    const host = hostFamily(item.url);
    const title = item.title.trim().slice(0, 500);
    if (!host || !title) continue;
    const key = item.url.split('#')[0].replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ ...item, title, summary: item.summary.trim().slice(0, 1600) });
  }
  return output;
}

/**
 * Builds auditable, deliberately conservative hypothesis assessments from independent
 * publisher evidence. Host diversity is a proxy, not proof of ownership independence;
 * lexical cues are review signals, not natural-language entailment.
 */
export function reviewResearchHypotheses(
  topic: string,
  rawEvidence: readonly HypothesisEvidence[],
  alreadyAsked: readonly string[] = [],
  maxDirections = 2,
): HypothesisReview {
  const cleanTopic = topic.trim().replace(/\s+/g, ' ').slice(0, 180);
  const evidence = cleanEvidence(rawEvidence);
  const topicWords = new Set(words(cleanTopic));
  const asked = new Set(alreadyAsked.map((query) => normalizeResearchText(query)));
  const explored = new Set(alreadyAsked.flatMap((query) => words(query)).filter((word) => !topicWords.has(word)));
  const hostById = new Map(evidence.map((item) => [item.id, hostFamily(item.url) ?? '']));
  const allHosts = unique([...hostById.values()].filter(Boolean));
  const candidateMap = new Map<string, { focus: string; ids: string[]; domains: Set<string> }>();

  for (const item of evidence) {
    const text = item.title + ' ' + item.summary;
    const tokens = words(text).filter((word) => !topicWords.has(word));
    const pairs: string[] = [];
    for (let index = 0; index < tokens.length - 1; index += 1) {
      if (tokens[index] !== tokens[index + 1]) pairs.push(tokens[index] + ' ' + tokens[index + 1]);
    }
    const candidates = [...pairs, ...tokens];
    for (const phrase of unique(candidates).slice(0, 18)) {
      if (phrase.split(' ').some((word) => explored.has(word))) continue;
      const current = candidateMap.get(phrase) ?? { focus: phrase, ids: [], domains: new Set<string>() };
      current.ids.push(item.id);
      const host = hostById.get(item.id);
      if (host) current.domains.add(host);
      candidateMap.set(phrase, current);
    }
  }

  const ranked = [...candidateMap.values()]
    .filter((candidate) => candidate.ids.length > 0)
    .sort((a, b) =>
      (b.domains.size * 4 + b.ids.length) - (a.domains.size * 4 + a.ids.length) ||
      a.focus.localeCompare(b.focus),
    )
    .slice(0, 8);

  const hypotheses: ResearchHypothesis[] = ranked.map((candidate, index) => {
    const matched = evidence.filter((item) => candidate.ids.includes(item.id));
    const supportingEvidenceIds: string[] = [];
    const challengingEvidenceIds: string[] = [];
    const contextEvidenceIds: string[] = [];
    for (const item of matched) {
      const text = item.title + ' ' + item.summary;
      const support = hasCue(text, SUPPORT_CUES);
      const challenge = hasCue(text, CHALLENGE_CUES);
      if (support && !challenge) supportingEvidenceIds.push(item.id);
      else if (challenge) challengingEvidenceIds.push(item.id);
      else contextEvidenceIds.push(item.id);
    }
    const supportingHosts = unique(supportingEvidenceIds.map((id) => hostById.get(id) ?? '').filter(Boolean));
    const challengingHosts = unique(challengingEvidenceIds.map((id) => hostById.get(id) ?? '').filter(Boolean));
    const contested = challengingEvidenceIds.length > 0 &&
      (supportingEvidenceIds.length > 0 || challengingEvidenceIds.length >= 2);
    const supported = supportingHosts.length >= 2 && challengingEvidenceIds.length === 0;
    const status = contested ? 'contested' : supported ? 'supported' : 'insufficient-evidence';
    const confidence = supportingHosts.length >= 3 && challengingEvidenceIds.length === 0
      ? 'high'
      : supportingHosts.length >= 2 && challengingEvidenceIds.length === 0
        ? 'moderate'
        : 'low';
    const rationale = contested
      ? 'Both supportive and challenging language signals were found; inspect the cited sources before deciding.'
      : supported
        ? 'Explicit supportive language appears across multiple host families; this is corroboration to review, not proof.'
        : 'The available material does not contain enough explicit, cross-domain support to validate this hypothesis.';
    return {
      id: 'hypothesis:' + index + ':' + normalizeResearchText(candidate.focus).replace(/\s+/g, '-').slice(0, 64),
      statement: 'Whether "' + candidate.focus + '" is materially connected to "' + cleanTopic + '".',
      focus: candidate.focus,
      status,
      confidence,
      supportingEvidenceIds,
      challengingEvidenceIds,
      contextEvidenceIds,
      independentHostCount: candidate.domains.size,
      rationale,
    };
  });

  const directions: ResearchDirection[] = [];
  for (const hypothesis of hypotheses) {
    const base = cleanTopic + ' ' + hypothesis.focus;
    const candidates: ResearchDirection[] = [
      {
        query: (base + ' independent confirmation primary sources').slice(0, 220),
        hypothesisId: hypothesis.id,
        purpose: 'independent-confirmation',
        priority: hypothesis.status === 'supported' ? 3 : 2,
        reason: 'Seek a separate primary or independent source to test the same hypothesis.',
      },
      {
        query: (base + ' limitations criticism contradictory evidence').slice(0, 220),
        hypothesisId: hypothesis.id,
        purpose: 'counterevidence',
        priority: hypothesis.status === 'contested' ? 4 : 3,
        reason: 'Actively search for limitations, disagreement and evidence against the hypothesis.',
      },
      {
        query: (base + ' mechanism how evidence').slice(0, 220),
        hypothesisId: hypothesis.id,
        purpose: 'mechanism',
        priority: 1,
        reason: 'Check the proposed mechanism rather than relying only on repeated claims.',
      },
    ];
    for (const direction of candidates) {
      const key = normalizeResearchText(direction.query);
      if (!key || asked.has(key) || directions.some((item) => normalizeResearchText(item.query) === key)) continue;
      directions.push(direction);
    }
  }
  directions.sort((a, b) => b.priority - a.priority || a.query.localeCompare(b.query));
  return {
    hypotheses,
    nextDirections: directions.slice(0, Math.max(0, Math.min(4, maxDirections))),
    usableEvidenceCount: evidence.length,
    independentHostCount: allHosts.length,
    limitations: [
      'Different host names do not prove different ownership or independent reporting.',
      'Keyword and wording signals do not establish that a source logically proves or disproves a claim.',
      'A source with no explicit stance cue is treated as context, not as confirmation.',
    ],
  };
}
