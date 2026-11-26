import type { YouTubeSampleVideo } from './api';
import type { InternalResearchResult } from './engine';
import type { SpaceNewsItem, WikiSignal } from './space';
import { matchesResearchTerms } from './intelligence';

export type ResearchGraphGroupId = 'sources' | 'youtube' | 'context' | 'evidence' | 'entities' | 'concepts' | 'findings' | 'angles' | 'ideas';

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

export type ResearchGraphNodeType = 'topic' | 'publisher' | 'news' | 'youtube' | 'context' | 'evidence' | 'entity' | 'concept' | 'finding' | 'idea';
export type ResearchGraphNode = ResearchGraphItem & { type: ResearchGraphNodeType; groupId?: ResearchGraphGroupId };
export type ResearchGraphEdge = { id: string; source: string; target: string; relation: string };
export type ResearchGraphModel = { topic: string; summary: string; groups: ResearchGraphGroup[]; nodes: ResearchGraphNode[]; edges: ResearchGraphEdge[] };

export type ResearchGraphIdeaInput = {
  id: string;
  topic: string;
  concept: string;
  videoIds: string[];
  sourceUrl?: string;
  sourceName?: string;
  ideaCategory?: string;
};

export type BuildResearchGraphInput = {
  topic: string;
  news: readonly SpaceNewsItem[];
  wiki?: WikiSignal;
  videos: readonly YouTubeSampleVideo[];
  analysis: InternalResearchResult;
  language: 'fa' | 'en';
  generatedIdeas?: readonly ResearchGraphIdeaInput[];
};

