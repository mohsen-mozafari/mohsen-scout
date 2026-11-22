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
