import type { ResearchDossier, ResearchMemoryEntry, ResearchMemorySnapshot } from './types';
import { canonicalizeResearchUrl, normalizeResearchText } from './intelligence';

const MAX_RESEARCH_MEMORY_SOURCES = 120;
const MAX_RESEARCH_MEMORY_HISTORY = 36;

export type PublisherMemorySource = {
  sourceId?: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt: string | null;
};
export type PublisherMemoryAnalysis = {
  evidence: readonly { id: string; detail: string }[];
  verificationQuestions: readonly string[];
  intelligence: {
    gaps: readonly string[];
    potentialContradictions: readonly string[];
    confidence: { level: 'low' | 'moderate' | 'high' };
  };
};

function unique(values: readonly string[], limit: number, maxLength: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = value.trim().slice(0, maxLength);
    const key = normalizeResearchText(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createResearchMemoryEntry(input: {
  topic: string;
  news: readonly PublisherMemorySource[];
  analysis: PublisherMemoryAnalysis;
  previous?: ResearchMemoryEntry;
  now?: number;
  language?: 'fa' | 'en';
  researchDossier?: ResearchDossier;
}): ResearchMemoryEntry | undefined {
  const topic = input.topic.trim().replace(/\s+/g, ' ').slice(0, 180);
  if (!topic) return undefined;
  const now = input.now ?? Date.now();
  const fa = input.language === 'fa';
  const byUrl = new Map<string, PublisherMemorySource>();
  // Preserve previously collected source records and append newly observed URLs.
  for (const old of input.previous?.sources ?? []) {
    const canonical = canonicalizeResearchUrl(old.sourceUrl);
    if (canonical.startsWith('https://')) {
      byUrl.set(canonical, {
        sourceId: old.sourceId,
        sourceName: old.sourceName,
        title: old.title,
        url: canonical,
        publishedAt: old.publishedAt,
      });
    }
  }
  const sorted = [...input.news].sort((a, b) => {
    const date = (value: string | null) => value ? Date.parse(value) || 0 : 0;
    return date(b.publishedAt) - date(a.publishedAt);
  });
  for (const item of sorted) {
    const canonical = canonicalizeResearchUrl(item.url);
    if (!canonical.startsWith('https://') || !item.title.trim() || !item.sourceName.trim()) continue;
    if (!byUrl.has(canonical)) byUrl.set(canonical, item);
  }
  const sources = [...byUrl.entries()]
    .map(([canonical, item]) => ({
      sourceId: item.sourceId?.slice(0, 80),
      sourceName: item.sourceName.trim().slice(0, 160),
      title: item.title.trim().slice(0, 500),
      sourceUrl: canonical,
      publishedAt: item.publishedAt,
    }))
    .sort((a, b) =>
      (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0),
    )
    .slice(0, MAX_RESEARCH_MEMORY_SOURCES);
  if (!sources.length && !input.researchDossier) return undefined;

  const keyFindings = unique([
    ...input.analysis.evidence.filter((item) => item.id === 'publisher-news').map((item) => item.detail),
    ...(input.researchDossier?.conclusion ? [input.researchDossier.conclusion] : []),
    ...(input.researchDossier?.hypotheses ?? []).filter((item) => item.status === 'supported').map((item) => item.claim),
  ], 8, 2000);
  const unresolvedQuestions = unique([
    ...input.analysis.intelligence.gaps,
    ...input.analysis.verificationQuestions,
    ...(input.researchDossier?.gaps ?? []),
    ...(input.researchDossier?.nextQueries ?? []).map((item) => item.query),
  ], 12, 500);
  const contradictions = unique([
    ...input.analysis.intelligence.potentialContradictions,
    ...(input.researchDossier?.contradictions ?? []).map((item) => item.description),
  ], 8, 500);
  const confidenceRank = { low: 0, moderate: 1, high: 2 } as const;
  const localConfidence = input.analysis.intelligence.confidence.level;
  const confidence = input.researchDossier && confidenceRank[input.researchDossier.confidence] < confidenceRank[localConfidence]
    ? input.researchDossier.confidence
    : localConfidence;
  const previousByUrl = new Map((input.previous?.sources ?? []).map((item) => [
    canonicalizeResearchUrl(item.sourceUrl),
    normalizeResearchText(item.title) + '|' + (item.publishedAt ?? ''),
  ]));
  let newSourceCount = 0;
  let updatedSourceCount = 0;
  for (const source of sources) {
    const prior = previousByUrl.get(source.sourceUrl);
    if (prior === undefined) newSourceCount++;
    else if (prior !== normalizeResearchText(source.title) + '|' + (source.publishedAt ?? '')) updatedSourceCount++;
  }
  const state = [
    ...sources.map((item) => item.sourceUrl + '|' + normalizeResearchText(item.title) + '|' + (item.publishedAt ?? '')).sort(),
    ...keyFindings.map(normalizeResearchText).sort(),
    ...unresolvedQuestions.map(normalizeResearchText).sort(),
    ...contradictions.map(normalizeResearchText).sort(),
    confidence,
  ].join('\u001f');
  const sourceFingerprint = fingerprint(state);
  const changes: string[] = [];
  if (!input.previous) {
    changes.push(fa ? 'اولین تصویر از شواهد ناشران رسمی ذخیره شد.' : 'Initial snapshot of official publisher evidence.');
  } else {
    if (newSourceCount) changes.push(fa ? newSourceCount + ' منبع خبری تازه نسبت به بررسی قبلی اضافه شد.' : newSourceCount + ' new publisher item(s) appeared since the previous review.');
    if (updatedSourceCount) changes.push(fa ? updatedSourceCount + ' منبع موجود به‌روزرسانی شده است.' : updatedSourceCount + ' existing publisher item(s) changed.');
    if (normalizeResearchText(keyFindings.join(' ')) !== normalizeResearchText(input.previous.keyFindings.join(' '))) {
      changes.push(fa ? 'یافته‌های اصلی تحلیل تغییر کرده‌اند.' : 'The main findings changed.');
    }
    if (normalizeResearchText(unresolvedQuestions.join(' ')) !== normalizeResearchText(input.previous.unresolvedQuestions.join(' '))) {
      changes.push(fa ? 'پرسش‌ها و خلأهای تحقیق تغییر کرده‌اند.' : 'Research questions and evidence gaps changed.');
    }
    if (confidence !== input.previous.confidence) changes.push(fa ? 'سطح اطمینان تحلیل تغییر کرده است.' : 'The evidence-based confidence level changed.');
    if (normalizeResearchText(contradictions.join(' ')) !== normalizeResearchText(input.previous.contradictions.join(' '))) {
      changes.push(fa ? 'یادداشت‌های مربوط به تناقض منابع تغییر کرده‌اند.' : 'Source discrepancy notes changed.');
    }
    if (!changes.length) changes.push(fa ? 'تغییر معناداری در شواهد رسمی در دسترس دیده نشد.' : 'No material change was found in the available official-source evidence.');
  }
  const snapshot: ResearchMemorySnapshot = {
    capturedAt: now,
    sourceFingerprint,
    sourceCount: sources.length,
    newSourceCount,
    updatedSourceCount,
    keyFindings,
    unresolvedQuestions,
    contradictions,
    confidence,
    changes: changes.slice(0, 4),
  };
  const oldHistory = input.previous?.history ?? [];
  const history = (oldHistory[0]?.sourceFingerprint === sourceFingerprint
    ? oldHistory
    : [snapshot, ...oldHistory]
  ).slice(0, MAX_RESEARCH_MEMORY_HISTORY);
  return {
    topic, updatedAt: now, sources, keyFindings, unresolvedQuestions, contradictions, confidence, history,
    ...(input.researchDossier ?? input.previous?.researchDossier
      ? { researchDossier: input.researchDossier ?? input.previous?.researchDossier }
      : {}),
  };
}