export function buildResearchGraphModel(input: BuildResearchGraphInput): ResearchGraphModel {
  // Raw YouTube API samples stay on their dedicated results screen. This graph is an
  // independent-source view and must not merge or correlate YouTube metadata.
  const rawDisplayVideos: BuildResearchGraphInput['videos'] = [];
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

  if (rawDisplayVideos.length) {
    groups.push({
      id: 'youtube',
      title: text('YouTube sample', 'نمونه یوتیوب'),
      items: rawDisplayVideos.map((video) => ({
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
  if (input.analysis.entityCandidates.length) {
    groups.push({
      id: 'entities',
      title: text('Recognized entities & co-mentions', 'موجودیت‌های شناخته‌شده و هم‌ذکری‌ها'),
      items: input.analysis.entityCandidates.map((entity) => ({
        id: 'entity-' + entity.id,
        title: entity.name,
        meta: entity.kind + ' · ' + number(entity.mentionCount) + ' ' + text('mentions', 'ذکر'),
        detail: [
          text('Known aliases: ', 'نام‌های جایگزین شناخته‌شده: ') + entity.aliases.join(', '),
          text('Evidence records: ', 'رکوردهای شاهد: ') + entity.evidenceIds.join(', '),
          text('Publisher/source IDs: ', 'شناسه منابع: ') + (entity.sourceIds.join(', ') || text('not available', 'ناموجود')),
          ...input.analysis.entityRelations
            .filter((relation) => relation.fromEntityId === entity.id || relation.toEntityId === entity.id)
            .map((relation) => {
              const otherId = relation.fromEntityId === entity.id ? relation.toEntityId : relation.fromEntityId;
              const other = input.analysis.entityCandidates.find((candidate) => candidate.id === otherId);
              return text('Co-mentioned with: ', 'هم‌ذکر با: ') + (other?.name ?? otherId) +
                ' · ' + relation.evidenceCount + ' ' + text('evidence record(s)', 'رکورد شاهد');
            }),
          text('A co-mention indicates that names occur in the same evidence record; it does not establish causation or a verified relationship.', 'هم‌ذکری فقط یعنی نام‌ها در یک رکورد شاهد کنار هم آمده‌اند و رابطه علّی یا ارتباط قطعی را ثابت نمی‌کند.'),
        ].join('\n'),
      })),
    });
  }

  if (input.analysis.emergentConcepts.length) {
    groups.push({
      id: 'concepts',
      title: text('Emerging evidence concepts', 'مفاهیم نوظهور در شواهد'),
      items: input.analysis.emergentConcepts.map((concept) => ({
        id: 'concept-' + concept.id,
        title: concept.term,
        meta: number(concept.evidenceIds.length) + ' ' + text('evidence documents', 'سند شاهد') +
          ' · ' + number(concept.sourceCount) + ' ' + text('source IDs', 'شناسه منبع') +
          ' · ' + number(concept.mentionCount) + ' ' + text('mentions', 'ذکر'),
        detail: [
          text('Evidence records: ', 'رکوردهای شاهد: ') + concept.evidenceIds.join(', '),
          text('Contributing publisher IDs: ', 'شناسه ناشران مشارکت‌کننده: ') + concept.sourceIds.join(', '),
          text('These are recurring words in the retrieved sample, not verified entities or causal claims.', 'این‌ها واژه‌های پرتکرار در نمونه دریافت‌شده‌اند، نه موجودیت تأییدشده یا ادعای علّی.'),
          ...input.analysis.conceptRelations
            .filter((relation) => relation.fromConceptId === concept.id || relation.toConceptId === concept.id)
            .map((relation) => {
              const otherId = relation.fromConceptId === concept.id ? relation.toConceptId : relation.fromConceptId;
              const other = input.analysis.emergentConcepts.find((item) => item.id === otherId);
              return text('Co-occurs with: ', 'هم‌رخداد با: ') + (other?.term ?? otherId) +
                ' · ' + number(relation.cooccurrenceCount) + ' ' + text('shared documents', 'سند مشترک');
            }),
        ].join('\\n'),
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

  if (input.generatedIdeas?.length) {
    groups.push({
      id: 'ideas',
      title: text('Generated ideas', 'ایده‌های تولیدشده'),
      items: input.generatedIdeas.map((idea) => ({
        id: 'idea-' + idea.id,
        title: idea.topic,
        meta: [idea.ideaCategory, text('Generated from this research', 'تولیدشده از این تحقیق')].filter(Boolean).join(' · '),
        detail: idea.concept,
        ...(idea.sourceUrl ? { url: idea.sourceUrl } : {}),
      })),
    });
  }

  const nodes: ResearchGraphNode[] = [
    { id: 'topic-root', type: 'topic', title: input.topic, meta: text('Research topic', 'موضوع تحقیق'), detail: input.analysis.summary },
    ...groups.flatMap((group) => group.items.map((item): ResearchGraphNode => ({
      ...item,
      type: group.id === 'sources' ? 'news'
        : group.id === 'youtube' ? 'youtube'
          : group.id === 'context' ? 'context'
            : group.id === 'evidence' ? 'evidence'
              : group.id === 'entities' ? 'entity'
                : group.id === 'concepts' ? 'concept'
                  : group.id === 'angles' || group.id === 'ideas' ? 'idea' : 'finding',
      groupId: group.id,
    }))),
  ];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: ResearchGraphEdge[] = [];
  const edgeIds = new Set<string>();
  const addEdge = (source: string, target: string, relation: string) => {
    if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) return;
    const id = source + '|' + relation + '|' + target;
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push({ id, source, target, relation });
  };
  for (const node of nodes) {
    if (node.id !== 'topic-root') addEdge('topic-root', node.id, text('included in this research', 'بخشی از این تحقیق'));
  }

  const publisherIds = new Map<string, string>();
  for (const item of input.news) {
    const publisherKey = item.sourceId + ':' + item.sourceName;
    const publisherId = 'publisher:' + publisherKey;
    if (!publisherIds.has(publisherKey)) {
      publisherIds.set(publisherKey, publisherId);
      nodes.push({
        id: publisherId, type: 'publisher', title: item.sourceName,
        meta: text('Original publisher', 'ناشر اصلی'),
        detail: text('Publisher identity comes from the official feed item.', 'هویت ناشر از آیتم خوراک رسمی گرفته شده است.'),
      });
      nodeIds.add(publisherId);
      addEdge('topic-root', publisherId, text('source in this research', 'منبع این تحقیق'));
    }
    addEdge('source-' + item.id, publisherId, text('published by', 'منتشرشده توسط'));
  }
  for (const entity of input.analysis.entityCandidates) {
    const entityNodeId = 'entity-' + entity.id;
    for (const story of input.news) {
      if (entity.evidenceIds.includes(story.url) || entity.evidenceIds.includes(story.id))
        addEdge('source-' + story.id, entityNodeId, text('mentions entity', 'به این موجودیت اشاره می‌کند'));
    }
    for (const video of rawDisplayVideos) {
      if (entity.evidenceIds.includes('youtube:' + video.id))
        addEdge('video-' + video.id, entityNodeId, text('mentions entity in temporary sample', 'ذکر موجودیت در نمونه موقت'));
    }
  }
  for (const relation of input.analysis.entityRelations) {
    addEdge(
      'entity-' + relation.fromEntityId,
      'entity-' + relation.toEntityId,
      text('co-mentioned in ' + relation.evidenceCount + ' evidence record(s)', 'هم‌ذکر در ' + relation.evidenceCount + ' رکورد شاهد'),
    );
  }

  for (const concept of input.analysis.emergentConcepts) {
    for (const story of input.news) {
      if (
        concept.evidenceIds.includes(story.url) ||
        concept.evidenceIds.includes(story.id) ||
        Boolean(story.sourceId && concept.sourceIds.includes(story.sourceId))
      ) {
        addEdge('source-' + story.id, 'concept-' + concept.id, text('contains recurring term', 'دارای واژه پرتکرار'));
      }
    }
  }
  for (const relation of input.analysis.conceptRelations) {
    addEdge(
      'concept-' + relation.fromConceptId,
      'concept-' + relation.toConceptId,
      text('co-occurs across ' + relation.cooccurrenceCount + ' evidence documents', 'هم‌رخداد در ' + relation.cooccurrenceCount + ' سند شاهد'),
    );
  }

  if (nodeIds.has('evidence-publisher-news')) {
    for (const item of input.news) addEdge('source-' + item.id, 'evidence-publisher-news', text('represented in news evidence', 'بازتاب‌یافته در شواهد خبری'));
  }
  if (nodeIds.has('evidence-youtube-sample')) {
    for (const video of rawDisplayVideos) addEdge('video-' + video.id, 'evidence-youtube-sample', text('represented in video sample', 'بازتاب‌یافته در نمونه ویدئویی'));
  }
  if (nodeIds.has('wikimedia-article') && nodeIds.has('evidence-wikimedia')) {
    addEdge('wikimedia-article', 'evidence-wikimedia', text('context for', 'زمینه برای'));
  }

  const shared = input.analysis.intelligence.sharedConcepts
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .slice(0, 24);
  if (shared.length && input.news.length && rawDisplayVideos.length) {
    // Index matches once per shared term. A bounded edge budget prevents a large
    // retained corpus from producing a quadratic graph rebuild or a UI freeze.
    const newsByTerm = new Map<string, SpaceNewsItem[]>();
    const videosByTerm = new Map<string, YouTubeSampleVideo[]>();
    for (const term of shared) {
      const matchedNews = input.news.filter((story) =>
        matchesResearchTerms(story.title + ' ' + story.summary, [term]));
      const matchedVideos = rawDisplayVideos.filter((video) =>
        matchesResearchTerms(video.title + ' ' + video.description, [term]));
      if (matchedNews.length && matchedVideos.length) {
        newsByTerm.set(term, matchedNews);
        videosByTerm.set(term, matchedVideos);
      }
    }
    let crossSourceEdges = 0;
    const maxCrossSourceEdges = 1200;
    for (const term of shared) {
      const matchedNews = newsByTerm.get(term) ?? [];
      const matchedVideos = videosByTerm.get(term) ?? [];
      for (const story of matchedNews) {
        for (const video of matchedVideos) {
          if (crossSourceEdges >= maxCrossSourceEdges) break;
          addEdge('source-' + story.id, 'video-' + video.id,
            text('word overlap only: ', 'فقط هم‌پوشانی واژگانی: ') + term);
          crossSourceEdges += 1;
        }
        if (crossSourceEdges >= maxCrossSourceEdges) break;
      }
      if (crossSourceEdges >= maxCrossSourceEdges) break;
    }
  }
  for (const idea of input.generatedIdeas ?? []) {
    const ideaNodeId = 'idea-' + idea.id;
    if (idea.sourceUrl) {
      for (const story of input.news.filter((item) => item.url === idea.sourceUrl)) {
        addEdge(ideaNodeId, 'source-' + story.id, text('generated from official source', 'تولیدشده از منبع رسمی'));
      }
    }
    for (const videoId of idea.videoIds) {
      addEdge(ideaNodeId, 'video-' + videoId, text('references temporary YouTube sample', 'ارجاع به نمونه موقت یوتیوب'));
    }
  }
  const evidenceNodes = nodes.filter((node) => node.type === 'evidence');
  for (const idea of nodes.filter((node) => node.type === 'idea')) {
    for (const evidence of evidenceNodes) {
      addEdge(idea.id, evidence.id, text('editorial hypothesis derived from analysis', 'فرضیه محتوایی برگرفته از تحلیل'));
    }
  }
  return { topic: input.topic, summary: input.analysis.summary, groups, nodes, edges };
}
