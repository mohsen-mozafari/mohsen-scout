import type { EngineV2Opportunity } from './engine/types';

export const regions = ['United States', 'Worldwide', 'Iran', 'United Kingdom', 'Germany'] as const;
export type Region = (typeof regions)[number];
export const languages: Record<string, string> = {
  en: 'English',
  fa: 'Persian',
  es: 'Spanish',
  pt: 'Portuguese',
  de: 'German',
  fr: 'French',
  ar: 'Arabic',
  ja: 'Japanese',
  ko: 'Korean',
  hi: 'Hindi',
  it: 'Italian',
  tr: 'Turkish',
  ru: 'Russian',
  id: 'Indonesian',
  zh: 'Chinese',
  ur: 'Urdu',
  bn: 'Bengali',
  vi: 'Vietnamese',
  th: 'Thai',
  nl: 'Dutch',
  pl: 'Polish',
  uk: 'Ukrainian',
};
export type ResearchInput = {
  topic: string;
  region: Region;
  languages: string[];
  days: number;
  duration: 'any' | 'short' | 'medium' | 'long';
  category: string;
  maxResults: number;
};
export type Video = {
  id: string;
  title: string;
  description: string;
  channel: string;
  channelId?: string;
  thumbnail: string;
  publishedAt: string;
  fetchedAt: number;
  query: string;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
};
export type VideoCoverageData = {
  videosFromReports: number;
  videosFromStored: number;
  uniqueVideos: number;
  droppedMissingFields: number;
  droppedAsExpired: number;
  coverageLimit: number;
};
export type VideoCoverage = VideoCoverageData & {
  /** Filled by the engine: how many retained videos entered the analysis. */
  reachingEngine: number;
  /** Filled by the engine: how many retained videos matched the topic (score > 0). */
  retainedVideos: number;
};
export type NewsCoverage = {
  total: number;
  bySource: Record<string, number>;
  reachingEngine: number;
};
export type EngineCoverage = { news: NewsCoverage; videos: VideoCoverageData };
export type Assessment =
  | 'Strong Opportunity'
  | 'Promising'
  | 'Worth Exploring'
  | 'Uncertain'
  | 'Highly Competitive';
export type IdeaStatus =
  | 'New Discoveries'
  | 'Promising Topics'
  | 'Strong Opportunities'
  | 'Saved Opportunities'
  | 'Rejected Ideas'
  | 'Completed Research';
