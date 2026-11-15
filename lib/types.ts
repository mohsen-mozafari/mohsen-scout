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
};
export type Opinion = {
  id: string;
  ideaId: string;
  text: string;
  model: string;
  createdAt: number;
};
export type SpaceNewsSourceId = 'nasa' | 'jpl' | 'esa-space' | 'esa-science';
export type WikiLanguage = 'en' | 'fa' | 'de' | 'fr' | 'es' | 'ja';
export type Preferences = {
  name: string;
  email: string;
  region: Region;
  languages: string[];
  defaultResearchDays: number;
  budget: number;
  model: string;
  schedule: 'Manual' | 'Every 12 hours' | 'Daily' | 'Weekly';
  paused: boolean;
  lastInput?: ResearchInput;
  spaceNewsSources: SpaceNewsSourceId[];
  spaceInterestLanguage: WikiLanguage;
  selectedSpaceNiche: string;
};
export type Budget = { date: string; units: number; requests: number; exhausted: boolean };
export type LocalData = {
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
    preferences: {
      name: 'Mohsen',
      email: '',
      region: 'United States',
      languages: ['en'],
      defaultResearchDays: 30,
      budget: 1500,
      model: '',
      schedule: 'Manual',
      paused: false,
      spaceNewsSources: ['nasa', 'jpl', 'esa-space', 'esa-science'],
      spaceInterestLanguage: 'en',
      selectedSpaceNiche: 'exoplanets',
    },
    ideas: [],
    links: [],
    notes: [],
    opinions: [],
    reports: [],
    videos: [],
    budget: { date: '', units: 0, requests: 0, exhausted: false },
  };
}
export function purgeExpired(data: LocalData, now = Date.now()): LocalData {
  const videos = data.videos.filter((v) => now - v.fetchedAt < RETENTION_MS);
  const reports = data.reports
    .filter((r) => now - r.createdAt < RETENTION_MS)
    .map((report) => ({
      ...report,
      videos: report.videos.filter((v) => now - v.fetchedAt < RETENTION_MS),
    }));
  const reportIds = new Set(reports.map((r) => r.id));
  const retainedIds = new Set([...videos.map((v) => v.id), ...data.links.map((l) => l.id)]);
  return {
    ...data,
    videos,
    reports,
    ideas: data.ideas.map((idea) => {
      const videoIds = idea.videoIds.filter((id) => retainedIds.has(id));
      const reportId = idea.reportId && reportIds.has(idea.reportId) ? idea.reportId : undefined;
      return videoIds.length === idea.videoIds.length && reportId === idea.reportId
        ? idea
        : { ...idea, videoIds, reportId };
    }),
  };
}
