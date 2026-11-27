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
  type ResearchDossier,
} from './types';
import { readData, writeData } from './storage';
import { getKey } from './vault';
import { localDateKey, nextBudget, nextOpenRouterUsage, searchYouTube, type YouTubeSampleVideo, type YouTubeQuotaKind, type YouTubeQuotaOrigin } from './api';
import { buildInternalResearch } from './engine';
import { reviewResearchHypotheses } from './hypothesis-engine';
import { getConfiguredResearchProviderCount, runResearchAgentSerialized, withResearchProviderQueue } from './research-agent';
import { createResearchMemoryEntry, mergeResearchMemoryEntries } from './research-memory';
import { enrichResearchEvidence, fetchWebResearch } from './web-research';
import { reviewIdeasAutomatically } from './ai-review';
import { generateEditorialIdeas, type IdeaGenerationCategory } from './idea-generation';
import { attachReportToIdea as attachReport, attachVideoReferenceToIdea as attachVideoReference, getOrCreateSourceIdea, type SourceIdeaInput } from './idea-research';
import { fetchSpaceNews, getCachedSpaceNews, getWikipediaSignal, hydrateSpaceNewsRegistry } from './space';
import { buildResearchInterestProfile, normalizeResearchText, type ResearchFeedbackProfile } from './intelligence';
import { recordRuntimeFinish, recordRuntimeStart } from './runtime-metrics';
import { readPendingResearch, getPendingResearch, savePendingResearch, updatePendingResearch, clearPendingResearch } from './pending-research';
import { captureYouTubeSnapshots } from './youtube-growth';
import {
  acquireManualResearchLease,
  availableAutonomousResearchRunSlots,
  isManualResearchActive,
  mapWithConcurrency,
  MAX_CONCURRENT_RESEARCH_RUNS,
} from './research-concurrency';
import { appendResearchActivity, buildResearchActivityFeedbackProfile, buildResearchActivityResults, buildResearchActivitySourceExclusions, explainResearchActivitySourceExclusion, updateResearchActivityEvent, updateResearchActivityFeedback } from './research-activity';
import { MAX_DEEP_RESEARCH_EVIDENCE, MAX_DEEP_RESEARCH_QUERIES, MAX_DEEP_RESEARCH_RESULTS_PER_QUERY, MAX_DEEP_RESEARCH_ROUNDS, planResearchRound, researchQueriesPerRound } from './research-orchestrator';
type State = {
  data: LocalData;
  ready: boolean;
  busy: boolean;
  activeResearchRuns: number;
  progress: string;
  error: string;
  boot: () => Promise<void>;
  resumePendingResearch: (options?: { maxAgeMs?: number; excludeIds?: readonly string[] }) => Promise<void>;
  saveYouTubeSample: (videos: readonly Video[]) => Promise<Video[]>;
  commit: (change: (data: LocalData) => LocalData) => Promise<void>;
  setResearchActivityFeedback: (eventId: string, resultId: string, feedback: ResearchActivityFeedback) => Promise<void>;
  recordResearchActivity: (event: ResearchActivityEvent) => Promise<void>;
  research: (
    input: ResearchInput,
    origin?: YouTubeQuotaOrigin,
    forceRefresh?: boolean,
    ideaOptions?: { category?: IdeaGenerationCategory; limit?: number },
    taskId?: string,
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

function mergeGeneratedIdeas(existing: readonly Idea[], incoming: readonly Idea[]): Idea[] {
  if (!incoming.length) return [...existing];
  const replacements = new Map(incoming.map((idea) => [idea.id, idea]));
  return [...incoming, ...existing.filter((idea) => !replacements.has(idea.id))];
}

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
let resumePendingResearchInProgress = false;
let snapshotWriteQueue = Promise.resolve();

let queue = Promise.resolve();
export const useScout = create<State>((set, get) => ({
  data: defaults(),
  ready: false,
  busy: false,
  activeResearchRuns: 0,
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
      // Foreground autonomous discovery performs fresh-topic collection before recovery.
    } catch {
      set({ error: 'Could not open local data. Retry before making changes.', ready: false });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  },
  resumePendingResearch: async (options) => {
    if (resumePendingResearchInProgress || isManualResearchActive() || !get().ready || availableAutonomousResearchRunSlots(get().activeResearchRuns) <= 0) return;
    resumePendingResearchInProgress = true;
    try {
      const pending = await readPendingResearch();
      if (!pending.length || !get().ready || isManualResearchActive()) return;
      const analyzedReportIds = new Set(get().data.reports.filter((report) => report.analyzed).map((report) => report.id));
      const completed = pending.filter((item) => item.stage === 'ideas-saved' || Boolean(item.reportId && analyzedReportIds.has(item.reportId)));
      if (completed.length) await Promise.all(completed.map((item) => clearPendingResearch(item.id)));
      const completedIds = new Set(completed.map((item) => item.id));
      const excluded = new Set(options?.excludeIds ?? []);
      const candidates = pending.filter((item) => !completedIds.has(item.id) && !excluded.has(item.id) &&
        (options?.maxAgeMs === undefined || Date.now() - item.savedAt <= options.maxAgeMs))
        .slice(0, availableAutonomousResearchRunSlots(get().activeResearchRuns));
      if (!candidates.length || isManualResearchActive()) return;
      set({ progress: 'Resuming interrupted research tasks from this device…' });
      const outcomes = await Promise.all(candidates.map((item) => get().research(item.input, 'automatic', true, undefined, item.id)));
      await Promise.all(outcomes.flatMap((report, index) => report ? [clearPendingResearch(candidates[index]!.id)] : []));
    } catch {
      set({ error: 'One or more interrupted research tasks could not resume. Their local checkpoints were retained.' });
    } finally {
      resumePendingResearchInProgress = false;
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
  saveYouTubeSample: async (videos) => {
    let enriched: Video[] = [];
    const action = snapshotWriteQueue.then(async () => {
      const current = get().data;
      const newestSnapshotAt = current.youtubeSnapshots.reduce((latest, item) => Math.max(latest, item.capturedAt), 0);
      const capturedAt = Math.max(Date.now(), newestSnapshotAt + 1);
      const batch = captureYouTubeSnapshots(videos, current.youtubeSnapshots, capturedAt);
      enriched = batch.videos;
      await get().commit((data) => ({
        ...data,
        videos: [...new Map([...data.videos, ...enriched].map((video) => [video.id, video])).values()],
        youtubeSnapshots: batch.history,
      }));
    });
    snapshotWriteQueue = action.then(() => undefined, () => undefined);
    await action;
    return enriched;
  },
  research: async (input, origin = 'manual', forceRefresh = false, ideaOptions, taskId) => {
    if (!get().ready || get().activeResearchRuns >= MAX_CONCURRENT_RESEARCH_RUNS) return undefined;
    const releaseManualLease = origin === 'manual' ? acquireManualResearchLease() : undefined;
    const runId = taskId ?? uid();
    set((state) => ({ activeResearchRuns: state.activeResearchRuns + 1, busy: true, error: '', progress: 'Starting independent source collection…' }));
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
        await clearPendingResearch(runId);
        set({ progress: 'Using a recent local research report.' });
        if (!cached.analyzed) await get().analyze(cached.id);
        return get().data.reports.find((item) => item.id === cached.id) ?? cached;
      }

      const savedCheckpoint = await getPendingResearch(runId);
      const researchReportId = savedCheckpoint?.reportId ?? uid();
      await savePendingResearch(normalizedInput, runId, researchReportId);
      let youtubeResult: Awaited<ReturnType<typeof searchYouTube>> | undefined;
      const checkpointReport = savedCheckpoint?.reportId
        ? get().data.reports.find((report) => report.id === savedCheckpoint.reportId)
        : undefined;
      let researchVideos: Video[] = checkpointReport?.videos ?? [];
      let youtubeTaskPromise: Promise<void> | undefined;
      let publisherNews = getCachedSpaceNews(get().data.feedRegistry, initialPreferences.spaceNewsSources);
      let feedRegistry = get().data.feedRegistry;
      let webItems: Awaited<ReturnType<typeof fetchWebResearch>>['items'] = [];
      let webSearchQueries: string[] = [];
      let webResearchDossier: ResearchDossier | undefined;
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
        if (checkpointReport?.videos.length) {
          warnings.push('Resumed from the saved YouTube sample; no new quota was used for this stage.');
          return;
        }
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
          try {
            researchVideos = await get().saveYouTubeSample(youtubeResult.videos);
            const partialReport: Report = {
              id: researchReportId, input: normalizedInput, videos: researchVideos,
              queries: [...(youtubeResult.queries ?? [])], warnings: [...(youtubeResult.warnings ?? [])],
              createdAt: Date.now(), analyzed: false,
            };
            await get().commit((data) => ({
              ...data, reports: [partialReport, ...data.reports.filter((report) => report.id !== researchReportId)],
            }));
            await updatePendingResearch(runId, { stage: 'youtube-saved' });
          } catch (error) {
            warnings.push('YouTube sample was received but its local snapshot could not be persisted: ' +
              (error instanceof Error ? error.message : 'local storage unavailable.'));
            researchVideos = youtubeResult.videos;
          }
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
          warnings.push('Independent web search is disabled in Settings; YouTube platform analysis and the external research-agent path remain active.');
        }
        const activityId = await beginActivity('Firecrawl Search', topic, topic + ' · model-led hypothesis testing and adaptive discovery', researchReportId);
        set({ progress: 'Searching independent web and news sources…' });
        try {
          const webKey = await getKey('firecrawl').catch(() => undefined);
          const savedQueries = savedCheckpoint?.queryHistory ?? [];
          const asked = new Set<string>(savedQueries.map((query) => normalizeResearchText(query)));
          const collected = new Map<string, (typeof webItems)[number]>((savedCheckpoint?.evidence ?? []).map((item) => [item.url, { ...item, publishedAt: item.publishedAt ?? undefined }] as const));
          const queryWarnings: string[] = [];
          let latestAiDossier: ResearchDossier | undefined = savedCheckpoint?.researchDossier;
          const queries: string[] = collected.size
            ? (latestAiDossier?.nextQueries.map((item) => item.query).filter((query) => !asked.has(normalizeResearchText(query))) ?? [])
            : [topic];
          if (!queries.length) queries.push(topic + ' YouTube platform evidence review');
          let hydrationRemaining = Math.max(0, 6 - [...collected.values()].filter((item) => Boolean(item.sourceText && item.sourceText.length >= 300)).length);
          let latestFallbackReview: ReturnType<typeof reviewResearchHypotheses> | undefined;
          const configuredProviders = await getConfiguredResearchProviderCount(initialPreferences);
          let modelAgentEnabled = configuredProviders >= 1;
          if (!modelAgentEnabled) {
            queryWarnings.push('No external research AI provider is configured. YouTube and other available evidence will still be analyzed locally; model analysis can start after a provider is configured.');
          } else if (configuredProviders < 2) {
            queryWarnings.push('Only one research AI provider is configured. The first-model analysis can run; an independent second-provider review will be marked unavailable until another provider is configured.');
          }

          let queryCursor = 0;
          let attemptedQueries = savedQueries.length;
          const executedQueries: string[] = [...savedQueries];
          const startingRound = collected.size ? 1 : 0;
          researchRounds: for (let round = startingRound; round <= MAX_DEEP_RESEARCH_ROUNDS; round += 1) {
            if (collected.size >= MAX_DEEP_RESEARCH_EVIDENCE || attemptedQueries >= MAX_DEEP_RESEARCH_QUERIES) break;
            const querySlots = Math.min(researchQueriesPerRound(round), MAX_DEEP_RESEARCH_QUERIES - attemptedQueries);
            const batch: string[] = [];
            while (batch.length < querySlots && queryCursor < queries.length) {
              const query = queries[queryCursor++];
              if (!query) continue;
              const key = normalizeResearchText(query);
              if (!key || asked.has(key)) continue;
              asked.add(key);
              executedQueries.push(query);
              attemptedQueries += 1;
              batch.push(query);
            }
            if (!batch.length) break;
            set({ progress: round === 0
              ? 'Searching independent web and news sources…'
              : 'Testing hypotheses with up to two parallel searches (' + round + '/' + MAX_DEEP_RESEARCH_ROUNDS + ')…' });
            const evidenceBeforeRound = collected.size;
            const searchResults = await mapWithConcurrency(initialPreferences.webResearchEnabled ? batch : [], 2, async (query) => {
              try {
                const result = await fetchWebResearch(query, {
                  apiKey: webKey ?? undefined,
                  limit: MAX_DEEP_RESEARCH_RESULTS_PER_QUERY,
                  days: normalizedInput.days,
                });
                return { query, result };
              } catch (error) {
                return { query, error: error instanceof Error ? error.message : 'Firecrawl request failed.' };
              }
            });
            for (const result of searchResults) {
              if ('error' in result) {
                queryWarnings.push(result.query + ': ' + result.error);
                continue;
              }
              queryWarnings.push(...result.result.warnings);
              const split = splitSourcesByFeedback(result.result.items);
              for (const item of split.included) {
                if (!collected.has(item.url) && collected.size < MAX_DEEP_RESEARCH_EVIDENCE) {
                  collected.set(item.url, item);
                }
              }
            }

            if (youtubeTaskPromise) await youtubeTaskPromise;
            if (modelAgentEnabled && (collected.size > 0 || researchVideos.length > 0)) {
              const youtubeSignals: YouTubeSampleVideo[] = researchVideos.map((video) => ({
                id: video.id, title: video.title, description: video.description,
                channel: video.channel, channelId: video.channelId ?? '',
                publishedAt: video.publishedAt, thumbnailUrl: video.thumbnail,
                viewCount: video.viewCount ?? null, likeCount: video.likeCount ?? null,
                commentCount: video.commentCount ?? null,
                channelSubscriberCount: video.channelSubscriberCount ?? null,
                channelVideoCount: video.channelVideoCount ?? null,
                url: 'https://www.youtube.com/watch?v=' + video.id, growth: video.growth,
              }));
              if (webKey && hydrationRemaining > 0) {
                const hydration = await enrichResearchEvidence([...collected.values()], webKey, hydrationRemaining);
                hydrationRemaining = Math.max(0, hydrationRemaining - hydration.enrichedCount);
                collected.clear();
                for (const item of hydration.items) collected.set(item.url, item);
                queryWarnings.push(...hydration.warnings);
                if (hydration.enrichedCount) {
                  queryWarnings.push(hydration.enrichedCount + ' original publisher pages fetched for local quote verification.');
                }
              }
              const currentResearchMemory = get().data.researchMemory.find(
                (entry) => normalizeResearchText(entry.topic) === normalizeResearchText(topic),
              );
              recordRuntimeStart('AI');
              const agent = await runResearchAgentSerialized({
                topic,
                researchNiche,
                evidence: [...collected.values()],
                youtubeSignals,
                preferences: initialPreferences,
                previous: latestAiDossier ?? currentResearchMemory?.researchDossier,
                alreadyAsked: [...asked],
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
              }, origin === 'manual' ? 'manual' : 'automatic');
              queryWarnings.push(...agent.warnings);
              recordRuntimeFinish('AI', agent.dossier ? 'success' : 'partial', agent.warnings.join(' ').slice(0, 220));
              if (agent.dossier) {
                latestAiDossier = agent.dossier;
              } else {
                // Do not retry a failed or preflight-blocked model pair for every later search batch.
                modelAgentEnabled = false;
              }
            }

            if (!latestAiDossier) {
              latestFallbackReview = reviewResearchHypotheses(
                topic,
                [...collected.values()].map((item) => ({
                  id: item.id,
                  title: item.title,
                  summary: item.summary,
                  url: item.url,
                  sourceName: item.sourceName,
                  ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
                })),
                [...asked],
                3,
              );
            }

            await updatePendingResearch(runId, {
              stage: 'sources-reviewed',
              ...(latestAiDossier ? { researchDossier: latestAiDossier } : {}),
              evidence: [...collected.values()].slice(0, 48).map((item) => ({
                id: item.id, title: item.title, summary: item.summary, url: item.url,
                sourceName: item.sourceName, publishedAt: item.publishedAt ?? null, category: item.category,
              })),
              queryHistory: executedQueries.slice(-40),
            });

            const newEvidenceCount = collected.size - evidenceBeforeRound;
            if (newEvidenceCount <= 0) {
              queryWarnings.push('Adaptive discovery stopped because the latest search batch added no new independent source URLs.');
              break researchRounds;
            }
            if (round >= MAX_DEEP_RESEARCH_ROUNDS || collected.size >= MAX_DEEP_RESEARCH_EVIDENCE ||
                attemptedQueries >= MAX_DEEP_RESEARCH_QUERIES) break;
            const nextDirections = latestAiDossier?.nextQueries ?? (latestFallbackReview?.nextDirections ?? []).map((item) => ({
              query: item.query,
              purpose: 'independent-confirmation' as const,
              hypothesisId: '',
              priority: 3,
              reason: item.reason,
            }));
            const plan = planResearchRound({
              round: round + 1,
              queriesAttempted: attemptedQueries,
              evidenceCount: collected.size,
              previousRoundNewEvidenceCount: newEvidenceCount,
              nextQueries: nextDirections,
              alreadyAsked: [...asked],
            });
            let addedDirection = false;
            for (const planned of plan.queries) {
              const key = normalizeResearchText(planned.query);
              if (!key || asked.has(key) || queries.some((item) => normalizeResearchText(item) === key)) continue;
              if (queries.length >= MAX_DEEP_RESEARCH_QUERIES) break;
              queries.push(planned.query);
              addedDirection = true;
            }
            if (!addedDirection) {
              if (plan.stopReason) queryWarnings.push(plan.stopReason);
              break researchRounds;
            }
          }

          webSearchQueries = executedQueries;
          webResearchDossier = latestAiDossier;
          webItems = [...collected.values()];
          warnings.push(...queryWarnings);
          if (webItems.length && webSearchQueries.length) {
            await updatePendingResearch(runId, {
              stage: 'sources-reviewed',
              ...(webResearchDossier ? { researchDossier: webResearchDossier } : {}),
              evidence: webItems.slice(0, 48).map((item) => ({
                id: item.id, title: item.title, summary: item.summary, url: item.url,
                sourceName: item.sourceName, publishedAt: item.publishedAt ?? null, category: item.category,
              })),
              queryHistory: webSearchQueries.slice(-40),
            });
          }
          const hypothesisSummary = latestAiDossier
            ? ' Model-led review by ' + latestAiDossier.provider + '/' + latestAiDossier.model +
              ': ' + latestAiDossier.hypotheses.length + ' hypothesis/hypotheses; ' +
              latestAiDossier.hypotheses.filter((item) => item.status === 'contested').length +
              ' contested; confidence ' + latestAiDossier.confidence + '. Conclusion: ' +
              (latestAiDossier.conclusion || 'No defensible conclusion yet.')
            : latestFallbackReview
              ? ' Local fallback review only (no model-backed semantic assessment): ' +
                latestFallbackReview.hypotheses.length + ' provisional keyword hypotheses; ' +
                latestFallbackReview.hypotheses.filter((item) => item.status === 'contested').length + ' flagged as contested.'
              : ' No usable independent evidence was available for hypothesis review.';

          const evidenceActivity = webItems.map((item) => {
            const assessment = latestAiDossier?.evidenceReviews.find((entry) => entry.evidenceId === item.id);
            const related = latestAiDossier?.hypotheses.filter((hypothesis) =>
              hypothesis.supportingEvidenceIds.includes(item.id) ||
              hypothesis.challengingEvidenceIds.includes(item.id),
            ) ?? [];
            const relation = related.slice(0, 3).map((hypothesis) =>
              hypothesis.status + ': ' + hypothesis.claim,
            ).join(' | ');
            const roleText = assessment
              ? 'Model assessment: ' + assessment.role + '; source type ' + assessment.sourceType +
                '; credibility ' + assessment.credibility + '; freshness ' + assessment.freshness +
                '. ' + assessment.reason
              : 'No model evidence assessment was available for this item; treat it as unverified context.';
            return {
              id: item.id,
              title: item.title,
              summary: item.summary,
              sourceName: item.sourceName,
              url: item.url,
              publishedAt: item.publishedAt ?? null,
              sourceAssessment: 'not-assessed' as const,
              includedInAnalysis: true,
              decisionReason: roleText + (relation ? ' Linked hypotheses: ' + relation : ''),
            };
          });
          const hypothesisActivity = (latestAiDossier?.hypotheses ?? []).map((hypothesis) => ({
            id: 'research-hypothesis:' + hypothesis.id,
            title: hypothesis.claim,
            summary: hypothesis.rationale,
            sourceName: 'Research Agent · ' + (latestAiDossier?.provider ?? 'AI'),
            includedInAnalysis: true,
            decisionReason: 'Status: ' + hypothesis.status + '; confidence: ' + hypothesis.confidence +
              '; supporting evidence: ' + hypothesis.supportingEvidenceIds.length +
              '; challenging evidence: ' + hypothesis.challengingEvidenceIds.length +
              '. Missing: ' + hypothesis.missingEvidence.join(' | '),
          }));

          await finishActivity(activityId, {
            status: webItems.length ? (queryWarnings.length ? 'partial' : 'success') : 'empty',
            query: queries.join(' ; ') + ' · ' + hypothesisSummary,
            resultCount: webItems.length + hypothesisActivity.length,
            analyzedCount: webItems.length,
            results: buildResearchActivityResults(topic, [...evidenceActivity, ...hypothesisActivity]),
            warnings: queryWarnings.slice(0, 12),
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

      // Collect bounded YouTube and independent publisher, web and Wikimedia
      // evidence concurrently. Model prompts still await the same run's YouTube sample.
      youtubeTaskPromise = youtubeTask();
      recordRuntimeStart('Sources');
      await Promise.all([youtubeTaskPromise, feedTask(), webTask(), wikiTask()]);
      const independentSourcesReady = publisherNews.length > 0 || webItems.length > 0;
      recordRuntimeFinish('Sources', independentSourcesReady ? 'success' : 'partial', independentSourcesReady ? undefined : 'No independent publisher/web evidence was returned.');
      if (!publisherNews.length) warnings.push('No selected publisher-feed items are currently available.');
      if (!webItems.length && initialPreferences.webResearchEnabled)
        warnings.push('No independent web results were available in this run.');
      if (!wiki) warnings.push('No Wikimedia pageview/article signal was available in this run.');

      const currentData = get().data;
      // YouTube videos and snapshots were persisted atomically by the serialized snapshot writer.
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
      set({ progress: 'Analyzing YouTube platform signals, independent evidence and research gaps…' });
      const internalAnalysis = buildInternalResearch({
        topic,
        news: engineNews,
        wiki,
        // Pass the complete current-run YouTube sample into the internal engine.
        // Its platform provenance stays labelled, but it participates in entity extraction,
        // relevance, measured momentum, idea discovery and editorial prioritization.
        videos: researchVideos.map((video) => ({
          id: video.id,
          title: video.title,
          description: video.description,
          channel: video.channel,
          publishedAt: video.publishedAt,
          viewCount: video.viewCount ?? null,
          likeCount: video.likeCount ?? null,
          commentCount: video.commentCount ?? null,
          channelSubscriberCount: video.channelSubscriberCount ?? null,
          channelVideoCount: video.channelVideoCount ?? null,
          growth: video.growth,
        })),
        priorMemory,
        language: currentData.preferences.uiLanguage ?? 'fa',
      });

      // The batch-level dossier has already passed independent cross-provider review.
      // Re-running the same provider pair here added latency without introducing new source evidence.
      const report: Report = {
        input: normalizedInput,
        videos: researchVideos,
        queries: [
          ...(youtubeResult?.queries ?? []),
          ...webSearchQueries.map((query) => 'Web research: ' + query),
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

      // The full same-run YouTube sample is a first-class input to idea generation
      // and editorial scoring. Platform signals remain distinct from publisher citations.
      const generatedIdeas = generateEditorialIdeas({
        topic,
        news: publisherNews,
        videos: researchVideos.map((video) => ({
          id: video.id,
          title: video.title,
          description: video.description,
          channel: video.channel,
          publishedAt: video.publishedAt,
          viewCount: video.viewCount ?? null,
          likeCount: video.likeCount ?? null,
          channelSubscriberCount: video.channelSubscriberCount ?? null,
          channelVideoCount: video.channelVideoCount ?? null,
          growth: video.growth,
          thumbnailUrl: video.thumbnail,
        })),
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
        refreshExisting: true,
        researchDossier: webResearchDossier ?? priorMemory?.researchDossier,
      });

      await finishActivity(engineActivityId, {
        status: generatedIdeas.length ? 'success' : 'empty',
        resultCount: generatedIdeas.length,
        analyzedCount: engineNews.length + (wiki ? 1 : 0) + researchVideos.length,
        results: buildResearchActivityResults(topic, generatedIdeas.map((idea) => ({
          id: idea.id,
          title: idea.topic,
          summary: idea.concept,
          sourceName: idea.sourceName ?? 'MOHSEN SCOUT Internal Engine',
          url: idea.sourceUrl,
          includedInAnalysis: true,
          decisionReason: idea.engineScoreReason ?? 'Generated from YouTube platform observations plus available independent publisher, web and Wikimedia evidence.',
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
        researchDossier: webResearchDossier,
        language: currentData.preferences.uiLanguage ?? 'fa',
      });

      if (!generatedIdeas.length) {
        report.warnings.push('No sufficiently distinct idea was supported by available publisher/web/Wikimedia/YouTube platform evidence in this run. Existing research and snapshots remain retained.');
      }
      await get().commit((data) => ({
        ...data,
        feedRegistry,
        reports: [report, ...data.reports.filter((item) => item.id !== report.id)],
        ideas: mergeGeneratedIdeas(data.ideas, generatedIdeas),
        videos: [...new Map([...data.videos, ...researchVideos].map((video) => [video.id, video])).values()],
        researchMemory: memoryEntry
          ? mergeResearchMemoryEntries(data.researchMemory, memoryEntry)
          : data.researchMemory,
        preferences: { ...data.preferences, lastInput: normalizedInput },
      }));
      await updatePendingResearch(runId, { stage: 'ideas-saved' });
      recordRuntimeFinish('Engine', generatedIdeas.length ? 'success' : 'partial');
      engineRecorded = true;

      if (generatedIdeas.length && get().data.preferences.automaticExternalReview) {
        recordRuntimeStart('AI');
        set({ progress: 'Reviewing generated ideas with the configured AI-provider fallback chain…' });
        const aiActivityId = await beginActivity(
          'AI Provider Review', topic,
          'Independent second-opinion review after local analysis: ' + generatedIdeas.slice(0, 8).map((idea) => idea.topic).join(' ; '),
          researchReportId,
        );
        const videosById = new Map(get().data.videos.map((video) => [video.id, video] as const));
        const review = await withResearchProviderQueue(() => reviewIdeasAutomatically(generatedIdeas, get().data.preferences, {
          language: get().data.preferences.uiLanguage ?? 'fa',
          youtubeSignalsByIdeaId: Object.fromEntries(generatedIdeas.map((idea) => [
            idea.id,
            idea.videoIds.flatMap((videoId) => {
              const video = videosById.get(videoId);
              return video ? [video] : [];
            }).map((video) => ({
              id: video.id, title: video.title, description: video.description, channel: video.channel,
              channelId: video.channelId ?? '', publishedAt: video.publishedAt, thumbnailUrl: video.thumbnail,
              viewCount: video.viewCount ?? null, likeCount: video.likeCount ?? null,
              commentCount: video.commentCount ?? null,
              channelSubscriberCount: video.channelSubscriberCount ?? null,
              channelVideoCount: video.channelVideoCount ?? null,
              url: 'https://www.youtube.com/watch?v=' + video.id, growth: video.growth,
            })),
          ])),
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
        }), origin === 'manual' ? 'manual' : 'automatic');
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
      }

      // Keep autonomous checkpoints until the durable queue records completion.
      if (taskId) await updatePendingResearch(runId, { stage: 'ideas-saved' });
      else await clearPendingResearch(runId);
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
      releaseManualLease?.();
      set((state) => {
        const activeResearchRuns = Math.max(0, state.activeResearchRuns - 1);
        return { activeResearchRuns, busy: activeResearchRuns > 0, progress: activeResearchRuns ? state.progress : '' };
      });
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
      videos: report.videos.map((video) => ({
        id: video.id,
        title: video.title,
        description: video.description,
        channel: video.channel,
        publishedAt: video.publishedAt,
        viewCount: video.viewCount ?? null,
        likeCount: video.likeCount ?? null,
        channelSubscriberCount: video.channelSubscriberCount ?? null,
        channelVideoCount: video.channelVideoCount ?? null,
        growth: video.growth,
        thumbnailUrl: video.thumbnail,
      })),
      reportId: report.id,
      priorMemory,
      existingIdeas: currentData.ideas,
      feedback: buildLocalResearchFeedback(currentData),
      region: report.input.region,
      languages: report.input.languages,
      language: currentData.preferences.uiLanguage ?? 'fa',
      limit: 10,
      refreshExisting: true,
    });
    await get().commit((data) => ({
      ...data,
      reports: data.reports.map((r) => (r.id === id ? { ...r, analyzed: true } : r)),
      ideas: mergeGeneratedIdeas(data.ideas, generatedIdeas),
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
          videos: (targetReport?.videos ?? []).map((video) => ({
            id: video.id,
            title: video.title,
            description: video.description,
            channel: video.channel,
            publishedAt: video.publishedAt,
            viewCount: video.viewCount ?? null,
            likeCount: video.likeCount ?? null,
            growth: video.growth,
            thumbnailUrl: video.thumbnail,
          })),
          ...(targetReport ? { reportId: targetReport.id } : {}),
          priorMemory,
          existingIdeas: ideas,
          feedback: buildLocalResearchFeedback(data),
          region: targetReport?.input.region ?? data.preferences.region,
          languages: targetReport?.input.languages ?? data.preferences.languages,
          language: data.preferences.uiLanguage ?? 'fa',
          limit: 10,
          now,
          refreshExisting: true,
        });
        replenished = nextIdeas.length;
        return { ...data, ideas: mergeGeneratedIdeas(ideas, nextIdeas) };
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
