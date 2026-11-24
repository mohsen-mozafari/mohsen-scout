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
  thumbnail: string;
  publishedAt: string;
  fetchedAt: number;
  query: string;
  viewCount?: number | null;
  likeCount?: number | null;
};
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
export type IdeaEvidenceSource = {
  sourceType: 'publisher' | 'web' | 'encyclopedia';
  sourceName: string;
  title: string;
  summary?: string;
  sourceUrl: string;
  publishedAt?: string;
};
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
  engineScoreBasis?: 'publisher-web-only-v2';
  evidenceSources?: IdeaEvidenceSource[];
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
export type SecondOpinionProvider = 'gemini' | 'groq' | 'cloudflare' | 'openrouter';
export const DEFAULT_SECOND_OPINION_ORDER: SecondOpinionProvider[] = ['gemini', 'groq', 'cloudflare', 'openrouter'];
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
  /** Kept for backward compatibility; external review now requires an explicit manual action. */
  hybridIntelligence: boolean;
  webResearchEnabled: boolean;
  automaticExternalReview: boolean;
  secondOpinionProvider: SecondOpinionProvider;
  secondOpinionOrder: SecondOpinionProvider[];
  secondOpinionModels: { gemini: string; groq: string; cloudflare: string; openrouter: string };
  /** Local mirror of OpenRouter free-model daily quota for this key. */
  openRouterUsageDay?: string;
  openRouterRequestsToday?: number;
  openRouterDailyLimit?: number;
  openRouterDailyUsed?: number;
  openRouterDailyRemaining?: number;
  openRouterQuotaCheckedAt?: number;
  youtubeRefreshTimestamps?: number[];
  schedule: 'Manual' | 'Every 6 hours' | 'Every 12 hours' | 'Daily' | 'Weekly';
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
export type ResearchDossierEvidenceReview = {
  evidenceId: string;
  role: 'supports' | 'challenges' | 'context' | 'irrelevant';
  credibility: 'high' | 'medium' | 'low' | 'unknown';
  sourceType: 'primary' | 'secondary' | 'opinion' | 'unknown';
  freshness: 'recent' | 'old' | 'unknown';
  reason: string;
};
export type ResearchDossierQuote = {
  evidenceId: string;
  quote: string;
  sourceName: string;
  sourceUrl: string;
  publisherFamily: string;
  verification: 'verbatim-checked';
};
export type ResearchDossierHypothesis = {
  id: string;
  claim: string;
  rationale: string;
  /** Final status is assigned only after independent review and local quote checks. */
  status: 'supported' | 'contested' | 'insufficient-evidence';
  confidence: 'low' | 'moderate' | 'high';
  supportingEvidenceIds: string[];
  challengingEvidenceIds: string[];
  missingEvidence: string[];
  /** First model's suggestion is retained for audit, never treated as a final verdict. */
  modelProposedStatus?: 'supported' | 'contested' | 'insufficient-evidence';
  supportingQuotes?: ResearchDossierQuote[];
  challengingQuotes?: ResearchDossierQuote[];
};
export type ResearchDossierQuery = {
  query: string;
  purpose: 'independent-confirmation' | 'counterevidence' | 'mechanism' | 'alternate-explanation' | 'primary-source';
  hypothesisId: string;
  priority: number;
  reason: string;
  searchedAt?: number;
};
export type ResearchDossier = {
  version: 1;
  updatedAt: number;
  provider: SecondOpinionProvider;
  model: string;
  hypotheses: ResearchDossierHypothesis[];
  evidenceReviews: ResearchDossierEvidenceReview[];
  nextQueries: ResearchDossierQuery[];
  completedQueries: ResearchDossierQuery[];
  contradictions: { description: string; evidenceIds: string[] }[];
  gaps: string[];
  conclusion: string;
  confidence: 'low' | 'moderate' | 'high';
  stoppingReason: string;
  reviewStatus?: 'pending-independent-review' | 'independently-reviewed' | 'review-unavailable';
  reviewerProvider?: SecondOpinionProvider;
  reviewerModel?: string;
  fullTextEvidenceCount?: number;
  summaryOnlyEvidenceCount?: number;
  publisherFamilyCount?: number;
  syndicatedItemCount?: number;
  verifiedCitationCount?: number;
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
  /** Model-reviewed independent-source dossier; contains no raw YouTube API metadata. */
  researchDossier?: ResearchDossier;
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
export type ResearchActivityEngine =
  | 'YouTube Data API'
  | 'Firecrawl Search'
  | 'Publisher Feeds'
  | 'Wikimedia'
  | 'Internal Engine'
  | 'AI Provider Review';
export type ResearchActivityStatus = 'running' | 'success' | 'partial' | 'empty' | 'error' | 'skipped';
export type ResearchActivityFeedback = 'useful' | 'irrelevant' | 'duplicate' | 'weak-source';
export type ResearchActivityResult = {
  id: string;
  title: string;
  sourceName: string;
  url?: string;
  summary: string;
  publishedAt?: string;
  relevanceScore: number;
  relevanceBand: 'high' | 'medium' | 'low';
  sourceAssessment: 'configured-feed' | 'not-assessed';
  includedInAnalysis: boolean;
  decisionReason: string;
  feedback?: ResearchActivityFeedback;
};
export type ResearchActivityEvent = {
  id: string;
  engine: ResearchActivityEngine;
  query: string;
  topic: string;
  niche: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  status: ResearchActivityStatus;
  resultCount: number;
  analyzedCount: number;
  results: ResearchActivityResult[];
  warnings: string[];
  error?: string;
  reportId?: string;
};
export type LocalData = {
  feedRegistry: FeedRegistryRecord[];
  researchActivity: ResearchActivityEvent[];
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
    researchActivity: [],
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
      webResearchEnabled: true,
      automaticExternalReview: true,
      secondOpinionProvider: 'gemini',
      secondOpinionOrder: [...DEFAULT_SECOND_OPINION_ORDER],
      secondOpinionModels: { gemini: 'gemini-3.8-flash', groq: 'openai/gpt-oss-120b', cloudflare: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', openrouter: '' },
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

  // Keep automated activity links only while the referenced report has live
  // YouTube API metadata. The detailed raw sample remains in the 29-day domain.
  const liveYoutubeReportIds = new Set(reports
    .filter((report) => report.videos.some((video) =>
      video.fetchedAt > 0 && now >= video.fetchedAt && now - video.fetchedAt < RETENTION_MS,
    ))
    .map((report) => report.id));
  const hasOrphanedActivityReference = data.researchActivity.some((event) =>
    Boolean(event.reportId && !liveYoutubeReportIds.has(event.reportId)),
  );
  if (!hasExpiredVideo && !hasExpiredReport && !hasOrphanedIdeaReference && !hasOrphanedActivityReference) return data;

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
  const researchActivity = hasOrphanedActivityReference
    ? data.researchActivity.map((event) =>
      event.reportId && !liveYoutubeReportIds.has(event.reportId)
        ? { ...event, reportId: undefined }
        : event,
    )
    : data.researchActivity;
  return {
    ...data,
    videos,
    reports,
    ideas: ideasChanged ? ideas : data.ideas,
    researchActivity,
  };
}
