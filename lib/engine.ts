import { type Report, type Idea, type ResearchMemoryEntry, uid } from './types';
import type { WikiSignal } from './space';
import type { YouTubeSampleVideo } from './api';
import {
  analyzeMonthlyViews,
  analyzeSourceQuality,
  deduplicateResearchEvidence,
  rankResearchEvidence,
  scoreResearchText,
  matchesResearchTerms,
  tokenizeResearchText,
  type ResearchFeedbackProfile,
} from './intelligence';

export const limitations =
  'This is a limited YouTube search sample, not a real-time trend report. Region controls availability, not audience location. Language is a relevance hint, not a strict language filter. Search ordering is supplied by YouTube. No demand, growth, competition score, or viral prediction is inferred.';

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
  videos?: readonly Pick<
    YouTubeSampleVideo,
    'id' | 'title' | 'channel' | 'publishedAt' | 'viewCount' | 'likeCount'
  >[];
  feedback?: ResearchFeedbackProfile;
  language?: 'fa' | 'en';
  priorMemory?: ResearchMemoryEntry;
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
    selfEvaluation: {
      inputNewsCount: number;
      uniqueNewsCount: number;
      topicMatchedNewsCount: number;
      duplicateNewsMerged: number;
      independentPublisherFamilies: number;
      undatedNewsCount: number;
      staleNewsCount: number;
      youtubeSampleCount: number;
      wikimediaMonthlyObservations: number;
      openResearchQuestionCount: number;
      contradictionWarningCount: number;
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
  const topic = cleanTopic(input.topic);
  const fa = input.language === 'fa';
  const text = (english: string, persian: string) => fa ? persian : english;
  const originalNews = [...(input.news ?? [])];
  const deduplicated = deduplicateResearchEvidence(originalNews);
  const allNews = deduplicated.items;
  const rankedNews = allNews
    .map((item, index) => {
      let score = topicRelevanceScore(topic, item.title, item.summary);
      if (input.feedback?.positiveTopics.some((term) => matchesResearchTerms(item.title + ' ' + item.summary, [term]))) score += 1;
      if (input.feedback?.negativeTopics.some((term) => matchesResearchTerms(item.title + ' ' + item.summary, [term]))) score -= 2;
      return { item, index, score };
    })
    .sort((a, b) => b.score - a.score ||
      (b.item.publishedAt ? Date.parse(b.item.publishedAt) : 0) -
      (a.item.publishedAt ? Date.parse(a.item.publishedAt) : 0) || a.index - b.index);
  const matchedNews = rankedNews.filter((entry) => entry.score > 0);
  const news = (matchedNews.length ? matchedNews : rankedNews).slice(0, 12).map((entry) => entry.item);
  const publisherNames = [...new Set(news.flatMap((item) =>
    item.sourceName.split('·').map((name) => name.trim()).filter(Boolean)))];
  const declaredPublisherCount = Math.max(0, ...news.map((item) => item.sourceCount ?? 0));
  const publisherCount = Math.max(publisherNames.length, declaredPublisherCount);

  const videos = [...new Map((input.videos ?? []).map((video) => [video.id, video])).values()];
  const rankedVideos = videos.map((video, index) => ({
    video, index, score: topicRelevanceScore(topic, video.title),
  })).sort((a, b) => b.score - a.score ||
    (b.video.viewCount ?? -1) - (a.video.viewCount ?? -1) ||
    (b.video.likeCount ?? -1) - (a.video.likeCount ?? -1) || a.index - b.index);
  const channelCount = new Set(videos.map((video) => video.channel)).size;
  const views = videos.map((video) => video.viewCount).filter((value): value is number => value != null);
  const likes = videos.map((video) => video.likeCount).filter((value): value is number => value != null);
  const mostViewed = [...videos].filter((video) => video.viewCount != null)
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))[0];
  const mostLiked = [...videos].filter((video) => video.likeCount != null)
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))[0];

  const evidence: InternalEngineEvidence[] = [];
  if (news.length) {
    const newest = [...news].sort((a, b) =>
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
      detail: text('No selected official RSS item was supplied to this analysis. Verify the original publisher before presenting a factual claim.', 'هیچ خبر رسمی از خوراک‌های انتخاب‌شده به این تحلیل نرسیده است. پیش از بیان ادعای واقعی، ناشر اصلی را بررسی کنید.')
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
      label: 'YouTube sample',
      detail: text('No YouTube sample was supplied. Competition has not been checked and no YouTube quota was used by this local analysis.', 'نمونه‌ای از یوتیوب ارائه نشده است. رقابت بررسی نشده و این تحلیل محلی هیچ سهمیه‌ای از یوتیوب مصرف نکرده است.')
    });
  }

  const topicTerms = new Set(tokenizeResearchText(topic));
  const newsTerms = new Set(news.slice(0, 6).flatMap((item) => tokenizeResearchText(item.title)));
  const topicalVideos = rankedVideos.filter((entry) => entry.score > 0);
  const videoTerms = new Set(topicalVideos.slice(0, 12).flatMap((entry) => tokenizeResearchText(entry.video.title)));
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
      title: text('What the latest source actually establishes', 'آخرین منبع دقیقاً چه چیزی را ثابت می‌کند؟') ,
      hook: newestNews
        ? 'با گزارش دقیق منبع شروع کن: «' + newestNews.title + '». ناشر چه چیزی را مشاهده کرده و کدام بخش هنوز تفسیر است؟'
        : 'برای تبدیل ' + topic + ' به یک ویدئوی مستند، ابتدا به یک مشاهده یا سند اولیه نیاز است.',
      approach: newestNews
        ? 'شروع روایت را بر گزارش پیوندشده و تاریخ آن بنا کن. نتیجه اندازه‌گیری‌شده را از تفسیر و پیش‌بینی جدا کن و عددی فراتر از منبع اضافه نکن.'
        : 'پیش از نگارش، صفحه مأموریت، مقاله یا اطلاعیه رسمی را پیدا کن و مشاهده مستقیم، تاریخ و روش آن را مشخص کن.',
      verification: text('Can each factual sentence be traced to the linked primary source or a cited paper?', 'آیا می‌توان هر جمله واقعی را به منبع اولیه پیوندشده یا مقاله ارجاع‌شده ردیابی کرد؟'),
    },
    {
      id: 'youtube-sample',
      title: text(bestVideo ? 'What the returned YouTube sample emphasizes' : 'How to test audience-facing explanations', bestVideo ? 'نمونه یوتیوب دریافت‌شده بر چه چیزی تأکید دارد؟' : 'چگونه توضیح مناسب مخاطب را آزمایش کنیم؟'),
      hook: bestVideo
        ? 'یکی از نمونه‌های دریافت‌شده «' + bestVideo.title + '» است. این عنوان چه وعده‌ای می‌دهد و چه توضیح مفیدتری می‌توان به آن افزود؟'
        : 'چه نوع توضیحی می‌تواند ' + topic + ' را برای مخاطبی که با موضوع آشنا نیست قابل فهم کند؟',
      approach: bestVideo
        ? 'عنوان، تاریخ انتشار و آمار خام بازدید و پسند نمونه‌های مرتبط را بررسی کن. وعده هر عنوان را با شواهد منبع بسنج. این‌ها نمونه‌اند، نه فهرست کامل رقبا.'
        : 'با بررسی دستی مجموعه‌ای از ویدئوهای مرتبط، پرسش‌ها و قالب‌هایی را که از قبل پوشش داده شده‌اند مشخص کن.',
      verification: text('Is the returned sample large and relevant enough for the comparison being made? What is still missing?', 'آیا نمونه دریافت‌شده برای این مقایسه به‌اندازه کافی بزرگ و مرتبط است؟ چه چیزی هنوز کم است؟'),
    },
    {
      id: 'open-question',
      title: text('The most important unanswered question', 'مهم‌ترین پرسش بی‌پاسخ'),
      hook: 'شاید بهترین زاویهٔ اصیل، بخشی از ' + topic + ' باشد که منابع موجود هنوز پاسخی برای آن ندارند.',
      approach: sharedTerms.length
        ? 'تیتر ناشران و عنوان ویدئوها در این واژه‌ها هم‌پوشانی دارند: ' + sharedTerms.slice(0, 4).join('، ') + '؛ فراتر از واژه‌های تکراری برو و سازوکار، عدم‌قطعیت یا اندازه‌گیری حل‌نشده را پیدا کن.'
        : 'سازوکار حل‌نشده، تفسیرهای رقیب یا اندازه‌گیری مفقود را پیدا کن و پرسش علمی باز را از گمانه‌زنی جدا نگه دار.',
      verification: text('Which uncertainty is explicitly acknowledged by the publisher or cited paper, and what evidence could resolve it?', 'ناشر یا مقاله ارجاع‌شده کدام عدم‌قطعیت را صریحاً پذیرفته و چه مدرکی می‌تواند آن را روشن کند؟'),
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
      'زاویه‌های محتوایی فرضیه‌اند، نه یافته علمی و نه پیش‌بینی بازدید، رشد یا وایرال شدن.',
      'پوشش خبری ناشران، بازدید مقاله‌های ویکی‌مدیا و نمونه یوتیوب سیگنال‌های جداگانه‌اند و نباید در یک امتیاز ترکیبی ادغام شوند.',
    ] : [
      'This engine runs locally on evidence already loaded in the app; it does not fetch new sources.',
      'Editorial angles are hypotheses, not scientific findings or predictions of views, growth or virality.',
      'Publisher feed coverage, Wikimedia article pageviews and YouTube samples are separate signals and must not be combined into a score.',
    ]),
    ...(matchedNews.length < news.length && news.length
      ? [text('Some supplied publisher items had no direct keyword overlap with the topic; treat them as broad context, not confirmed topic matches.', 'برخی گزارش‌های ناشر با واژه‌های موضوع تطبیق مستقیم نداشتند؛ آن‌ها را زمینه عمومی بدان، نه تطبیق قطعی با موضوع.')]
      : []),
    ...(!news.length && !input.wiki && !videos.length
      ? [text('No source evidence was supplied. Treat all angles as starting questions only.', 'هیچ شاهد منبعی ارائه نشده است؛ همه زاویه‌ها را فقط پرسش‌های آغازین در نظر بگیر.')]
      : []),
  ];
  const summaryParts: string[] = [];
  if (news.length) summaryParts.push(fa
    ? news.length + ' گزارش ناشر بررسی شد؛ ' + matchedNews.length + ' مورد از نظر واژگان مستقیماً با موضوع تطبیق داشتند و در ' + publisherCount + ' خوراک منبع حضور داشتند.'
    : news.length + ' publisher report(s) were inspected; ' + matchedNews.length + ' matched the topic wording directly across ' + publisherCount + ' selected feed source(s).');
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

  const sourceQuality = analyzeSourceQuality(allNews, deduplicated.duplicatesMerged);
  const trend = analyzeMonthlyViews(input.wiki?.monthlyViews ?? []);
  const evidenceTypes = Number(news.length > 0) + Number(Boolean(input.wiki)) + Number(videos.length > 0);
  const confidence: InternalResearchResult['intelligence']['confidence'] =
    evidenceTypes >= 3 && sourceQuality.independentPublishers >= 2 && trend.observations >= 4 && videos.length >= 3
      ? { level: 'high', reason: text('Several different evidence types are available, with multiple publisher families and a usable monthly series. This is still sample-scoped.', 'چند نوع شاهد، چند گروه مستقل ناشر و یک سری زمانی ماهانه قابل استفاده موجود است؛ بااین‌حال نتیجه همچنان محدود به همین نمونه است.') }
      : evidenceTypes >= 2 && (sourceQuality.independentPublishers >= 2 || trend.observations >= 4 || videos.length >= 3)
        ? { level: 'moderate', reason: text('More than one evidence type is available, but source independence, sample size or historical depth is incomplete.', 'بیش از یک نوع شاهد در دسترس است، اما استقلال منابع، اندازه نمونه یا عمق داده تاریخی هنوز کامل نیست.') }
        : { level: 'low', reason: text('The current evidence is limited in source diversity, sample size or historical depth.', 'شواهد فعلی از نظر تنوع منابع، اندازه نمونه یا عمق تاریخی محدود است.') };
  const gaps: string[] = [];
  if (!matchedNews.length) gaps.push(text('No direct publisher headline matched the requested topic.', 'هیچ تیتر مستقیمی از ناشران با موضوع درخواستی تطبیق نداشت.'));
  if (sourceQuality.independentPublishers < 2) gaps.push(text('Independent publisher confirmation is limited.', 'تأیید از سوی ناشران مستقل محدود است.'));
  if (!input.wiki || trend.observations < 4) gaps.push(text('There is not enough monthly public-interest history to infer a reliable direction.', 'سابقه ماهانه توجه عمومی برای تشخیص جهت قابل اعتماد کافی نیست.'));
  if (videos.length < 3) gaps.push(text('The YouTube sample is too small for a robust comparison.', 'نمونه یوتیوب برای مقایسه قابل اتکا کوچک است.'));
  if (sourceQuality.undatedItems > 0) gaps.push(text('Some source items have no publication date.', 'تاریخ انتشار بعضی منابع مشخص نیست.'));
  if (sourceQuality.staleItems > 0) gaps.push(text('Some source items are older than 90 days.', 'بعضی منابع بیش از ۹۰ روز قدمت دارند.'));
  const followUpQueries = (fa ? [
    ...(sourceQuality.independentPublishers < 2 ? [topic + ' منبع اولیه مستقل'] : []),
    ...(!input.wiki || trend.observations < 4 ? [topic + ' سابقه ماهانه توجه عمومی'] : []),
    ...(videos.length < 3 ? [topic + ' نمونه‌های یوتیوب'] : []),
    ...(matchedNews.length ? [topic + ' محدودیت‌های روش‌شناسی'] : [topic + ' تازه‌ترین پژوهش رسمی']),
  ] : [
    ...(sourceQuality.independentPublishers < 2 ? [topic + ' independent primary source'] : []),
    ...(!input.wiki || trend.observations < 4 ? [topic + ' monthly interest history'] : []),
    ...(videos.length < 3 ? [topic + ' YouTube examples'] : []),
    ...(matchedNews.length ? [topic + ' methodology limitations'] : [topic + ' latest official research']),
  ]).slice(0, 4);
  const topicConceptTerms = new Set(tokenizeResearchText(topic));
  const publisherConceptTerms = new Set(news.slice(0, 8).flatMap((item) => tokenizeResearchText(item.title)));
  const videoConceptTerms = new Set(topicalVideos.slice(0, 12).flatMap((entry) => tokenizeResearchText(entry.video.title)));
  const sharedConcepts = [...publisherConceptTerms]
    .filter((term) => videoConceptTerms.has(term) && !topicConceptTerms.has(term))
    .slice(0, 6);
  const potentialContradictions: string[] = (input.priorMemory?.contradictions ?? []).slice(0, 2).map((item) => {
    const detail = item.replace(/^(Previously unresolved discrepancy: |اختلاف حل‌نشده در تحقیق قبلی: )/, '');
    return text('Previously unresolved discrepancy: ' + detail, 'اختلاف حل‌نشده در تحقیق قبلی: ' + detail);
  });
  const numericClaims = originalNews.map((item) => {
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
    duplicateNewsMerged: deduplicated.duplicatesMerged,
    independentPublisherFamilies: sourceQuality.independentPublishers,
    undatedNewsCount: sourceQuality.undatedItems,
    staleNewsCount: sourceQuality.staleItems,
    youtubeSampleCount: videos.length,
    wikimediaMonthlyObservations: trend.observations,
    openResearchQuestionCount: gaps.length + verificationQuestions.length,
    contradictionWarningCount: potentialContradictions.length,
    limitations: [...gaps],
  };
  const intelligence = {
    sourceQuality,
    trend,
    confidence,
    gaps,
    followUpQueries,
    sharedConcepts,
    potentialContradictions,
    selfEvaluation,
    scenarios: fa ? [
      'سناریوی مشروط اول: اگر جهت اخیر ادامه پیدا کند، میزان توجه ممکن است نزدیک محدوده فعلی بماند؛ این پیش‌بینی قطعی نیست.',
      'سناریوی مشروط دوم: اگر فعالیت به میانگین قبلی برگردد، تغییر اخیر ممکن است پایدار نماند.',
      'سناریوی مشروط سوم: اگر جهت سری زمانی عوض شود، نباید الگوی فعلی را به آینده تعمیم داد.',
    ].slice(0, trend.scenarios.length) : trend.scenarios,
  };
  return { topic, summary, evidence, angles, verificationQuestions, limitations: limitationsList, intelligence };
}
function matchedVideos(report: Report, queries: readonly string[]) {
  const expected = new Set(queries.map((query) => query.trim().toLowerCase()));
  return report.videos.filter((video) => expected.has(video.query.trim().toLowerCase()));
}

