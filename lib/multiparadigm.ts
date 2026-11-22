import { tokenizeResearchText } from './intelligence';

export type ParadigmStatus = 'strong' | 'mixed' | 'limited' | 'warning' | 'hypothesis';
export type ParadigmLens = {
  id: 'evidence' | 'semantic' | 'temporal' | 'network' | 'adversarial' | 'causal' | 'creative' | 'decision';
  title: string;
  status: ParadigmStatus;
  statusLabel: string;
  summary: string;
  findings: string[];
  caveats: string[];
};
export type ResearchParadigmAnalysis = {
  version: 1;
  readiness: 'exploratory' | 'developing' | 'well-supported';
  readinessLabel: string;
  synthesis: string;
  lenses: ParadigmLens[];
  creativeDirections: string[];
  nextActions: string[];
  centralEntities: string[];
};
export type MultiParadigmInput = {
  topic: string;
  news: readonly { title: string; summary: string; sourceName: string; sourceId?: string; publishedAt: string | null }[];
  videos: readonly { id: string; title: string; channel: string; publishedAt: string }[];
  wikiObservations: readonly { month: string; views: number }[];
  trend: { direction: 'rising' | 'falling' | 'stable' | 'insufficient-data'; observations: number; changePercent: number | null; anomaly: 'spike' | 'drop' | null };
  independentPublisherFamilies: number;
  undatedPublisherItems: number;
  stalePublisherItems: number;
  entities: readonly { id: string; name: string; mentionCount: number; sourceIds: string[] }[];
  relations: readonly { fromEntityId: string; toEntityId: string; evidenceCount: number }[];
  gaps: readonly string[];
  contradictions: readonly string[];
  now: number;
  language?: 'fa' | 'en';
};

function unique(values: readonly string[], limit = 8): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}
function statusText(status: ParadigmStatus, fa: boolean): string {
  const faLabels: Record<ParadigmStatus, string> = {
    strong: 'پشتوانه نسبتاً قوی', mixed: 'ترکیبی؛ نیازمند بررسی',
    limited: 'داده محدود', warning: 'هشدار بررسی انتقادی', hypothesis: 'فرضیه اکتشافی',
  };
  const enLabels: Record<ParadigmStatus, string> = {
    strong: 'Relatively strong support', mixed: 'Mixed; needs review',
    limited: 'Limited data', warning: 'Critical-review warning', hypothesis: 'Exploratory hypothesis',
  };
  return (fa ? faLabels : enLabels)[status];
}
function makeLens(
  id: ParadigmLens['id'], title: string, status: ParadigmStatus, summary: string,
  findings: string[], caveats: string[], fa: boolean,
): ParadigmLens {
  return { id, title, status, statusLabel: statusText(status, fa), summary, findings, caveats };
}

