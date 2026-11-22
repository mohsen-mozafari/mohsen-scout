import { buildResearchInterestProfile, canonicalizeResearchUrl, createEditorialOpportunityScorer, matchesAnyResearchTerms, matchesStrongResearchTopic, normalizeResearchText, scoreResearchText, tokenizeResearchText, type ResearchFeedbackProfile } from './intelligence';
import type { ResearchMemoryEntry } from './types';
import type { SpaceNewsItem } from './space';
import { uid, type Idea, type Region } from './types';

export const IDEA_GENERATION_CATEGORIES = [
  'Explainer',
  'Evidence audit',
  'Comparison',
  'Timeline',
  'Open question',
  'Cross-source',
  'Storytelling',
] as const;

export type IdeaGenerationCategory = (typeof IDEA_GENERATION_CATEGORIES)[number];

export type IdeaGenerationVideo = {
  id: string;
  title: string;
  description?: string;
  channel?: string;
  publishedAt?: string;
  viewCount?: number | null;
  likeCount?: number | null;
};

export type IdeaGenerationContext = {
  title: string;
  summary?: string;
  sourceName?: string;
  sourceUrl?: string;
};

export type GenerateEditorialIdeasInput = {
  topic: string;
  news?: readonly SpaceNewsItem[];
  /** Transient official YouTube metadata used only for local scoring; never copied into durable Idea text. */
  videos?: readonly IdeaGenerationVideo[];
  context?: readonly IdeaGenerationContext[];
  /** Bounded publisher-only history; raw YouTube metadata is intentionally excluded. */
  priorMemory?: ResearchMemoryEntry;
  feedback?: ResearchFeedbackProfile;
  existingIdeas?: readonly Idea[];
  reportId?: string;
  region: Region;
  languages: string[];
  language?: 'fa' | 'en';
  category?: IdeaGenerationCategory;
  limit?: number;
  now?: number;
  evidenceKey?: string;
  skipExistingEvidence?: boolean;
};

type Document = {
  id: string;
  title: string;
  text: string;
  kind: 'news' | 'context' | 'history' | 'youtube';
  publishedAt?: string | null;
  sourceId?: string;
  sourceName?: string;
  sourceUrl?: string;
  videoId?: string;
};

type Candidate = {
  category: IdeaGenerationCategory;
  anchor: string;
  title: string;
  question: string;
  rationale: string;
  storyPath: string;
  verification: string;
  opportunityScore: number;
  opportunityConfidence: 'low' | 'moderate' | 'high';
  opportunityReason: string;
};

function semanticTokens(value: string): Set<string> {
  return new Set(tokenizeResearchText(value).filter((token) => token.length > 2));
}

/** Saved idea feedback may use a longer editorial phrase than a generated anchor. */
function matchesSavedTopicPreference(value: string, topics: readonly string[]): boolean {
  if (matchesAnyResearchTerms(value, topics)) return true;
  const valueTokens = semanticTokens(value);
  if (!valueTokens.size) return false;
  return topics.some((topic) => {
    const topicTokens = semanticTokens(topic);
    if (!topicTokens.size) return false;
    const overlap = [...topicTokens].filter((token) => valueTokens.has(token)).length;
    return overlap >= Math.max(1, Math.ceil(topicTokens.size * 0.5));
  });
}

function ideaHasSameMeaning(candidate: Candidate, idea: Pick<Idea, 'engineGenerated' | 'ideaCategory' | 'topic' | 'concept'>, topic: string): boolean {
  if (!idea.engineGenerated) return false;
  const question = idea.concept.match(/(?:Central question:|پرسش اصلی:|پرسش محوری:)\s*([^\n]+)/i)?.[1] ?? '';
  const candidateTokens = semanticTokens(candidate.title + ' ' + candidate.question);
  const existingTokens = semanticTokens(idea.topic + ' ' + question);
  const anchorTokens = semanticTokens(candidate.anchor);
  const anchorOverlap = [...anchorTokens].filter((token) => existingTokens.has(token)).length;
  if (anchorTokens.size > 0 && anchorOverlap / anchorTokens.size < 0.75) return false;
  const topicTokens = semanticTokens(topic);
  for (const token of topicTokens) {
    candidateTokens.delete(token);
    existingTokens.delete(token);
  }
  if (!candidateTokens.size || !existingTokens.size) return false;
  let overlap = 0;
  for (const token of candidateTokens) if (existingTokens.has(token)) overlap += 1;
  const containment = overlap / Math.min(candidateTokens.size, existingTokens.size);
  const jaccard = overlap / (candidateTokens.size + existingTokens.size - overlap);
  return containment >= 0.76 && jaccard >= 0.5;
}