export const statuses: IdeaStatus[] = [
  'New Discoveries',
  'Promising Topics',
  'Strong Opportunities',
  'Saved Opportunities',
  'Rejected Ideas',
  'Completed Research',
];
export type Idea = {
  id: string;
  topic: string;
  concept: string;
  note: string;
  status: IdeaStatus;
  decision: string;
  videoIds: string[];
  createdAt: number;
  archived: boolean;
  assessment: Assessment;
  region: Region;
  languages: string[];
  reportId?: string;
  imageUrl?: string;
  sourceUrl?: string;
  sourceName?: string;
  engineGenerated?: boolean;
  ideaCategory?: string;
  generationKey?: string;
  /** Explainable local editorial-priority score (not a view or revenue forecast). */
  engineScore?: number;
  engineScoreReason?: string;
  /** Engine v2 structured idea details (score, evidence refs, estimated income). */
  engineV2?: EngineV2Opportunity;
};
export type Report = {
  id: string;
  input: ResearchInput;
  videos: Video[];
  queries: string[];
  warnings: string[];
  createdAt: number;
  analyzed: boolean;
};
export type SavedLink = {
  id: string;
  url: string;
  manualTitle: string;
  topic: string;
  note: string;
  folder: string;
  tags: string[];
  savedAt: number;
};
export type NoteBlock = {
  id: string;
  type: 'heading' | 'paragraph' | 'bullet' | 'checklist' | 'link' | 'video' | 'opportunity';
  text: string;
  checked?: boolean;
};
export type Note = {
  id: string;
  title: string;
  folder: string;
  tags: string[];
  blocks: NoteBlock[];
  updatedAt: number;
  /** Optional relationship to a personal research idea. */
  ideaId?: string;
};
export type Opinion = {
  id: string;
  ideaId: string;
  text: string;
  model: string;
  createdAt: number;
};
export const DEFAULT_SPACE_NEWS_SOURCE_IDS: SpaceNewsSourceId[] = ['nasa', 'jpl', 'cneos', 'esa-space', 'esa-science', 'space-com', 'phys-space', 'universe-today', 'sky-telescope'];
export type SpaceNewsSourceId = 'nasa' | 'jpl' | 'cneos' | 'esa-space' | 'esa-science' | 'space-com' | 'phys-space' | 'universe-today' | 'sky-telescope';
export type WikiLanguage = 'en' | 'fa' | 'de' | 'fr' | 'es' | 'ja';
export type UiLanguage = 'fa' | 'en';
export type Preferences = {
  uiLanguage: UiLanguage;
  name: string;
  email: string;
  region: Region;
  languages: string[];
  defaultResearchDays: 0 | 7 | 30 | 90;
  budget: number;
  model: string;
  /** Automatic privacy-bounded external review after local research completes. */
  hybridIntelligence: boolean;
  /** Local mirror of OpenRouter free-model daily quota for this key. */
  openRouterUsageDay?: string;
  openRouterRequestsToday?: number;
  openRouterDailyLimit?: number;
  openRouterDailyUsed?: number;
  openRouterDailyRemaining?: number;
  openRouterQuotaCheckedAt?: number;
  youtubeRefreshTimestamps?: number[];
  schedule: 'Manual' | 'Every 12 hours' | 'Daily' | 'Weekly';
  paused: boolean;
  lastInput?: ResearchInput;
  spaceNewsSources: SpaceNewsSourceId[];
  spaceNewsSourcesVersion?: 2;
  spaceInterestLanguage: WikiLanguage;
  selectedSpaceNiche: string;
  customSpaceNiche: string;
};
export type Budget = {
  date: string; units: number; requests: number; exhausted: boolean;
  searchExhausted?: boolean; otherExhausted?: boolean;
  searchManualRequests?: number; searchAutomaticRequests?: number; searchReserveRequests?: number;
  otherManualUnits?: number; otherAutomaticUnits?: number; otherReserveUnits?: number;
};
export type ResearchMemorySnapshot = {
  capturedAt: number;
  sourceFingerprint: string;
  sourceCount: number;
  newSourceCount: number;
  updatedSourceCount: number;
  keyFindings: string[];
  unresolvedQuestions: string[];
  contradictions: string[];
  confidence: 'low' | 'moderate' | 'high';
  changes: string[];
};
export type ResearchMemoryEntry = {
  topic: string;
  updatedAt: number;
  sources: { sourceId?: string; sourceName: string; title: string; sourceUrl: string; publishedAt: string | null }[];
  keyFindings: string[];
  unresolvedQuestions: string[];
  contradictions: string[];
  confidence: 'low' | 'moderate' | 'high';
  /** Bounded, versioned snapshots. Legacy entries without history remain valid. */
  history?: ResearchMemorySnapshot[];
};
export type FeedRegistryRecord = {
  sourceId: SpaceNewsSourceId;
  configuredUrl: string;
  endpoint: string;
  format: 'rss' | 'atom' | 'json' | 'unknown';
  status: 'healthy' | 'stale' | 'unavailable' | 'unknown';
  lastCheckedAt: number;
  lastSuccessAt: number;
  failureCount: number;
  retryAt: number;
  lastError: string;
  etag?: string;
  lastModified?: string;
  cachedItems: {
    id: string;
    sourceId: SpaceNewsSourceId;
    sourceName: string;
    title: string;
    summary: string;
    url: string;
    publishedAt: string | null;
    imageUrl?: string;
  }[];
};
export type LocalData = {
  feedRegistry: FeedRegistryRecord[];
  researchMemory: ResearchMemoryEntry[];
  preferences: Preferences;
  ideas: Idea[];
  links: SavedLink[];
  notes: Note[];
  opinions: Opinion[];
  reports: Report[];
  videos: Video[];
  budget: Budget;
};
export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const RETENTION_MS = 29 * 24 * 60 * 60 * 1000;
export function defaults(): LocalData {
  return {
    feedRegistry: [],
    researchMemory: [],
    preferences: {
      uiLanguage: 'fa',
      name: 'Mohsen',
      email: '',
      region: 'United States',
      languages: ['en'],
      defaultResearchDays: 30,
      budget: 10000,
      model: '',
      hybridIntelligence: false,
      schedule: 'Daily',
      paused: false,
      spaceNewsSources: [...DEFAULT_SPACE_NEWS_SOURCE_IDS],
      spaceNewsSourcesVersion: 2,
      spaceInterestLanguage: 'en',
      selectedSpaceNiche: 'all',
      customSpaceNiche: '',
    },
    ideas: [],
    links: [],
    notes: [],
    opinions: [],
    reports: [],
    videos: [],
    budget: { date: '', units: 0, requests: 0, exhausted: false, searchExhausted: false, otherExhausted: false, searchManualRequests: 0, searchAutomaticRequests: 0, searchReserveRequests: 0, otherManualUnits: 0, otherAutomaticUnits: 0, otherReserveUnits: 0 },
  };
}
export function purgeExpired(data: LocalData, now = Date.now()): LocalData {
  const hasExpiredVideo = data.videos.some((video) => now - video.fetchedAt >= RETENTION_MS);
  const hasExpiredReport = data.reports.some((report) =>
    now - report.createdAt >= RETENTION_MS ||
    report.videos.some((video) => now - video.fetchedAt >= RETENTION_MS),
  );

  const originalReportIds = new Set(data.reports.map((report) => report.id));
  const originalVideoIds = new Set([...data.videos.map((video) => video.id), ...data.links.map((link) => link.id)]);
  const hasOrphanedIdeaReference = data.ideas.some((idea) =>
    Boolean(idea.reportId && !originalReportIds.has(idea.reportId)) ||
    idea.videoIds.some((id) => !originalVideoIds.has(id)),
  );
  if (!hasExpiredVideo && !hasExpiredReport && !hasOrphanedIdeaReference) return data;

  const videos = hasExpiredVideo
    ? data.videos.filter((video) => now - video.fetchedAt < RETENTION_MS)
    : data.videos;
  const reports = hasExpiredReport
    ? data.reports
      .filter((report) => now - report.createdAt < RETENTION_MS)
      .map((report) => {
        const keptVideos = report.videos.filter((video) => now - video.fetchedAt < RETENTION_MS);
        return keptVideos.length === report.videos.length ? report : { ...report, videos: keptVideos };
      })
    : data.reports;
  const reportIds = new Set(reports.map((report) => report.id));
  const retainedIds = new Set([...videos.map((video) => video.id), ...data.links.map((link) => link.id)]);
  let ideasChanged = false;
  const ideas = data.ideas.map((idea) => {
    const videoIds = idea.videoIds.filter((id) => retainedIds.has(id));
    const reportId = idea.reportId && reportIds.has(idea.reportId) ? idea.reportId : undefined;
    if (videoIds.length === idea.videoIds.length && reportId === idea.reportId) return idea;
    ideasChanged = true;
    return { ...idea, videoIds, reportId };
  });
  return { ...data, videos, reports, ideas: ideasChanged ? ideas : data.ideas };
}
