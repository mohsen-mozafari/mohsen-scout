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
    fa ? 'از واژه‌های اصلی موضوع، ' + (lexicalCoverage * 100).toFixed(0) + '٪ در خبرها و ویدئوهای بررسی‌شده پیدا شد.'
      : 'Lexical coverage of topic terms in the inspected corpus is ' + (lexicalCoverage * 100).toFixed(0) + '%.',
    sharedTerms.length
      ? (fa ? 'عبارت‌های مشترک در خبرها و ویدئوها: ' : 'Terms shared by publisher records and sampled videos: ') + sharedTerms.join(fa ? '، ' : ', ')
      : (fa ? 'عبارت مشترک روشنی میان خبرها و ویدئوهای این نمونه پیدا نشد.' : 'No clear lexical overlap was found between the two collections.'),
  ];
  const temporalEnough = datedNews.length >= 4 || input.wikiObservations.length >= 4;
  const temporalFindings = [
    fa ? recentNews + '  گزارش در ۳۰ روز اخیر و ' + previousNews + '  گزارش در ۳۰ روز قبل از آن منتشر شده است.'
      : recentNews + ' publisher reports fall in the latest 30 days and ' + previousNews + ' in the preceding 30 days.',
    fa ? 'داده ماهانه ویکی‌پدیا ' + input.wikiObservations.length + ' ماه داده دارد؛ جهت تغییر آن «' + input.trend.direction + '» است.'
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
    centralEntities.length ? (fa ? 'نام‌های پرتکرار و مرتبط: ' : 'Frequent/central entities: ') + centralEntities.join(fa ? '، ' : ', ')
      : (fa ? 'نام یا ارتباط پرتکرار قابل اتکایی از این نمونه به دست نیامد.' : 'No reliable central entity was extracted.'),
  ];
  const contradictionCount = input.contradictions.length;
  const adversarialFindings = contradictionCount
    ? unique(input.contradictions, 4)
    : [fa ? 'اختلاف روشنی پیدا نشد؛ البته پیدا نشدن اختلاف، یکسان بودن همه گزارش‌ها را ثابت نمی‌کند.'
      : 'No explicit discrepancy was flagged; absence of a warning does not prove consistency.'];
  adversarialFindings.push(fa
    ? input.gaps.length + ' هنوز چند پرسش بی‌پاسخ وجود دارد که باید پیش از نتیجه‌گیری بررسی شوند.'
    : input.gaps.length + ' research gaps remain for testing claims.');

  const causalFindings = [
    fa ? 'اینکه خبرها، بازدید مقاله و ویدئوها در یک زمان دیده شوند، ثابت نمی‌کند یکی باعث دیگری شده است.'
      : 'Co-occurrence among news, article pageviews and sampled videos does not establish causality.',
    fa ? 'برای گفتن اینکه یک عامل باعث عامل دیگر شده، به آزمایش، مقایسه درست یا توضیح مستند در منبع اولیه نیاز داریم.'
      : 'Causal claims require an experiment, a defensible counterfactual comparison or a mechanism documented by a primary source.',
  ];
  const creativeDirections = unique([
    fa ? 'سازوکار: این پدیده چطور اتفاق می‌افتد و چه اندازه‌گیری‌ای آن را نشان می‌دهد؟'
      : 'Mechanism: what process creates the phenomenon, and which measurement demonstrates it?',
    fa ? 'توضیح جایگزین: چه عامل دیگری ممکن است همین نتیجه را به وجود آورده باشد؟'
      : 'Rival explanation: what other factor could produce the same observed pattern?',
    fa ? 'مقایسه: کدام دو مأموریت یا نتیجه را می‌توان با یک معیار مشخص کنار هم گذاشت؟'
      : 'Comparison: which missions, methods or findings can be compared using the same criteria?',
    input.gaps[0] ? (fa ? 'خلأ تحقیق: ' : 'Research gap: ') + input.gaps[0]
      : (fa ? 'چه چیزی هنوز اندازه‌گیری یا تأیید نشده است؟' : 'Knowledge boundary: what remains unmeasured or unverified?'),
    contradictionCount
      ? (fa ? 'بررسی اختلاف: تفاوت تاریخ، واحد یا روش اندازه‌گیری باعث اختلاف گزارش‌ها شده است؟'
        : 'Resolve the discrepancy: do differing sources use different dates, units or methods?')
      : (fa ? 'بررسی در زمان: آیا همین الگو در چند بازه جداگانه هم دیده می‌شود؟'
        : 'Temporal test: does the pattern recur across independent periods?'),
  ], 5);

  const actions: string[] = [];
  if (!input.news.length) actions.push(fa ? 'یک سند اولیه و معتبر درباره همین موضوع پیدا کن.'
    : 'Retrieve a credible primary document directly related to the topic.');
  if (input.independentPublisherFamilies < 2) actions.push(fa
    ? 'ادعاهای مهم را در یک منبع مستقل دیگر هم بررسی کن.'
    : 'Check important claims against another independent publisher family.');
  if (contradictionCount) actions.push(fa
    ? 'تاریخ، واحد، روش اندازه‌گیری و منبع اصلی هر اختلاف را کنار هم مقایسه کن.'
    : 'Compare date, unit, measurement method and original source for each discrepancy.');
  if (input.wikiObservations.length < 4) actions.push(fa
    ? 'برای بررسی روند، دست‌کم چهار ماه داده با روش یکسان جمع کن.'
    : 'Collect at least four consistently defined monthly observations before interpreting a trend.');
  if (input.videos.length < 3) actions.push(fa
    ? 'ویدئوهای بیشتری را بررسی کن؛ چند نمونه محدود را نماینده همه محتواها ندان.'
    : 'Broaden the video sample; do not treat a small sample as representative of the whole market.');
  if (input.entities.length < 3 || input.relations.length < 2) actions.push(fa
    ? 'نام‌ها و ارتباط‌های مهم را از متن منبع اصلی استخراج و بررسی کن.'
    : 'Extract related entities and relationships from primary sources, then verify them.');
  if (!actions.length) actions.push(fa
    ? 'یک توضیح جایگزین مطرح کن و مشخص کن چه مدرکی آن را تأیید یا رد می‌کند.'
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
    makeLens('evidence', fa ? '۱. اعتبار و تنوع منابع' : '1. Evidence quality and independence', evidenceStatus,
      fa ? 'بررسی می‌کند اطلاعات از کجا آمده‌اند، چقدر تازه‌اند و چند منبع مستقل آن‌ها را پوشش می‌دهند.' : 'Reviews provenance, freshness, diversity and sample size.',
      evidenceFindings, [fa ? 'چند خوراک از یک خانواده ناشر، تأیید مستقل متعدد نیست.' : 'Multiple feeds from one publisher family are not multiple independent confirmations.'], fa),
    makeLens('semantic', fa ? '۲. ارتباط موضوعی خبرها و ویدئوها' : '2. Semantic and lexical alignment',
      sharedTerms.length >= 2 ? 'mixed' : 'limited',
      fa ? 'بررسی می‌کند خبرها و ویدئوهای نمونه واقعاً درباره کدام بخش از موضوع‌اند.' : 'Compares topic vocabulary, publisher reports and sampled video titles.',
      semanticFindings, [fa ? 'مشترک بودن چند واژه به معنی یکی بودن محتوا یا تأیید متقابل خبرها نیست.' : 'Lexical overlap does not prove deep understanding or factual agreement.'], fa),
    makeLens('temporal', fa ? '۳. تغییرات در طول زمان' : '3. Temporal dynamics', temporalEnough ? 'mixed' : 'limited',
      fa ? 'تازه بودن خبرها را از تغییر بازدید مقاله‌های ویکی‌پدیا جداگانه بررسی می‌کند.' : 'Separates publication recency from the Wikimedia time-series direction.',
      temporalFindings, [fa ? 'تعداد خبرها معادل تقاضا نیست.' : 'Article counts are not demand.'], fa),
    makeLens('network', fa ? '۴. نام‌ها و ارتباط‌های مهم' : '4. Entity and relationship graph',
      input.entities.length >= 3 && input.relations.length >= 2 ? 'mixed' : 'limited',
      fa ? 'نام‌ها و ارتباط‌هایی را پیدا می‌کند که در چند منبع تکرار شده‌اند.' : 'Identifies frequent entities and document co-mentions.',
      networkFindings, [fa ? 'هم‌ذکری رابطه رسمی یا اثر علّی را اثبات نمی‌کند.' : 'Co-mention does not prove a formal relationship or causal influence.'], fa),
    makeLens('adversarial', fa ? '۵. بررسی اختلاف‌ها و دیدگاه مخالف' : '5. Adversarial review',
      contradictionCount ? 'warning' : input.gaps.length ? 'mixed' : 'limited',
      fa ? 'اختلاف گزارش‌ها و ادعاهایی را که هنوز سند کافی ندارند مشخص می‌کند.' : 'Surfaces discrepancies and claims that remain unverified.',
      adversarialFindings, [fa ? 'اختلاف باید با منبع اولیه و زمینه اندازه‌گیری بررسی شود.' : 'Discrepancies must be checked against primary sources and measurement context.'], fa),
    makeLens('causal', fa ? '۶. بررسی علت و معلول' : '6. Causal and counterfactual reasoning', 'hypothesis',
      fa ? 'اجازه نمی‌دهد هم‌زمانی دو اتفاق را به‌اشتباه رابطه علت و معلولی بدانیم.' : 'Prevents correlation from being mistaken for cause and effect.',
      causalFindings, [fa ? 'موتور آزمایش علّی اجرا نمی‌کند.' : 'The local engine does not run causal experiments.'], fa),
    makeLens('creative', fa ? '۷. پیدا کردن زاویه‌های تازه' : '7. Creative synthesis', 'hypothesis',
      fa ? 'از پرسش‌های بی‌پاسخ و توضیح‌های جایگزین، مسیرهای تازه‌ای برای تحقیق می‌سازد.' : 'Creates research directions from gaps and rival interpretations.',
      creativeDirections, [fa ? 'این موارد فرضیه‌اند، نه یافته اثبات‌شده.' : 'These are hypotheses, not established findings.'], fa),
    makeLens('decision', fa ? '۸. بهترین گام بعدی برای تحقیق' : '8. Next-best research actions', 'mixed',
      fa ? 'گام بعدی را بر اساس اینکه کدام کار ابهام مهم‌تری را برطرف می‌کند پیشنهاد می‌دهد.' : 'Prioritizes steps most likely to reduce uncertainty.',
      nextActions, [fa ? 'با ورود داده جدید، پیشنهادها دوباره محاسبه می‌شوند.' : 'Recommendations are recalculated when new evidence arrives.'], fa),
  ];

  return {
    version: 1, readiness, readinessLabel,
    synthesis: fa
      ? readiness === 'well-supported'
        ? 'چند منبع مستقل از موضوع پشتیبانی می‌کنند، اما نتیجه را فقط به همین نمونه تعمیم بده. اختلاف‌ها و محدودیت‌های منابع را هم جداگانه بررسی کن.'
        : readiness === 'developing'
          ? 'داده‌های فعلی چند فرضیه قابل بررسی می‌سازند، اما هنوز بعضی بخش‌ها ناقص‌اند. اول سراغ کاری برو که ابهام اصلی را کمتر می‌کند.'
          : 'هنوز شواهد کافی برای نتیجه‌گیری نداریم. این خروجی را فهرستی از پرسش‌های تحقیق بدان، نه جواب نهایی.'
      : readiness === 'well-supported'
        ? 'Several independent sources support parts of the picture, but the conclusion should stay limited to this sample.'
        : readiness === 'developing'
          ? 'The data suggests several useful questions, but important gaps remain. Start with the checks that would remove the biggest uncertainty.'
          : 'There is not enough evidence for a firm conclusion. Treat this as a list of questions to investigate, not a final answer.',
    lenses, creativeDirections, nextActions, centralEntities,
  };
}
