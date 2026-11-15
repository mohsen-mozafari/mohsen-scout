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

/**
 * Local-only editorial analysis. It consumes already fetched evidence and never
 * performs network requests, writes to storage, or sends source material to AI.
 */
export function buildInternalResearch(input: InternalResearchInput): InternalResearchResult {
  const topic = cleanTopic(input.topic);
  const newsByUrl = new Map<string, EngineNewsItem>();
  for (const item of input.news ?? []) {
    const key = item.sourceUrl || item.title.trim().toLowerCase();
    if (key) newsByUrl.set(key, item);
  }
  const news = [...newsByUrl.values()];
  const publisherNames = [...new Set(
    news.flatMap((item) => item.sourceName.split('·').map((name) => name.trim()).filter(Boolean)),
  )];
  const declaredPublisherCount = Math.max(0, ...(input.news ?? []).map((item) => item.sourceCount ?? 0));
  const publisherCount = Math.max(publisherNames.length, declaredPublisherCount);
  const videos = input.videos ?? [];
  const channelCount = new Set(videos.map((video) => video.channel)).size;
  const evidence: InternalEngineEvidence[] = [];

  if (news.length) {
    const newest = [...news].sort((a, b) => {
      const first = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const second = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return second - first;
    })[0];
    const publishers = publisherNames.length ? publisherNames.join(', ') : 'selected official feeds';
    evidence.push({
      id: 'publisher-news',
      label: 'Official publisher coverage',
      detail:
        news.length + ' matching report(s) across ' + publisherCount +
        ' selected feed source(s): ' + publishers +
        '. Feed coverage is not an independent fact-check or proof of audience demand.',
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
      detail:
        input.wiki.articleTitle + ' · ' + input.wiki.language.toUpperCase() +
        ' Wikipedia. ' +
        (latest
          ? 'Latest returned month: ' + latest.month + ', ' + latest.views.toLocaleString() + ' article pageviews.'
          : 'No monthly pageview observations were returned.') +
        ' Article pageviews are not search volume, unique people, or YouTube views.',
    });
  }

  if (videos.length) {
    evidence.push({
      id: 'youtube-sample',
      label: 'YouTube sample',
      detail:
        videos.length + ' returned video example(s) from ' + channelCount +
        ' distinct channel(s). Inspect the individual raw observations; this sample is not a complete YouTube market census.',
    });
  } else {
    evidence.push({
      id: 'youtube-sample',
      label: 'YouTube sample',
      detail: 'No YouTube sample was supplied. Competition has not been checked and no YouTube quota was used by this local analysis.',
    });
  }

  const hasAnyEvidence = news.length > 0 || Boolean(input.wiki) || videos.length > 0;
  const angles: InternalEngineAngle[] = [
    {
      id: 'evidence-audit',
      title: 'What does the evidence actually say?',
      hook: 'A story about ' + topic + ' raises one important question: what was directly observed, and what is interpretation?',
      approach: 'Build the video around the exact statement in the primary source. Separate measured observations from explanations, predictions and unanswered questions. Use the publisher wording and date visible in the source card.',
      verification: 'Can every factual sentence be traced to the linked primary source or a cited paper?',
    },
    {
      id: 'method-explainer',
      title: 'How do researchers know?',
      hook: 'Before accepting a headline about ' + topic + ', show viewers how the result was obtained.',
      approach: 'Explain the instrument, mission, observation method or analysis only when the source identifies it. Define unfamiliar terms and show what the method can—and cannot—measure.',
      verification: 'Does the source name the instrument or method? Do not guess missing technical details.',
    },
    {
      id: 'open-question',
      title: 'What remains unanswered?',
      hook: 'The most interesting part of ' + topic + ' may be what scientists still cannot conclude.',
      approach: 'End with the unresolved scientific question, the next observation that could help answer it, and the alternative explanations that remain open in the source material.',
      verification: 'Which uncertainty is explicitly acknowledged by the publisher or cited paper?',
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
    ...(hasAnyEvidence ? [] : ['No source evidence was supplied. Treat every angle as a starting question only.']),
  ];

  return {
    topic,
    summary: hasAnyEvidence
      ? 'The local engine connected the available source signals and produced three editorial angles plus a verification checklist. It did not call YouTube or OpenRouter.'
      : 'The local engine produced exploratory angles, but no source evidence was supplied. Research the primary sources before prioritizing this topic.',
    evidence,
    angles,
    verificationQuestions,
    limitations: limitationsList,
  };
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
      queries: [report.input.topic, 'YouTube popularity order'],
      concept:
        'Use the returned examples as reference points for explaining what the current sample covers. Add an original explanation and make clear that this is only a limited search sample.',
    },
    {
      suffix: 'A clear beginner explanation',
      queries: [report.input.topic + ' beginner guide'],
      concept:
        'Build a beginner-friendly explanation of ' + topic +
        '. Define essential terms, explain one central mechanism and verify each scientific statement against a primary source.',
    },
    {
      suffix: 'A useful comparison',
      queries: [report.input.topic + ' comparison', report.input.topic + ' common mistakes'],
      concept:
        'Develop a focused comparison or misconception-check around ' + topic +
        '. Use the returned search examples as prompts, then verify the claims rather than assuming the sample represents the whole topic.',
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
