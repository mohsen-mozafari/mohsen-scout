import { type Report, type Idea, uid } from './types';
import type { WikiSignal } from './space';
import type { YouTubeSampleVideo } from './api';

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
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where',
  'how', 'why', 'are', 'was', 'were', 'into', 'about', 'latest', 'new', 'best',
  'video', 'videos', 'guide', 'explained', 'update', 'updates', 'news',
]);

function evidenceTokens(value: string): string[] {
  return value.toLocaleLowerCase().normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .map((token) => token.endsWith('ies') && token.length > 4
      ? token.slice(0, -3) + 'y'
      : token.endsWith('s') && token.length > 4 ? token.slice(0, -1) : token);
}

/** Transparent lexical relevance over fetched text; it is not a market or audience score. */
export function topicRelevanceScore(topic: string, title: string, summary = ''): number {
  const terms = [...new Set(evidenceTokens(topic))];
  if (!terms.length) return 0;
  const titleTerms = new Set(evidenceTokens(title));
  const summaryTerms = new Set(evidenceTokens(summary));
  let score = 0;
  for (const term of terms) {
    if (titleTerms.has(term)) score += 3;
    else if (summaryTerms.has(term)) score += 1;
  }
  const normalizedTitle = title.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedTopic = topic.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  if (normalizedTopic.length > 3 && normalizedTitle.includes(normalizedTopic)) score += 4;
  return score;
}