/** Turns query buckets from a real manual search into evidence-linked ideas. */
export function buildIdeas(report: Report, language: 'fa' | 'en' = 'en'): Idea[] {
  const fa = language === 'fa';
  const topic = cleanTopic(report.input.topic);
  const angleDefinitions = [
    {
      suffix: fa ? 'نمونه‌های فعلی چه چیزی نشان می‌دهند' : 'What current examples show',
      queries: [report.input.topic, 'YouTube popularity order', 'YouTube recent results'],
      concept: fa
        ? 'از نمونه‌های دریافت‌شده برای توضیح محدوده نتایج فعلی استفاده کن. تحلیل و توضیح مستقلی اضافه کن و روشن نگه دار که این فقط یک نمونه محدود از جست‌وجو است.'
        : 'Use the returned examples as reference points for explaining what the current sample covers. Add an original explanation and make clear that this is only a limited search sample.',
    },
    {
      suffix: fa ? 'توضیح روشن برای تازه‌کارها' : 'A clear beginner explanation',
      queries: [report.input.topic + ' explained'],
      concept: fa
        ? 'توضیحی قابل فهم برای تازه‌کارها درباره ' + topic + ' بساز. اصطلاحات ضروری را تعریف کن، یک سازوکار اصلی را توضیح بده و هر ادعای علمی را با منبع اولیه تطبیق بده.'
        : 'Build a beginner-friendly explanation of ' + topic + '. Define essential terms, explain one central mechanism and verify each scientific statement against a primary source.',
    },
    {
      suffix: fa ? 'نمونه‌های تازه‌منتشرشده چه چیزی اضافه می‌کنند' : 'What recently published examples add',
      queries: ['YouTube recent results'],
      concept: fa
        ? 'مقایسه‌ای متمرکز درباره ' + topic + ' طراحی کن. معیارهای مقایسه را ثابت نگه دار و هر ادعای واقعی را بررسی کن؛ نمونه محدود را نماینده کل موضوع فرض نکن.'
        : 'Develop a focused comparison around ' + topic + '. State what is being compared, keep the criteria consistent and verify every factual claim rather than assuming the sample represents the whole topic.',
    },
    {
      suffix: fa ? 'مقایسه‌ای که ارزش راستی‌آزمایی دارد' : 'A comparison worth verifying',
      queries: [],
      concept: fa
        ? 'فقط در صورتی یک ادعای پرتکرار درباره ' + topic + ' را انتخاب کن که منبع معتبری آن را ثبت کرده باشد. ادعا را با شواهد اولیه بسنج و از ساختن افسانه یا ادعای بی‌پشتوانه پرهیز کن.'
        : 'Choose one commonly repeated claim about ' + topic + ' only if a reliable source documents it. Test the claim against primary evidence, explain what is accurate or incomplete, and do not invent a myth if none is supported.',
    },
  ];

  return angleDefinitions.map((angle): Idea => {
    const related = matchedVideos(report, angle.queries);
    const hasExamples = related.length > 0;
    return {
      id: uid(),
      topic: topic + ' · ' + angle.suffix,
      concept: angle.concept,
      note: hasExamples
        ? fa
          ? 'موتور داخلی ' + related.length + ' نمونه ویدئوی دریافت‌شده را به این زاویه مرتبط کرده است. این نمونه‌ها شواهد محدود جست‌وجو هستند و تقاضا یا رقابت پایین را ثابت نمی‌کنند.'
          : 'Internal engine linked ' + related.length + ' returned sample video(s) to this angle. Examples remain limited search evidence, not proof of demand or low competition.'
        : fa
          ? 'نمونه مستقیمی برای این زاویه دریافت نشد. آن را یک فرضیه محتوایی بدان و پیش از اولویت‌بندی اعتبارسنجی کن.'
          : 'No directly matching sample was returned for this angle. Treat it as an editorial hypothesis and validate it before prioritizing.',
      status: 'New Discoveries',
      decision: '',
      videoIds: related.map((video) => video.id),
      imageUrl: related.find((video) => Boolean(video.thumbnail))?.thumbnail,
      createdAt: Date.now(),
      archived: false,
      assessment: hasExamples ? 'Worth Exploring' : 'Uncertain',
      region: report.input.region,
      languages: report.input.languages,
      reportId: report.id,
    };
  });
}

