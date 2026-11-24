import { normalizeResearchText } from './intelligence';
import type { ResearchDossierQuery } from './types';
import type { WebResearchItem } from './web-research';

/**
 * A manual research run is deliberately bounded. These are safety and cost
 * ceilings, not a claim that every topic can be exhaustively researched.
 */
export const MAX_DEEP_RESEARCH_ROUNDS = 4;
export const MAX_DEEP_RESEARCH_QUERIES = 8;
export const MAX_DEEP_RESEARCH_QUERIES_PER_ROUND = 2;
export const MAX_DEEP_RESEARCH_EVIDENCE = 48;
export const MAX_DEEP_RESEARCH_RESULTS_PER_QUERY = 4;

export type ResearchRoundPlan = {
  queries: ResearchDossierQuery[];
  stopReason: string;
};

export type ResearchRoundInput = {
  round: number;
  queriesAttempted: number;
  evidenceCount: number;
  previousRoundNewEvidenceCount?: number;
  nextQueries: readonly ResearchDossierQuery[];
  alreadyAsked: readonly string[];
};

export type MergeResearchEvidenceResult = {
  items: WebResearchItem[];
  addedItems: WebResearchItem[];
  duplicateCount: number;
  rejectedCount: number;
};

function isBlockedVideoHost(host: string): boolean {
  return host === 'youtube.com' || host.endsWith('.youtube.com') ||
    host === 'youtu.be' || host.endsWith('.youtu.be') ||
    host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com') ||
    host === 'googlevideo.com' || host.endsWith('.googlevideo.com');
}

/** Stable URL identity for independent web evidence; tracking parameters are not identity. */
export function canonicalizeIndependentResearchUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return undefined;
    if (isBlockedVideoHost(url.hostname.toLowerCase())) return undefined;
    url.hash = '';
    const trackingKeys: string[] = [];
    url.searchParams.forEach((_value, key) => {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) trackingKeys.push(key);
    });
    for (const key of trackingKeys) url.searchParams.delete(key);
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return undefined;
  }
}

function hostOf(url: string): string | undefined {
  try {
    const canonical = canonicalizeIndependentResearchUrl(url);
    return canonical ? new URL(canonical).hostname.toLowerCase().replace(/^www\./, '') : undefined;
  } catch {
    return undefined;
  }
}

export function mergeIndependentResearchEvidence(
  existing: readonly WebResearchItem[],
  incoming: readonly WebResearchItem[],
  maximum = MAX_DEEP_RESEARCH_EVIDENCE,
): MergeResearchEvidenceResult {
  const items: WebResearchItem[] = [];
  const addedItems: WebResearchItem[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  let rejectedCount = 0;
  const add = (item: WebResearchItem, isNew: boolean) => {
    const canonical = canonicalizeIndependentResearchUrl(item.url);
    if (!canonical || !item.title.trim() || !item.sourceName.trim()) {
      rejectedCount += 1;
      return;
    }
    if (seen.has(canonical)) {
      duplicateCount += 1;
      return;
    }
    if (items.length >= Math.max(0, maximum)) return;
    seen.add(canonical);
    const normalized = { ...item, url: canonical };
    items.push(normalized);
    if (isNew) addedItems.push(normalized);
  };
  for (const item of existing) add(item, false);
  for (const item of incoming) add(item, true);
  return { items, addedItems, duplicateCount, rejectedCount };
}

export function assessResearchEvidenceCoverage(
  evidence: readonly WebResearchItem[],
  now = Date.now(),
): { uniqueUrlCount: number; uniqueHostCount: number; datedCount: number; undatedCount: number; olderThanOneYearCount: number } {
  const urls = new Set<string>();
  const hosts = new Set<string>();
  let datedCount = 0;
  let undatedCount = 0;
  let olderThanOneYearCount = 0;
  for (const item of evidence) {
    const canonical = canonicalizeIndependentResearchUrl(item.url);
    if (!canonical) continue;
    urls.add(canonical);
    const host = hostOf(canonical);
    if (host) hosts.add(host);
    const published = item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN;
    if (Number.isFinite(published)) {
      datedCount += 1;
      if (now - published > 365 * 24 * 60 * 60 * 1000) olderThanOneYearCount += 1;
    } else {
      undatedCount += 1;
    }
  }
  return { uniqueUrlCount: urls.size, uniqueHostCount: hosts.size, datedCount, undatedCount, olderThanOneYearCount };
}

/** Selects a diverse, non-repeating next batch and explains every stopping condition. */
export function planResearchRound(input: ResearchRoundInput): ResearchRoundPlan {
  if (input.round > MAX_DEEP_RESEARCH_ROUNDS) {
    return { queries: [], stopReason: 'The maximum adaptive research round limit was reached.' };
  }
  if (input.queriesAttempted >= MAX_DEEP_RESEARCH_QUERIES) {
    return { queries: [], stopReason: 'The focused-search budget was exhausted; unresolved questions remain recorded.' };
  }
  if (input.evidenceCount >= MAX_DEEP_RESEARCH_EVIDENCE) {
    return { queries: [], stopReason: 'The independent evidence ceiling was reached to keep the research run bounded.' };
  }
  if (input.round > 1 && input.previousRoundNewEvidenceCount === 0) {
    return { queries: [], stopReason: 'Research stopped because the previous round produced no new independent evidence.' };
  }

  const asked = new Set(input.alreadyAsked.map(normalizeResearchText));
  const candidates = input.nextQueries
    .filter((item) => item.query.trim() && !asked.has(normalizeResearchText(item.query)))
    .sort((a, b) => b.priority - a.priority);
  if (!candidates.length) {
    return { queries: [], stopReason: 'The research reviewer found no new targeted question that justified another search.' };
  }

  const selected: ResearchDossierQuery[] = [];
  const usedPurposes = new Set<string>();
  for (const candidate of candidates) {
    const purposeKey = candidate.purpose;
    if (selected.length >= MAX_DEEP_RESEARCH_QUERIES_PER_ROUND) break;
    if (usedPurposes.has(purposeKey) && candidates.some((item) => !usedPurposes.has(item.purpose))) continue;
    selected.push(candidate);
    usedPurposes.add(purposeKey);
  }
  const remaining = MAX_DEEP_RESEARCH_QUERIES - input.queriesAttempted;
  return {
    queries: selected.slice(0, Math.min(MAX_DEEP_RESEARCH_QUERIES_PER_ROUND, remaining)),
    stopReason: '',
  };
}