export function rankNewsForTopic<T extends { title: string; summary: string; publishedAt: string | null }>(
  topic: string, items: readonly T[], limit = 6,
): T[] {
  return items
    .map((item, index) => ({ item, index, score: topicRelevanceScore(topic, item.title, item.summary) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score ||
      (b.item.publishedAt ? Date.parse(b.item.publishedAt) : 0) -
      (a.item.publishedAt ? Date.parse(a.item.publishedAt) : 0) || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.item);
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
  const newsByUrl = new Map<string, EngineNewsItem>();
  for (const item of input.news ?? []) {
    const key = item.sourceUrl || item.title.trim().toLowerCase();
    if (key) newsByUrl.set(key, item);
  }
  const allNews = [...newsByUrl.values()];
  const rankedNews = allNews
    .map((item, index) => ({ item, index, score: topicRelevanceScore(topic, item.title, item.summary) }))
    .sort((a, b) => b.score - a.score ||
      (b.item.publishedAt ? Date.parse(b.item.publishedAt) : 0) -
      (a.item.publishedAt ? Date.parse(a.item.publishedAt) : 0) || a.index - b.index);
  const matchedNews = rankedNews.filter((entry) => entry.score > 0);
  const news = (matchedNews.length ? matchedNews : rankedNews).slice(0, 12).map((entry) => entry.item);
  const publisherNames = [...new Set(news.flatMap((item) =>
    item.sourceName.split('·').map((name) => name.trim()).filter(Boolean)))];
  const declaredPublisherCount = Math.max(0, ...news.map((item) => item.sourceCount ?? 0));
  const publisherCount = Math.max(publisherNames.length, declaredPublisherCount);

  const videos = [...(input.videos ?? [])];
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
      label: 'Official publisher coverage',
      detail: news.length + ' selected report(s), ' + matchedNews.length +
        ' with direct topic-word matches, across ' + publisherCount +
        ' selected feed source(s): ' + publishers +
        '. Latest retrieved headline: “' + (newest?.title ?? 'not supplied') +
        '”. Feed coverage is not an independent fact-check or proof of audience demand.',
      sourceUrl: newest?.sourceUrl,
    });
  } else {
    evidence.push({
      id: 'publisher-news',
      label: 'Official publisher coverage',
      detail: 'No selected official RSS item was supplied to this analysis. Verify the original publisher before presenting a factual claim.',
    });
  }
  if (input.wiki) {
    const series = input.wiki.monthlyViews;
    const latest = series.length ? series[series.length - 1] : undefined;
    evidence.push({
      id: 'wikimedia',
      label: 'Public-interest proxy · Wikimedia',
      detail: input.wiki.articleTitle + ' · ' + input.wiki.language.toUpperCase() +
        ' Wikipedia. ' + (latest
          ? 'Latest returned month: ' + latest.month + ', ' + latest.views.toLocaleString() +
            ' article pageviews across ' + series.length + ' returned month(s).'
          : 'No monthly pageview observations were returned.') +
        ' Article pageviews are not search volume, unique people, or YouTube views.',
    });
  }
  if (videos.length) {
    evidence.push({
      id: 'youtube-sample',
      label: 'YouTube sample',
      detail: videos.length + ' returned video example(s) from ' + channelCount +
        ' distinct channel(s). Raw view counts are available for ' + views.length +
        ' sample(s) (median ' + (median(views)?.toLocaleString() ?? 'unavailable') +
        '); raw like counts are available for ' + likes.length +
        ' sample(s) (median ' + (median(likes)?.toLocaleString() ?? 'unavailable') + ').' +
        (mostViewed ? ' Highest-viewed returned example: “' + mostViewed.title + '” (' +
          mostViewed.viewCount!.toLocaleString() + ' views).' : ' No view count was returned.') +
        (mostLiked ? ' Highest-like returned example: “' + mostLiked.title + '” (' +
          mostLiked.likeCount!.toLocaleString() + ' likes).' : ' No like count was returned.') +
        ' These are observations from this limited sample, not a market-wide ranking or growth measure.',
    });
  } else {
    evidence.push({
      id: 'youtube-sample',
      label: 'YouTube sample',
      detail: 'No YouTube sample was supplied. Competition has not been checked and no YouTube quota was used by this local analysis.',
    });
  }

  const topicTerms = new Set(evidenceTokens(topic));
  const newsTerms = new Set(news.slice(0, 6).flatMap((item) => evidenceTokens(item.title)));
  const topicalVideos = rankedVideos.filter((entry) => entry.score > 0);
  const videoTerms = new Set(topicalVideos.slice(0, 12).flatMap((entry) => evidenceTokens(entry.video.title)));
  const sharedTerms = [...newsTerms].filter((term) => videoTerms.has(term) && !topicTerms.has(term)).slice(0, 6);
  if (sharedTerms.length) evidence.push({
    id: 'cross-source-overlap',
    label: 'Shared vocabulary across retrieved sources',
    detail: 'Retrieved publisher headlines and video titles share these exact topic words: ' +
      sharedTerms.join(', ') + '. This is text overlap in the returned sample, not proof of semantic agreement or market coverage.',
  });

  const newestNews = [...news].sort((a, b) =>
    (b.publishedAt ? Date.parse(b.publishedAt) : 0) -
    (a.publishedAt ? Date.parse(a.publishedAt) : 0))[0];
  const bestVideo = topicalVideos[0]?.video;
  const angles: InternalEngineAngle[] = [
    {
      id: 'evidence-audit',
      title: newestNews ? 'What the latest source actually establishes' : 'What evidence would establish this story?',
      hook: newestNews
        ? 'Start with the exact report: “' + newestNews.title + '”. What did the publisher observe, and what remains interpretation?'
        : 'A story about ' + topic + ' needs a primary observation before it becomes a factual video.',
      approach: newestNews
        ? 'Build the opening around the linked publisher report and its date. Separate the measured result from explanations and predictions. Do not add figures absent from the source.'
        : 'Locate a mission page, paper or official release; identify the direct observation, its date and method before scripting.',
      verification: 'Can each factual sentence be traced to the linked primary source or a cited paper?',
    },
    {
      id: 'youtube-sample',
      title: bestVideo ? 'What the returned YouTube sample emphasizes' : 'How to test audience-facing explanations',
      hook: bestVideo
        ? 'One returned example is “' + bestVideo.title + '”. What does this framing promise, and what would a more useful explanation add?'
        : 'Which explanation would make ' + topic + ' understandable to a viewer who is new to the subject?',
      approach: bestVideo
        ? 'Inspect title, publication date, raw views and likes of the topically relevant examples. Compare each title promise with the source evidence. Treat these as examples, not a complete competitor set.'
        : 'Use a manually checked set of topic-relevant videos to identify questions and formats already represented.',
      verification: 'Is the returned sample large and relevant enough for the comparison being made? What is still missing?',
    },
    {
      id: 'open-question',
      title: 'The most important unanswered question',
      hook: 'The strongest original angle may be the part of ' + topic + ' that the available sources still cannot answer.',
      approach: sharedTerms.length
        ? 'Publisher and video titles overlap on ' + sharedTerms.slice(0, 4).join(', ') +
          '. Look beyond those repeated words: identify a mechanism, uncertainty or measurement the source material leaves unresolved.'
        : 'Find the unresolved mechanism, competing interpretation or missing measurement. Distinguish an open scientific question from speculation.',
      verification: 'Which uncertainty is explicitly acknowledged by the publisher or cited paper, and what evidence could resolve it?',
    },
  ];

  const verificationQuestions = [
    'Does the primary source describe a direct measurement, an interpretation or a hypothesis?',
    'Can names, dates, figures and mission status be checked against the original publisher?',
    'Which important claim still needs a paper, mission page or independent source?',
    'What does the available evidence not establish?',
  ];
  const limitationsList = [
    'This engine runs locally on evidence already loaded in the app; it does not fetch new sources.',
    'Editorial angles are hypotheses, not scientific findings or predictions of views, growth or virality.',
    'Publisher feed coverage, Wikimedia article pageviews and YouTube samples are separate signals and must not be combined into a score.',
    ...(matchedNews.length < news.length && news.length
      ? ['Some supplied publisher items had no direct keyword overlap with the topic; treat them as broad context, not confirmed topic matches.']
      : []),
    ...(!news.length && !input.wiki && !videos.length
      ? ['No source evidence was supplied. Treat all angles as starting questions only.']
      : []),
  ];
  const summaryParts: string[] = [];
  if (news.length) summaryParts.push(news.length + ' publisher report(s) were inspected; ' +
    matchedNews.length + ' matched the topic wording directly across ' + publisherCount + ' selected feed source(s).');
  if (input.wiki) {
    const latest = input.wiki.monthlyViews[input.wiki.monthlyViews.length - 1];
    summaryParts.push(latest
      ? 'Wikimedia returned ' + latest.views.toLocaleString() + ' article pageviews in ' + latest.month + '.'
      : 'Wikimedia returned no monthly pageview observation.');
  }
  if (videos.length) summaryParts.push('The YouTube sample contains ' + videos.length + ' videos from ' +
    channelCount + ' channels; ' + views.length + ' view counts and ' + likes.length + ' like counts were available.');
  const hasAnyEvidence = news.length > 0 || Boolean(input.wiki) || videos.length > 0;
  const summary = hasAnyEvidence
    ? summaryParts.join(' ') + ' These signals remain separate observations; this engine does not calculate a composite opportunity score or predict performance.'
    : 'No source evidence was supplied. The local engine can prepare questions, but this topic is still exploratory until sources are checked.';
  return { topic, summary, evidence, angles, verificationQuestions, limitations: limitationsList };
}
function matchedVideos(report: Report, queries: readonly string[]) {
  const expected = new Set(queries.map((query) => query.trim().toLowerCase()));
  return report.videos.filter((video) => expected.has(video.query.trim().toLowerCase()));
}