export function reasoning(idea: Idea, observedVideoCount = idea.videoIds.length, language: 'fa' | 'en' = 'en') {
  if (language === 'fa') {
    if (observedVideoCount <= 0) {
      return 'در حال حاضر نمونه ویدئوی مرتبطی به این ایده پیوند داده نشده است. این مورد یک فرضیه محتوایی است؛ پیش از اولویت‌بندی، شواهد بیشتری گردآوری کن.';
    }
    return 'موتور داخلی ' + observedVideoCount + ' نمونه ویدئوی دریافت‌شده را به این ایده مرتبط کرده است. این نمونه‌ها فقط نقاط مرجع‌اند و تقاضای مخاطب، رقابت پایین یا رشد آینده را ثابت نمی‌کنند.';
  }
  if (observedVideoCount <= 0) {
    return 'No currently available related YouTube examples are linked to this idea. It remains an editorial hypothesis; gather evidence before prioritizing it.';
  }
  return 'The internal engine linked ' + observedVideoCount +
    ' returned sample video example(s) to this idea. They are reference points only—not proof of audience demand, low competition or future growth.';
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
  relatedVideos: readonly Pick<YouTubeSampleVideo, 'id' | 'title' | 'channel' | 'publishedAt'>[],
  language: 'fa' | 'en' = 'en',
): IdeaAnalysisSection[] {
  const fa = language === 'fa';
  const topic = idea.topic.trim();
  const concept = idea.concept.trim();
  const matched = relatedVideos
    .map((video, index) => ({ video, index, relevance: scoreResearchText(topic, video.title) }))
    .filter((entry) => entry.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || a.index - b.index)
    .slice(0, 5);
  const channels = new Set(matched.map((entry) => entry.video.channel).filter(Boolean));
  const gaps: string[] = [];
  if (!idea.sourceUrl?.trim()) gaps.push(fa
    ? 'هنوز پیوندی به منبع اولیه برای این ایده ذخیره نشده است؛ ادعاهای واقعی را پیش از تولید با سند اصلی تطبیق بده.'
    : 'No primary-source link is attached to this idea yet; verify factual claims against an original document before production.');
  if (!concept) gaps.push(fa
    ? 'مفهوم ویدئو تعریف نشده است؛ پرسش مرکزی، چیزی که مخاطب یاد می‌گیرد و زاویه متمایز را مشخص کن.'
    : 'The video concept is not defined; specify the central question, viewer takeaway and distinctive angle.');
  if (matched.length < 3) gaps.push(fa
    ? 'کمتر از سه نمونه مرتبطِ ذخیره‌شده در داده‌های محلی پیدا شد؛ برای مقایسه، نمونه بیشتری با جست‌وجوی دستی جمع‌آوری کن.'
    : 'Fewer than three relevant saved examples were found in local data; gather more through manual search before drawing comparisons.');
  if (matched.length > 0 && channels.size < 2) gaps.push(fa
    ? 'نمونه‌های مرتبط فعلی از کانال‌های متمایز کافی نیستند؛ مقایسه به نمونه‌هایی از سازندگان مختلف نیاز دارد.'
    : 'The current relevant sample does not span multiple channels; a broader comparison needs examples from distinct creators.');
  if (!idea.decision.trim()) gaps.push(fa
    ? 'معیار تصمیم شخصی هنوز ثبت نشده است؛ مشخص کن چه نتیجه‌ای این ایده را ارزشمند یا نامناسب می‌کند.'
    : 'No personal decision criterion is recorded; define what would make this idea worth pursuing or rejecting.');
  const evidenceBody = fa
    ? 'از ' + relatedVideos.length + ' ویدئوی پیوندخورده و موجود در داده محلی، ' + matched.length +
      ' عنوان با موضوع ایده تطبیق متنی/معنایی داشتند و این نمونه‌ها به ' + channels.size +
      ' کانال متمایز مربوط‌اند. این فقط بررسی همان نمونه ذخیره‌شده است؛ تقاضای مخاطب، سطح رقابت یا عملکرد آینده را اثبات نمی‌کند.'
    : 'Of ' + relatedVideos.length + ' linked videos currently present in local data, ' + matched.length +
      ' titles matched the idea topic using local relevance rules, across ' + channels.size +
      ' distinct channels. This describes only the saved sample; it does not prove audience demand, competition or future performance.';
  const nextSteps = fa
    ? [
        '۱. پرسش مرکزی و وعده آموزشی ایده را در یک جمله دقیق بنویس.',
        idea.sourceUrl?.trim()
          ? '۲. ادعاهای اصلی را در منبع پیوندشده و منابع اولیه ارجاعی بررسی کن.'
          : '۲. یک مقاله، اطلاعیه یا سند اولیه معتبر پیدا و به ایده پیوند بده.',
        matched.length
          ? '۳. عنوان و زاویه نمونه‌های مرتبط را با ایده خود مقایسه کن و تفاوت واقعی را مشخص کن.'
          : '۳. با جست‌وجوی دستی چند نمونه واقعاً مرتبط پیدا کن؛ نبود نمونه ذخیره‌شده به معنی نبود محتوا نیست.',
        '۴. مخاطب هدف و دلیل مفید بودن این توضیح برای او را مشخص کن؛ سپس مفهوم را با شواهد تکمیل کن.',
      ]
    : [
        '1. State the central question and viewer takeaway in one precise sentence.',
        idea.sourceUrl?.trim()
          ? '2. Check key claims against the linked source and its cited primary material.'
          : '2. Find a credible original paper, mission release or primary document and attach it to the idea.',
        matched.length
          ? '3. Compare the angles and titles of relevant saved examples, then state the genuine difference in your approach.'
          : '3. Gather a few genuinely relevant examples with manual search; an empty saved sample does not mean no videos exist.',
        '4. Define the intended audience and why this explanation helps them, then refine the concept against the evidence.',
      ];
  const framing = concept
    ? (fa
        ? 'مبنای تحلیل، مفهوم ثبت‌شده کاربر است: «' + concept.slice(0, 900) + '». این متن جهت فعلی ایده را مشخص می‌کند؛ اعتبار ادعاها باید جداگانه با منابع سنجیده شود.'
        : 'The analysis starts from the user’s saved concept: “' + concept.slice(0, 900) + '”. It defines the current direction of the idea; factual claims still need separate source verification.')
    : (fa
        ? 'برای این ایده هنوز توضیح محتوایی ثبت نشده است. تا زمان تکمیل مفهوم، نمی‌توان درباره زاویه یا ارزش تحریری آن داوری کرد.'
        : 'No editorial concept is saved for this idea. Its angle cannot be assessed until the concept is completed.');
  return [
    { id: 'core-framing', title: fa ? 'هسته ایده و زاویه فعلی' : 'Core idea and current angle', body: framing },
    {
      id: 'evidence-review',
      title: fa ? 'بررسی شواهد و نمونه‌های موجود' : 'Evidence and available examples',
      body: evidenceBody,
      ...(matched.length ? { items: matched.map((entry) => entry.video.title) } : {}),
    },
    {
      id: 'research-gaps',
      title: fa ? 'چه چیزهایی هنوز ثابت نشده‌اند؟' : 'What remains unproven?',
      body: gaps.length ? gaps.map((gap) => '• ' + gap).join('\n') : (fa
        ? 'در داده محلی فعلی، خلأ آشکار دیگری از قواعد این بررسی پیدا نشد؛ این به معنای راستی‌آزمایی کامل ایده نیست.'
        : 'No additional gap was identified by these local checks; this does not mean the idea has been fully verified.'),
    },
    {
      id: 'next-actions',
      title: fa ? 'اقدام‌های پیشنهادی برای پیشبرد ایده' : 'Practical next steps',
      body: nextSteps.join('\n'),
    },
  ];
}
