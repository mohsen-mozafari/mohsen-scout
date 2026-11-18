import { matchesResearchTerms, normalizeResearchText, tokenizeResearchText } from './intelligence';
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
  videos?: readonly IdeaGenerationVideo[];
  context?: readonly IdeaGenerationContext[];
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
  kind: 'news' | 'youtube' | 'context';
  publishedAt?: string | null;
};

type Candidate = {
  category: IdeaGenerationCategory;
  anchor: string;
  title: string;
  question: string;
  rationale: string;
  storyPath: string;
  verification: string;
};

function semanticTokens(value: string): Set<string> {
  return new Set(tokenizeResearchText(value).filter((token) => token.length > 2));
}

function ideaHasSameMeaning(candidate: Candidate, idea: Pick<Idea, 'engineGenerated' | 'ideaCategory' | 'topic' | 'concept'>, topic: string): boolean {
  if (!idea.engineGenerated) return false;
  const question = idea.concept.match(/(?:Central question:|پرسش محوری:)\s*([^\n]+)/i)?.[1] ?? '';
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

function buildCandidate(
  category: IdeaGenerationCategory,
  topic: string,
  anchor: string,
  fa: boolean,
  sourceMode: 'news' | 'youtube' | 'mixed' | 'context',
): Candidate {
  const term = displayTerm(anchor || topic);
  const titles: Record<IdeaGenerationCategory, string> = {
    Explainer: fa
      ? 'سازوکار ' + term + ' در موضوع ' + topic + ' چگونه کار می‌کند؟'
      : 'How ' + term + ' works within ' + topic,
    'Evidence audit': fa
      ? 'شواهد فعلی درباره ' + term + ' دقیقاً چه چیزی را نشان می‌دهند؟'
      : 'What the available evidence actually establishes about ' + term,
    Comparison: fa
      ? 'چه تفاوتی میان گزارش‌ها و نمونه‌های موجود درباره ' + term + ' دیده می‌شود؟'
      : 'What differs across the available accounts of ' + term,
    Timeline: fa
      ? 'رد زمانی رویدادهای مرتبط با ' + term + ' در ' + topic
      : 'How the available reports trace the timeline of ' + term,
    'Open question': fa
      ? 'پرسش بی‌پاسخ پشت ' + term + ' در موضوع ' + topic
      : 'The unanswered question behind ' + term + ' in ' + topic,
    'Cross-source': fa
      ? 'نقطه تلاقی گزارش‌های رسمی و نمونه‌های ویدئویی درباره ' + term
      : 'Where official reporting and video examples meet on ' + term,
    Storytelling: fa
      ? 'از مشاهده تا معنا: روایت مستند ' + term + ' در ' + topic
      : 'From observation to meaning: the evidence trail behind ' + term,
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
    ? (fa ? 'پایه داده: خوراک خبری رسمی انتخاب‌شده.' : 'Evidence base: selected official publisher feed items.')
    : sourceMode === 'youtube'
      ? (fa ? 'پایه داده: نمونه محدود نتایج YouTube؛ این نمونه نماینده کل بازار نیست.' : 'Evidence base: a limited YouTube result sample; it does not represent the whole market.')
      : sourceMode === 'mixed'
        ? (fa ? 'پایه داده: خبرهای رسمی و نمونه محدود YouTube؛ این دو نوع منبع مستقل و با محدودیت‌های متفاوت‌اند.' : 'Evidence base: official publisher items and a limited YouTube sample; these source types remain separate and have different limits.')
        : (fa ? 'پایه داده: زمینه عمومی ویکی‌مدیا؛ بازدید مقاله معادل حجم جست‌وجو یا تقاضای YouTube نیست.' : 'Evidence base: Wikimedia context; article pageviews are not search volume or YouTube demand.');

  return {
    category,
    anchor: term,
    title: titles[category],
    question: questions[category],
    rationale: rationales[category] + ' ' + sourceNote,
    storyPath: paths[category],
    verification: verify,
  };
}

/**
 * Generates local editorial hypotheses from evidence already present in memory.
 * It performs no network calls and never copies YouTube titles, descriptions,
 * thumbnails or statistics into the durable Idea record.
 */
/**
 * Selects the most-viewed topic-relevant records from an existing YouTube sample.
 * It does not claim global trend status or infer growth from a single view count.
 */
export function selectIdeaGenerationVideos(
  topic: string,
  videos: readonly IdeaGenerationVideo[],
  limit = 12,
): IdeaGenerationVideo[] {
  const topicTokens = new Set(tokenizeResearchText(topic).filter((token) => token.length > 2));
  if (!topicTokens.size) return [];
  const unique = new Map<string, { video: IdeaGenerationVideo; overlap: number }>();
  for (const video of videos) {
    const views = video.viewCount;
    if (!/^[\w-]{11}$/.test(video.id) || typeof views !== 'number' || !Number.isFinite(views) || views <= 0) continue;
    const titleTokens = new Set(tokenizeResearchText(video.title));
    const overlap = [...topicTokens].filter((token) => titleTokens.has(token)).length;
    if (overlap / topicTokens.size < 0.30) continue;
    const previous = unique.get(video.id);
    if (!previous || views > (previous.video.viewCount ?? 0)) unique.set(video.id, { video, overlap });
  }
  return [...unique.values()]
    .sort((a, b) =>
      (b.video.viewCount ?? 0) - (a.video.viewCount ?? 0) ||
      b.overlap - a.overlap ||
      (Date.parse(b.video.publishedAt ?? '') || 0) - (Date.parse(a.video.publishedAt ?? '') || 0),
    )
    .slice(0, Math.max(1, Math.min(25, Math.trunc(limit) || 1)))
    .map((entry) => entry.video);
}

/** Removes repeated generated cards from list views without changing saved data. */
export function deduplicateDisplayIdeas(ideas: readonly Idea[]): Idea[] {
  const seenIds = new Set<string>();
  const seenGeneratedTitles = new Set<string>();
  const seenGeneratedConcepts: Set<string>[] = [];
  return ideas.filter((idea) => {
    if (seenIds.has(idea.id)) return false;
    seenIds.add(idea.id);
    if (!idea.engineGenerated) return true;
    const title = normalizeResearchText(idea.topic);
    if (!title) return true;
    if (seenGeneratedTitles.has(title)) return false;
    const centralQuestion = idea.concept.match(/(?:Central question:|پرسش محوری:)\s*([^\n]+)/i)?.[1] ?? '';
    const tokens = semanticTokens(idea.topic + ' ' + centralQuestion);
    for (const previous of seenGeneratedConcepts) {
      const overlap = [...tokens].filter((token) => previous.has(token)).length;
      const containment = overlap / Math.max(1, Math.min(tokens.size, previous.size));
      const jaccard = overlap / Math.max(1, tokens.size + previous.size - overlap);
      if (containment >= 0.88 && jaccard >= 0.72) return false;
    }
    seenGeneratedTitles.add(title);
    seenGeneratedConcepts.push(tokens);
    return true;
  });
}

export function generateEditorialIdeas(input: GenerateEditorialIdeasInput): Idea[] {
  const topic = input.topic.trim().replace(/\s+/g, ' ').slice(0, 180);
  if (!topic) return [];

  const news = [...(input.news ?? [])];
  const videos = selectIdeaGenerationVideos(topic, input.videos ?? [], 25);
  const context = [...(input.context ?? [])];
  const documents: Document[] = [
    ...news.map((item) => ({
      id: item.id || item.url,
      title: item.title,
      text: item.title + ' ' + item.summary,
      kind: 'news' as const,
      publishedAt: item.publishedAt,
    })),
    ...videos.map((video) => ({
      id: video.id,
      title: video.title,
      text: video.title + ' ' + (video.description ?? ''),
      kind: 'youtube' as const,
      publishedAt: video.publishedAt ?? null,
    })),
    ...context.map((item, index) => ({
      id: 'context-' + index,
      title: item.title,
      text: item.title + ' ' + (item.summary ?? ''),
      kind: 'context' as const,
    })),
  ];
  if (!documents.length) return [];

  const topicTokens = new Set(tokenizeResearchText(topic));
  const termStats = new Map<string, { documents: number; frequency: number; videoDocuments: number }>();
  // Anchors may come from the strongest topic-relevant videos and publisher evidence.
  // Raw video metadata is not copied into the saved Idea record.
  for (const document of documents) {
    const uniqueTerms = new Set(tokenizeResearchText(document.text));
    for (const term of uniqueTerms) {
      if (term.length < 3 || topicTokens.has(term)) continue;
      const current = termStats.get(term) ?? { documents: 0, frequency: 0, videoDocuments: 0 };
      current.documents += 1;
      if (document.kind === 'youtube') current.videoDocuments += 1;
      current.frequency += tokenizeResearchText(document.text).filter((value) => value === term).length;
      termStats.set(term, current);
    }
  }
  const phraseStats = new Map<string, { documents: number; videoDocuments: number; frequency: number }>();
  const ignoredPhraseTerms = new Set(['mock', 'sample', 'report', 'reports', 'news', 'update', 'latest', 'official']);
  for (const document of documents) {
    const titleTokens = tokenizeResearchText(document.title);
    const phrases = new Set<string>();
    for (const width of [3, 2]) {
      for (let start = 0; start <= titleTokens.length - width; start++) {
        const words = titleTokens.slice(start, start + width);
        if (words.some((word) => word.length < 3 || topicTokens.has(word) || ignoredPhraseTerms.has(word))) continue;
        phrases.add(words.join(' '));
      }
    }
    for (const phrase of phrases) {
      const stats = phraseStats.get(phrase) ?? { documents: 0, videoDocuments: 0, frequency: 0 };
      stats.documents += 1;
      if (document.kind === 'youtube') stats.videoDocuments += 1;
      stats.frequency += 1;
      phraseStats.set(phrase, stats);
    }
  }
  const phraseAnchors = [...phraseStats.entries()]
    .sort((a, b) =>
      (videos.length ? b[1].videoDocuments - a[1].videoDocuments : 0) ||
      b[1].documents - a[1].documents ||
      b[1].frequency - a[1].frequency ||
      b[0].split(' ').length - a[0].split(' ').length ||
      a[0].localeCompare(b[0]),
    )
    .map(([phrase]) => phrase)
    .slice(0, 12);
  const singleAnchors = [...termStats.entries()]
    .sort((a, b) =>
      (videos.length ? b[1].videoDocuments - a[1].videoDocuments : 0) ||
      b[1].documents - a[1].documents ||
      b[1].frequency - a[1].frequency ||
      a[0].localeCompare(b[0]),
    )
    .map(([term]) => term)
    .slice(0, 8);
  const anchors = [...new Set([...phraseAnchors, ...singleAnchors])].slice(0, 20);
  const fallback = tokenizeResearchText(topic).filter((term) => term.length > 2).slice(0, 4);
  const usableAnchors = anchors.length ? anchors : (fallback.length ? fallback : [topic]);
  const newsTerms = new Set(news.flatMap((item) => tokenizeResearchText(item.title + ' ' + item.summary)));
  const videoTerms = new Set(videos.flatMap((item) => tokenizeResearchText(item.title + ' ' + (item.description ?? ''))));
  const sharedAnchors = usableAnchors.filter((term) => {
    const tokens = tokenizeResearchText(term);
    return tokens.length > 0 && tokens.every((token) => newsTerms.has(token) && videoTerms.has(token));
  });
  const datedCount = documents.filter((item) => item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))).length;
  const mode: 'news' | 'youtube' | 'mixed' | 'context' =
    news.length && videos.length ? 'mixed' :
      news.length ? 'news' :
        videos.length ? 'youtube' : 'context';
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
    if (category === 'Comparison') return documents.length >= 2;
    if (category === 'Timeline') return datedCount >= 2;
    if (category === 'Cross-source') return news.length > 0 && videos.length > 0 && sharedAnchors.length > 0;
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
  const categoryAnchors = input.category === 'Cross-source' ? sharedAnchors : usableAnchors;
  for (let index = 0; index < Math.min(categoryAnchors.length, 20); index++) {
    const category = categoryOrder[index % Math.max(1, categoryOrder.length)];
    const anchor = categoryAnchors[index];
    if (!category || !eligible.includes(category) || !anchor) continue;
    const candidate = buildCandidate(category, topic, anchor, input.language === 'fa', mode);
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

  const output: Idea[] = [];
  const now = input.now ?? Date.now();
  const limit = Math.max(1, Math.min(25, input.limit ?? 25));
  const sourceUrl = news.find((item) => item.url.startsWith('https://'))?.url ??
    context.find((item) => item.sourceUrl?.startsWith('https://'))?.sourceUrl;
  const sourceName = news.find((item) => item.url === sourceUrl)?.sourceName ??
    context.find((item) => item.sourceUrl === sourceUrl)?.sourceName;
  const confidence = news.length >= 2 && videos.length >= 2
    ? 'moderate'
    : documents.length >= 3
      ? 'moderate'
      : 'low';
  const language = input.language ?? 'en';

  for (const candidate of candidates) {
    if (output.length >= limit) break;
    const normalizedTitle = normalizeResearchText(candidate.title);
    if (usedTitles.has(normalizedTitle) ||
      existing.some((idea) => ideaHasSameMeaning(candidate, idea, topic)) ||
      output.some((idea) => ideaHasSameMeaning(candidate, idea, topic))) continue;
    usedTitles.add(normalizedTitle);
    const relatedVideoIds = videos
      .filter((video) => matchesResearchTerms(video.title + ' ' + (video.description ?? ''), [candidate.anchor]) ||
        matchesResearchTerms(video.title, [topic]))
      .slice(0, 12)
      .map((video) => video.id);
    const evidenceScope = [
      news.length ? (language === 'fa' ? news.length + ' گزارش خبری رسمی' : news.length + ' official news item(s)') : '',
      videos.length ? (language === 'fa' ? videos.length + ' نمونه موقت YouTube' : videos.length + ' temporary YouTube sample(s)') : '',
      context.length ? (language === 'fa' ? context.length + ' منبع زمینه‌ای' : context.length + ' context source(s)') : '',
    ].filter(Boolean).join(language === 'fa' ? ' و ' : ' and ');
    const concept = language === 'fa'
      ? 'پرسش محوری: ' + candidate.question +
        '\n\nزاویه محتوا: ' + candidate.category +
        '\n\nچرا این ایده ساخته شد: ' + candidate.rationale +
        '\n\nدامنه شواهد: ' + evidenceScope + '. این تعداد، فقط داده‌های همین تحقیق است و شاخص تقاضا یا محبوبیت نیست.' +
        '\n\nارزش برای مخاطب: مخاطب می‌تواند مفهوم «' + candidate.anchor + '» را در چارچوب ' + topic + ' بفهمد و مرز میان مشاهده و تفسیر را تشخیص دهد.' +
        '\n\nمسیر روایت: ' + candidate.storyPath +
        '\n\nموارد لازم برای راستی‌آزمایی: ' + candidate.verification +
        '\n\nسطح اطمینان: ' + (confidence === 'moderate' ? 'متوسط' : 'پایین') + '؛ این سطح به تنوع و تعداد منابع موجود وابسته است و تضمین صحت ادعا نیست.'
      : 'Central question: ' + candidate.question +
        '\n\nEditorial angle: ' + candidate.category +
        '\n\nWhy this idea was generated: ' + candidate.rationale +
        '\n\nEvidence scope: ' + evidenceScope + '. These are counts from this investigation, not a demand or popularity metric.' +
        '\n\nAudience value: the viewer can understand “' + candidate.anchor + '” in the context of ' + topic + ' and distinguish reported observations from interpretation.' +
        '\n\nSuggested story path: ' + candidate.storyPath +
        '\n\nVerify before production: ' + candidate.verification +
        '\n\nConfidence: ' + confidence + '; this reflects the amount and mix of available material, not a guarantee that any claim is true.';

    const note = language === 'fa'
      ? 'ساخته‌شده توسط موتور محلی از ' + evidenceScope + '. هیچ درخواست تازه‌ای برای YouTube یا منبع خارجی جهت تولید این ایده ارسال نشد. عنوان‌ها، توضیحات، تصویرها و آمار خام YouTube در رکورد دائمی این ایده کپی نشده‌اند.'
      : 'Generated locally from ' + evidenceScope + '. No new YouTube or external request was made to generate this idea. Raw YouTube titles, descriptions, thumbnails and statistics were not copied into this durable Idea record.';
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
      assessment: documents.length ? 'Worth Exploring' : 'Uncertain',
      region: input.region,
      languages: [...input.languages],
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(sourceName ? { sourceName } : {}),
      ...(input.reportId && videos.length ? { reportId: input.reportId } : {}),
      engineGenerated: true,
      ideaCategory: candidate.category,
      generationKey: evidenceKey,
    });
  }
  return output;
}
