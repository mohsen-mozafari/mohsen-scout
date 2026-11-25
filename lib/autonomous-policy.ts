import type { Preferences, ResearchInput, Video } from './types';
import { SPACE_NICHES } from './space';

export const AUTONOMOUS_DISCOVERY_WINDOW_DAYS = 7;
export const AUTONOMOUS_YOUTUBE_DISCOVERY_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Resolve a useful autonomous topic even before the user has run a manual search. */
export function selectedAutonomousNicheTopic(
  preferences: Pick<Preferences, 'selectedSpaceNiche' | 'customSpaceNiche' | 'lastInput'>,
): string {
  if (preferences.selectedSpaceNiche === 'custom') {
    return preferences.customSpaceNiche.trim() || preferences.lastInput?.topic.trim() || 'space science and exploration';
  }
  const niche = SPACE_NICHES.find((item) => item.id === preferences.selectedSpaceNiche);
  return niche?.topic ?? preferences.lastInput?.topic.trim() ?? 'space science and exploration';
}

/** Builds a valid research request from current preferences without requiring lastInput. */
export function buildAutonomousResearchInput(preferences: Preferences): ResearchInput {
  const topic = selectedAutonomousNicheTopic(preferences).slice(0, 180);
  return {
    ...(preferences.lastInput ?? {
      topic,
      region: preferences.region,
      languages: [...preferences.languages],
      days: AUTONOMOUS_DISCOVERY_WINDOW_DAYS,
      duration: 'any' as const,
      category: '',
      maxResults: 25,
    }),
    topic,
    region: preferences.region,
    languages: preferences.languages.length ? [...preferences.languages] : ['en'],
    days: AUTONOMOUS_DISCOVERY_WINDOW_DAYS,
    maxResults: 25,
  };
}

export function isAutonomousYouTubeDiscoveryDue(
  lastAttemptAt: number,
  now = Date.now(),
  intervalMs = AUTONOMOUS_YOUTUBE_DISCOVERY_INTERVAL_MS,
): boolean {
  if (!Number.isFinite(lastAttemptAt) || lastAttemptAt <= 0) return true;
  if (!Number.isFinite(now) || !Number.isFinite(intervalMs) || intervalMs <= 0) return false;
  return lastAttemptAt <= now && now - lastAttemptAt >= intervalMs;
}

/** YouTube is the primary discovery lane; measured momentum raises priority without inventing growth. */
export function autonomousYouTubePriority(video: Pick<Video, 'growth'>): number {
  const rate = video.growth?.status === 'measured' ? video.growth.viewsPerHour : null;
  const outlier = video.growth?.status === 'measured' ? video.growth.channelOutlierRatio : null;
  const velocityBoost = rate !== null && rate !== undefined && Number.isFinite(rate) && rate > 0
    ? Math.min(24, Math.log10(1 + rate) * 8) : 0;
  const outlierBoost = outlier !== null && outlier !== undefined && Number.isFinite(outlier) && outlier > 0
    ? Math.min(12, Math.log10(1 + outlier) * 8) : 0;
  return Math.round(120 + velocityBoost + outlierBoost);
}

/** Publisher discoveries remain a fallback lane below YouTube-first candidates. */
export function autonomousPublisherPriority(
  publishedAt: string | null | undefined,
  sourceCount: number,
  now = Date.now(),
): number {
  const published = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  const ageHours = Number.isFinite(published) ? Math.max(0, (now - published) / 3600000) : 72;
  return Math.round(Math.max(35, 95 - Math.min(60, ageHours)) + (sourceCount > 1 ? 3 : 0));
}
