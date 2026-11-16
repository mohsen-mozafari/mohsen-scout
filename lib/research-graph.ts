import type { YouTubeSampleVideo } from './api';
import type { InternalResearchResult } from './engine';
import type { SpaceNewsItem, WikiSignal } from './space';

export type ResearchGraphGroupId = 'sources' | 'youtube' | 'context' | 'evidence' | 'findings' | 'angles';

export type ResearchGraphItem = {
  id: string;
  title: string;
  meta: string;
  detail: string;
  url?: string;
};

export type ResearchGraphGroup = {
  id: ResearchGraphGroupId;
  title: string;
  items: ResearchGraphItem[];
};

export type ResearchGraphModel = {
  topic: string;
  summary: string;
  groups: ResearchGraphGroup[];
};

export type BuildResearchGraphInput = {
  topic: string;
  news: readonly SpaceNewsItem[];
  wiki?: WikiSignal;
  videos: readonly YouTubeSampleVideo[];
  analysis: InternalResearchResult;
  language: 'fa' | 'en';
};

export function buildResearchGraphModel(input: BuildResearchGraphInput): ResearchGraphModel {
  const fa = input.language === 'fa';
  const number = (value: number) => new Intl.NumberFormat(input.language).format(value);
  const text = (english: string, persian: string) => fa ? persian : english;
  const groups: ResearchGraphGroup[] = [];

  if (input.news.length) {
    groups.push({
      id: 'sources',
      title: text('Publisher reports', 'گزارش‌های ناشران'),
      items: input.news.map((item) => ({
        id: 'source-' + item.id,
        title: item.title,
        meta: [item.sourceName, item.sourceId, item.publishedAt ?? text('Date not supplied', 'تاریخ ارائه نشده')].filter(Boolean).join(' · '),
        detail: item.summary || text('The publisher did not provide a summary for this item.', 'ناشر برای این مورد خلاصه‌ای ارائه نکرده است.'),
        url: item.url,
      })),
    });
  }

  if (input.videos.length) {
    groups.push({
      id: 'youtube',
      title: text('YouTube sample', 'نمونه یوتیوب'),
      items: input.videos.map((video) => ({
        id: 'video-' + video.id,
        title: video.title,
        meta: [video.channel, video.publishedAt].filter(Boolean).join(' · '),
        detail: [
          video.description,
          text('Raw sample statistics', 'آمار خام نمونه'),
          text('Views: ', 'بازدید: ') + (video.viewCount === null ? text('unavailable', 'ناموجود') : number(video.viewCount)),
          text('Likes: ', 'پسند: ') + (video.likeCount === null ? text('unavailable', 'ناموجود') : number(video.likeCount)),
          text('Channel subscribers: ', 'دنبال‌کنندگان کانال: ') + (video.channelSubscriberCount === null ? text('unavailable', 'ناموجود') : number(video.channelSubscriberCount)),
          text('Channel uploads: ', 'ویدئوهای کانال: ') + (video.channelVideoCount === null ? text('unavailable', 'ناموجود') : number(video.channelVideoCount)),
          text('These are returned sample values, not market-wide totals or performance forecasts.', 'این اعداد فقط مقادیر نمونه‌های دریافت‌شده‌اند و مجموع بازار یا پیش‌بینی عملکرد نیستند.'),
        ].filter(Boolean).join('\n'),
        url: video.url,
      })),
    });
  }

  const contextItems: ResearchGraphItem[] = [];
  if (input.wiki) {
    contextItems.push({
      id: 'wikimedia-article',
      title: input.wiki.articleTitle,
      meta: text('Wikimedia article · ', 'مقاله ویکی‌مدیا · ') + input.wiki.language.toUpperCase(),
      detail: [
        input.wiki.summary,
        text('Article pageviews are a language-edition metric, not search volume, unique people or YouTube views.', 'بازدید مقاله، شاخص یک نسخه زبانی است و معادل حجم جست‌وجو، افراد یکتا یا بازدید یوتیوب نیست.'),
      ].filter(Boolean).join('\n\n'),
      url: input.wiki.articleUrl,
    });
  }
  const trend = input.analysis.intelligence.trend;
  if (input.wiki || trend.observations > 0) {
    const direction = trend.direction === 'insufficient-data'
      ? text('Insufficient data', 'داده ناکافی')
      : trend.direction === 'rising'
        ? text('Rising', 'افزایشی')
        : trend.direction === 'falling'
          ? text('Falling', 'کاهشی')
          : text('Stable / mixed', 'ثابت / ترکیبی');
    const series = input.wiki?.monthlyViews ?? [];
    contextItems.push({
      id: 'trend-observations',
      title: text('Monthly trend observations', 'مشاهدات روند ماهانه'),
      meta: direction + ' · ' + number(trend.observations) + ' ' + text('observations', 'مشاهده'),
      detail: [
        text('Direction: ', 'جهت روند: ') + direction,
        text('Observations: ', 'تعداد مشاهدات: ') + number(trend.observations),
        ...(trend.changePercent === null ? [] : [text('Change between returned series halves: ', 'تغییر میان دو نیمه سری دریافت‌شده: ') + trend.changePercent + '%']),
        ...(trend.anomaly ? [text('Potential anomaly: ', 'ناهنجاری احتمالی: ') + trend.anomaly] : []),
        text('Original monthly observations', 'مشاهدات ماهانه اصلی'),
        ...series.map((point) => point.month + ' — ' + number(point.views)),
        text('The series describes Wikimedia article pageviews only; it is not a YouTube or search-demand series.', 'این سری فقط بازدید مقاله‌های ویکی‌مدیا را توصیف می‌کند و سری تقاضای جست‌وجو یا یوتیوب نیست.'),
      ].join('\n'),
      ...(input.wiki ? { url: input.wiki.articleUrl } : {}),
    });
  }
  if (contextItems.length) {
    groups.push({
      id: 'context',
      title: text('Public-interest context', 'زمینه توجه عمومی'),
      items: contextItems,
    });
  }

  if (input.analysis.evidence.length) {
    groups.push({
      id: 'evidence',
      title: text('Engine evidence', 'شواهد موتور داخلی'),
      items: input.analysis.evidence.map((item) => ({
        id: 'evidence-' + item.id,
        title: item.label,
        meta: text('Evidence supplied to the local engine', 'شواهد ارائه‌شده به موتور محلی'),
        detail: item.detail,
        ...(item.sourceUrl ? { url: item.sourceUrl } : {}),
      })),
    });
  }

  const quality = input.analysis.intelligence.sourceQuality;
  const confidence = input.analysis.intelligence.confidence;
  const findings: ResearchGraphItem[] = [
    {
      id: 'confidence',
      title: text('Evidence confidence', 'میزان اطمینان به شواهد'),
      meta: text('Qualitative assessment · ', 'ارزیابی کیفی · ') + confidence.level,
      detail: [
        confidence.reason,
        text('Source quality details', 'جزئیات کیفیت منابع'),
        text('Feeds represented: ', 'خوراک‌های نمایندگی‌شده: ') + number(quality.feedsRepresented),
        text('Independent publisher groups: ', 'گروه‌های مستقل ناشران: ') + number(quality.independentPublishers),
        text('Duplicate stories merged: ', 'خبرهای تکراری ادغام‌شده: ') + number(quality.duplicateStoriesMerged),
        text('Undated items: ', 'موارد بدون تاریخ: ') + number(quality.undatedItems),
        text('Items older than 90 days: ', 'موارد قدیمی‌تر از ۹۰ روز: ') + number(quality.staleItems),
        text('This is a qualitative evidence assessment, not a fabricated numeric score.', 'این ارزیابی کیفی شواهد است، نه یک امتیاز عددی ساختگی.'),
      ].join('\n'),
    },
    ...input.analysis.intelligence.gaps.map((value, index) => ({
      id: 'gap-' + index,
      title: text('Research gap', 'شکاف تحقیق'),
      meta: text('Missing or insufficient evidence', 'شواهد ناموجود یا ناکافی'),
      detail: value,
    })),
    ...input.analysis.intelligence.potentialContradictions.map((value, index) => ({
      id: 'discrepancy-' + index,
      title: text('Potential discrepancy', 'اختلاف احتمالی'),
      meta: text('Requires source-level verification', 'نیازمند بررسی در سطح منبع اصلی'),
      detail: value,
    })),
    ...input.analysis.intelligence.scenarios.map((value, index) => ({
      id: 'scenario-' + index,
      title: text('Conditional scenario', 'سناریوی مشروط'),
      meta: text('Not a prediction', 'پیش‌بینی قطعی نیست'),
      detail: value,
    })),
    ...(input.analysis.intelligence.sharedConcepts.length ? [{
      id: 'shared-concepts',
      title: text('Shared wording across samples', 'واژگان مشترک میان نمونه‌ها'),
      meta: text('Text overlap only', 'هم‌پوشانی متنی'),
      detail: input.analysis.intelligence.sharedConcepts.join(fa ? '، ' : ', '),
    }] : []),
    ...input.analysis.intelligence.followUpQueries.map((value, index) => ({
      id: 'follow-up-' + index,
      title: text('Follow-up research query', 'عبارت تحقیق بعدی'),
      meta: text('Suggested next investigation', 'پیشنهاد برای بررسی بعدی'),
      detail: value,
    })),
    ...input.analysis.verificationQuestions.map((value, index) => ({
      id: 'verification-' + index,
      title: text('Verification question', 'پرسش راستی‌آزمایی'),
      meta: text('Check before making a factual claim', 'پیش از طرح ادعای واقعی بررسی شود'),
      detail: value,
    })),
    ...input.analysis.limitations.map((value, index) => ({
      id: 'limitation-' + index,
      title: text('Analysis limitation', 'محدودیت تحلیل'),
      meta: text('Scope and uncertainty', 'دامنه و عدم‌قطعیت'),
      detail: value,
    })),
  ];
  if (findings.length) {
    groups.push({
      id: 'findings',
      title: text('Findings & open questions', 'یافته‌ها و پرسش‌های باز'),
      items: findings,
    });
  }

  if (input.analysis.angles.length) {
    groups.push({
      id: 'angles',
      title: text('Editorial angles', 'زاویه‌های محتوایی'),
      items: input.analysis.angles.map((angle) => ({
        id: 'angle-' + angle.id,
        title: angle.title,
        meta: text('Editorial hypothesis · verify before production', 'فرضیه محتوایی · پیش از تولید راستی‌آزمایی شود'),
        detail: [
          text('Hook: ', 'قلاب: ') + angle.hook,
          text('Approach: ', 'رویکرد: ') + angle.approach,
          text('Verification: ', 'راستی‌آزمایی: ') + angle.verification,
        ].join('\n\n'),
      })),
    });
  }

  return {
    topic: input.topic,
    summary: input.analysis.summary,
    groups,
  };
}
