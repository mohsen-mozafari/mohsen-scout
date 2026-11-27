import { canonicalizeResearchUrl, normalizeResearchText, scoreResearchText } from './intelligence';
import type {
  ResearchActivityEvent,
  ResearchActivityFeedback,
  ResearchActivityResult,
} from './types';

export const MAX_RESEARCH_ACTIVITY = 400;
export const MAX_RESEARCH_ACTIVITY_RESULTS = 8;

export type ResearchActivityCandidate = {
  id?: string;
  title: string;
  summary?: string;
  sourceName?: string;
  url?: string;
  publishedAt?: string | null;
  includedInAnalysis: boolean;
  decisionReason: string;
  sourceAssessment?: 'configured-feed' | 'not-assessed';
};

function cleanText(value: string | undefined, limit: number): string {
  const safe = Array.from(value ?? '').filter((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('');
  return safe.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function safeSourceUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const canonical = canonicalizeResearchUrl(value);
  if (!canonical) return undefined;
  try {
    const url = new URL(canonical);
    const host = url.hostname.toLowerCase();
    const youtubeHosts = ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'googlevideo.com'];
    if (url.protocol !== 'https:' || youtubeHosts.some((domain) => host === domain || host.endsWith('.' + domain))) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function publishedDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

/** Build a bounded, source-traceable list. YouTube-originated URLs are intentionally excluded. */
export function buildResearchActivityResults(
  topic: string,
  candidates: readonly ResearchActivityCandidate[],
  limit = MAX_RESEARCH_ACTIVITY_RESULTS,
): ResearchActivityResult[] {
  const unique = new Map<string, ResearchActivityResult>();
  const topicWords = normalizeResearchText(topic).split(/\s+/).filter(Boolean).length;
  const denominator = Math.max(3, topicWords * 3 + 9);
  for (const candidate of candidates) {
    const title = cleanText(candidate.title, 500);
    if (!title) continue;
    const url = safeSourceUrl(candidate.url);
    if (candidate.url && !url) continue;
    const summary = cleanText(candidate.summary, 1200);
    const score = scoreResearchText(topic, title, summary);
    const relevanceScore = Math.max(0, Math.min(100, Math.round((score / denominator) * 100)));
    const relevanceBand = relevanceScore >= 65 ? 'high' : relevanceScore >= 30 ? 'medium' : 'low';
    const key = url ?? normalizeResearchText(title);
    if (!key) continue;
    const normalizedDate = publishedDate(candidate.publishedAt);
    const result: ResearchActivityResult = {
      id: url ? 'source:' + url : 'item:' + (candidate.id ?? key).slice(0, 900),
      title,
      sourceName: cleanText(candidate.sourceName, 160) || 'Unknown source',
      ...(url ? { url } : {}),
      summary,
      ...(normalizedDate ? { publishedAt: normalizedDate } : {}),
      relevanceScore,
      relevanceBand,
      sourceAssessment: candidate.sourceAssessment ?? 'not-assessed',
      includedInAnalysis: candidate.includedInAnalysis,
      decisionReason: cleanText(candidate.decisionReason, 700),
    };
    const previous = unique.get(key);
    if (!previous || result.relevanceScore > previous.relevanceScore) unique.set(key, result);
  }
  return [...unique.values()]
    .sort((a, b) => b.relevanceScore - a.relevanceScore || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, Math.max(1, Math.min(MAX_RESEARCH_ACTIVITY_RESULTS, Math.floor(limit) || 1)));
}

/** Newest first; one persisted event per real source operation. */
export function appendResearchActivity(
  events: readonly ResearchActivityEvent[],
  event: ResearchActivityEvent,
): ResearchActivityEvent[] {
  return [event, ...events.filter((item) => item.id !== event.id)]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, MAX_RESEARCH_ACTIVITY);
}

export function updateResearchActivityEvent(
  events: readonly ResearchActivityEvent[],
  eventId: string,
  patch: Partial<ResearchActivityEvent>,
): ResearchActivityEvent[] {
  const index = events.findIndex((event) => event.id === eventId);
  if (index < 0) return events as ResearchActivityEvent[];
  return events.map((event) => event.id === eventId ? { ...event, ...patch, id: event.id } : event);
}

export function updateResearchActivityFeedback(
  events: readonly ResearchActivityEvent[],
  eventId: string,
  resultId: string,
  feedback: ResearchActivityFeedback,
): ResearchActivityEvent[] {
  const event = events.find((item) => item.id === eventId);
  if (!event || !event.results.some((item) => item.id === resultId)) return events as ResearchActivityEvent[];
  return updateResearchActivityEvent(events, eventId, {
    results: event.results.map((item) => item.id === resultId ? { ...item, feedback } : item),
  });
}

import type { ResearchFeedbackProfile } from './intelligence';

export type ResearchActivitySourceExclusions = {
  weakSourceHosts: string[];
  duplicateSourceUrls: string[];
};

/** Convert explicit user feedback into a bounded topic-preference profile. */
export function buildResearchActivityFeedbackProfile(
  events: readonly ResearchActivityEvent[],
): ResearchFeedbackProfile {
  const latest = new Map<string, { title: string; feedback: ResearchActivityFeedback }>();
  for (const event of [...events].sort((a, b) => b.startedAt - a.startedAt)) {
    for (const result of event.results) {
      if (!result.feedback) continue;
      const key = normalizeResearchText(result.title);
      if (key && !latest.has(key)) latest.set(key, { title: result.title, feedback: result.feedback });
    }
  }
  const entries = [...latest.values()];
  return {
    positiveTopics: entries.filter((item) => item.feedback === 'useful').slice(0, 40).map((item) => item.title),
    negativeTopics: entries.filter((item) => item.feedback === 'irrelevant').slice(0, 20).map((item) => item.title),
  };
}

/** Build a recent, bounded exclusion profile from explicit source feedback. */
export function buildResearchActivitySourceExclusions(
  events: readonly ResearchActivityEvent[],
): ResearchActivitySourceExclusions {
  const latestHosts = new Map<string, ResearchActivityFeedback>();
  const latestUrls = new Map<string, ResearchActivityFeedback>();
  for (const event of [...events].sort((a, b) => b.startedAt - a.startedAt)) {
    for (const result of event.results) {
      if (!result.feedback || !result.url) continue;
      const canonical = canonicalizeResearchUrl(result.url);
      if (!canonical) continue;
      try {
        const host = new URL(canonical).hostname.toLowerCase();
        if (!latestHosts.has(host)) latestHosts.set(host, result.feedback);
        if (!latestUrls.has(canonical)) latestUrls.set(canonical, result.feedback);
      } catch {
        // Invalid URLs are already excluded from activity records.
      }
    }
  }
  return {
    weakSourceHosts: [...latestHosts].filter(([, feedback]) => feedback === 'weak-source').map(([host]) => host).slice(0, 50),
    duplicateSourceUrls: [...latestUrls].filter(([, feedback]) => feedback === 'duplicate').map(([url]) => url).slice(0, 50),
  };
}

/** Return a transparent reason when saved feedback excludes a result from a later run. */
export function explainResearchActivitySourceExclusion(
  value: string | undefined,
  exclusions: ResearchActivitySourceExclusions,
): string | undefined {
  if (!value) return undefined;
  const canonical = canonicalizeResearchUrl(value);
  if (!canonical) return undefined;
  try {
    const host = new URL(canonical).hostname.toLowerCase();
    if (exclusions.weakSourceHosts.some((blocked) => host === blocked || host.endsWith('.' + blocked))) {
      return 'Excluded from this run because the source domain was previously marked as a weak source.';
    }
    if (exclusions.duplicateSourceUrls.includes(canonical)) {
      return 'Excluded from this run because this canonical source URL was previously marked as a duplicate.';
    }
  } catch {
    return undefined;
  }
  return undefined;
}
