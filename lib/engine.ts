import { type Report, type Idea, type ResearchMemoryEntry, type YouTubeGrowth, uid } from './types';
import { buildMultiParadigmAnalysis, type ResearchParadigmAnalysis } from './multiparadigm';
import type { WikiSignal } from './space';
import type { YouTubeSampleVideo } from './api';
import {
  analyzeMonthlyViews,
  analyzeSourceQuality,
  deduplicateResearchEvidence,
  rankResearchEvidence,
  scoreResearchText,
  matchesAnyResearchTerms,
  tokenizeResearchText,
  type ResearchFeedbackProfile,
  extractResearchEntityCandidates,
  buildResearchEntityRelations,
  type ResearchEntityCandidate,
  type ResearchEntityRelation,
  extractEmergentResearchConcepts,
  buildEmergentConceptRelations,
  type EmergentResearchConcept,
  type EmergentConceptRelation,
} from './intelligence';

export const limitations =
  'This is a limited YouTube search sample, not a real-time trend report. Region controls availability, not audience location. Language is a relevance hint, not a strict language filter. Search ordering is supplied by YouTube. Growth is measured only from valid repeat snapshots; a single snapshot cannot establish velocity. The engine does not predict competition, views or virality.';

export type EngineNewsItem = {
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string | null;
  sourceId?: string;
  sourceCount?: number;
};

export type InternalResearchInput = {
  topic: string;
  news?: readonly EngineNewsItem[];
  wiki?: Pick<WikiSignal, 'articleTitle' | 'language' | 'monthlyViews'>;
  videos?: readonly (Pick<
    YouTubeSampleVideo,
    'id' | 'title' | 'channel' | 'publishedAt' | 'viewCount' | 'likeCount'
  > & Partial<Pick<YouTubeSampleVideo, 'description'>> & { growth?: YouTubeGrowth })[];
  feedback?: ResearchFeedbackProfile;
  language?: 'fa' | 'en';
  priorMemory?: ResearchMemoryEntry;
  videoWindowDays?: number;
  /** Injectable clock for deterministic freshness tests. */
  now?: number;
};

export type InternalEngineEvidence = {
  id: string;
  label: string;
  detail: string;
  sourceUrl?: string;
};

export type InternalEngineAngle = {
  id: string;
  title: string;
  hook: string;
  approach: string;
  verification: string;
};

export type InternalResearchResult = {
  topic: string;
  entityCandidates: ResearchEntityCandidate[];
  entityRelations: ResearchEntityRelation[];
  emergentConcepts: EmergentResearchConcept[];
  conceptRelations: EmergentConceptRelation[];
  summary: string;
  evidence: InternalEngineEvidence[];
  angles: InternalEngineAngle[];
  verificationQuestions: string[];
  limitations: string[];
  intelligence: {
    sourceQuality: ReturnType<typeof analyzeSourceQuality>;
    trend: ReturnType<typeof analyzeMonthlyViews>;
    confidence: { level: 'low' | 'moderate' | 'high'; reason: string };
    gaps: string[];
    followUpQueries: string[];
    sharedConcepts: string[];
    potentialContradictions: string[];
    scenarios: string[];
    paradigms: ResearchParadigmAnalysis;
    selfEvaluation: {
      inputNewsCount: number;
      uniqueNewsCount: number;
      topicMatchedNewsCount: number;
      duplicateNewsMerged: number;
      independentPublisherFamilies: number;
      undatedNewsCount: number;
      staleNewsCount: number;
      youtubeSampleCount: number;
      youtubeRawSampleReceived: boolean;
      matchedVideoCount: number;
      allTimeMatchedVideoCount: number;
      recentMatchedVideoCount: number;
      outsideVideoWindowCount: number;
      futureDatedVideoCount: number;
      recentVideoCandidateCount: number;
      excludedVideoCount: number;
      videoViewCountsAvailable: number;
      videoWindowDays: number;
      unmatchedNewsCount: number;
      wikimediaMonthlyObservations: number;
      openResearchQuestionCount: number;
      contradictionWarningCount: number;
      entityCandidateCount: number;
      coMentionRelationCount: number;
      emergentConceptCount: number;
      conceptRelationCount: number;
      processingMs: number;
      limitations: string[];
    };
  };
};

function cleanTopic(topic: string) {
  return topic.trim().replace(/\s+/g, ' ').slice(0, 180) || 'this topic';
}
export function createManualIdea(
  topic: string,
  concept: string,
  decision: string,
  region: Idea['region'],
  languages: string[],
): Idea {
  const cleanTitle = topic.trim().replace(/\s+/g, ' ').slice(0, 180);
  const cleanConcept = concept.trim().slice(0, 4000);
  if (!cleanTitle || cleanTitle.toLowerCase() === 'untitled idea')
    throw new Error('Enter a real topic before saving this idea.');
  if (!cleanConcept) throw new Error('Add a video concept before saving this idea.');
  return {
    id: uid(), topic: cleanTitle, concept: cleanConcept, note: '',
    status: 'New Discoveries', decision: decision.trim().slice(0, 1200),
    videoIds: [], createdAt: Date.now(), archived: false,
    assessment: 'Uncertain', region, languages: [...languages],
  };
}

/**
 * Local-only editorial analysis. It consumes already fetched evidence and never
 * performs network requests, writes to storage, or sends source material to AI.
 */
/** Transparent local relevance using normalized bilingual text and explicit concept aliases. */
export function topicRelevanceScore(topic: string, title: string, summary = ''): number {
  return scoreResearchText(topic, title, summary);
}

export function rankNewsForTopic<T extends { title: string; summary: string; publishedAt: string | null }>(
  topic: string, items: readonly T[], limit = 6, feedback?: ResearchFeedbackProfile,
): T[] {
  return rankResearchEvidence(topic, items, limit, feedback);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
}

