import { create } from 'zustand';
import * as Haptics from 'expo-haptics';
import {
  defaults,
  purgeExpired,
  type LocalData,
  type ResearchInput,
  type Report,
  type Idea,
  type Video,
  uid,
  type ResearchActivityEngine,
  type ResearchActivityEvent,
  type ResearchActivityFeedback,
} from './types';
import { readData, writeData } from './storage';
import { getKey } from './vault';
import { localDateKey, nextBudget, nextOpenRouterUsage, searchYouTube, type YouTubeQuotaKind, type YouTubeQuotaOrigin } from './api';
import { buildInternalResearch } from './engine';
import { createResearchMemoryEntry } from './research-memory';
import { fetchWebResearch } from './web-research';
import { reviewIdeasAutomatically } from './ai-review';
import { generateEditorialIdeas, type IdeaGenerationCategory } from './idea-generation';
import { attachReportToIdea as attachReport, attachVideoReferenceToIdea as attachVideoReference, getOrCreateSourceIdea, type SourceIdeaInput } from './idea-research';
import { fetchSpaceNews, getCachedSpaceNews, getWikipediaSignal, hydrateSpaceNewsRegistry } from './space';
import { buildResearchInterestProfile, normalizeResearchText, type ResearchFeedbackProfile } from './intelligence';
import { runIndependentResearchStages } from './research-resilience';
import { recordRuntimeFinish, recordRuntimeStart } from './runtime-metrics';
import { appendResearchActivity, buildResearchActivityFeedbackProfile, buildResearchActivityResults, buildResearchActivitySourceExclusions, explainResearchActivitySourceExclusion, updateResearchActivityEvent, updateResearchActivityFeedback } from './research-activity';
type State = {
  data: LocalData;
  ready: boolean;
  busy: boolean;
  progress: string;
  error: string;
  boot: () => Promise<void>;
  commit: (change: (data: LocalData) => LocalData) => Promise<void>;
  setResearchActivityFeedback: (eventId: string, resultId: string, feedback: ResearchActivityFeedback) => Promise<void>;
  recordResearchActivity: (event: ResearchActivityEvent) => Promise<void>;
  research: (
    input: ResearchInput,
    origin?: YouTubeQuotaOrigin,
    forceRefresh?: boolean,
    ideaOptions?: { category?: IdeaGenerationCategory; limit?: number },
  ) => Promise<Report | undefined>;
  analyze: (id: string) => Promise<void>;
  saveVideo: (video: Video, topic: string) => Promise<void>;
  saveIdea: (idea: Idea) => Promise<void>;
  updateIdea: (idea: Idea) => Promise<void>;
  ensureSourceIdea: (input: SourceIdeaInput) => Promise<Idea>;
  linkReportToIdea: (ideaId: string, reportId: string) => Promise<void>;
  bookmarkVideoForIdea: (ideaId: string, videoId: string) => Promise<void>;
  charge: (units: number, kind?: YouTubeQuotaKind, origin?: YouTubeQuotaOrigin) => Promise<void>;
  clearError: () => void;
};
const RETENTION_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function buildLocalResearchFeedback(data: LocalData): ResearchFeedbackProfile {
  const activity = buildResearchActivityFeedbackProfile(data.researchActivity);
  const savedIdeas = buildResearchInterestProfile(data.ideas);
  const unique = (values: readonly string[], limit: number) => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const normalized = normalizeResearchText(value);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(value);
      if (result.length >= limit) break;
    }
    return result;
  };
  return {
    positiveTopics: unique([...activity.positiveTopics, ...savedIdeas.positiveTopics], 40),
    negativeTopics: unique([...activity.negativeTopics, ...savedIdeas.negativeTopics], 20),
  };
}
let lastRetentionSweepAt = 0;