function extractGeneratedAnchor(concept: string): string {
  const english = concept.match(/understand\s+[“"]([^”"]+)[”"]/i)?.[1];
  const persian = concept.match(/مفهوم\s*[«“"]([^»”"]+)[»”"]/i)?.[1];
  return (english ?? persian ?? '').trim();
}

function displayTerm(value: string): string {
  if (!value) return value;
  return /^[a-z]/i.test(value) ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function categoryLabel(category: IdeaGenerationCategory, language: 'fa' | 'en'): string {
  if (language !== 'fa') return category;
  const labels: Record<IdeaGenerationCategory, string> = {
    Explainer: 'توضیح ساده یک مفهوم',
    'Evidence audit': 'بررسی و سنجش شواهد',
    Comparison: 'مقایسه',
    Timeline: 'روایت بر اساس خط زمانی',
    'Open question': 'پرسش بی‌پاسخ',
    'Cross-source': 'مقایسه روایت منابع',
    Storytelling: 'روایت مستند',
  };
  return labels[category];
}

function opportunityReasonText(
  opportunity: ReturnType<ReturnType<typeof createEditorialOpportunityScorer>>,
  language: 'fa' | 'en',
): string {
  if (language !== 'fa') return opportunity.reason;
  const level = (value: number) => value >= 70 ? 'قوی' : value >= 40 ? 'متوسط' : 'محدود';
  return [
    'ارتباط با موضوع: ' + level(opportunity.components.relevance),
    'پشتوانه منابع: ' + level(opportunity.components.evidenceBreadth),
    'تازگی اطلاعات: ' + level(opportunity.components.freshness),
    'تمایز زاویه: ' + level(opportunity.components.differentiation),
  ].join('؛ ');
}

function buildCandidate(
  category: IdeaGenerationCategory,
  topic: string,
  anchor: string,
  fa: boolean,
  sourceMode: 'news' | 'youtube' | 'context' | 'history' | 'topic' | 'mixed',
): Candidate {
  const term = displayTerm(anchor || topic);
  const titles: Record<IdeaGenerationCategory, string> = {
    Explainer: fa
      ? 'آنچه «' + term + '» درباره ' + topic + ' نشان می‌دهد'
      : 'What ' + term + ' tells us about ' + topic,
    'Evidence audit': fa
      ? 'شواهد درباره «' + term + '» چه چیزی را نشان می‌دهند و چه چیزی را نه؟'
      : 'What the evidence does—and does not—show about ' + term,
    Comparison: fa
      ? 'مقایسه شواهد موجود درباره ' + term
      : 'Comparing the available evidence on ' + term,
    Timeline: fa
      ? 'خط زمانی شواهد درباره ' + term
      : 'The evidence timeline for ' + term,
    'Open question': fa
      ? 'چه چیزی هنوز درباره «' + term + '» نامعلوم است؟'
      : 'What remains unknown about ' + term + '?',
    'Cross-source': fa
      ? 'خبرها و ویدئوها «' + term + '» را چگونه متفاوت روایت می‌کنند؟'
      : 'How news and videos frame ' + term + ' differently',
    Storytelling: fa
      ? 'روایت مستند مبتنی بر شواهد درباره ' + term
      : 'The evidence-led story behind ' + term,
  };
  const questions: Record<IdeaGenerationCategory, string> = {
    Explainer: fa
      ? 'کدام سازوکار قابل استناد، ' + term + ' را توضیح می‌دهد و منبع اصلی آن را چگونه شرح داده است؟'
      : 'Which documented mechanism explains ' + term + ', and how does the original source describe it?',
    'Evidence audit': fa
      ? 'کدام بخش درباره ' + term + ' مشاهده مستقیم است، کدام بخش تفسیر است و چه چیزی هنوز اثبات نشده؟'
      : 'Which statements about ' + term + ' are direct observations, which are interpretations, and what remains unproven?',
    Comparison: fa
      ? 'منابع موجود درباره ' + term + ' در چه جزئیات، دامنه یا محدودیت‌هایی با هم تفاوت دارند؟'
      : 'How do the returned sources differ in their details, scope or limitations about ' + term + '?',
    Timeline: fa
      ? 'اطلاعات تاریخ‌دار موجود چه توالی‌ای برای رویدادهای مرتبط با ' + term + ' نشان می‌دهند؟'
      : 'What sequence of events related to ' + term + ' is supported by the dated material currently available?',
    'Open question': fa
      ? 'کدام پرسش مشخص درباره ' + term + ' با شواهد موجود هنوز پاسخ داده نشده است؟'
      : 'Which specific question about ' + term + ' is not answered by the evidence currently available?',
    'Cross-source': fa
      ? 'گزارش‌های رسمی و نمونه‌های ویدئویی در کدام واژه یا جنبه از ' + term + ' هم‌پوشانی دارند و کجا متفاوت‌اند؟'
      : 'Where do official reports and returned video examples overlap in their wording about ' + term + ', and where do they differ?',
    Storytelling: fa
      ? 'چگونه می‌توان مسیر شواهد درباره ' + term + ' را بدون افزودن علت یا نتیجه تأییدنشده روایت کرد؟'
      : 'How can the evidence trail around ' + term + ' be told without adding an unverified cause or conclusion?',
  };
  const rationales: Record<IdeaGenerationCategory, string> = {
    Explainer: fa
      ? 'این زاویه از یک مفهوم استخراج‌شده از اطلاعات همین تحقیق شروع می‌کند و آن را به یک پرسش توضیحی قابل بررسی تبدیل می‌کند.'
      : 'This angle starts from a concept present in this investigation and turns it into a concrete explanatory question.',
    'Evidence audit': fa
      ? 'این ایده برای جدا کردن مشاهده، ادعای ناشر و تفسیر تحریری ساخته شده است؛ نه برای تأیید خودکار ادعا.'
      : 'This idea is designed to separate observations, publisher claims and editorial interpretation rather than automatically validate a claim.',
    Comparison: fa
      ? 'چند رکورد مرتبط در مجموعه فعلی وجود دارد؛ مقایسه باید فقط تفاوت‌های مستند همین نمونه را بررسی کند.'
      : 'More than one related record is available in the current set; the comparison must stay within differences documented by this sample.',
    Timeline: fa
      ? 'حداقل دو رکورد تاریخ‌دار برای ساخت یک خط زمانی محدود در داده فعلی وجود دارد.'
      : 'The current material contains at least two dated records, enough for a limited evidence-based timeline.',
    'Open question': fa
      ? 'این زاویه روی یک خلأ مشخص تمرکز می‌کند و پاسخ را از پیش معلوم فرض نمی‌کند.'
      : 'This angle focuses on an unresolved question and does not assume its answer in advance.',
    'Cross-source': fa
      ? 'این مفهوم در خبرها و نمونه‌های ویدئویی بازیابی‌شده دیده شده است؛ این ارتباط فقط هم‌پوشانی متن در نمونه است، نه توافق معنایی.'
      : 'This term appears in both retrieved publisher items and video titles; the connection is wording overlap in the sample, not semantic agreement.',
    Storytelling: fa
      ? 'این روایت، مسیر قابل ردیابی اطلاعات را به محتوا تبدیل می‌کند و بین واقعیت ثبت‌شده و تفسیر فاصله می‌گذارد.'
      : 'This turns the traceable path of available information into a narrative while keeping recorded facts separate from interpretation.',
  };
  const paths: Record<IdeaGenerationCategory, string> = {
    Explainer: fa
      ? '۱. پرسش را مطرح کن؛ ۲. اصطلاح ' + term + ' را تعریف کن؛ ۳. سازوکار را فقط با سند معتبر توضیح بده؛ ۴. محدودیت شواهد را نشان بده.'
      : '1. State the question; 2. define ' + term + '; 3. explain the mechanism only with a reliable source; 4. show the evidence limits.',
    'Evidence audit': fa
      ? '۱. ادعای قابل ردیابی را انتخاب کن؛ ۲. منبع اولیه را باز کن؛ ۳. مشاهده و تفسیر را جدا کن؛ ۴. موارد تأییدنشده را صریح بگو.'
      : '1. Select a traceable claim; 2. open the original source; 3. separate observation from interpretation; 4. state what remains unverified.',
    Comparison: fa
      ? '۱. موارد قابل مقایسه را تعریف کن؛ ۲. معیار یکسان تعیین کن؛ ۳. تفاوت‌های ثبت‌شده را کنار هم بگذار؛ ۴. از تعمیم به کل حوزه پرهیز کن.'
      : '1. Define comparable items; 2. use the same criteria; 3. place documented differences side by side; 4. avoid generalizing to the whole field.',
    Timeline: fa
      ? '۱. تاریخ‌های معتبر را مرتب کن؛ ۲. رویدادهای ثبت‌شده را مشخص کن؛ ۳. فاصله‌های زمانی را نشان بده؛ ۴. از ساختن رابطه علت و معلولی خودداری کن.'
      : '1. Order verified dates; 2. identify recorded events; 3. show gaps in the timeline; 4. do not invent causal links.',
    'Open question': fa
      ? '۱. پرسش دقیق را بیان کن؛ ۲. پاسخ‌های موجود را مرور کن؛ ۳. بخش نامعلوم را مشخص کن؛ ۴. بگو چه مدرکی می‌تواند آن را روشن کند.'
      : '1. State the precise question; 2. review available answers; 3. identify the unresolved part; 4. name the evidence that could resolve it.',
    'Cross-source': fa
      ? '۱. نمونه‌های هر منبع را جداگانه معرفی کن؛ ۲. هم‌پوشانی واژگانی را نشان بده؛ ۳. تفاوت محتوا را بررسی کن؛ ۴. توافق یا رابطه علّی را فرض نکن.'
      : '1. Introduce each source type separately; 2. show the wording overlap; 3. inspect differences in content; 4. assume neither agreement nor causation.',
    Storytelling: fa
      ? '۱. نقطه شروع مستند را انتخاب کن؛ ۲. اطلاعات را بر اساس تاریخ یا منطق شواهد بچین؛ ۳. عدم‌قطعیت را حفظ کن؛ ۴. با پرسش باز پایان بده.'
      : '1. Choose a documented starting point; 2. order the material by date or evidence logic; 3. preserve uncertainty; 4. end with an open question.',
  };
  const verify = fa
    ? 'پیش از تولید، عنوان، تاریخ، عددها و ادعاهای اصلی را در پیوند منبع بررسی کن. عنوان و توضیح ویدئو به‌تنهایی منبع علمی اولیه محسوب نمی‌شود.'
    : 'Before production, verify the title, date, figures and key claims at the linked source. A video title or description alone is not a primary scientific source.';
  const sourceNote = sourceMode === 'news'
    ? (fa ? 'پایه داده: خوراک خبری ناشران انتخاب‌شده.' : 'Evidence base: selected publisher feed items.')
    : sourceMode === 'mixed'
      ? (fa ? 'پایه داده: خبرهای ناشران و نمونه‌های مرتبط YouTube که در همین تحقیق بازیابی شده‌اند؛ هم‌پوشانی نمونه به‌معنای توافق یا رابطه علّی نیست.' : 'Evidence base: selected publisher reports plus relevant YouTube samples from this run; sample overlap is not proof of agreement or causation.')
      : sourceMode === 'youtube'
        ? (fa ? 'پایه داده: چند نمونه مرتبط از YouTube؛ بازدیدها فقط مشاهدات خام‌اند و معادل تقاضا یا رشد نیستند.' : 'Evidence base: multiple relevant YouTube Data API samples; raw view counts are observations, not demand or growth.')
        : sourceMode === 'history'
          ? (fa ? 'پایه داده: حافظه تاریخی ناشران و یادداشت‌های تحقیق قبلی؛ این داده‌ها الزاماً تازه نیستند.' : 'Evidence base: saved historical publisher records and prior research notes; these are not necessarily current.')
          : sourceMode === 'topic'
            ? (fa ? 'پایه داده: فقط موضوع انتخاب‌شده توسط کاربر؛ هنوز منبع مستقل مرتبطی برای تأیید یا امتیازدهی شواهد در دسترس نیست.' : 'Evidence base: user-provided topic only; no independent source is available to verify or score the idea.')
            : (fa ? 'پایه داده: زمینه عمومی ویکی‌مدیا؛ بازدید مقاله معادل حجم جست‌وجو یا تقاضای مخاطب نیست.' : 'Evidence base: Wikimedia context; article pageviews are not search volume or audience demand.');

  return {
    category,
    anchor: term,
    title: titles[category],
    question: questions[category],
    rationale: rationales[category] + ' ' + sourceNote,
    storyPath: paths[category],
    verification: verify,
    opportunityScore: 0,
    opportunityConfidence: 'low',
    opportunityReason: '',
  };
}

/**
 * Generates local editorial hypotheses from evidence already present in memory.
 * It performs no network calls and never copies YouTube titles, descriptions,
 * thumbnails or statistics into the durable Idea record.
 */
/** Keeps the complete selected YouTube time range; 0 means all available past records. */
export function filterVideosToSelectedResearchPeriod<T extends { publishedAt?: string | null }>(
  videos: readonly T[],
  days: number,
  now = Date.now(),
): T[] {
  const windowDays = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 30;
  const cutoff = windowDays === 0 ? Number.NEGATIVE_INFINITY : now - windowDays * 86400000;
  return videos.filter((video) => {
    const published = Date.parse(video.publishedAt ?? '');
    return Number.isFinite(published) && published <= now && published >= cutoff;
  });
}

/**
 * Selects relevant records from the existing YouTube sample using topic relevance,
 * overlap and recency. Lifetime view counts do not determine selection order.
 */
export function selectIdeaGenerationVideos(
  topic: string,
  videos: readonly IdeaGenerationVideo[],
  limit = Number.MAX_SAFE_INTEGER,
): IdeaGenerationVideo[] {
  const topicTokens = new Set(tokenizeResearchText(topic).filter((token) => token.length > 2));
  if (!topicTokens.size) return [];
  const unique = new Map<string, { video: IdeaGenerationVideo; relevance: number; overlap: number; descriptionWeight: number }>();
  for (const video of videos) {
    if (!/^[\w-]{11}$/.test(video.id)) continue;
    const titleTokens = new Set(tokenizeResearchText(video.title));
    const descriptionTokens = new Set(tokenizeResearchText(video.description ?? ''));
    const totalOverlap = [...topicTokens].filter((token) => titleTokens.has(token) || descriptionTokens.has(token)).length;
    // Require a meaningful match across the topic, not just one shared generic word.
    // The shared matcher still recognizes the project's explicit semantic aliases.
    const searchable = video.title + ' ' + (video.description ?? '');
    if (!matchesStrongResearchTopic(searchable, topic)) continue;
    const relevance = scoreResearchText(topic, video.title, video.description ?? '');
    if (relevance <= 0) continue;
    const previous = unique.get(video.id);
    const descriptionWeight = normalizeResearchText(video.title + ' ' + (video.description ?? '')).length;
    if (!previous ||
      relevance > previous.relevance ||
      (relevance === previous.relevance && descriptionWeight > previous.descriptionWeight)) {
      unique.set(video.id, {
        video,
        relevance,
        overlap: totalOverlap,
        descriptionWeight,
      });
    }
  }
  return [...unique.values()]
    .sort((a, b) =>
      b.relevance - a.relevance ||
      b.overlap - a.overlap ||
      (Date.parse(b.video.publishedAt ?? '') || 0) - (Date.parse(a.video.publishedAt ?? '') || 0) ||
      b.descriptionWeight - a.descriptionWeight ||
      a.video.id.localeCompare(b.video.id),
    )
    .slice(0, Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(limit) || 0)))
    .map((entry) => entry.video);
}

/** Removes repeated generated cards from list views without changing saved data. */
export function deduplicateDisplayIdeas(ideas: readonly Idea[]): Idea[] {
  const seenIds = new Set<string>();
  const seenGeneratedTitles = new Set<string>();
  const tokenIndex = new Map<string, number[]>();
  const acceptedGeneratedTokens: Set<string>[] = [];
  const output: Idea[] = [];

  for (const idea of ideas) {
    if (seenIds.has(idea.id)) continue;
    seenIds.add(idea.id);
    if (!idea.engineGenerated) {
      output.push(idea);
      continue;
    }

    const title = normalizeResearchText(idea.topic);
    if (!title) {
      output.push(idea);
      continue;
    }
    if (seenGeneratedTitles.has(title)) continue;

    const centralQuestion = idea.concept.match(/(?:Central question:|پرسش اصلی:|پرسش محوری:)\s*([^\n]+)/i)?.[1] ?? '';
    const tokens = semanticTokens(idea.topic + ' ' + centralQuestion);
    let duplicate = false;

    // Existing similarity requires >=0.88 containment and >=0.72 Jaccard.
    // Such a pair shares at least 63% of either token set, so probing the
    // least-common 64%+ avoids scanning all previously accepted ideas.
    if (tokens.size > 0) {
      const postings = [...tokens]
        .map((token) => tokenIndex.get(token))
        .filter((list): list is number[] => Boolean(list))
        .sort((a, b) => a.length - b.length);
      const probeCount = Math.min(postings.length, Math.floor(tokens.size * 0.64) + 1);
      const candidates = new Set<number>();
      for (let postingIndex = 0; postingIndex < probeCount; postingIndex += 1) {
        for (const candidate of postings[postingIndex]) candidates.add(candidate);
      }
      for (const candidate of candidates) {
        const previous = acceptedGeneratedTokens[candidate];
        let overlap = 0;
        for (const token of tokens) if (previous.has(token)) overlap += 1;
        const containment = overlap / Math.max(1, Math.min(tokens.size, previous.size));
        const jaccard = overlap / Math.max(1, tokens.size + previous.size - overlap);
        if (containment >= 0.88 && jaccard >= 0.72) {
          duplicate = true;
          break;
        }
      }
    }

    if (duplicate) continue;
    seenGeneratedTitles.add(title);
    const acceptedIndex = acceptedGeneratedTokens.length;
    acceptedGeneratedTokens.push(tokens);
    for (const token of tokens) {
      const posting = tokenIndex.get(token);
      if (posting) posting.push(acceptedIndex);
      else tokenIndex.set(token, [acceptedIndex]);
    }
    output.push(idea);
  }
  return output;
}

export function generateEditorialIdeas(input: GenerateEditorialIdeasInput): Idea[] {
  const topic = input.topic.trim().replace(/\s+/g, ' ').slice(0, 180);
  if (!topic) return [];

  const news = [...(input.news ?? [])];
  // YouTube metadata is processed locally as transient evidence. Only expiring video IDs
  // and report references are attached to Ideas; raw titles, descriptions and statistics
  // never enter durable Idea text or any external model request.
  const videos = selectIdeaGenerationVideos(topic, input.videos ?? [], 120);
  const context = [...(input.context ?? [])];
  const independentContext = context.filter((item) => item.sourceName !== 'User-provided topic');
  const currentUrls = new Set(news.map((item) => canonicalizeResearchUrl(item.url)).filter(Boolean));
  const priorMemory = input.priorMemory;
  const historicalSources = (priorMemory?.sources ?? []).filter((item) => {
    const url = canonicalizeResearchUrl(item.sourceUrl);
    return Boolean(url && !currentUrls.has(url) && item.title.trim());
  });
  const historyDocuments: Document[] = [
    ...historicalSources.map((item) => ({
      id: 'history:' + canonicalizeResearchUrl(item.sourceUrl),
      title: item.title,
      text: item.title,
      kind: 'history' as const,
      publishedAt: item.publishedAt,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
    })),
    ...(priorMemory?.keyFindings ?? []).map((value, index) => ({
      id: 'memory-finding:' + index,
      title: value.slice(0, 500),
      text: value,
      kind: 'history' as const,
    })),
    ...(priorMemory?.unresolvedQuestions ?? []).map((value, index) => ({
      id: 'memory-question:' + index,
      title: value.slice(0, 500),
      text: value,
      kind: 'history' as const,
    })),
    ...(priorMemory?.contradictions ?? []).map((value, index) => ({
      id: 'memory-discrepancy:' + index,
      title: value.slice(0, 500),
      text: value,
      kind: 'history' as const,
    })),
    ...(priorMemory?.history ?? []).map((snapshot, index) => {
      const summary = [
        ...snapshot.keyFindings,
        ...snapshot.unresolvedQuestions,
        ...snapshot.contradictions,
        ...snapshot.changes,
      ].join(' ').slice(0, 4000);
      return {
        id: 'memory-snapshot:' + snapshot.sourceFingerprint + ':' + index,
        title: summary.slice(0, 500),
        text: summary,
        kind: 'history' as const,
      };
    }).filter((item) => item.text.trim().length > 0),
  ];
  const documents: Document[] = [
    ...news.map((item) => ({
      id: item.id || item.url,
      title: item.title,
      text: item.title + ' ' + item.summary,
      kind: 'news' as const,
      publishedAt: item.publishedAt,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      sourceUrl: item.url,
    })),
    ...independentContext.map((item, index) => ({
      id: 'context-' + index,
      title: item.title,
      text: item.title + ' ' + (item.summary ?? ''),
      kind: 'context' as const,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
    })),
    ...videos.map((video) => ({
      id: 'youtube:' + video.id,
      title: video.title,
      text: video.title + ' ' + (video.description ?? ''),
      kind: 'youtube' as const,
      publishedAt: video.publishedAt ?? null,
      sourceId: video.channel || 'youtube',
      sourceName: 'YouTube sample',
      videoId: video.id,
    })),
    ...historyDocuments,
  ];
  if (!documents.length) return [];

  const topicTokens = new Set(tokenizeResearchText(topic));
  const termStats = new Map<string, { documents: number; frequency: number; sourceKinds: Set<string>; sourceGroups: Set<string> }>();
  // Anchors are derived from independent publisher, YouTube, context and history evidence.
  const topicRelevantDocuments = documents.filter((document) => scoreResearchText(topic, document.title, document.text) > 0);
  // A single isolated record is not enough to justify an automated editorial idea.
  if (topicRelevantDocuments.length < 2) return [];
  const topicRelevantNews = news.filter((item) => scoreResearchText(topic, item.title, item.summary) > 0);
  const topicRelevantVideos = videos.filter((item) => scoreResearchText(topic, item.title, item.description ?? '') > 0);
  const topicRelevantHistory = historyDocuments.filter((item) => scoreResearchText(topic, item.title, item.text) > 0);
  const relevantIndependentContext = independentContext.filter((item) =>
    scoreResearchText(topic, item.title, item.summary ?? '') > 0,
  );
  const feedback = input.feedback ?? buildResearchInterestProfile(input.existingIdeas ?? []);
  const opportunityScorer = createEditorialOpportunityScorer({
    topic,
    news: news.map((item) => ({
      title: item.title,
      summary: item.summary,
      sourceName: item.sourceName,
      sourceId: item.sourceId,
      sourceUrl: item.url,
      publishedAt: item.publishedAt,
    })),
    historicalNews: historicalSources.map((item) => ({
      title: item.title,
      sourceName: item.sourceName,
      sourceId: item.sourceId,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt,
    })),
    context: [
      ...independentContext.map((item) => ({
        title: item.title,
        summary: item.summary,
        sourceName: item.sourceName,
        sourceUrl: item.sourceUrl,
      })),
      ...historyDocuments
        .filter((item) => item.id.startsWith('memory-'))
        .map((item) => ({
          title: item.title,
          summary: item.text,
          sourceName: 'Saved research memory',
        })),
    ],
    videos: videos.map((item) => ({
      title: item.title,
      description: item.description,
      channel: item.channel,
      publishedAt: item.publishedAt,
      viewCount: item.viewCount ?? null,
    })),
    now: input.now,
  });
  for (const document of topicRelevantDocuments) {
    const frequencies = new Map<string, number>();
    for (const term of tokenizeResearchText(document.text)) {
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    }
    for (const [term, frequency] of frequencies) {
      if (term.length < 3 || topicTokens.has(term)) continue;
      const current = termStats.get(term) ?? { documents: 0, frequency: 0, sourceKinds: new Set<string>(), sourceGroups: new Set<string>() };
      current.documents += 1;
      // Source groups preserve publisher families and YouTube channel diversity.
      current.sourceKinds.add(document.kind);
      if (document.sourceId || document.sourceName) current.sourceGroups.add(document.sourceId || document.sourceName || '');
      current.frequency += frequency;
      termStats.set(term, current);
    }
  }
  const phraseStats = new Map<string, { documents: number; frequency: number; sourceKinds: Set<string>; sourceGroups: Set<string> }>();
  const ignoredPhraseTerms = new Set(['mock', 'sample', 'report', 'reports', 'news', 'update', 'latest', 'official']);
  for (const document of topicRelevantDocuments) {
    const titleTokens = tokenizeResearchText(document.kind === 'youtube' ? document.text : document.title);
    const phrases = new Set<string>();
    for (const width of [3, 2]) {
      for (let start = 0; start <= titleTokens.length - width; start++) {
        const words = titleTokens.slice(start, start + width);
        if (words.some((word) => word.length < 3 || topicTokens.has(word) || ignoredPhraseTerms.has(word))) continue;
        phrases.add(words.join(' '));
      }
    }
    for (const phrase of phrases) {
      const stats = phraseStats.get(phrase) ?? { documents: 0, frequency: 0, sourceKinds: new Set<string>(), sourceGroups: new Set<string>() };
      stats.documents += 1;
      stats.sourceKinds.add(document.kind);
      if (document.sourceId || document.sourceName) stats.sourceGroups.add(document.sourceId || document.sourceName || '');
      stats.frequency += 1;
      phraseStats.set(phrase, stats);
    }
  }
  const anchorStrength = (stats: { documents: number; frequency: number; sourceKinds: Set<string>; sourceGroups: Set<string> }) => {
    const documentFrequency = Math.max(1, stats.documents);
    const inverseFrequency = Math.log(1 + (topicRelevantDocuments.length + 1) / (documentFrequency + 1));
    // Balance corroboration and information gain; repeated boilerplate is weaker
    // than a useful phrase recurring across independent documents and source types.
    return Math.min(4, stats.sourceKinds.size) * 5 +
      Math.min(6, stats.sourceGroups.size) * 3 +
      Math.log2(1 + stats.documents) * 4 +
      inverseFrequency * 2 +
      Math.min(5, stats.frequency / documentFrequency) * 0.2;
  };
  const phraseAnchors = [...phraseStats.entries()]
    .sort((a, b) =>
      anchorStrength(b[1]) - anchorStrength(a[1]) ||
      b[1].documents - a[1].documents ||
      b[0].split(' ').length - a[0].split(' ').length ||
      a[0].localeCompare(b[0]),
    )
    .map(([phrase]) => phrase);
  const singleAnchors = [...termStats.entries()]
    .sort((a, b) =>
      anchorStrength(b[1]) - anchorStrength(a[1]) ||
      b[1].documents - a[1].documents ||
      a[0].localeCompare(b[0]),
    )
    .map(([term]) => term);
  // Analyse the complete corpus, then evaluate a broad shortlist to keep UI work responsive.
  const anchors = [...new Set([...phraseAnchors, ...singleAnchors])].slice(0, 80);
  const fallback = tokenizeResearchText(topic).filter((term) => term.length > 2).slice(0, 4);
  const usableAnchors = anchors.length ? anchors : (fallback.length ? fallback : [topic]);
  const datedCount = topicRelevantDocuments.filter((item) => item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))).length;
  const mode: 'news' | 'youtube' | 'context' | 'history' | 'topic' | 'mixed' =
    topicRelevantNews.length && topicRelevantVideos.length ? 'mixed'
      : topicRelevantNews.length ? 'news'
        : topicRelevantVideos.length ? 'youtube'
          : topicRelevantHistory.length ? 'history'
            : relevantIndependentContext.length ? 'context' : 'topic';
  const definitions: IdeaGenerationCategory[] = [
    'Explainer',
    'Evidence audit',
    'Comparison',
    'Timeline',
    'Open question',
    'Cross-source',
    'Storytelling',
  ];
  const eligible = definitions.filter((category) => {
    if (category === 'Comparison') return topicRelevantDocuments.length >= 2;
    if (category === 'Timeline') return datedCount >= 2;
    if (category === 'Cross-source') return topicRelevantNews.length > 0 && topicRelevantVideos.length > 0;
    return true;
  });
  const existing: Idea[] = [];
  const seenGeneratedTitles = new Set<string>();
  for (const idea of input.existingIdeas ?? []) {
    if (idea.engineGenerated) {
      const titleKey = normalizeResearchText(idea.topic);
      if (titleKey && seenGeneratedTitles.has(titleKey)) continue;
      if (titleKey) seenGeneratedTitles.add(titleKey);
    }
    existing.push(idea);
  }
  const evidenceKey = (input.evidenceKey ?? documents.map((document) => document.id).sort().join('|')).slice(0, 1200);
  if (input.skipExistingEvidence && existing.some((idea) => idea.generationKey === evidenceKey)) return [];
  const usedTitles = new Set(existing.map((idea) => normalizeResearchText(idea.topic)));
  const sameEvidenceIdeas = existing.filter((idea) => idea.engineGenerated && idea.generationKey === evidenceKey);
  const existingEngineCount = sameEvidenceIdeas.length;
  const usedAnchors = new Set(sameEvidenceIdeas
    .map((idea) => normalizeResearchText(extractGeneratedAnchor(idea.concept)))
    .filter(Boolean));
  const candidates: Candidate[] = [];
  const categoryOrder = input.category
    ? [input.category]
    : eligible.slice(existingEngineCount % Math.max(1, eligible.length)).concat(eligible.slice(0, existingEngineCount % Math.max(1, eligible.length)));
  const categoryAnchors = usableAnchors;
  for (let index = 0; index < categoryAnchors.length; index++) {
    const category = categoryOrder[index % Math.max(1, categoryOrder.length)];
    const anchor = categoryAnchors[index];
    if (!category || !eligible.includes(category) || !anchor) continue;
    const candidate = buildCandidate(category, topic, anchor, input.language === 'fa', mode);
    if (category === 'Cross-source') {
      const hasPublisherSupport = topicRelevantNews.some((item) =>
        scoreResearchText(candidate.anchor, item.title, item.summary) > 0,
      );
      const hasVideoSupport = topicRelevantVideos.some((video) =>
        scoreResearchText(candidate.anchor, video.title, video.description ?? '') > 0,
      );
      if (!hasPublisherSupport || !hasVideoSupport) continue;
    }
    const opportunity = opportunityScorer(candidate.anchor);
    const positivePreference = matchesSavedTopicPreference(candidate.anchor, feedback.positiveTopics);
    const negativePreference = matchesSavedTopicPreference(candidate.anchor, feedback.negativeTopics);
    candidate.opportunityScore = Math.max(0, Math.min(100,
      opportunity.score + (positivePreference ? 8 : 0) - (negativePreference ? 18 : 0)));
    candidate.opportunityConfidence = opportunity.confidence;
    candidate.opportunityReason = opportunityReasonText(opportunity, input.language ?? 'en') + (positivePreference
      ? (input.language === 'fa' ? '؛ با موضوعاتی که قبلاً پسندیده‌ای هم‌راستاست' : '; aligns with your saved positive topics')
      : '') + (negativePreference
        ? (input.language === 'fa' ? '؛ به موضوعی شبیه است که قبلاً نپسندیده‌ای' : '; overlaps a topic you previously rejected')
        : '');
    const anchorKey = normalizeResearchText(candidate.anchor);
    if (!anchorKey || usedAnchors.has(anchorKey) ||
      usedTitles.has(normalizeResearchText(candidate.title)) ||
      existing.some((idea) => ideaHasSameMeaning(candidate, idea, topic)) ||
      candidates.some((prior) => ideaHasSameMeaning(candidate, {
        engineGenerated: true,
        ideaCategory: prior.category,
        topic: prior.title,
        concept: prior.question,
      }, topic))) continue;
    candidates.push(candidate);
    usedAnchors.add(anchorKey);
  }

  candidates.sort((a, b) => b.opportunityScore - a.opportunityScore || a.title.localeCompare(b.title));
  const publisherGroups = new Set(topicRelevantNews
    .map((item) => normalizeResearchText(item.sourceId || item.sourceName))
    .filter(Boolean)).size;
  const videoChannels = new Set(topicRelevantVideos.map((item) => normalizeResearchText(item.channel ?? '')).filter(Boolean)).size;
  // Confidence describes the breadth of this returned sample, not truth or audience demand.
  const confidence = publisherGroups >= 2 && videoChannels >= 2 ? 'high'
    : publisherGroups >= 2 || videoChannels >= 2 ? 'moderate' : 'low';
  const output: Idea[] = [];
  const now = input.now ?? Date.now();
  const limit = Math.max(1, Math.min(25, input.limit ?? 25));
  const sourceUrl = topicRelevantNews.find((item) => item.url.startsWith('https://'))?.url ??
    topicRelevantHistory.find((item) => item.sourceUrl?.startsWith('https://'))?.sourceUrl ??
    relevantIndependentContext.find((item) => item.sourceUrl?.startsWith('https://'))?.sourceUrl;
  const sourceName = news.find((item) => item.url === sourceUrl)?.sourceName ??
    historicalSources.find((item) => item.sourceUrl === sourceUrl)?.sourceName ??
    relevantIndependentContext.find((item) => item.sourceUrl === sourceUrl)?.sourceName ??
    (topicRelevantVideos.length ? 'YouTube sample' : undefined);
  const language = input.language ?? 'en';

  for (const candidate of candidates) {
    if (output.length >= limit) break;
    const normalizedTitle = normalizeResearchText(candidate.title);
    if (usedTitles.has(normalizedTitle) ||
      existing.some((idea) => ideaHasSameMeaning(candidate, idea, topic)) ||
      output.some((idea) => ideaHasSameMeaning(candidate, idea, topic))) continue;
    usedTitles.add(normalizedTitle);
    const relatedVideoIds = topicRelevantVideos
      .map((video) => ({
        id: video.id,
        relevance: scoreResearchText(candidate.anchor, video.title, video.description ?? ''),
        publishedAt: Date.parse(video.publishedAt ?? '') || 0,
      }))
      .filter((video) => video.relevance > 0)
      .sort((left, right) =>
        right.relevance - left.relevance ||
        right.publishedAt - left.publishedAt ||
        left.id.localeCompare(right.id),
      )
      .slice(0, 5)
      .map((video) => video.id);
    const evidenceScope = [
      news.length ? (language === 'fa'
        ? news.length + ' خبر دریافتی؛ ' + topicRelevantNews.length + ' مورد هم‌موضوع'
        : news.length + ' publisher item(s) received; ' + topicRelevantNews.length + ' topic-matched') : '',
      videos.length ? (language === 'fa'
        ? videos.length + ' نمونه ویدئویی دریافتی؛ ' + topicRelevantVideos.length + ' مورد هم‌موضوع'
        : videos.length + ' YouTube sample(s) received; ' + topicRelevantVideos.length + ' topic-matched') : '',
      relevantIndependentContext.length ? (language === 'fa' ? relevantIndependentContext.length + ' منبع زمینه‌ای' : relevantIndependentContext.length + ' independent context source(s)') : '',
      mode === 'topic' ? (language === 'fa'
        ? 'فقط موضوع واردشده توسط کاربر؛ بدون شواهد مستقل مرتبط'
        : 'user-provided topic only; no independent source evidence is available') : '',
      historicalSources.length ? (language === 'fa'
        ? historicalSources.length + ' منبع خبری در حافظه تاریخی'
        : historicalSources.length + ' historical publisher record(s) from saved research memory') : '',
      (priorMemory?.keyFindings.length ?? 0) + (priorMemory?.unresolvedQuestions.length ?? 0) + (priorMemory?.contradictions.length ?? 0) > 0
        ? (language === 'fa'
          ? 'یافته‌ها، پرسش‌های بی‌پاسخ و اختلاف‌های قبلی هم بررسی شدند'
          : 'saved findings, open questions and discrepancies were also reviewed') : '',
      priorMemory?.history?.length
        ? (language === 'fa'
          ? priorMemory.history.length + ' گزارش قبلی از روند تغییرات تحقیق مرور شد'
          : priorMemory.history.length + ' historical research snapshots reviewed') : '',
    ].filter(Boolean).join(language === 'fa' ? ' و ' : ' and ');
    const concept = language === 'fa'
      ? 'پرسش اصلی: ' + candidate.question +
        '\n\nزاویه پیشنهادی: ' + categoryLabel(candidate.category, language) +
        '\n\nچرا این ایده پیشنهاد شده؟ ' + candidate.rationale +
        '\n\nداده‌های بررسی‌شده: ' + evidenceScope + '. این شمارش فقط مربوط به همین تحقیق است و به معنی محبوبیت یا تقاضای مخاطب نیست.' +
        '\n\nفایده برای مخاطب: این ویدئو باید کمک کند مخاطب مفهوم «' + candidate.anchor + '» را در موضوع ' + topic + ' بهتر بفهمد و فرق مشاهده با برداشت را تشخیص دهد.' +
        '\n\nپیشنهاد برای روایت: ' + candidate.storyPath +
        '\n\nپیش از تولید بررسی کن: ' + candidate.verification +
        '\n\nاولویت پیشنهادی موتور: ' + candidate.opportunityScore + '/100 · اطمینان به داده‌ها: ' + (candidate.opportunityConfidence === 'high' ? 'زیاد' : candidate.opportunityConfidence === 'moderate' ? 'متوسط' : 'کم') + ' · ' + candidate.opportunityReason +
        '\n\nاطمینان کلی: ' + (confidence === 'high' ? 'زیاد' : confidence === 'moderate' ? 'متوسط' : 'کم') + '؛ این برآورد فقط به تعداد و تنوع منابع موجود مربوط است و صحت ادعاها را تضمین نمی‌کند.'
      : 'Central question: ' + candidate.question +
        '\n\nEditorial angle: ' + candidate.category +
        '\n\nWhy this idea was generated: ' + candidate.rationale +
        '\n\nEvidence scope: ' + evidenceScope + '. These are counts from this investigation, not a demand or popularity metric.' +
        '\n\nAudience value: the viewer can understand “' + candidate.anchor + '” in the context of ' + topic + ' and distinguish reported observations from interpretation.' +
        '\n\nSuggested story path: ' + candidate.storyPath +
        '\n\nVerify before production: ' + candidate.verification +
        '\n\nEngine editorial priority: ' + candidate.opportunityScore + '/100 · evidence confidence: ' + candidate.opportunityConfidence + ' · ' + candidate.opportunityReason +
        '\n\nConfidence: ' + confidence + '; this reflects the amount and mix of available material, not a guarantee that any claim is true.';

    const note = language === 'fa'
      ? 'این ایده با موتور داخلی و بر پایه داده‌های همین تحقیق ساخته شده است: ' + evidenceScope + '. برای ساخت آن درخواست تازه‌ای به یوتیوب یا سرویس خارجی ارسال نشد و عنوان، توضیحات، تصویر و آمار خام ویدئوها در اطلاعات ماندگار این ایده ذخیره نشده‌اند؛ فقط شناسه‌های لازم برای پیوند به فرادادهٔ منقضی‌شونده نگهداری می‌شوند.'
      : 'Generated locally from ' + evidenceScope + '. No new YouTube or external request was made during idea generation. Raw YouTube titles, descriptions, thumbnails and statistics were not copied into this durable Idea record; only references to expiring metadata are linked.';
    output.push({
      id: uid(),
      topic: candidate.title.slice(0, 180),
      concept: concept.slice(0, 4000),
      note,
      status: 'New Discoveries',
      decision: '',
      videoIds: relatedVideoIds,
      createdAt: now + output.length,
      archived: false,
      assessment: confidence === 'low' ? 'Uncertain' : 'Worth Exploring',
      region: input.region,
      languages: [...input.languages],
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(sourceName ? { sourceName } : {}),
      ...(input.reportId ? { reportId: input.reportId } : {}),
      engineGenerated: true,
      ideaCategory: candidate.category,
      generationKey: evidenceKey,
      engineScore: candidate.opportunityScore,
      engineScoreReason: candidate.opportunityReason,
    });
  }
  return output;
}
