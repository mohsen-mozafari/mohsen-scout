import type { MonthlyTrend } from '../intelligence';
import { computeVideoFeatures, median } from './features';
import type {
  EngineV2Feature,
  EngineV2Opportunity,
  EngineV2Result,
  EngineV2StageTiming,
  EngineV2VideoInput,
  EngineV2Weights,
} from './types';
import { DEFAULT_ENGINE_V2_WEIGHTS, type EngineV2NewsInput } from './types';
import { scoreFeatures } from './opportunity';
import { buildTopicEngine, findGapsAndRisks, type TopicDoc } from './topics';
import { generateEngineV2Opportunities } from './idea-generator';
import { estimateIncomeByNiche, findNicheByTopic } from './income';

export type EngineV2Input = {
  videos: EngineV2VideoInput[];
  news: EngineV2NewsInput[];
  topic: string;
  language: 'fa' | 'en';
  trend?: MonthlyTrend;
  coverage?: EngineV2Result['coverage'];
  weights?: Partial<EngineV2Weights>;
  limit?: number;
  budgetMs?: number;
};

export function runEngineV2(input: EngineV2Input): EngineV2Result {
  const startedAt = Date.now();
  const lang = input.language ?? 'en';
  const now = Date.now();
  const weights = { ...DEFAULT_ENGINE_V2_WEIGHTS, ...input.weights };
  const timings: EngineV2StageTiming[] = [];
  const stageFallbacks: string[] = [];
  const budgetMs = input.budgetMs ?? Number.MAX_SAFE_INTEGER;
  const coverage = input.coverage ?? {
    news: { total: input.news.length, bySource: {}, reachingEngine: input.news.length },
    videos: { videosFromReports: 0, videosFromStored: 0, uniqueVideos: 0, droppedMissingFields: 0, droppedAsExpired: 0, coverageLimit: 0 },
  };

  let stopped = false;
  const overBudget = () => Date.now() - startedAt > budgetMs;
  const runStage = <T>(stage: string, run: () => T): T | undefined => {
    if (stopped) {
      stageFallbacks.push(`budget: stopped before stage "${stage}"`);
      return undefined;
    }
    const t0 = Date.now();
    try {
      const value = run();
      timings.push({ stage, ms: Math.max(0, Date.now() - t0) });
      if (overBudget()) {
        stopped = true;
        stageFallbacks.push(`budget: stage "${stage}" exceeded the budget of ${budgetMs}ms`);
      }
      return value;
    } catch (error) {
      timings.push({ stage, ms: Math.max(0, Date.now() - t0) });
      stageFallbacks.push(`stage-error: ${stage} (${error instanceof Error ? error.message : String(error)})`);
      stopped = true;
      return undefined;
    }
  };

  // setup: dedupe videos + build docs.
  const setup = runStage('setup', () => {
    const videoMap = new Map<string, EngineV2VideoInput>();
    for (const video of input.videos) if (video.id) videoMap.set(video.id, video);
    const videos = [...videoMap.values()];
    const docs: TopicDoc[] = [
      ...videos.map((video) => ({ id: video.id, kind: 'youtube' as const, text: `${video.title} ${video.description}`, publishedAt: video.publishedAt })),
      ...input.news.map((news, index) => ({ id: news.id ?? `news:${index}`, kind: 'news' as const, text: `${news.title} ${news.summary}`, publishedAt: news.publishedAt })),
    ];
    return { videos, docs };
  });
  const videos = setup?.videos ?? [];
  const docs = setup?.docs ?? [];
  const newsById = new Map<string, EngineV2NewsInput>();
  input.news.forEach((news, index) => {
    const id = news.id ?? `news:${index}`;
    if (!newsById.has(id)) newsById.set(id, { ...news, id });
  });

  // features: channel median views/subs + per-video features.
  const features = new Map<string, EngineV2Feature>();
  runStage('features', () => {
    const channelMedianViews = new Map<string, number>();
    const channelMedianSubs = new Map<string, number>();
    {
      const viewsByChannel = new Map<string, number[]>();
      const subsByChannel = new Map<string, number[]>();
      for (const video of videos) {
        const channelId = video.channelId || video.channel;
        if (!channelId) continue;
        if (video.viewCount != null) {
          viewsByChannel.set(channelId, [...(viewsByChannel.get(channelId) ?? []), video.viewCount]);
        }
        if (video.channelSubscriberCount != null) {
          subsByChannel.set(channelId, [...(subsByChannel.get(channelId) ?? []), video.channelSubscriberCount]);
        }
      }
      for (const [id, values] of viewsByChannel) if (values.length) channelMedianViews.set(id, median(values));
      for (const [id, values] of subsByChannel) if (values.length) channelMedianSubs.set(id, median(values));
    }
    for (const video of videos) {
      features.set(video.id, computeVideoFeatures(video, { now, channelMedianViews, channelMedianSubs }));
    }
  });

  // topics: clusters + momentum + gap/risk plan.
  const topicsStage = runStage('topics', () => {
    const engine = buildTopicEngine(docs, {}, input.trend?.changePercent ?? null);
    const plan = findGapsAndRisks(engine, features);
    return { engine, plan };
  });

  // opportunity: per-feature scores -> opportunities (title/hook/references/news/income placeholder).
  const opportunityList = runStage('opportunity', () => {
    if (!topicsStage) return [];
    const { engine, plan } = topicsStage;
    const featureList = [...features.values()];
    const populations = {
      growthRates: featureList.map((feature) => feature.growthRate),
      outlierScores: featureList.map((feature) => feature.outlierScore).filter((value): value is number => value != null),
      engagementRatios: featureList.map((feature) => feature.engagementRatio),
      recencies: featureList.map((feature) => feature.recencyHours),
      channelSizeRatios: featureList.map((feature) => feature.channelSizeRatio).filter((value): value is number => value != null),
    };
    const scored = scoreFeatures(featureList, {
      weights,
      lang,
      populations,
      resolve: (feature) => {
        const clusterId = topicsStage.engine.docTopics.get(feature.videoId) ?? 'general';
        const cluster = engine.clusters.find((item) => item.id === clusterId) ?? null;
        return {
          gap: plan.gapTopics.includes(clusterId),
          risk: plan.riskTopics.includes(clusterId),
          topicMomentum: cluster?.momentum ?? 0,
          topicTerms: cluster?.terms ?? [],
          clusterId,
        };
      },
    });
    const out: EngineV2Opportunity[] = [];
    for (const { feature, score, componentScores, reasons } of scored) {
      if (score < 15) continue;
      const clusterId = topicsStage.engine.docTopics.get(feature.videoId) ?? 'general';
      const cluster = engine.clusters.find((item) => item.id === clusterId) ?? null;
      const risk = plan.riskTopics.includes(clusterId);
      const clusterVideos = (engine.topicDocs.get(clusterId) ?? [])
        .map((doc) => features.get(doc.id))
        .filter((value): value is EngineV2Feature => Boolean(value))
        .sort((a, b) => (b.outlierScore ?? 0) - (a.outlierScore ?? 0) || (b.growthRate ?? 0) - (a.growthRate ?? 0) || (b.viewCount ?? 0) - (a.viewCount ?? 0));
      const references = clusterVideos.slice(0, 3).map((video) => ({
        id: video.videoId,
        url: 'https://www.youtube.com/watch?v=' + video.videoId,
        title: video.title,
        channel: video.channel,
        views: video.viewCount ?? 0,
        publishedAt: video.publishedAt,
      }));
      const riskLevel = risk ? 'high' : score >= 70 ? 'medium' : 'low';
      const refTitles = references.map((item) => item.title).filter(Boolean);
      const title = lang === 'fa' ? `«${feature.title}» — ایده ویدئو با پتانسیل واقعی` : `«${feature.title}» — video idea with real potential`;
      const angle = risk
        ? (lang === 'fa'
          ? `پیشنهاد: همان فرمت محبوب + زاویه اصلاح‌کننده مبتنی بر داده (مقایسه با گزارش ناشر) — به عنوان مرجع: ${refTitles.join(' | ') || '-'}.`
          : `Suggested angle: reuse the trending format with a data-backed verifiable twist (cross-check with publisher reports) — reference: ${refTitles.join(' | ') || '-'}.`)
        : (lang === 'fa'
          ? 'پیشنهاد: فرمت محبوب را با زاویه جدید تکرار — اصطلاحات کلیدی + ساختار ویدئو.'
          : 'Suggested angle: reproduce the trending format with a new twist — key terms + structure.');
      const horizonDays = risk ? 7 : 14;
      const bestTime = lang === 'fa'
        ? (risk ? 'در هفته‌ی آینده (فرصت محدود)' : 'در دو هفته‌ی آینده (فرصت فعلی)')
        : (risk ? 'Within the next week (limited window)' : 'Within the next two weeks (current opportunity)');
      const newsDocs = (engine.topicDocs.get(clusterId) ?? []).filter((doc) => doc.kind === 'news');
      const news = newsDocs.map((doc) => newsById.get(doc.id)).filter((value): value is EngineV2NewsInput => Boolean(value));
      out.push({
        id: 'e2-' + feature.videoId,
        title,
        hook: angle,
        angleId: cluster?.id ?? 'general',
        riskLevel,
        score: Math.round(score),
        reasons,
        componentScores,
        videos: references,
        news,
        estimatedIncome: null,
        publishWindow: { bestTime, horizonDays },
        topicTerms: cluster?.terms ?? [],
      });
    }
    return out;
  });

  // income: estimate per opportunity (labeled estimate, niche-based).
  const opportunities = runStage('income', () => {
    if (!opportunityList) return [];
    const niche = findNicheByTopic(input.topic);
    return opportunityList.map((opp) => {
      const views = opp.videos[0]?.views ?? 0;
      return { ...opp, estimatedIncome: niche ? estimateIncomeByNiche(niche, views, lang) : null };
    });
  });

  return {
    version: 2,
    topic: input.topic,
    language: lang,
    weights,
    opportunities: generateEngineV2Opportunities({ opportunities: opportunities ?? [], limit: input.limit }),
    topics: topicsStage?.engine.clusters ?? [],
    plan: topicsStage?.plan ?? { gapTopics: [], riskTopics: [] },
    timings,
    stageFallbacks,
    processingMs: Math.max(0, Date.now() - startedAt),
    coverage,
  };
}
