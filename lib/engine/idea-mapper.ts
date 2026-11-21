import type { Idea, Region } from '../types';
import type { EngineV2Opportunity, EngineV2VideoInput } from './types';

export function engineV2OpportunityToIdea(
  opportunity: EngineV2Opportunity,
  ctx: { region: Region; languages: readonly string[]; language: 'fa' | 'en'; now?: number },
): Idea {
  const score = Math.min(100, Math.max(0, Math.round(opportunity.score)));
  const assessment: Idea['assessment'] = score >= 70 ? 'Strong Opportunity' : score >= 50 ? 'Promising' : score >= 30 ? 'Worth Exploring' : 'Uncertain';
  const references = opportunity.videos.map((video) => video.title).filter(Boolean).slice(0, 4).join(' · ');
  const evidenceLines = opportunity.news.slice(0, 3).map((item) => item.title).filter(Boolean).slice(0, 3).join(' · ');
  return {
    id: opportunity.id,
    topic: opportunity.title,
    concept: opportunity.hook + (references ? '\nEvidence videos: ' + references : '') + (evidenceLines ? '\nSupporting news: ' + evidenceLines : ''),
    note: '',
    status: 'Strong Opportunities',
    decision: '',
    videoIds: opportunity.videos.map((video) => video.id),
    createdAt: ctx.now ?? Date.now(),
    archived: false,
    assessment,
    region: ctx.region,
    languages: [...ctx.languages],
    engineGenerated: true,
    engineScore: score,
    engineScoreReason: opportunity.reasons.slice(0, 3).join(' · '),
    engineV2: opportunity,
  };
}

export function engineV2VideoInputFromVideo(
  video: {
    id: string;
    title: string;
    description?: string;
    channel: string;
    channelId?: string;
    publishedAt: string;
    viewCount?: number | null;
    likeCount?: number | null;
    commentCount?: number | null;
  },
  fetchedAt: number,
): EngineV2VideoInput {
  return {
    id: video.id,
    title: video.title,
    description: video.description ?? '',
    channel: video.channel,
    channelId: video.channelId ?? '',
    publishedAt: video.publishedAt,
    viewCount: video.viewCount ?? null,
    likeCount: video.likeCount ?? null,
    commentCount: video.commentCount ?? null,
    channelSubscriberCount: null,
    channelVideoCount: null,
    fetchedAt,
  };
}
