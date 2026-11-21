import type { VideoCoverageData } from '../types';

export type EngineV2Weights = {
  momentum: number;
  growth: number;
  outlier: number;
  engagement: number;
  titlePattern: number;
  channelSize: number;
  newsGap: number;
  freshness: number;
  riskPenalty: number;
};

export const DEFAULT_ENGINE_V2_WEIGHTS: EngineV2Weights = {
  momentum: 0.18,
  growth: 0.10,
  outlier: 0.13,
  engagement: 0.09,
  titlePattern: 0.07,
  channelSize: 0.04,
  newsGap: 0.18,
  freshness: 0.03,
  riskPenalty: 0.13,
};

export type EngineV2VideoInput = {
  id: string;
  title: string;
  description: string;
  channel: string;
  channelId?: string;
  publishedAt: string;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  channelSubscriberCount: number | null;
  channelVideoCount: number | null;
  fetchedAt: number;
};

export type EngineV2NewsInput = {
  id?: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string | null;
  sourceId?: string;
};

export type EngineV2Feature = {
  videoId: string;
  title: string;
  channel: string;
  channelId: string;
  publishedAt: string;
  hoursSincePublish: number;
  /** views per hour since publish; 0 when stats/date are unavailable. */
  growthRate: number;
  /** (likes + comments) / views; 0 when stats are unavailable. */
  engagementRatio: number;
  commentCount: number;
  viewCount: number | null;
  likeCount: number | null;
  hasStats: boolean;
  titlePatterns: { hasDigit: boolean; isQuestion: boolean; words: number };
  recencyHours: number;
  channelSizeRatio: number | null;
  outlierScore: number | null;
};

export type EngineV2TopicCluster = {
  id: string;
  terms: string[];
  videoIds: string[];
  newsIds: string[];
  momentum: number;
  confidence: 'low' | 'medium' | 'high';
};

export type EngineV2EvidenceRef = {
  id: string;
  url: string;
  title: string;
  channel: string;
  views: number;
  publishedAt: string;
};

export type EngineV2IncomeEstimate = {
  estimate: number;
  currency: 'USD';
  label: 'estimate';
  assumptions: string[];
};

export type EngineV2Opportunity = {
  id: string;
  title: string;
  hook: string;
  angleId: string;
  riskLevel: 'low' | 'medium' | 'high';
  score: number;
  reasons: string[];
  componentScores: Partial<Record<keyof EngineV2Weights, number>>;
  videos: EngineV2EvidenceRef[];
  news: EngineV2NewsInput[];
  estimatedIncome: EngineV2IncomeEstimate | null;
  publishWindow: { bestTime: string; horizonDays: number };
  topicTerms: string[];
};

export type EngineV2StageTiming = { stage: string; ms: number };

export type EngineV2Result = {
  version: 2;
  topic: string;
  language: 'fa' | 'en';
  weights: EngineV2Weights;
  opportunities: EngineV2Opportunity[];
  topics: EngineV2TopicCluster[];
  plan: { gapTopics: string[]; riskTopics: string[] };
  timings: EngineV2StageTiming[];
  stageFallbacks: string[];
  processingMs: number;
  coverage: {
    news: { total: number; bySource: Record<string, number>; reachingEngine: number };
    videos: VideoCoverageData;
  };
};