/** Independent local reasoning perspectives; deliberately no composite opportunity score. */
export function buildMultiParadigmAnalysis(input: MultiParadigmInput): ResearchParadigmAnalysis {
  const fa = input.language === 'fa';
  const topicTerms = new Set(tokenizeResearchText(input.topic).filter((term) => term.length > 1));
  const publisherTerms = new Set<string>();
  const videoTerms = new Set<string>();
  for (const item of input.news) {
    for (const term of tokenizeResearchText(item.title + ' ' + item.summary)) publisherTerms.add(term);
  }
  for (const video of input.videos) {
    for (const term of tokenizeResearchText(video.title)) videoTerms.add(term);
  }
  let coveredTerms = 0;
  for (const term of topicTerms) if (publisherTerms.has(term) || videoTerms.has(term)) coveredTerms += 1;
  const lexicalCoverage = topicTerms.size ? coveredTerms / topicTerms.size : 0;
  const sharedTerms = [...publisherTerms]
    .filter((term) => videoTerms.has(term) && !topicTerms.has(term))
    .sort((a, b) => a.localeCompare(b)).slice(0, 8);

  const datedNews = input.news.filter((item) => {
    const time = item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN;
    return Number.isFinite(time) && time <= input.now + 86400000;
  });
  const recentNews = datedNews.filter((item) => input.now - Date.parse(item.publishedAt!) <= 30 * 86400000).length;
  const previousNews = datedNews.filter((item) => {
    const age = input.now - Date.parse(item.publishedAt!);
    return age > 30 * 86400000 && age <= 60 * 86400000;
  }).length;
  const datedRatio = input.news.length ? datedNews.length / input.news.length : 0;

  const entityDegree = new Map<string, number>();
  for (const edge of input.relations) {
    entityDegree.set(edge.fromEntityId, (entityDegree.get(edge.fromEntityId) ?? 0) + 1);
    entityDegree.set(edge.toEntityId, (entityDegree.get(edge.toEntityId) ?? 0) + 1);
  }
  const centralEntities = [...input.entities]
    .sort((a, b) => (entityDegree.get(b.id) ?? 0) - (entityDegree.get(a.id) ?? 0) ||
      b.mentionCount - a.mentionCount || a.name.localeCompare(b.name))
    .slice(0, 5).map((entity) => entity.name);

  const evidenceStatus: ParadigmStatus = input.news.length >= 3 &&
    input.independentPublisherFamilies >= 2 && datedRatio >= 0.67 ? 'strong' :
      input.news.length ? 'mixed' : 'limited';
  const evidenceFindings = [
    fa
      ? input.news.length + ' گزارش هم‌موضوع، ' + input.independentPublisherFamilies + ' گروه مستقل ناشر و ' + datedNews.length + ' رکورد تاریخ‌دار در نمونه وجود دارد.'
      : input.news.length + ' topic-matched publisher records, ' + input.independentPublisherFamilies + ' independent publisher families and ' + datedNews.length + ' dated records are present.',
    fa
      ? 'پوشش تاریخ‌دار ' + (datedRatio * 100).toFixed(0) + '٪ است؛ ' + input.undatedPublisherItems + ' مورد بی‌تاریخ و ' + input.stalePublisherItems + ' مورد قدیمی‌تر از ۹۰ روزند.'
      : 'Dated-record coverage is ' + (datedRatio * 100).toFixed(0) + '%; ' + input.undatedPublisherItems + ' are undated and ' + input.stalePublisherItems + ' are older than 90 days.',
  ];
  if (input.independentPublisherFamilies < 2) evidenceFindings.push(fa
    ? 'تأیید مستقل از چند خانواده ناشر هنوز شکل نگرفته است.'
    : 'Independent confirmation across multiple publisher families is not established.');

  const semanticFindings = [
    fa ? 'پوشش واژگانی موضوع در پیکره بررسی‌شده ' + (lexicalCoverage * 100).toFixed(0) + '٪ است.'
      : 'Lexical coverage of topic terms in the inspected corpus is ' + (lexicalCoverage * 100).toFixed(0) + '%.',
    sharedTerms.length
      ? (fa ? 'واژه‌های مشترک خبر و نمونه ویدئو: ' : 'Terms shared by publisher records and sampled videos: ') + sharedTerms.join(fa ? '، ' : ', ')
      : (fa ? 'هم‌پوشانی واژگانی مشخصی میان دو مجموعه پیدا نشد.' : 'No clear lexical overlap was found between the two collections.'),
  ];
  const temporalEnough = datedNews.length >= 4 || input.wikiObservations.length >= 4;
  const temporalFindings = [
    fa ? recentNews + ' گزارش در ۳۰ روز اخیر و ' + previousNews + ' گزارش در ۳۰ روز پیش از آن ثبت شده است.'
      : recentNews + ' publisher reports fall in the latest 30 days and ' + previousNews + ' in the preceding 30 days.',
    fa ? 'سری ماهانه ویکی‌مدیا ' + input.wikiObservations.length + ' مشاهده دارد؛ جهت آن «' + input.trend.direction + '» است.'
      : 'The Wikimedia series has ' + input.wikiObservations.length + ' observations; its direction is "' + input.trend.direction + '".',
  ];
  if (input.trend.anomaly) temporalFindings.push(fa
    ? 'یک ناهنجاری احتمالی ' + (input.trend.anomaly === 'spike' ? 'افزایش' : 'افت') + ' در سری ماهانه علامت‌گذاری شده است.'
    : 'A potential ' + input.trend.anomaly + ' anomaly is flagged in the monthly series.');
  if (!temporalEnough) temporalFindings.push(fa
    ? 'تاریخچه برای نتیجه‌گیری قابل اتکا درباره روند کافی نیست.'
    : 'There is not enough history for a reliable temporal conclusion.');

  const networkFindings = [
    fa ? input.entities.length + ' موجودیت و ' + input.relations.length + ' رابطه هم‌ذکری در گراف محلی استخراج شد.'
      : input.entities.length + ' entities and ' + input.relations.length + ' co-mention relations were extracted.',
    centralEntities.length ? (fa ? 'موجودیت‌های پرتکرار/مرکزی: ' : 'Frequent/central entities: ') + centralEntities.join(fa ? '، ' : ', ')
      : (fa ? 'موجودیت مرکزی قابل اتکایی استخراج نشد.' : 'No reliable central entity was extracted.'),
  ];
  const contradictionCount = input.contradictions.length;
  const adversarialFindings = contradictionCount
    ? unique(input.contradictions, 4)
    : [fa ? 'تناقض صریحی علامت‌گذاری نشد؛ نبود هشدار به معنی نبود تناقض نیست.'
      : 'No explicit discrepancy was flagged; absence of a warning does not prove consistency.'];
  adversarialFindings.push(fa
    ? input.gaps.length + ' خلأ تحقیق برای آزمون ادعاها باقی مانده است.'
    : input.gaps.length + ' research gaps remain for testing claims.');

  const causalFindings = [
    fa ? 'هم‌زمانی خبرها، بازدید مقاله و نمونه ویدئو رابطه علّی را ثابت نمی‌کند.'
      : 'Co-occurrence among news, article pageviews and sampled videos does not establish causality.',
    fa ? 'برای ادعای علّی به آزمایش، مقایسه خلاف‌واقع معتبر یا سازوکار مستند در منبع اولیه نیاز است.'
      : 'Causal claims require an experiment, a defensible counterfactual comparison or a mechanism documented by a primary source.',
  ];
  const creativeDirections = unique([
    fa ? 'سازوکار: چه فرایندی پدیده را ایجاد می‌کند و کدام اندازه‌گیری آن را نشان می‌دهد؟'
      : 'Mechanism: what process creates the phenomenon, and which measurement demonstrates it?',
    fa ? 'توضیح رقیب: چه عامل دیگری می‌تواند همین الگوی مشاهده‌شده را توضیح دهد؟'
      : 'Rival explanation: what other factor could produce the same observed pattern?',
    fa ? 'مقایسه: کدام دو مأموریت، روش یا نتیجه را می‌توان با معیار یکسان مقایسه کرد؟'
      : 'Comparison: which missions, methods or findings can be compared using the same criteria?',
    input.gaps[0] ? (fa ? 'خلأ تحقیق: ' : 'Research gap: ') + input.gaps[0]
      : (fa ? 'مرز دانش: چه چیزی هنوز اندازه‌گیری یا تأیید نشده است؟' : 'Knowledge boundary: what remains unmeasured or unverified?'),
    contradictionCount
      ? (fa ? 'حل اختلاف: تفاوت منابع از تاریخ، واحد یا روش اندازه‌گیری ناشی می‌شود؟'
        : 'Resolve the discrepancy: do differing sources use different dates, units or methods?')
      : (fa ? 'آزمون زمانی: آیا الگو در چند بازه مستقل نیز تکرار می‌شود؟'
        : 'Temporal test: does the pattern recur across independent periods?'),
  ], 5);

  const actions: string[] = [];
  if (!input.news.length) actions.push(fa ? 'یک سند اولیه معتبر و مستقیماً مرتبط با موضوع پیدا کن.'
    : 'Retrieve a credible primary document directly related to the topic.');
  if (input.independentPublisherFamilies < 2) actions.push(fa
    ? 'ادعاهای مهم را با یک خانواده ناشر مستقل دیگر تطبیق بده.'
    : 'Check important claims against another independent publisher family.');
  if (contradictionCount) actions.push(fa
    ? 'تاریخ، واحد، روش اندازه‌گیری و منبع اصلی هر اختلاف را کنار هم مقایسه کن.'
    : 'Compare date, unit, measurement method and original source for each discrepancy.');
  if (input.wikiObservations.length < 4) actions.push(fa
    ? 'پیش از تفسیر روند، دست‌کم چهار مشاهده ماهانه با تعریف ثابت جمع‌آوری کن.'
    : 'Collect at least four consistently defined monthly observations before interpreting a trend.');
  if (input.videos.length < 3) actions.push(fa
    ? 'نمونه ویدئو را گسترش بده و نمونه کوچک را نماینده کل بازار فرض نکن.'
    : 'Broaden the video sample; do not treat a small sample as representative of the whole market.');
  if (input.entities.length < 3 || input.relations.length < 2) actions.push(fa
    ? 'موجودیت‌ها و روابط را از منابع اصلی استخراج و راستی‌آزمایی کن.'
    : 'Extract related entities and relationships from primary sources, then verify them.');
  if (!actions.length) actions.push(fa
    ? 'یک تفسیر رقیب و مدرک لازم برای رد یا تأیید آن را مشخص کن.'
    : 'State a rival interpretation and identify evidence needed to falsify or support it.');
  const nextActions = unique(actions, 6);

  const hasEvidence = input.news.length > 0 || input.videos.length > 0 || input.wikiObservations.length > 0;
  const readiness: ResearchParadigmAnalysis['readiness'] = !hasEvidence ? 'exploratory' :
    input.independentPublisherFamilies >= 2 && input.news.length >= 3 &&
    (input.wikiObservations.length >= 4 || input.videos.length >= 3) && !contradictionCount
      ? 'well-supported' : 'developing';
  const readinessLabel = fa
    ? readiness === 'well-supported' ? 'پشتوانه چندمنبعی مناسب؛ محدود به نمونه فعلی' :
      readiness === 'developing' ? 'تحلیل در حال تکمیل' : 'اکتشافی؛ شواهد کافی موجود نیست'
    : readiness === 'well-supported' ? 'Reasonably multi-source supported; sample-scoped' :
      readiness === 'developing' ? 'Analysis is still developing' : 'Exploratory; evidence is insufficient';

  const lenses: ParadigmLens[] = [
    makeLens('evidence', fa ? '۱. کیفیت و استقلال شواهد' : '1. Evidence quality and independence', evidenceStatus,
      fa ? 'بررسی منشأ، تازگی، تنوع و تعداد شواهد.' : 'Reviews provenance, freshness, diversity and sample size.',
      evidenceFindings, [fa ? 'چند خوراک از یک خانواده ناشر، تأیید مستقل متعدد نیست.' : 'Multiple feeds from one publisher family are not multiple independent confirmations.'], fa),
    makeLens('semantic', fa ? '۲. ارتباط معنایی و واژگانی' : '2. Semantic and lexical alignment',
      sharedTerms.length >= 2 ? 'mixed' : 'limited',
      fa ? 'مقایسه واژگان موضوع، گزارش‌ها و نمونه ویدئوها.' : 'Compares topic vocabulary, publisher reports and sampled video titles.',
      semanticFindings, [fa ? 'هم‌پوشانی واژگانی اثبات درک عمیق یا توافق factual نیست.' : 'Lexical overlap does not prove deep understanding or factual agreement.'], fa),
    makeLens('temporal', fa ? '۳. پویایی زمانی' : '3. Temporal dynamics', temporalEnough ? 'mixed' : 'limited',
      fa ? 'تفکیک قدمت گزارش‌ها از جهت سری زمانی ویکی‌مدیا.' : 'Separates publication recency from the Wikimedia time-series direction.',
      temporalFindings, [fa ? 'تعداد خبرها معادل تقاضا نیست.' : 'Article counts are not demand.'], fa),
    makeLens('network', fa ? '۴. گراف موجودیت‌ها و روابط' : '4. Entity and relationship graph',
      input.entities.length >= 3 && input.relations.length >= 2 ? 'mixed' : 'limited',
      fa ? 'شناسایی موجودیت‌های پرتکرار و ارتباطات هم‌ذکری.' : 'Identifies frequent entities and document co-mentions.',
      networkFindings, [fa ? 'هم‌ذکری رابطه رسمی یا اثر علّی را اثبات نمی‌کند.' : 'Co-mention does not prove a formal relationship or causal influence.'], fa),
    makeLens('adversarial', fa ? '۵. تفکر نقادانه و تناقض‌سنجی' : '5. Adversarial review',
      contradictionCount ? 'warning' : input.gaps.length ? 'mixed' : 'limited',
      fa ? 'آشکارسازی اختلاف‌ها و ادعاهای تأییدنشده.' : 'Surfaces discrepancies and claims that remain unverified.',
      adversarialFindings, [fa ? 'اختلاف باید با منبع اولیه و زمینه اندازه‌گیری بررسی شود.' : 'Discrepancies must be checked against primary sources and measurement context.'], fa),
    makeLens('causal', fa ? '۶. بررسی علّی و خلاف‌واقع' : '6. Causal and counterfactual reasoning', 'hypothesis',
      fa ? 'جلوگیری از اشتباه گرفتن هم‌بستگی با علت و معلول.' : 'Prevents correlation from being mistaken for cause and effect.',
      causalFindings, [fa ? 'موتور آزمایش علّی اجرا نمی‌کند.' : 'The local engine does not run causal experiments.'], fa),
    makeLens('creative', fa ? '۷. ترکیب خلاقانه و فرضیه‌سازی' : '7. Creative synthesis', 'hypothesis',
      fa ? 'ساخت مسیر تحقیق از شکاف‌ها و تفسیرهای رقیب.' : 'Creates research directions from gaps and rival interpretations.',
      creativeDirections, [fa ? 'این موارد فرضیه‌اند، نه یافته اثبات‌شده.' : 'These are hypotheses, not established findings.'], fa),
    makeLens('decision', fa ? '۸. اقدام بعدی بهینه' : '8. Next-best research actions', 'mixed',
      fa ? 'اولویت‌بندی گام‌هایی که بیشترین عدم‌قطعیت را کاهش می‌دهند.' : 'Prioritizes steps most likely to reduce uncertainty.',
      nextActions, [fa ? 'با ورود داده جدید، پیشنهادها دوباره محاسبه می‌شوند.' : 'Recommendations are recalculated when new evidence arrives.'], fa),
  ];

  return {
    version: 1, readiness, readinessLabel,
    synthesis: fa
      ? readiness === 'well-supported'
        ? 'چند مسیر مستقل شواهد در دسترس است، اما نتیجه به نمونه فعلی محدود است. اختلاف‌ها و محدودیت‌های منابع را جدا نگه دار.'
        : readiness === 'developing'
          ? 'داده برای ساخت چند فرضیه مفید است، اما بعضی ابعاد اصلی ضعیف‌اند. اقدام‌های بعدی برای کاهش عدم‌قطعیت اولویت دارند.'
          : 'شواهد کافی برای نتیجه‌گیری وجود ندارد. خروجی موتور را نقشه پرسش‌های تحقیق بدان، نه پاسخ قطعی.'
      : readiness === 'well-supported'
        ? 'Several independent evidence tracks are available, but conclusions remain bounded by the current sample.'
        : readiness === 'developing'
          ? 'The data can support several hypotheses, but key dimensions remain weak. Prioritize actions that reduce uncertainty.'
          : 'There is not enough evidence for a substantive conclusion. Use the output as a research-question map, not a definitive answer.',
    lenses, creativeDirections, nextActions, centralEntities,
  };
}
