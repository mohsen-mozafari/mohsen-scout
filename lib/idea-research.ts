import { type Idea, type LocalData, type Region, uid } from './types';

export type SourceIdeaInput = {
  topic: string;
  concept: string;
  sourceUrl: string;
  sourceName: string;
  region: Region;
  languages: string[];
  imageUrl?: string;
};

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Reuses one local idea for a source story instead of creating a duplicate per research screen. */
export function getOrCreateSourceIdea(
  data: LocalData,
  input: SourceIdeaInput,
  now = Date.now(),
): { data: LocalData; idea: Idea; created: boolean } {
  const topic = input.topic.trim().replace(/\s+/g, ' ').slice(0, 180);
  const sourceUrl = input.sourceUrl.trim();
  if (!topic || topic.toLowerCase() === 'untitled idea') {
    throw new Error('A real research topic is required.');
  }
  if (!isHttpsUrl(sourceUrl)) {
    throw new Error('A secure source link is required before creating a linked research idea.');
  }
  const existing = data.ideas.find((idea) => idea.topic === topic && idea.sourceUrl === sourceUrl);
  if (existing) return { data, idea: existing, created: false };

  const concept = input.concept.trim().slice(0, 4000) ||
    'Review the original publisher source, verify its claims and develop an original explanatory angle.';
  const imageUrl = input.imageUrl && isHttpsUrl(input.imageUrl) ? input.imageUrl : undefined;
  const idea: Idea = {
    id: uid(),
    topic,
    concept,
    note: 'Source-led research idea. Verify scientific claims against the original source and cited papers.',
    status: 'Saved Opportunities',
    decision: '',
    videoIds: [],
    createdAt: now,
    archived: false,
    assessment: 'Worth Exploring',
    region: input.region,
    languages: input.languages.length ? [...input.languages] : ['en'],
    sourceUrl,
    sourceName: input.sourceName.trim().slice(0, 160),
    ...(imageUrl ? { imageUrl } : {}),
  };
  return { data: { ...data, ideas: [idea, ...data.ideas] }, idea, created: true };
}

/** Connects an existing local YouTube report to an idea without copying API metadata. */
export function attachReportToIdea(data: LocalData, ideaId: string, reportId: string): LocalData {
  const idea = data.ideas.find((item) => item.id === ideaId);
  const report = data.reports.find((item) => item.id === reportId);
  if (!idea) throw new Error('The linked idea no longer exists.');
  if (!report) throw new Error('The YouTube research report is no longer available.');
  const videoIds = [...new Set([...idea.videoIds, ...report.videos.map((video) => video.id)])];
  return {
    ...data,
    ideas: data.ideas.map((item) =>
      item.id === ideaId ? { ...item, reportId, videoIds } : item,
    ),
  };
}

/**
 * Saves only a user-selected YouTube URL as a personal bookmark.
 * API titles, descriptions, thumbnails and statistics remain in the expiring metadata domain.
 */
export function attachVideoReferenceToIdea(
  data: LocalData,
  ideaId: string,
  videoId: string,
  now = Date.now(),
): LocalData {
  const idea = data.ideas.find((item) => item.id === ideaId);
  if (!idea) throw new Error('The linked idea no longer exists.');
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error('This does not look like a valid YouTube video reference.');
  }
  const existingLink = data.links.find((link) => link.id === videoId);
  const link = existingLink ?? {
    id: videoId,
    url: 'https://www.youtube.com/watch?v=' + videoId,
    manualTitle: '',
    topic: idea.topic,
    note: '',
    folder: 'Space Research',
    tags: ['space', 'research'],
    savedAt: now,
  };
  return {
    ...data,
    links: existingLink ? data.links : [link, ...data.links],
    ideas: data.ideas.map((item) =>
      item.id === ideaId
        ? { ...item, videoIds: [...new Set([...item.videoIds, videoId])] }
        : item,
    ),
  };
}
