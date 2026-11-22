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
import { normalizeResearchText } from './intelligence';
import { recordRuntimeFinish, recordRuntimeStart } from './runtime-metrics';
type State = {
  data: LocalData;
  ready: boolean;
  busy: boolean;
  progress: string;
  error: string;
  boot: () => Promise<void>;
  commit: (change: (data: LocalData) => LocalData) => Promise<void>;
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
let lastRetentionSweepAt = 0;

let queue = Promise.resolve();
export const useScout = create<State>((set, get) => ({
  data: defaults(),
  ready: false,
  busy: false,
  progress: '',
  error: '',
  clearError: () => set({ error: '' }),
  boot: async () => {
    try {
      const data = await readData();
      lastRetentionSweepAt = Date.now();
      hydrateSpaceNewsRegistry(data.feedRegistry);
      set({ data, ready: true, error: '' });
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
    const initialPreferences = get().data.preferences;
    let engineStarted = false;
    let engineRecorded = false;
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

      const warnings: string[] = [];
      let youtubeResult: Awaited<ReturnType<typeof searchYouTube>> | undefined;
      let publisherNews = getCachedSpaceNews(get().data.feedRegistry, initialPreferences.spaceNewsSources);
      let feedRegistry = get().data.feedRegistry;
      let webItems: Awaited<ReturnType<typeof fetchWebResearch>>['items'] = [];
      let wiki: Awaited<ReturnType<typeof getWikipediaSignal>> | undefined;

      const youtubeTask = async () => {
        const key = await getKey('youtube').catch(() => undefined);
        if (!key) {
          warnings.push('YouTube sample skipped: add a YouTube Data API key in Settings. Independent web/publisher research can still continue.');
          return;
        }
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
        } catch (error) {
          const message = error instanceof Error ? error.message : 'YouTube sample was unavailable.';
          recordRuntimeFinish('YouTube', 'error', message);
          warnings.push('YouTube sample unavailable: ' + message);
        }
      };

      const feedTask = async () => {
        set({ progress: 'Refreshing selected NASA, ESA and publisher feeds…' });
        try {
          const result = await fetchSpaceNews(initialPreferences.spaceNewsSources, fetch, true);
          feedRegistry = result.registry;
          publisherNews = result.items.length
            ? result.items
            : getCachedSpaceNews(result.registry, initialPreferences.spaceNewsSources);
          warnings.push(...result.warnings);
        } catch (error) {
          warnings.push('Publisher-feed refresh failed; the last successful cached feed items were retained. ' +
            (error instanceof Error ? error.message : ''));
          publisherNews = getCachedSpaceNews(feedRegistry, initialPreferences.spaceNewsSources);
        }
      };

      const webTask = async () => {
        if (!initialPreferences.webResearchEnabled) {
          warnings.push('Independent web search is disabled in Settings; selected RSS feeds and Wikimedia remain available.');
          return;
        }
        set({ progress: 'Searching independent web and news sources…' });
        try {
          const webKey = await getKey('firecrawl').catch(() => undefined);
          const result = await fetchWebResearch(topic, {
            apiKey: webKey ?? undefined,
            limit: 6,
            days: normalizedInput.days,
          });
          webItems = result.items;
          warnings.push(...result.warnings);
        } catch (error) {
          warnings.push('Independent web search unavailable: ' +
            (error instanceof Error ? error.message : 'Firecrawl request failed.') +
            ' RSS and Wikimedia research continue independently.');
        }
      };

      const wikiTask = async () => {
        recordRuntimeStart('Wikimedia');
        set({ progress: 'Checking Wikimedia public-interest context…' });
        try {
          wiki = await getWikipediaSignal(topic, initialPreferences.spaceInterestLanguage ?? 'en');
          recordRuntimeFinish('Wikimedia', wiki ? 'success' : 'partial');
        } catch (error) {
          recordRuntimeFinish('Wikimedia', 'error', error instanceof Error ? error.message : 'Wikimedia unavailable.');
          warnings.push('Wikimedia article context was unavailable; this signal will not be inferred.');
        }
      };

      recordRuntimeStart('Sources');
      await Promise.all([youtubeTask(), feedTask(), webTask(), wikiTask()]);
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

      recordRuntimeStart('Engine');
      engineStarted = true;
      set({ progress: 'Analyzing independent evidence and research gaps…' });
      const internalAnalysis = buildInternalResearch({
        topic,
        news: engineNews,
        wiki,
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
        id: uid(),
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
        region: normalizedInput.region,
        languages: normalizedInput.languages,
        language: currentData.preferences.uiLanguage ?? 'fa',
        ...(ideaOptions?.category ? { category: ideaOptions.category } : {}),
        limit: ideaOptions?.limit ?? 8,
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
        recordRuntimeStart('AI');
        set({ progress: 'Reviewing generated ideas with the configured AI-provider fallback chain…' });
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
        recordRuntimeFinish('AI', review.opinions.length ? 'success' : 'partial', review.warnings.join(' '));
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return get().data.reports.find((item) => item.id === report.id) ?? report;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Research could not finish. Try again.';
      if (engineStarted && !engineRecorded) recordRuntimeFinish('Engine', 'error', message);
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
      region: report.input.region,
      languages: report.input.languages,
      language: currentData.preferences.uiLanguage ?? 'fa',
      limit: 8,
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
        const metadataTtlMs = 29 * 24 * 60 * 60 * 1000;
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
          region: targetReport?.input.region ?? data.preferences.region,
          languages: targetReport?.input.languages ?? data.preferences.languages,
          language: data.preferences.uiLanguage ?? 'fa',
          limit: 8,
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