/** Local-only analysis over fetched evidence; no network, storage writes or AI calls. */
export function buildInternalResearch(input: InternalResearchInput): InternalResearchResult {
  const startedAt = Date.now();
  const now = Number.isFinite(input.now) ? input.now! : Date.now();
  const videoWindowDays = Number.isFinite(input.videoWindowDays) ? Math.max(0, Math.min(90, Math.floor(input.videoWindowDays!))) : 30;
  const videoWindowStart = videoWindowDays === 0 ? Number.NEGATIVE_INFINITY : now - videoWindowDays * 86400000;
  const topic = cleanTopic(input.topic);
  // YouTube API records are first-class discovery signals. They may inform
  // relevance, entity extraction and cross-source hypotheses, but remain clearly
  // labelled platform observations rather than independent publisher evidence.
  const youtubeSample = input.videos ?? [];
  const fa = input.language === 'fa';
  const text = (english: string, persian: string) => fa ? persian : english;
  const originalNews = [...(input.news ?? [])];
  const deduplicated = deduplicateResearchEvidence(originalNews);
  const allNews = deduplicated.items;
  const rankedNews = allNews
    .map((item, index) => {
      let score = topicRelevanceScore(topic, item.title, item.summary);
      const searchable = item.title + ' ' + item.summary;
      if (input.feedback && matchesAnyResearchTerms(searchable, input.feedback.positiveTopics)) score += 1;
      if (input.feedback && matchesAnyResearchTerms(searchable, input.feedback.negativeTopics)) score -= 2;
      return { item, index, score };
    })
    .sort((a, b) => b.score - a.score ||
      (b.item.publishedAt ? Date.parse(b.item.publishedAt) : 0) -
      (a.item.publishedAt ? Date.parse(a.item.publishedAt) : 0) || a.index - b.index);
  const matchedNews = rankedNews.filter((entry) => entry.score > 0);
  // Keep every de-duplicated publisher record in the evidence graph. Direct matches
  // drive the topic-specific conclusion; unmatched records remain contextual/auditable.
  const news = rankedNews.map((entry) => entry.item);
  const publisherNames = [...new Set(news.flatMap((item) =>
    item.sourceName.split('·').map((name) => name.trim()).filter(Boolean)))];
  const declaredPublisherCount = Math.max(0, ...news.map((item) => item.sourceCount ?? 0));
  const publisherCount = Math.max(publisherNames.length, declaredPublisherCount);

  // Analyze the supplied YouTube sample directly. These records are not counted
  // as independent publishers and do not become web citations.
  const inputVideos: NonNullable<InternalResearchInput['videos']> = youtubeSample;
  const recentVideoCandidates = inputVideos.filter((video) => {
    const published = Date.parse(video.publishedAt);
    return Number.isFinite(published) && published >= videoWindowStart && published <= now + 86400000;
  });
  // Analyze all retained YouTube records, not only recent title matches. Description matches
  // are weaker context; the recent, directly matched subset remains a separate audit signal.
  const measuredViewsPerHour = (video: NonNullable<InternalResearchInput['videos']>[number]) =>
    video.growth?.status === 'measured' && Number.isFinite(video.growth.viewsPerHour)
      ? video.growth.viewsPerHour ?? -1 : -1;
  const measuredOutlierRatio = (video: NonNullable<InternalResearchInput['videos']>[number]) =>
    video.growth?.status === 'measured' && Number.isFinite(video.growth.channelOutlierRatio)
      ? video.growth.channelOutlierRatio ?? -1 : -1;
  const rankedVideos = inputVideos.map((video, index) => ({
    video, index, score: topicRelevanceScore(topic, video.title, video.description ?? ''),
  })).filter((entry) => entry.score > 0 && Date.parse(entry.video.publishedAt) <= now + 86400000).sort((a, b) => b.score - a.score ||
    measuredViewsPerHour(b.video) - measuredViewsPerHour(a.video) ||
    measuredOutlierRatio(b.video) - measuredOutlierRatio(a.video) ||
    (b.video.viewCount ?? -1) - (a.video.viewCount ?? -1) ||
    (b.video.likeCount ?? -1) - (a.video.likeCount ?? -1) || a.index - b.index);
  const videos = rankedVideos.map((entry) => entry.video);
  const recentVideoIds = new Set(recentVideoCandidates.map((video) => video.id));
  const recentMatchedVideoCount = rankedVideos.filter((entry) => recentVideoIds.has(entry.video.id)).length;
  const entityDocuments = [
    ...allNews.map((item, index) => ({ id: item.sourceUrl || 'news:' + index, text: item.title + ' ' + item.summary, sourceId: item.sourceId })),
    ...inputVideos.map((video) => ({ id: 'youtube:' + video.id, text: video.title + ' ' + (video.description ?? ''), sourceId: 'youtube-sample' })),
  ];
  const entityCandidates = extractResearchEntityCandidates(entityDocuments);
  const entityRelations = buildResearchEntityRelations(entityCandidates);
  const conceptDocuments = [
    ...matchedNews.map((entry) => ({
      id: entry.item.sourceUrl || 'news:' + entry.index,
      text: entry.item.title + ' ' + entry.item.summary,
      sourceId: entry.item.sourceId,
    })),
    ...rankedVideos.map((entry) => ({
      id: 'youtube:' + entry.video.id,
      text: entry.video.title + ' ' + (entry.video.description ?? ''),
      sourceId: 'youtube:' + (entry.video.channel || entry.video.id),
    })),
  ];
  const emergentConcepts = extractEmergentResearchConcepts(conceptDocuments, topic, 2, 10);
  const conceptRelations = buildEmergentConceptRelations(emergentConcepts, 2);
  const channelCount = new Set(videos.map((video) => video.channel)).size;
  const views = videos.map((video) => video.viewCount).filter((value): value is number => value != null);
  const likes = videos.map((video) => video.likeCount).filter((value): value is number => value != null);
  const mostViewed = videos.filter((video) => video.viewCount != null)
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))[0];
  const mostLiked = videos.filter((video) => video.likeCount != null)
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))[0];
  const measuredGrowthVideos = videos.filter((video) =>
    video.growth?.status === 'measured' &&
    video.growth.viewsPerHour !== null &&
    Number.isFinite(video.growth.viewsPerHour),
  );
  const fastestMeasuredVideo = [...measuredGrowthVideos]
    .sort((a, b) => (b.growth?.viewsPerHour ?? -1) - (a.growth?.viewsPerHour ?? -1))[0];

  const evidence: InternalEngineEvidence[] = [];
  if (emergentConcepts.length) {
    const conceptSummary = emergentConcepts.slice(0, 8).map((item) =>
      item.term + ' (' + item.evidenceIds.length + ' evidence documents, ' + item.mentionCount + ' mentions)',
    ).join(' · ');
    const relationSummary = conceptRelations.slice(0, 5).map((item) => {
      const left = emergentConcepts.find((concept) => concept.id === item.fromConceptId)?.term ?? 'concept';
      const right = emergentConcepts.find((concept) => concept.id === item.toConceptId)?.term ?? 'concept';
      return left + ' ↔ ' + right + ' (' + item.cooccurrenceCount + ' shared documents)';
    }).join(' · ');
    evidence.push({
      id: 'emergent-concepts',
      label: text('Recurring concepts in retrieved evidence', 'مفاهیم پرتکرار در شواهد دریافت‌شده'),
      detail: fa
        ? 'مفاهیم خارج از عبارت اصلی که در چند سند تکرار شده‌اند: ' + conceptSummary +
          (relationSummary ? '. هم‌رخدادی‌های چندسندی: ' + relationSummary : '') +
          '. این‌ها الگوهای متنی در نمونه فعلی‌اند، نه رابطه علّی یا اثبات معنایی.'
        : 'Recurring terms beyond the requested topic phrase: ' + conceptSummary +
          (relationSummary ? '. Multi-document co-occurrences: ' + relationSummary : '') +
          '. These are patterns in the current text sample, not causal or semantic proof.',
    });
  }
  if (news.length) {
    const newest = matchedNews.map((entry) => entry.item).sort((a, b) =>
      (b.publishedAt ? Date.parse(b.publishedAt) : 0) -
      (a.publishedAt ? Date.parse(a.publishedAt) : 0))[0];
    const publishers = publisherNames.length ? publisherNames.join(', ') : 'selected official feeds';
    evidence.push({
      id: 'publisher-news',
      label: text('Official publisher coverage', 'پوشش ناشران رسمی'),
      detail: fa
        ? news.length + ' گزارش انتخاب‌شده بررسی شد؛ ' + matchedNews.length + ' مورد با واژه‌های موضوع تطبیق مستقیم داشتند و در ' + publisherCount + ' خوراک منبع دیده شدند: ' + publishers + '. تازه‌ترین تیتر دریافت‌شده: «' + (newest?.title ?? 'ارائه نشده') + '». پوشش خبری به معنی راستی‌آزمایی مستقل یا اثبات تقاضای مخاطب نیست.'
        : news.length + ' selected report(s), ' + matchedNews.length + ' with direct topic-word matches, across ' + publisherCount + ' selected feed source(s): ' + publishers + '. Latest retrieved headline: “' + (newest?.title ?? 'not supplied') + '”. Feed coverage is not an independent fact-check or proof of audience demand.',
      sourceUrl: newest?.sourceUrl,
    });
  } else {
    evidence.push({
      id: 'publisher-news',
      label: text('Official publisher coverage', 'پوشش ناشران رسمی'),
      detail: text(
        allNews.length
          ? 'No supplied publisher headline matched the topic; ' + allNews.length + ' unmatched item(s) were excluded.'
          : 'No selected official RSS item was supplied to this analysis. Verify the original publisher before presenting a factual claim.',
        allNews.length
          ? 'هیچ تیتر خبری با موضوع تطبیق نداشت؛ ' + allNews.length + ' خبر نامرتبط از تحلیل اصلی حذف شد.'
          : 'هیچ خبر رسمی از خوراک‌های انتخاب‌شده به این تحلیل نرسیده است. پیش از بیان ادعای واقعی، ناشر اصلی را بررسی کنید.',
      )
    });
  }
  if (input.wiki) {
    const series = input.wiki.monthlyViews;
    const latest = series.length ? series[series.length - 1] : undefined;
    evidence.push({
      id: 'wikimedia',
      label: text('Public-interest proxy · Wikimedia', 'شاخص توجه عمومی · ویکی‌مدیا'),
      detail: fa
        ? input.wiki.articleTitle + ' · ویکی‌پدیای ' + input.wiki.language.toUpperCase() + '. ' + (latest ? 'آخرین ماه دریافت‌شده: ' + latest.month + '، ' + latest.views.toLocaleString() + ' بازدید مقاله در ' + series.length + ' ماه.' : 'داده بازدید ماهانه‌ای دریافت نشد.') + ' بازدید مقاله معادل حجم جست‌وجو، تعداد افراد یکتا یا بازدید یوتیوب نیست.'
        : input.wiki.articleTitle + ' · ' + input.wiki.language.toUpperCase() + ' Wikipedia. ' + (latest ? 'Latest returned month: ' + latest.month + ', ' + latest.views.toLocaleString() + ' article pageviews across ' + series.length + ' returned month(s).' : 'No monthly pageview observations were returned.') + ' Article pageviews are not search volume, unique people, or YouTube views.',
    });
  }
  if (news.length) {
    evidence.push({
      id: 'retrieved-news-headlines',
      label: text('Retrieved official news headlines', 'تیتر خبرهای رسمی دریافت‌شده'),
      detail: news.slice(0, 10).map((item, index) =>
        (index + 1) + '. ' + item.sourceName + ' · ' + item.title +
        (item.publishedAt ? ' · ' + new Date(item.publishedAt).toLocaleDateString(fa ? 'fa-IR' : 'en-US') : ''),
      ).join('\n').slice(0, 2800),
    });
  }
  if (videos.length) {
    evidence.push({
      id: 'retrieved-youtube-videos',
      label: text('Retrieved YouTube titles and public metrics', 'عنوان ویدئوهای یوتیوب و آمار عمومی'),
      detail: [...videos]
        .sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1))
        .slice(0, 12)
        .map((video, index) =>
          (index + 1) + '. ' + video.title + ' · ' + video.channel +
          ' · ' + (video.viewCount == null ? text('views unavailable', 'بازدید ناموجود') : video.viewCount.toLocaleString() + (fa ? ' بازدید' : ' views')) +
          ' · ' + (video.likeCount == null ? text('likes unavailable', 'پسند ناموجود') : video.likeCount.toLocaleString() + (fa ? ' پسند' : ' likes')),
        ).join('\n').slice(0, 3200),
    });
  }
  if (videos.length) {
    evidence.push({
      id: 'youtube-sample',
      label: text('YouTube sample', 'نمونه یوتیوب'),
      detail: fa
        ? videos.length + ' نمونه ویدئو از ' + channelCount + ' کانال متمایز دریافت شد. تعداد بازدید در ' + views.length + ' نمونه در دسترس است (میانه: ' + (median(views)?.toLocaleString() ?? 'ناموجود') + ')؛ تعداد پسند در ' + likes.length + ' نمونه موجود است (میانه: ' + (median(likes)?.toLocaleString() ?? 'ناموجود') + ').' + (mostViewed ? ' پربازدیدترین نمونه: «' + mostViewed.title + '» با ' + mostViewed.viewCount!.toLocaleString() + ' بازدید.' : ' تعداد بازدید دریافت نشد.') + (mostLiked ? ' بیشترین پسند: «' + mostLiked.title + '» با ' + mostLiked.likeCount!.toLocaleString() + ' پسند.' : ' تعداد پسند دریافت نشد.') + ' این‌ها مشاهدات یک نمونه محدودند، نه رتبه‌بندی کل بازار یا معیار رشد.'
        : videos.length + ' returned video example(s) from ' + channelCount + ' distinct channel(s). Raw view counts are available for ' + views.length + ' sample(s) (median ' + (median(views)?.toLocaleString() ?? 'unavailable') + '); raw like counts are available for ' + likes.length + ' sample(s) (median ' + (median(likes)?.toLocaleString() ?? 'unavailable') + ').' + (mostViewed ? ' Highest-viewed returned example: “' + mostViewed.title + '” (' + mostViewed.viewCount!.toLocaleString() + ' views).' : ' No view count was returned.') + (mostLiked ? ' Highest-like returned example: “' + mostLiked.title + '” (' + mostLiked.likeCount!.toLocaleString() + ' likes).' : ' No like count was returned.') + ' These are observations from this limited sample, not a market-wide ranking or growth measure.',
    });
  } else {
    evidence.push({
      id: 'youtube-sample',
      label: text('YouTube sample', 'نمونه یوتیوب'),
      detail: youtubeSample.length
        ? text('A raw YouTube API sample reached the internal engine as transient input through its isolated field and is intentionally excluded from scoring, summarization, source correlation and external model requests under the current project policy.', 'نمونه خام API یوتیوب از مسیر مستقل و بدون تحلیل به موتور رسیده است. طبق سیاست فعلی پروژه، این داده امتیازدهی، خلاصه، با منابع مستقل ترکیب یا به مدل بیرونی ارسال نمی‌شود.')
        : text('No YouTube API sample was supplied to this engine run. The raw sample remains available in its separate report view.', 'در این اجرای موتور نمونه‌ای از API یوتیوب دریافت نشد. نمونه خام در صفحه گزارش جداگانه در دسترس است.')
    });
  }
  if (videos.length) {
    evidence.push({
      id: 'youtube-momentum',
      label: text('Measured YouTube momentum', 'شتاب اندازه‌گیری‌شده در YouTube'),
      detail: measuredGrowthVideos.length
        ? (fa
          ? 'از ' + videos.length + ' ویدئوی هم‌موضوع، ' + measuredGrowthVideos.length + ' مورد سابقه snapshot معتبر دارند. سریع‌ترین نمونه «' + fastestMeasuredVideo!.title + '» با ' + fastestMeasuredVideo!.growth!.viewsPerHour!.toFixed(1) + ' بازدید در ساعت رشد اندازه‌گیری‌شده و نسبت ' + (fastestMeasuredVideo!.growth!.channelOutlierRatio?.toFixed(2) ?? 'ناموجود') + ' برابر خط پایه کانال دارد. این فقط نمونه محدود پلتفرم است، نه تقاضای کل بازار.'
          : measuredGrowthVideos.length + ' of ' + videos.length + ' matched sample videos have valid repeated snapshots. Fastest measured example: "' + fastestMeasuredVideo!.title + '" at ' + fastestMeasuredVideo!.growth!.viewsPerHour!.toFixed(1) + ' views/hour; channel outlier ratio ' + (fastestMeasuredVideo!.growth!.channelOutlierRatio?.toFixed(2) ?? 'unavailable') + '. This is a bounded platform sample, not market-wide demand.')
        : text('No matched video has enough repeat snapshots to measure growth. Lifetime view counts remain raw observations and are not described as momentum.', 'هنوز برای هیچ ویدئوی هم‌موضوعی snapshot تکراری کافی برای اندازه‌گیری رشد وجود ندارد. بازدید کل فقط مشاهده خام است و به‌عنوان شتاب رشد گزارش نمی‌شود.'),
      ...(fastestMeasuredVideo ? { sourceUrl: 'https://www.youtube.com/watch?v=' + fastestMeasuredVideo.id } : {}),
    });
  }

  const topicTerms = new Set(tokenizeResearchText(topic));
  const newsTerms = new Set(matchedNews.flatMap((entry) => tokenizeResearchText(entry.item.title + ' ' + entry.item.summary)));
  const topicalVideos = rankedVideos;
  const videoTerms = new Set(topicalVideos.flatMap((entry) => tokenizeResearchText(entry.video.title + ' ' + (entry.video.description ?? ''))));
  const sharedTerms = [...newsTerms].filter((term) => videoTerms.has(term) && !topicTerms.has(term)).slice(0, 6);
  if (sharedTerms.length) evidence.push({
    id: 'cross-source-overlap',
    label: text('Shared vocabulary across retrieved sources', 'واژگان مشترک در منابع دریافت‌شده'),
    detail: text(
      'Retrieved publisher headlines and video titles share these exact topic words: ' +
        sharedTerms.join(', ') + '. This is text overlap in the returned sample, not proof of semantic agreement or market coverage.',
      'تیترهای ناشران و عنوان ویدئوهای دریافت‌شده این واژه‌ها را به‌صورت مشترک دارند: ' +
        sharedTerms.join('، ') + '. این فقط هم‌پوشانی متنی در نمونه فعلی است و اثبات‌کننده توافق معنایی یا پوشش کامل بازار نیست.',
    ),
  });

  const newestNews = [...news].sort((a, b) =>
    (b.publishedAt ? Date.parse(b.publishedAt) : 0) -
    (a.publishedAt ? Date.parse(a.publishedAt) : 0))[0];
  const bestVideo = topicalVideos[0]?.video;
  const angles: InternalEngineAngle[] = [
    {
      id: 'evidence-audit',
      title: text('What the latest report actually tells us', 'از تازه‌ترین گزارش چه چیزی می‌دانیم؟') ,
      hook: newestNews
        ? 'با خود گزارش شروع کن: «' + newestNews.title + '». گزارش دقیقاً چه چیزی را ثبت کرده و چه بخشی هنوز برداشت یا تفسیر است؟'
        : 'برای تبدیل ' + topic + ' به یک ویدئوی مستند، اول باید یک گزارش یا سند اولیه پیدا کنیم.',
      approach: newestNews
        ? 'روایت را از همان گزارش و تاریخ انتشارش شروع کن. آنچه واقعاً اندازه‌گیری شده را از برداشت‌ها جدا نگه دار و عددی که در منبع نیست اضافه نکن.'
        : 'پیش از نگارش، صفحه مأموریت، مقاله یا اطلاعیه رسمی را پیدا کن و مشاهده مستقیم، تاریخ و روش آن را مشخص کن.',
      verification: text('Can each factual sentence be traced to the linked primary source or a cited paper?', 'آیا می‌توان هر جمله واقعی را به منبع اولیه پیوندشده یا مقاله ارجاع‌شده ردیابی کرد؟'),
    },
    {
      id: 'youtube-sample',
      title: text(bestVideo ? 'What the sampled YouTube videos focus on' : 'How to test audience-facing explanations', bestVideo ? 'ویدئوهای بررسی‌شده بیشتر به چه نکته‌ای پرداخته‌اند؟' : 'چگونه توضیح مناسب مخاطب را آزمایش کنیم؟'),
      hook: bestVideo
        ? 'یکی از نمونه‌های دریافت‌شده «' + bestVideo.title + '» است. این عنوان چه وعده‌ای می‌دهد و چه توضیح مفیدتری می‌توان به آن افزود؟'
        : 'چه نوع توضیحی می‌تواند ' + topic + ' را برای مخاطبی که با موضوع آشنا نیست قابل فهم کند؟',
      approach: bestVideo
        ? 'عنوان و تاریخ ویدئوهای مرتبط را کنار هم بگذار و ببین هرکدام چه وعده‌ای به مخاطب می‌دهند. بعد آن وعده را با منبع اصلی مقایسه کن؛ این چند ویدئو فقط یک نمونه‌اند، نه تصویر کامل یوتیوب.'
        : 'چند ویدئوی واقعاً مرتبط را هم دستی بررسی کن تا ببینی چه پرسش‌هایی قبلاً جواب گرفته‌اند و چه زاویه‌ای هنوز جای کار دارد.',
      verification: text('Is the returned sample large and relevant enough for the comparison being made? What is still missing?', 'آیا نمونه دریافت‌شده برای این مقایسه به‌اندازه کافی بزرگ و مرتبط است؟ چه چیزی هنوز کم است؟'),
    },
    {
      id: 'open-question',
      title: text('The most important unanswered question', 'مهم‌ترین پرسش بی‌پاسخ'),
      hook: 'شاید زاویه تازه در بخشی از ' + topic + ' باشد که منابع فعلی هنوز جواب روشنی برایش ندارند.',
      approach: sharedTerms.length
        ? 'تیتر ناشران و عنوان ویدئوها در این واژه‌ها هم‌پوشانی دارند: ' + sharedTerms.slice(0, 4).join('، ') + '؛ به تکرار واژه‌ها بسنده نکن؛ ببین چه سازوکاری پشت موضوع است، چه چیزی هنوز قطعی نیست و کدام اندازه‌گیری کم است.'
        : 'یک پرسش بی‌پاسخ، توضیح جایگزین یا داده‌ای را که هنوز اندازه‌گیری نشده پیدا کن؛ حدس را هم جای واقعیت ننشان.',
      verification: text('Which uncertainty is explicitly acknowledged by the publisher or cited paper, and what evidence could resolve it?', 'منبع اصلی چه چیزی را هنوز نامطمئن می‌داند؟ چه داده‌ای می‌تواند این ابهام را کمتر کند؟'),
    },
  ];

  const verificationQuestions = fa ? [
    'آیا منبع اولیه یک اندازه‌گیری مستقیم را شرح می‌دهد، یک تفسیر یا یک فرضیه؟',
    'آیا نام‌ها، تاریخ‌ها، اعداد و وضعیت مأموریت با ناشر اصلی قابل بررسی‌اند؟',
    'کدام ادعای مهم هنوز به مقاله، صفحه مأموریت یا منبع مستقل نیاز دارد؟',
    'شواهد موجود چه چیزی را ثابت نمی‌کنند؟',
  ] : [
    'Does the primary source describe a direct measurement, an interpretation or a hypothesis?',
    'Can names, dates, figures and mission status be checked against the original publisher?',
    'Which important claim still needs a paper, mission page or independent source?',
    'What does the available evidence not establish?',
  ];
  const limitationsList = [
    ...(fa ? [
      'این موتور به‌صورت محلی و بر پایه شواهد بارگذاری‌شده در برنامه اجرا می‌شود و در این مرحله منبع تازه‌ای دریافت نمی‌کند.',
      'داده‌های API یوتیوب به فیلد مستقل youtubeSample می‌رسند، اما وارد استخراج موجودیت، confidence یا نتیجه‌گیری این موتور نمی‌شوند.',
      'زاویه‌های محتوایی فرضیه‌اند، نه یافته علمی و نه پیش‌بینی بازدید، رشد یا وایرال شدن.',
      'پوشش ناشران و بازدید مقاله‌های ویکی‌مدیا زمینه مستقل هستند؛ نمونه خام YouTube فقط در مسیر دریافت جداگانه می‌ماند و در تحلیل و امتیازها دخالت ندارد.',
    ] : [
      'This engine runs locally on evidence already loaded in the app; it does not fetch new sources.',
      'YouTube metadata is analyzed as a platform observation for topic matching and entity extraction; it is not independent publisher evidence.',
      'Editorial angles are hypotheses, not scientific findings or predictions of views, growth or virality.',
      'Publisher coverage, Wikimedia pageviews and YouTube sample metrics are separate signal families. A single YouTube snapshot cannot establish temporal growth or market-wide demand.',
    ]),
    ...(matchedNews.length < allNews.length
      ? [text('Unmatched publisher records remain in contextual evidence and source audits; they are not treated as direct support for the requested topic.', 'خبرهای بدون تطبیق مستقیم در شواهد زمینه‌ای و ممیزی منابع باقی می‌مانند، اما پشتیبانی مستقیم از موضوع محسوب نمی‌شوند.')]
      : []),
    ...(!news.length && !input.wiki && !videos.length
      ? [text('No source evidence was supplied. Treat all angles as starting questions only.', 'هیچ شاهد منبعی ارائه نشده است؛ همه زاویه‌ها را فقط پرسش‌های آغازین در نظر بگیر.')]
      : []),
  ];
  const summaryParts: string[] = [];
  if (news.length) summaryParts.push(fa
    ? news.length + ' گزارش یکتای همه خوراک‌ها بررسی شد؛ ' + matchedNews.length + ' مورد مستقیماً هم‌موضوع بود و سایر موارد برای زمینه، موجودیت‌ها و ممیزی منابع نگه داشته شدند. خوراک‌های حاضر: ' + publisherCount + '.'
    : news.length + ' unique reports from all selected feeds were inspected; ' + matchedNews.length + ' directly matched the topic, while the rest were retained for context, entity analysis and source auditing. Feeds represented: ' + publisherCount + '.');
  if (input.wiki) {
    const latest = input.wiki.monthlyViews[input.wiki.monthlyViews.length - 1];
    summaryParts.push(latest
      ? (fa ? 'ویکی‌مدیا در ' + latest.month + ' تعداد ' + latest.views.toLocaleString() + ' بازدید مقاله ثبت کرده است.' : 'Wikimedia returned ' + latest.views.toLocaleString() + ' article pageviews in ' + latest.month + '.')
      : text('Wikimedia returned no monthly pageview observation.', 'ویکی‌مدیا داده بازدید ماهانه‌ای برنگرداند.'));
  }
  if (videos.length) summaryParts.push(fa
    ? 'نمونه یوتیوب شامل ' + videos.length + ' ویدئو از ' + channelCount + ' کانال است؛ آمار بازدید ' + views.length + ' و آمار پسند ' + likes.length + ' ویدئو در دسترس بود.'
    : 'The YouTube sample contains ' + videos.length + ' videos from ' + channelCount + ' channels; ' + views.length + ' view counts and ' + likes.length + ' like counts were available.');
  const hasAnyEvidence = news.length > 0 || Boolean(input.wiki) || videos.length > 0;
  const summary = hasAnyEvidence
    ? (fa ? summaryParts.join(' ') + ' این سیگنال‌ها مشاهدات جداگانه‌اند؛ موتور امتیاز ترکیبی فرصت محاسبه نمی‌کند و عملکرد آینده را پیش‌بینی نمی‌کند.' : summaryParts.join(' ') + ' These signals remain separate observations; this engine does not calculate a composite opportunity score or predict performance.')
    : text('No source evidence was supplied. The local engine can prepare questions, but this topic is still exploratory until sources are checked.', 'هیچ شاهد منبعی ارائه نشده است. موتور محلی می‌تواند پرسش‌های تحقیق را آماده کند، اما تا بررسی منابع این موضوع اکتشافی باقی می‌ماند.');

  const sourceQuality = analyzeSourceQuality(news, deduplicated.duplicatesMerged, now);
  const matchedSourceQuality = analyzeSourceQuality(matchedNews.map((entry) => entry.item), 0, now);
  const trend = analyzeMonthlyViews(input.wiki?.monthlyViews ?? []);
  const hasPublisherEvidence = matchedNews.length > 0;
  const hasUsableWikiHistory = trend.observations >= 4;
  const confidence: InternalResearchResult['intelligence']['confidence'] =
    hasPublisherEvidence && matchedSourceQuality.independentPublishers >= 3 && hasUsableWikiHistory
      ? { level: 'high', reason: text('Several independent publisher families and a usable Wikimedia history are available. This is evidence breadth, not a guarantee that claims are true.', 'چند خانواده ناشر مستقل و سابقه قابل استفاده ویکی‌مدیا در دسترس‌اند؛ این فقط تنوع شواهد است و صحت ادعاها را تضمین نمی‌کند.') }
      : hasPublisherEvidence && (matchedSourceQuality.independentPublishers >= 2 || hasUsableWikiHistory)
        ? { level: 'moderate', reason: text('Publisher coverage or a usable Wikimedia history adds context, but the source sample is still limited.', 'پوشش ناشران یا سابقه ویکی‌مدیا زمینه می‌دهد، اما نمونه منابع هنوز محدود است.') }
        : { level: 'low', reason: text('Independent publisher evidence or historical context is limited.', 'شواهد مستقل ناشران یا زمینه تاریخی محدود است.') };
  const gaps: string[] = [];
  if (!matchedNews.length) gaps.push(text('No direct publisher headline matched the requested topic.', 'هیچ تیتر مستقیمی از ناشران با موضوع درخواستی تطبیق نداشت.'));
  if (matchedSourceQuality.independentPublishers < 2) gaps.push(text('Independent publisher confirmation among directly relevant records is limited.', 'تأیید از سوی ناشران مستقل در میان رکوردهای مستقیماً مرتبط محدود است.'));
  if (!input.wiki || trend.observations < 4) gaps.push(text('There is not enough monthly public-interest history to infer a reliable direction.', 'سابقه ماهانه توجه عمومی برای تشخیص جهت قابل اعتماد کافی نیست.'));
  if (sourceQuality.undatedItems > 0) gaps.push(text('Some source items have no publication date.', 'تاریخ انتشار بعضی منابع مشخص نیست.'));
  if (sourceQuality.staleItems > 0) gaps.push(text('Some source items are older than 90 days.', 'بعضی منابع بیش از ۹۰ روز قدمت دارند.'));
  const followUpQueries = (fa ? [
    ...(sourceQuality.independentPublishers < 2 ? [topic + ' منبع اولیه مستقل'] : []),
    ...(!input.wiki || trend.observations < 4 ? [topic + ' سابقه ماهانه توجه عمومی'] : []),
    ...(matchedNews.length ? [topic + ' محدودیت‌های روش‌شناسی'] : [topic + ' تازه‌ترین پژوهش رسمی']),
  ] : [
    ...(sourceQuality.independentPublishers < 2 ? [topic + ' independent primary source'] : []),
    ...(!input.wiki || trend.observations < 4 ? [topic + ' monthly interest history'] : []),
    ...(matchedNews.length ? [topic + ' methodology limitations'] : [topic + ' latest official research']),
  ]).slice(0, 4);
  const topicConceptTerms = new Set(tokenizeResearchText(topic));
  const conceptSourceGroups = new Map<string, Set<string>>();
  for (const entry of matchedNews) {
    const sourceGroup = entry.item.sourceId || entry.item.sourceName || entry.item.sourceUrl;
    for (const term of tokenizeResearchText(entry.item.title + ' ' + entry.item.summary)) {
      if (term.length < 3 || topicConceptTerms.has(term)) continue;
      const groups = conceptSourceGroups.get(term) ?? new Set<string>();
      groups.add(sourceGroup);
      conceptSourceGroups.set(term, groups);
    }
  }
  const sharedConcepts = [...conceptSourceGroups.entries()]
    .filter(([, groups]) => groups.size >= 2)
    .map(([term]) => term)
    .slice(0, 6);
  const potentialContradictions: string[] = (input.priorMemory?.contradictions ?? []).slice(0, 2).map((item) => {
    const detail = item.replace(/^(Previously unresolved discrepancy: |اختلاف حل‌نشده در تحقیق قبلی: )/, '');
    return text('Previously unresolved discrepancy: ' + detail, 'اختلاف حل‌نشده در تحقیق قبلی: ' + detail);
  });
  const numericClaims = news.map((item) => {
    const values = [...item.title.matchAll(/(\d+(?:[.,]\d+)?)\s*(%|km|miles?|years?|days?|hours?)/gi)]
      .map((match) => ({ value: Number(match[1].replace(',', '.')), unit: match[2].toLowerCase() }));
    return { item, values };
  }).filter((entry) => entry.values.length);
  for (let i = 0; i < numericClaims.length; i++) {
    for (let j = i + 1; j < numericClaims.length; j++) {
      const a = numericClaims[i];
      const b = numericClaims[j];
      if (topicRelevanceScore(a.item.title, b.item.title) < 3) continue;
      const conflict = a.values.some((left) => b.values.some((right) =>
        left.unit === right.unit && left.value !== right.value));
      if (conflict) potentialContradictions.push(text('Similar source headlines contain different numeric claims; verify the original reports and measurement context before combining them.', 'تیترهای مشابه در منابع مختلف اعداد متفاوتی دارند؛ پیش از ترکیب، گزارش‌های اصلی و زمینه اندازه‌گیری را بررسی کن.'));
      if (potentialContradictions.length >= 4) break;
    }
    if (potentialContradictions.length >= 4) break;
  }
  for (const current of numericClaims) {
    for (const previous of input.priorMemory?.sources ?? []) {
      if (topicRelevanceScore(previous.title, current.item.title) < 4) continue;
      const previousValues = [...previous.title.matchAll(/(\d+(?:[.,]\d+)?)\s*(%|km|miles?|years?|days?|hours?)/gi)]
        .map((match) => ({ value: Number(match[1].replace(',', '.')), unit: match[2].toLowerCase() }));
      const differs = current.values.some((left) => previousValues.some((right) =>
        left.unit === right.unit && left.value !== right.value));
      if (differs) {
        potentialContradictions.push(text(
          'A newly retrieved headline differs numerically from a similar headline in saved research memory. Check dates, units and measurement context before deciding that the sources conflict.',
          'یک تیتر تازه از نظر عددی با تیتر مشابه در حافظه تحقیق قبلی تفاوت دارد. پیش از نتیجه‌گیری درباره تناقض، تاریخ، واحد و زمینه اندازه‌گیری را بررسی کن.',
        ));
        break;
      }
    }
    if (potentialContradictions.length >= 4) break;
  }
  const selfEvaluation = {
    inputNewsCount: originalNews.length,
    uniqueNewsCount: allNews.length,
    topicMatchedNewsCount: matchedNews.length,
    unmatchedNewsCount: Math.max(0, allNews.length - matchedNews.length),
    duplicateNewsMerged: deduplicated.duplicatesMerged,
    independentPublisherFamilies: sourceQuality.independentPublishers,
    undatedNewsCount: sourceQuality.undatedItems,
    staleNewsCount: sourceQuality.staleItems,
    youtubeSampleCount: youtubeSample.length,
    youtubeRawSampleReceived: youtubeSample.length > 0,
    matchedVideoCount: recentMatchedVideoCount,
    allTimeMatchedVideoCount: videos.length,
    recentMatchedVideoCount,
    outsideVideoWindowCount: Math.max(0, inputVideos.length - recentVideoCandidates.length),
    futureDatedVideoCount: inputVideos.filter((video) => Date.parse(video.publishedAt) > now + 86400000).length,
    recentVideoCandidateCount: recentVideoCandidates.length,
    excludedVideoCount: Math.max(0, inputVideos.length - videos.length),
    videoViewCountsAvailable: views.length,
    videoWindowDays,
    wikimediaMonthlyObservations: trend.observations,
    openResearchQuestionCount: gaps.length + verificationQuestions.length,
    contradictionWarningCount: potentialContradictions.length,
    entityCandidateCount: entityCandidates.length,
    coMentionRelationCount: entityRelations.length,
    emergentConceptCount: emergentConcepts.length,
    conceptRelationCount: conceptRelations.length,
    processingMs: Math.max(0, Date.now() - startedAt),
    limitations: [...gaps],
  };
  const paradigms = buildMultiParadigmAnalysis({
    topic,
    news: matchedNews.map(({ item }) => ({
      title: item.title,
      summary: item.summary,
      sourceName: item.sourceName,
      sourceId: item.sourceId,
      publishedAt: item.publishedAt,
    })),
    videos: videos.map((video) => ({
      id: video.id,
      title: video.title,
      channel: video.channel,
      publishedAt: video.publishedAt,
      viewsPerHour: video.growth?.status === 'measured' ? video.growth.viewsPerHour : null,
      channelOutlierRatio: video.growth?.status === 'measured' ? video.growth.channelOutlierRatio : null,
    })),
    wikiObservations: input.wiki?.monthlyViews ?? [],
    trend,
    independentPublisherFamilies: matchedSourceQuality.independentPublishers,
    undatedPublisherItems: matchedSourceQuality.undatedItems,
    stalePublisherItems: matchedSourceQuality.staleItems,
    entities: entityCandidates,
    relations: entityRelations,
    gaps,
    contradictions: potentialContradictions,
    now,
    language: input.language,
  });
  const intelligence = {
    sourceQuality,
    trend,
    confidence,
    gaps,
    followUpQueries,
    sharedConcepts,
    potentialContradictions,
    selfEvaluation,
    paradigms,
    scenarios: fa ? [
      'سناریوی مشروط اول: اگر جهت اخیر ادامه پیدا کند، میزان توجه ممکن است نزدیک محدوده فعلی بماند؛ این پیش‌بینی قطعی نیست.',
      'سناریوی مشروط دوم: اگر فعالیت به میانگین قبلی برگردد، تغییر اخیر ممکن است پایدار نماند.',
      'سناریوی مشروط سوم: اگر جهت سری زمانی عوض شود، نباید الگوی فعلی را به آینده تعمیم داد.',
    ].slice(0, trend.scenarios.length) : trend.scenarios,
  };
  return { topic, entityCandidates, entityRelations, emergentConcepts, conceptRelations, summary, evidence, angles, verificationQuestions, limitations: limitationsList, intelligence };
}
export function buildIdeas(_report: Report, _language: 'fa' | 'en' = 'en'): Idea[] {
  // This legacy helper receives only a Report, which has raw YouTube records but no
  // independent publisher/web evidence. It must not fabricate source-backed ideas.
  return [];
}
export function reasoning(_idea: Idea, _observedVideoCount = 0, language: 'fa' | 'en' = 'en') {
  return language === 'fa'
    ? 'سیگنال‌های YouTube برای کشف زاویه و فرصت پلتفرمی به‌کار می‌روند، اما جای سند مستقل یا تأیید علمی را نمی‌گیرند. وضعیت پژوهش و اولویت تحریری جداگانه بررسی می‌شوند.'
    : 'YouTube signals help discover platform opportunities, but they are not independent documentary evidence or scientific validation. Research status and editorial priority remain separate.';
}

