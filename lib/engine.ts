import { type Report, type Idea, uid } from './types';
export const limitations =
  'This is a limited YouTube search sample, not a real-time trend report. Region controls availability, not audience location. Language is a relevance hint, not a strict language filter. Search ordering is supplied by YouTube. No demand, growth, competition score, or viral prediction is inferred.';
export function buildIdeas(report: Report): Idea[] {
  const angles = [
    {
      suffix: 'A practical first step',
      concept: `A hands-on beginner walkthrough of ${report.input.topic}, with one achievable outcome.`,
      query: `${report.input.topic} beginner guide`,
    },
    {
      suffix: 'Mistakes worth explaining',
      concept: `Explain common pitfalls in ${report.input.topic}, using your own experience and examples.`,
      query: `${report.input.topic} common mistakes`,
    },
    {
      suffix: 'A useful comparison',
      concept: `Compare approaches to ${report.input.topic} for a specific audience and make the trade-offs clear.`,
      query: `${report.input.topic} comparison`,
    },
  ];
  const priority: Idea['assessment'][] = [
    'Strong Opportunity',
    'Promising',
    'Worth Exploring',
    'Uncertain',
    'Highly Competitive',
  ];
  return angles
    .map(
      (angle): Idea => ({
        id: uid(),
        topic: `${report.input.topic} · ${angle.suffix}`,
        concept: angle.concept,
        note: '',
        status: 'New Discoveries',
        decision: '',
        videoIds: report.videos.filter((v) => v.query === angle.query).map((v) => v.id),
        imageUrl: report.videos.find((v) => v.query === angle.query)?.thumbnail,
        createdAt: Date.now(),
        archived: false,
        assessment: report.videos.some((v) => v.query === angle.query)
          ? 'Worth Exploring'
          : 'Uncertain',
        region: report.input.region,
        languages: report.input.languages,
        reportId: report.id,
      }),
    )
    .sort((a, b) => priority.indexOf(a.assessment) - priority.indexOf(b.assessment));
}
export function reasoning(idea: Idea) {
  return idea.assessment === 'Uncertain'
    ? 'Insufficient evidence for this angle. This is a query-based editorial hypothesis, not an observed market gap.'
    : 'A related search returned actual videos. This establishes an example to investigate, not demand or low competition. Assess usefulness and feasibility yourself.';
}