/** Turns query buckets from a real manual search into evidence-linked ideas. */
export function buildIdeas(report: Report): Idea[] {
  const topic = cleanTopic(report.input.topic);
  const angleDefinitions = [
    {
      suffix: 'What current examples show',
      queries: [report.input.topic, 'YouTube popularity order', 'YouTube recent results'],
      concept:
        'Use the returned examples as reference points for explaining what the current sample covers. Add an original explanation and make clear that this is only a limited search sample.',
    },
    {
      suffix: 'A clear beginner explanation',
      queries: [report.input.topic + ' explained'],
      concept:
        'Build a beginner-friendly explanation of ' + topic +
        '. Define essential terms, explain one central mechanism and verify each scientific statement against a primary source.',
    },
    {
      suffix: 'What recently published examples add',
      queries: ['YouTube recent results'],
      concept:
        'Develop a focused comparison around ' + topic +
        '. State what is being compared, keep the criteria consistent and verify every factual claim rather than assuming the sample represents the whole topic.',
    },
    {
      suffix: 'A comparison worth verifying',
      queries: [],
      concept:
        'Choose one commonly repeated claim about ' + topic +
        ' only if a reliable source documents it. Test the claim against primary evidence, explain what is accurate or incomplete, and do not invent a myth if none is supported.',
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
        ? 'Internal engine linked ' + related.length +
          ' returned sample video(s) to this angle. Examples remain limited search evidence, not proof of demand or low competition.'
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

export function reasoning(idea: Idea, observedVideoCount = idea.videoIds.length) {
  if (observedVideoCount <= 0) {
    return 'No currently available related YouTube examples are linked to this idea. It remains an editorial hypothesis; gather evidence before prioritizing it.';
  }
  return 'The internal engine linked ' + observedVideoCount +
    ' returned sample video example(s) to this idea. They are reference points only—not proof of audience demand, low competition or future growth.';
}