export type IdeaAnalysisSection = {
  id: string;
  title: string;
  body: string;
  items?: string[];
};

/**
 * A local editorial checklist from a saved Idea and already-linked local video
 * references. It performs no network, storage or AI calls and does not infer
 * demand, competition, growth or performance.
 */
export function buildIdeaAnalysis(
  idea: Idea,
  _relatedVideos: readonly Pick<YouTubeSampleVideo, 'id' | 'title' | 'channel' | 'publishedAt'>[],
  language: 'fa' | 'en' = 'en',
): IdeaAnalysisSection[] {
  const fa = language === 'fa';
  const concept = idea.concept.trim();
  const sources = (idea.evidenceSources ?? []).slice(0, 8);
  const sourceItems = sources.map((source) => source.sourceName + ' · ' + source.title);
  const gaps: string[] = [];
  if (idea.researchStatus === 'contested') gaps.push(fa
    ? 'پرونده تحقیق برای این ایده شواهد مخالف یا متناقض ثبت کرده است؛ پیش از تولید، اختلاف‌ها را صریح و با منابع نشان بده.'
    : 'The research dossier records counterevidence or conflicting evidence for this idea; disclose and examine the disagreement before production.');
  if (idea.researchStatus === 'unverified' || idea.researchStatus === 'not-reviewed') gaps.push(fa
    ? 'این ایده هنوز از نظر علمی تأیید نشده است؛ امتیاز فرصت تحریری را با اعتبار علمی اشتباه نگیر.'
    : 'This idea has not been scientifically validated yet; do not confuse editorial opportunity priority with evidence confidence.');
  // A YouTube URL is a platform observation, not an independent publisher/web source.
  if (!sources.length) gaps.push(fa
    ? 'هنوز منبع مستقل ناشر یا وب به این ایده پیوند نشده است؛ پیش از تولید، یک سند اولیه معتبر پیدا کن.'
    : 'No independent publisher or web source is attached to this idea yet; find a credible primary document before production.');
  if (!concept) gaps.push(fa
    ? 'مفهوم ویدئو تعریف نشده است؛ پرسش مرکزی و چیزی را که مخاطب یاد می‌گیرد مشخص کن.'
    : 'The video concept is not defined; specify the central question and viewer takeaway.');
  if (!idea.decision.trim()) gaps.push(fa
    ? 'معیار تصمیم شخصی هنوز ثبت نشده است؛ مشخص کن چه نتیجه‌ای این ایده را ارزشمند یا نامناسب می‌کند.'
    : 'No personal decision criterion is recorded; define what would make this idea worth pursuing or rejecting.');
  const evidenceBody = sources.length
    ? (fa
        ? sources.length + ' منبع مستقل ناشر، وب یا دانشنامه‌ای به ایده پیوند شده است. این پیوندها مسیر بررسی ادعاها را نشان می‌دهند، اما به‌تنهایی راستی‌آزمایی یا اثبات تقاضای مخاطب نیستند.'
        : sources.length + ' independent publisher, web or encyclopedia source(s) are linked to this idea. They support source tracing but do not by themselves verify every claim or prove audience demand.')
    : (fa
        ? 'هیچ منبع مستقلی به ایده پیوند نشده است. داده خام YouTube جداگانه نمایش داده می‌شود و در این تحلیل یا امتیاز دخالت ندارد.'
        : 'No independent source is linked to this idea. Raw YouTube API data is displayed separately and is not used in this analysis or any score.');
  const nextSteps = fa
    ? [
        '۱. پرسش مرکزی و وعده آموزشی ایده را در یک جمله دقیق بنویس.',
        sources.length ? '۲. ادعاهای اصلی را در منابع مستقل پیوندشده و اسناد اولیه بررسی کن.' : '۲. یک مقاله، اطلاعیه یا سند اولیه معتبر پیدا و به ایده پیوند بده.',
        '۳. ادعاهای منابع را از تفسیر خودت جدا کن و اختلاف یا خلأ شواهد را مشخص کن.',
        '۴. مخاطب هدف و دلیل مفید بودن این توضیح برای او را تعریف کن.',
      ]
    : [
        '1. State the central question and viewer takeaway in one precise sentence.',
        sources.length ? '2. Check the main claims against the linked independent sources and their primary documents.' : '2. Find a credible original paper, official release or primary document and attach it to the idea.',
        '3. Separate source claims from your interpretation and note any evidence gaps or contradictions.',
        '4. Define the intended audience and why this explanation helps them.',
      ];
  const framing = concept
    ? (fa
        ? 'مبنای تحلیل، مفهوم ثبت‌شده کاربر است: «' + concept.slice(0, 900) + '». اعتبار ادعاها باید جداگانه با منابع مستقل سنجیده شود.'
        : 'The analysis starts from the saved concept: “' + concept.slice(0, 900) + '”. Factual claims still need independent source verification.')
    : (fa ? 'برای این ایده هنوز توضیح محتوایی ثبت نشده است.' : 'No editorial concept is saved for this idea yet.');
  return [
    { id: 'core-framing', title: fa ? 'هسته ایده و زاویه فعلی' : 'Core idea and current angle', body: framing },
    { id: 'evidence-review', title: fa ? 'منابع مستقل پیوندشده' : 'Linked independent sources', body: evidenceBody, ...(sourceItems.length ? { items: sourceItems } : {}) },
    { id: 'research-gaps', title: fa ? 'چه چیزهایی هنوز ثابت نشده‌اند؟' : 'What remains unproven?', body: gaps.length ? gaps.map((gap) => '• ' + gap).join('\n') : (fa ? 'خلأ آشکار دیگری در داده‌های منبع ثبت‌شده دیده نشد؛ این به معنی راستی‌آزمایی کامل نیست.' : 'No additional gap was identified in the saved source data; this does not mean the idea is fully verified.') },
    { id: 'next-actions', title: fa ? 'اقدام‌های پیشنهادی برای پیشبرد ایده' : 'Practical next steps', body: nextSteps.join('\n') },
  ];
}