let queue = Promise.resolve();
export const useScout = create<State>((set, get) => ({
  data: defaults(),
  ready: false,
  busy: false,
  progress: '',
  error: '',
  clearError: () => set({ error: '' }),
  setResearchActivityFeedback: async (eventId, resultId, feedback) => {
    await get().commit((data) => ({
      ...data,
      researchActivity: updateResearchActivityFeedback(data.researchActivity, eventId, resultId, feedback),
    }));
  },
  recordResearchActivity: async (event) => {
    await get().commit((data) => ({
      ...data,
      researchActivity: appendResearchActivity(data.researchActivity, event),
    }));
  },
  boot: async () => {
    try {
      const loaded = await readData();
      const now = Date.now();
      const data = purgeExpired(loaded, now);
      let retentionError = '';
      if (data !== loaded) {
        try {
          await writeData(data, loaded);
        } catch {
          retentionError = 'Local data opened, but expired YouTube metadata could not be pruned. Check available device storage.';
        }
      }
      lastRetentionSweepAt = retentionError ? 0 : now;
      hydrateSpaceNewsRegistry(data.feedRegistry);
      set({ data, ready: true, error: retentionError });
    } catch {
      set({ error: 'Could not open local data. Retry before making changes.', ready: false });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  },
  commit: async (change) => {
    const action = queue.then(async () => {
      if (!get().ready) throw new Error('Local data is not ready. Retry opening it.');
      const previousData = get().data;
      const changedData = change(previousData);
      const now = Date.now();
      const data = now - lastRetentionSweepAt >= RETENTION_SWEEP_INTERVAL_MS
        ? (lastRetentionSweepAt = now, purgeExpired(changedData, now))
        : changedData;
      try {
        // Persist only the data domains that changed. In particular, saving an AI
        // opinion must not rewrite large news/video/report rows in the same database.
        await writeData(data, previousData);
        set({ data });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const full = /SQLITE_FULL|database or disk is full|no space left/i.test(detail);
        const message = full
          ? 'SQLite reports that device storage is full. Free some space, reopen MOHSEN SCOUT, and retry.'
          : `Local database save failed: ${detail.slice(0, 220)}`;
        set({ error: message });
        throw new Error(message, { cause: error });
      }
    });
    queue = action.catch(() => {});
    await action;
  },
  charge: async (units, kind = 'other', origin = 'manual') => {
    await get().commit((data) => ({
      ...data,
      budget: nextBudget(data.budget, data.preferences.budget, units, new Date(), kind, origin),
    }));
  },
  research: async (input, origin = 'manual', forceRefresh = false, ideaOptions) => {
    if (get().busy) return undefined;
    const initialData = get().data;
    const initialPreferences = initialData.preferences;
    const sourceExclusions = buildResearchActivitySourceExclusions(initialData.researchActivity);
    const researchNiche = initialPreferences.customSpaceNiche.trim() ||
      (initialPreferences.selectedSpaceNiche !== 'all' ? initialPreferences.selectedSpaceNiche : input.topic.trim());
    let engineStarted = false;
    let engineRecorded = false;
    let engineActivityId: string | undefined;
    const warnings: string[] = [];
    const beginActivity = async (
      engine: ResearchActivityEngine,
      topic: string,
      query: string,
      reportId: string,
    ): Promise<string | undefined> => {
      const startedAt = Date.now();
      const event: ResearchActivityEvent = {
        id: uid(), engine, query: query.slice(0, 1600), topic,
        niche: researchNiche, startedAt, status: 'running', resultCount: 0,
        analyzedCount: 0, results: [], warnings: [], reportId,
      };
      try {
        await get().commit((data) => ({
          ...data,
          researchActivity: appendResearchActivity(data.researchActivity, event),
        }));
        return event.id;
      } catch {
        warnings.push(engine + ' activity could not be written to local history.');
        return undefined;
      }
    };
    const finishActivity = async (
      eventId: string | undefined,
      patch: Partial<ResearchActivityEvent>,
    ): Promise<void> => {
      if (!eventId) return;
      const completedAt = Date.now();
      try {
        await get().commit((data) => {
          const startedAt = data.researchActivity.find((event) => event.id === eventId)?.startedAt ?? completedAt;
          return {
            ...data,
            researchActivity: updateResearchActivityEvent(data.researchActivity, eventId, {
              ...patch,
              completedAt,
              durationMs: Math.max(0, completedAt - startedAt),
            }),
          };
        });
      } catch {
        warnings.push('A research activity result could not be saved to local history.');
      }
    };
    set({ busy: true, error: '', progress: 'Starting independent source collection…' });
    try {
      if (!input.topic.trim() || !input.languages.length)
        throw new Error('Enter a topic and choose at least one language.');
      const topic = input.topic.trim().replace(/\s+/g, ' ').slice(0, 180);
      const normalizedInput = { ...input, topic };
      const cached = forceRefresh ? undefined : get().data.reports.find(
        (report) =>
          JSON.stringify(report.input) === JSON.stringify(normalizedInput) &&
          Date.now() - report.createdAt < 15 * 60000,
      );
      if (cached) {
        set({ progress: 'Using a recent local research report.' });
        if (!cached.analyzed) await get().analyze(cached.id);
        return get().data.reports.find((item) => item.id === cached.id) ?? cached;
      }

      const researchReportId = uid();
      let youtubeResult: Awaited<ReturnType<typeof searchYouTube>> | undefined;
      let publisherNews = getCachedSpaceNews(get().data.feedRegistry, initialPreferences.spaceNewsSources);
      let feedRegistry = get().data.feedRegistry;
      let webItems: Awaited<ReturnType<typeof fetchWebResearch>>['items'] = [];
      let wiki: Awaited<ReturnType<typeof getWikipediaSignal>> | undefined;

      const splitSourcesByFeedback = <T extends { url: string }>(items: readonly T[]) => {
        const included: T[] = [];
        const excluded: { item: T; reason: string }[] = [];
        for (const item of items) {
          const reason = explainResearchActivitySourceExclusion(item.url, sourceExclusions);
          if (reason) excluded.push({ item, reason });
          else included.push(item);
        }
        return { included, excluded };
      };

      const youtubeTask = async () => {
        const key = await getKey('youtube').catch(() => undefined);
        if (!key) {
          warnings.push('YouTube sample skipped: add a YouTube Data API key in Settings. Independent web/publisher research can still continue.');
          return;
        }
        const activityId = await beginActivity('YouTube Data API', topic, topic, researchReportId);
        recordRuntimeStart('YouTube');
        set({ progress: 'Collecting a bounded YouTube Data API sample…' });
        try {
          youtubeResult = await searchYouTube(
            normalizedInput,
            {
              key,
              origin,
              charge: (units, kind = 'other') => get().charge(units, kind, origin),
              onQuota: (kind) =>
                get().commit((data) => ({
                  ...data,
                  budget: {
                    ...data.budget,
                    ...(kind === 'search' ? { searchExhausted: true } : { otherExhausted: true }),
                  },
                })),
            },
            (progress) => set({ progress }),
          );
          recordRuntimeFinish('YouTube', youtubeResult.videos.length ? 'success' : 'partial');
          warnings.push(...(youtubeResult.warnings ?? []));
          await finishActivity(activityId, {
            query: (youtubeResult.queries ?? []).join(' ; ') || topic,
            status: youtubeResult.videos.length
              ? ((youtubeResult.warnings ?? []).length ? 'partial' : 'success')
              : 'empty',
            resultCount: youtubeResult.videos.length,
            analyzedCount: 0,
            results: [],
            warnings: (youtubeResult.warnings ?? []).slice(0, 12),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'YouTube sample was unavailable.';
          recordRuntimeFinish('YouTube', 'error', message);
          warnings.push('YouTube sample unavailable: ' + message);
          await finishActivity(activityId, {
            status: 'error',
            error: message.slice(0, 700),
            warnings: [message.slice(0, 700)],
          });
        }
      };

      const feedTask = async () => {
        const activityId = await beginActivity(
          'Publisher Feeds', topic,
          'Refresh selected publisher feeds: ' + initialPreferences.spaceNewsSources.join(', ') + '; topic relevance is evaluated locally: ' + topic,
          researchReportId,
        );
        set({ progress: 'Refreshing selected NASA, ESA and publisher feeds…' });
        try {
          const result = await fetchSpaceNews(initialPreferences.spaceNewsSources, fetch, true);
          feedRegistry = result.registry;
          const rawPublisherNews = result.items.length
            ? result.items
            : getCachedSpaceNews(result.registry, initialPreferences.spaceNewsSources);
          const split = splitSourcesByFeedback(rawPublisherNews);
          publisherNews = split.included;
          warnings.push(...result.warnings);
          const usedCachedItems = result.items.length === 0 && rawPublisherNews.length > 0;
          const activityWarnings = [
            ...result.warnings,
            ...(usedCachedItems ? ['No fresh feed items were returned; retained cached publisher items were evaluated.'] : []),
            ...(split.excluded.length ? [split.excluded.length + ' publisher result(s) were excluded using saved source feedback.'] : []),
          ];
          await finishActivity(activityId, {
            status: rawPublisherNews.length
              ? (activityWarnings.length || !publisherNews.length ? 'partial' : 'success')
              : 'empty',
            resultCount: rawPublisherNews.length,
            analyzedCount: publisherNews.length,
            results: buildResearchActivityResults(topic, rawPublisherNews.map((item) => {
              const exclusion = explainResearchActivitySourceExclusion(item.url, sourceExclusions);
              return {
                id: item.id, title: item.title, summary: item.summary, sourceName: item.sourceName,
                url: item.url, publishedAt: item.publishedAt, sourceAssessment: 'configured-feed',
                includedInAnalysis: !exclusion,
                decisionReason: exclusion ?? 'Passed to the internal evidence pipeline; relevance, publication freshness, duplication and source diversity are evaluated before idea generation.',
              };
            })),
            warnings: activityWarnings.slice(0, 12),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Publisher-feed refresh failed.';
          warnings.push('Publisher-feed refresh failed; the last successful cached feed items were retained. ' + message);
          const rawPublisherNews = getCachedSpaceNews(feedRegistry, initialPreferences.spaceNewsSources);
          const split = splitSourcesByFeedback(rawPublisherNews);
          publisherNews = split.included;
          await finishActivity(activityId, {
            status: rawPublisherNews.length ? 'partial' : 'error',
            resultCount: rawPublisherNews.length,
            analyzedCount: publisherNews.length,
            results: buildResearchActivityResults(topic, rawPublisherNews.map((item) => {
              const exclusion = explainResearchActivitySourceExclusion(item.url, sourceExclusions);
              return {
                id: item.id, title: item.title, summary: item.summary, sourceName: item.sourceName,
                url: item.url, publishedAt: item.publishedAt, sourceAssessment: 'configured-feed',
                includedInAnalysis: !exclusion,
                decisionReason: exclusion ?? 'Retained cached publisher item; fresh feed retrieval failed, then source feedback was applied.',
              };
            })),
            error: message.slice(0, 700),
            warnings: [
              message.slice(0, 700),
              ...(split.excluded.length ? [split.excluded.length + ' cached publisher result(s) were excluded using saved source feedback.'] : []),
            ],
          });
        }
      };

      const webTask = async () => {
        if (!initialPreferences.webResearchEnabled) {
          warnings.push('Independent web search is disabled in Settings; selected RSS feeds and Wikimedia remain available.');
          return;
        }
        const activityId = await beginActivity('Firecrawl Search', topic, topic, researchReportId);
        set({ progress: 'Searching independent web and news sources…' });
        try {
          const webKey = await getKey('firecrawl').catch(() => undefined);
          const result = await fetchWebResearch(topic, {
            apiKey: webKey ?? undefined,
            limit: 6,
            days: normalizedInput.days,
          });
          const split = splitSourcesByFeedback(result.items);
          webItems = split.included;
          warnings.push(...result.warnings);
          const activityWarnings = [
            ...result.warnings,
            ...(split.excluded.length ? [split.excluded.length + ' Firecrawl result(s) were excluded using saved source feedback.'] : []),
          ];
          await finishActivity(activityId, {
            status: result.items.length
              ? (activityWarnings.length || !webItems.length ? 'partial' : 'success')
              : 'empty',
            resultCount: result.items.length,
            analyzedCount: webItems.length,
            results: buildResearchActivityResults(topic, result.items.map((item) => {
              const exclusion = explainResearchActivitySourceExclusion(item.url, sourceExclusions);
              return {
                id: item.id, title: item.title, summary: item.summary, sourceName: item.sourceName,
                url: item.url, publishedAt: item.publishedAt ?? null, sourceAssessment: 'not-assessed',
                includedInAnalysis: !exclusion,
                decisionReason: exclusion ?? 'Returned by Firecrawl and passed to internal analysis; publisher credibility is not inferred from search ranking.',
              };
            })),
            warnings: activityWarnings.slice(0, 12),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Firecrawl request failed.';
          warnings.push('Independent web search unavailable: ' + message + ' RSS and Wikimedia research continue independently.');
          await finishActivity(activityId, {
            status: 'error',
            error: message.slice(0, 700),
            warnings: [message.slice(0, 700)],
          });
        }
      };

      const wikiTask = async () => {
        const activityId = await beginActivity('Wikimedia', topic, topic + ' · article search and monthly pageviews · ' + (initialPreferences.spaceInterestLanguage ?? 'en'), researchReportId);
        recordRuntimeStart('Wikimedia');
        set({ progress: 'Checking Wikimedia public-interest context…' });
        try {
          const result = await getWikipediaSignal(topic, initialPreferences.spaceInterestLanguage ?? 'en');
          if (!result) {
            recordRuntimeFinish('Wikimedia', 'partial');
            await finishActivity(activityId, { status: 'empty', resultCount: 0, analyzedCount: 0 });
            return;
          }
          const exclusion = explainResearchActivitySourceExclusion(result.articleUrl, sourceExclusions);
          if (exclusion) {
            recordRuntimeFinish('Wikimedia', 'partial', exclusion);
            warnings.push('Wikimedia context was excluded using saved source feedback.');
            await finishActivity(activityId, {
              status: 'partial',
              resultCount: 1,
              analyzedCount: 0,
              results: buildResearchActivityResults(topic, [{
                title: result.articleTitle, summary: result.summary, sourceName: 'Wikimedia Pageviews',
                url: result.articleUrl, sourceAssessment: 'not-assessed', includedInAnalysis: false,
                decisionReason: exclusion,
              }]),
              warnings: [exclusion],
            });
            return;
          }
          wiki = result;
          recordRuntimeFinish('Wikimedia', 'success');
          await finishActivity(activityId, {
            status: 'success',
            resultCount: 1,
            analyzedCount: 1,
            results: buildResearchActivityResults(topic, [{
              title: result.articleTitle, summary: result.summary, sourceName: 'Wikimedia Pageviews',
              url: result.articleUrl, sourceAssessment: 'not-assessed', includedInAnalysis: true,
              decisionReason: 'Article context and monthly Wikimedia pageviews were passed as an independent attention proxy, not as YouTube demand or search volume.',
            }]),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Wikimedia unavailable.';
          recordRuntimeFinish('Wikimedia', 'error', message);
          warnings.push('Wikimedia article context was unavailable; this signal will not be inferred.');
          await finishActivity(activityId, {
            status: 'error',
            error: message.slice(0, 700),
            warnings: [message.slice(0, 700)],
          });
        }
      };

      recordRuntimeStart('Sources');
      const stageRun = await runIndependentResearchStages([
        { name: 'YouTube Data API', run: youtubeTask },
        { name: 'Publisher feeds', run: feedTask },
        { name: 'Independent web/news search', run: webTask },
        { name: 'Wikimedia', run: wikiTask },
      ]);
      for (const failure of stageRun.failures) {
        warnings.push(failure.name + ' failed unexpectedly; the other research sources continued independently.');
      }
      const independentSourcesReady = publisherNews.length > 0 || webItems.length > 0;
      recordRuntimeFinish('Sources', independentSourcesReady ? 'success' : 'partial', independentSourcesReady ? undefined : 'No independent publisher/web evidence was returned.');
      if (!publisherNews.length) warnings.push('No selected publisher-feed items are currently available.');
      if (!webItems.length && initialPreferences.webResearchEnabled)
        warnings.push('No independent web results were available in this run.');
      if (!wiki) warnings.push('No Wikimedia pageview/article signal was available in this run.');

      const currentData = get().data;
      const priorMemory = currentData.researchMemory.find(
        (entry) => normalizeResearchText(entry.topic) === normalizeResearchText(topic),
      );
      const engineNews = [
        ...publisherNews.map((item) => ({
          title: item.title,
          summary: item.summary,
          sourceName: item.sourceName,
          sourceUrl: item.url,
          publishedAt: item.publishedAt,
          sourceId: item.sourceId,
        })),
        ...webItems.map((item) => ({
          title: item.title,
          summary: item.summary,
          sourceName: item.sourceName,
          sourceUrl: item.url,
          publishedAt: item.publishedAt ?? null,
          sourceId: 'web:' + item.sourceName,
        })),
      ];

      engineActivityId = await beginActivity('Internal Engine', topic, 'Internal evidence analysis and editorial opportunity generation: ' + topic, researchReportId);
      recordRuntimeStart('Engine');
      engineStarted = true;
      set({ progress: 'Analyzing independent evidence and research gaps…' });
      const internalAnalysis = buildInternalResearch({
        topic,
        news: engineNews,
        wiki,
        // Map the stored video record into the engine's transient raw-only input shape.
        // Do not add this payload to the analysis result, persistence or external prompts.
        videos: (youtubeResult?.videos ?? []).map((video) => ({
          id: video.id,
          title: video.title,
          description: video.description,
          channel: video.channel,
          publishedAt: video.publishedAt,
          viewCount: video.viewCount ?? null,
          likeCount: video.likeCount ?? null,
        })),
        priorMemory,
        language: currentData.preferences.uiLanguage ?? 'fa',
      });

      const report: Report = {
        input: normalizedInput,
        videos: youtubeResult?.videos ?? [],
        queries: [
          ...(youtubeResult?.queries ?? []),
          ...(webItems.length ? ['Firecrawl web/news search: ' + topic] : []),
        ],
        warnings: [...new Set(warnings)],
        id: researchReportId,
        createdAt: Date.now(),
        analyzed: true,
      };

      const webContexts = webItems.map((item) => ({
        title: item.title,
        summary: item.summary,
        sourceName: item.sourceName,
        sourceUrl: item.url,
        publishedAt: item.publishedAt ?? null,
      }));
      const context = [
        ...webContexts,
        ...(wiki ? [{
          title: wiki.articleTitle,
          summary: wiki.summary,
          sourceName: 'Wikimedia',
          sourceUrl: wiki.articleUrl,
        }] : []),
      ];

      // Editorial ideas and their scores use only independent publisher/web/Wikimedia
      // evidence. YouTube API records stay in the separate raw sample/report domain.
      const generatedIdeas = generateEditorialIdeas({
        topic,
        news: publisherNews,
        context,
        reportId: report.id,
        priorMemory,
        existingIdeas: currentData.ideas,
        feedback: buildLocalResearchFeedback(currentData),
        region: normalizedInput.region,
        languages: normalizedInput.languages,
        language: currentData.preferences.uiLanguage ?? 'fa',
        ...(ideaOptions?.category ? { category: ideaOptions.category } : {}),
        limit: ideaOptions?.limit ?? 10,
      });

      await finishActivity(engineActivityId, {
        status: generatedIdeas.length ? 'success' : 'empty',
        resultCount: generatedIdeas.length,
        analyzedCount: engineNews.length + (wiki ? 1 : 0),
        results: buildResearchActivityResults(topic, generatedIdeas.map((idea) => ({
          id: idea.id,
          title: idea.topic,
          summary: idea.concept,
          sourceName: idea.sourceName ?? 'MOHSEN SCOUT Internal Engine',
          url: idea.sourceUrl,
          includedInAnalysis: true,
          decisionReason: idea.engineScoreReason ?? 'Generated from independent publisher, web and Wikimedia evidence.',
        }))),
      });

      const memoryEntry = createResearchMemoryEntry({
        topic,
        news: engineNews.map((item) => ({
          sourceId: item.sourceId,
          sourceName: item.sourceName,
          title: item.title,
          url: item.sourceUrl,
          publishedAt: item.publishedAt,
        })),
        analysis: internalAnalysis,
        previous: priorMemory,
        language: currentData.preferences.uiLanguage ?? 'fa',
      });

      if (!generatedIdeas.length) {
        report.warnings.push('No sufficiently distinct idea was supported by the independent publisher/web evidence in this run. The raw YouTube sample remains separate.');
      }
      await get().commit((data) => ({
        ...data,
        feedRegistry,
        reports: [report, ...data.reports],
        ideas: [...generatedIdeas, ...data.ideas],
        videos: [...new Map([...data.videos, ...(youtubeResult?.videos ?? [])].map((video) => [video.id, video])).values()],
        researchMemory: memoryEntry
          ? [
              memoryEntry,
              ...data.researchMemory.filter((entry) => normalizeResearchText(entry.topic) !== normalizeResearchText(topic)),
            ].slice(0, 40)
          : data.researchMemory,
        preferences: { ...data.preferences, lastInput: normalizedInput },
      }));
      recordRuntimeFinish('Engine', generatedIdeas.length ? 'success' : 'partial');
      engineRecorded = true;

      if (generatedIdeas.length && get().data.preferences.automaticExternalReview) {
        let aiActivityId: string | undefined;
        recordRuntimeStart('AI');
        try {
        set({ progress: 'Reviewing generated ideas with the configured AI-provider fallback chain…' });
        aiActivityId = await beginActivity(
          'AI Provider Review', topic,
          'Independent second-opinion review after local analysis: ' + generatedIdeas.slice(0, 8).map((idea) => idea.topic).join(' ; '),
          researchReportId,
        );
        const review = await reviewIdeasAutomatically(generatedIdeas, get().data.preferences, {
          language: get().data.preferences.uiLanguage ?? 'fa',
          beforeProviderRequest: async (config) => {
            if (config.provider !== 'openrouter') return;
            const preferences = get().data.preferences;
            const usage = nextOpenRouterUsage(
              preferences.openRouterUsageDay,
              preferences.openRouterRequestsToday,
              localDateKey(),
              preferences.openRouterDailyLimit ?? 50,
            );
            await get().commit((data) => ({
              ...data,
              preferences: { ...data.preferences, ...usage },
            }));
          },
        });
        if (review.opinions.length || review.warnings.length) {
          await get().commit((data) => ({
            ...data,
            opinions: [
              ...review.opinions,
              ...data.opinions.filter((opinion) => !review.opinions.some((item) => item.ideaId === opinion.ideaId)),
            ],
            reports: data.reports.map((item) => item.id === report.id
              ? { ...item, warnings: [...new Set([...item.warnings, ...review.warnings])] }
              : item),
          }));
        }
        const fallbackUsed = review.providerAttempts.some((attempt) =>
          attempt.status !== 'success' && attempt.status !== 'disabled',
        );
        recordRuntimeFinish('AI', review.opinions.length ? (fallbackUsed ? 'partial' : 'success') : 'partial', review.warnings.join(' '));
        const groupedAttempts = new Map<string, {
          provider: string;
          model: string;
          statuses: string[];
          messages: string[];
          ideaTopics: string[];
        }>();
        for (const attempt of review.providerAttempts) {
          const key = attempt.provider + '/' + attempt.model;
          const group = groupedAttempts.get(key) ?? {
            provider: attempt.provider,
            model: attempt.model,
            statuses: [],
            messages: [],
            ideaTopics: [],
          };
          group.statuses.push(attempt.status);
          group.messages.push(attempt.message.slice(0, 180));
          if (!group.ideaTopics.includes(attempt.ideaTopic)) group.ideaTopics.push(attempt.ideaTopic);
          groupedAttempts.set(key, group);
        }
        const providerActivity = [...groupedAttempts.values()].map((group) => ({
          id: group.provider + '/' + group.model,
          title: group.provider + ' · ' + group.model,
          summary: group.ideaTopics.slice(0, 3).join(' | ') +
            ' · ' + group.statuses.length + ' request(s): ' + group.statuses.join(', ') +
            ' · ' + group.messages.slice(0, 3).join(' | '),
          sourceName: group.provider,
          includedInAnalysis: false,
          decisionReason: 'Advisory second opinion requested after the internal ranking was completed. It is recorded for audit and does not alter internal evidence scores or reorder the local ideas.',
        }));
        await finishActivity(aiActivityId, {
          status: review.opinions.length
            ? (fallbackUsed || review.warnings.length ? 'partial' : 'success')
            : review.providerAttempts.length ? 'error' : 'skipped',
          resultCount: review.providerAttempts.length,
          analyzedCount: review.opinions.length,
          results: buildResearchActivityResults(topic, providerActivity),
          warnings: review.warnings.slice(0, 12),
        });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'AI second-opinion review failed.';
          recordRuntimeFinish('AI', 'partial', message);
          const warning = 'AI second-opinion review failed; the completed local research and generated ideas were preserved. ' + message.slice(0, 240);
          warnings.push(warning);
          await get().commit((data) => ({
            ...data,
            reports: data.reports.map((item) => item.id === report.id
              ? { ...item, warnings: [...new Set([...item.warnings, warning])] }
              : item),
          })).catch(() => {});
          await finishActivity(aiActivityId, {
            status: 'error',
            error: message.slice(0, 700),
            warnings: [message.slice(0, 700)],
          });
        }
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return get().data.reports.find((item) => item.id === report.id) ?? report;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Research could not finish. Try again.';
      if (engineStarted && !engineRecorded) recordRuntimeFinish('Engine', 'error', message);
      if (engineStarted && !engineRecorded) await finishActivity(engineActivityId, { status: 'error', error: message.slice(0, 700), warnings: [message.slice(0, 700)] });
      set({ error: message });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return undefined;
    } finally {
      set({ busy: false, progress: '' });
    }
  },
  analyze: async (id) => {
    const report = get().data.reports.find((r) => r.id === id);
    if (!report || report.analyzed) return;
    recordRuntimeStart('Engine');
    try {
    const currentData = get().data;
    const availableNews = getCachedSpaceNews(currentData.feedRegistry, currentData.preferences.spaceNewsSources);
    const priorMemory = currentData.researchMemory.find((entry) => normalizeResearchText(entry.topic) === normalizeResearchText(report.input.topic));
    const generatedIdeas = generateEditorialIdeas({
      topic: report.input.topic,
      news: availableNews,
      reportId: report.id,
      priorMemory,
      existingIdeas: currentData.ideas,
      feedback: buildLocalResearchFeedback(currentData),
      region: report.input.region,
      languages: report.input.languages,
      language: currentData.preferences.uiLanguage ?? 'fa',
      limit: 10,
    });
    await get().commit((data) => ({
      ...data,
      reports: data.reports.map((r) => (r.id === id ? { ...r, analyzed: true } : r)),
      ideas: [...generatedIdeas, ...data.ideas],
    }));
    recordRuntimeFinish('Engine', generatedIdeas.length ? 'success' : 'partial');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      recordRuntimeFinish('Engine', 'error', error instanceof Error ? error.message : String(error));
      throw error;
    }
  },
  saveVideo: async (video, topic) => {
    await get().commit((data) => ({
      ...data,
      links: data.links.some((l) => l.id === video.id)
        ? data.links
        : [
            {
              id: video.id,
              url: `https://www.youtube.com/watch?v=${video.id}`,
              manualTitle: '',
              topic,
              note: '',
              folder: '',
              tags: [],
              savedAt: Date.now(),
            },
            ...data.links,
          ],
    }));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  saveIdea: async (idea) => {
    await get().commit((data) => ({
      ...data,
      ideas: [
        { ...idea, status: 'Saved Opportunities' },
        ...data.ideas.filter((i) => i.id !== idea.id),
      ],
    }));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  updateIdea: async (idea) => {
    const previous = get().data.ideas.find((item) => item.id === idea.id);
    const closingTransition = Boolean(
      previous?.engineGenerated &&
      previous.status !== idea.status &&
      (idea.status === 'Completed Research' || idea.status === 'Rejected Ideas'),
    );
    if (closingTransition) recordRuntimeStart('Engine');
    let replenished = 0;
    try {
      await get().commit((data) => {
        const existing = data.ideas.find((item) => item.id === idea.id);
        const ideas = [{ ...idea }, ...data.ideas.filter((item) => item.id !== idea.id)];
        const closedNow = Boolean(
          existing?.engineGenerated &&
          existing.status !== idea.status &&
          (idea.status === 'Completed Research' || idea.status === 'Rejected Ideas'),
        );
        if (!closedNow) return { ...data, ideas };

        // Rotate to unused angles from the most recent retained report. This is local-only:
        // no YouTube quota is consumed until the user or scheduled cycle requests fresh data.
        const lastTopic = data.preferences.lastInput?.topic;
        const targetReport = data.reports.find((report) => report.id === idea.reportId) ??
          (lastTopic
            ? data.reports.find((report) =>
                normalizeResearchText(report.input.topic) === normalizeResearchText(lastTopic),
              )
            : data.reports[0]);
        const topic = targetReport?.input.topic ?? lastTopic ?? '';
        if (!topic) return { ...data, ideas };

        const now = Date.now();
        const news = getCachedSpaceNews(data.feedRegistry, data.preferences.spaceNewsSources);
        const priorMemory = data.researchMemory.find(
          (entry) => normalizeResearchText(entry.topic) === normalizeResearchText(topic),
        );
        const nextIdeas = generateEditorialIdeas({
          topic,
          news,
          ...(targetReport ? { reportId: targetReport.id } : {}),
          priorMemory,
          existingIdeas: ideas,
          feedback: buildLocalResearchFeedback(data),
          region: targetReport?.input.region ?? data.preferences.region,
          languages: targetReport?.input.languages ?? data.preferences.languages,
          language: data.preferences.uiLanguage ?? 'fa',
          limit: 10,
          now,
        });
        replenished = nextIdeas.length;
        return { ...data, ideas: [...nextIdeas, ...ideas] };
      });
      if (closingTransition) recordRuntimeFinish('Engine', replenished ? 'success' : 'partial');
    } catch (error) {
      if (closingTransition) recordRuntimeFinish('Engine', 'error', error instanceof Error ? error.message : String(error));
      throw error;
    }
  },
  ensureSourceIdea: async (input) => {
    const preview = getOrCreateSourceIdea(get().data, input);
    if (!preview.created) return preview.idea;
    let saved: Idea | undefined;
    await get().commit((data) => {
      const result = getOrCreateSourceIdea(data, input);
      saved = result.idea;
      return result.data;
    });
    if (!saved) throw new Error('The source idea could not be saved on this device.');
    return saved;
  },
  linkReportToIdea: async (ideaId, reportId) => {
    await get().commit((data) => attachReport(data, ideaId, reportId));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  bookmarkVideoForIdea: async (ideaId, videoId) => {
    await get().commit((data) => attachVideoReference(data, ideaId, videoId));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
}));
