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
import { nextBudget, searchYouTube, type YouTubeQuotaKind, type YouTubeQuotaOrigin } from './api';
import { generateEditorialIdeas } from './idea-generation';
import { attachReportToIdea as attachReport, attachVideoReferenceToIdea as attachVideoReference, getOrCreateSourceIdea, type SourceIdeaInput } from './idea-research';
import { getCachedSpaceNews, hydrateSpaceNewsRegistry } from './space';
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
  research: (input: ResearchInput, origin?: YouTubeQuotaOrigin, forceRefresh?: boolean) => Promise<Report | undefined>;
  analyze: (id: string) => Promise<void>;
  saveVideo: (video: Video, topic: string) => Promise<void>;
  saveIdea: (idea: Idea) => Promise<void>;
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
  research: async (input, origin = 'manual', forceRefresh = false) => {
    if (get().busy) return undefined;
    recordRuntimeStart('YouTube');
    let youtubeRecorded = false;
    let engineStarted = false;
    let engineRecorded = false;
    set({ busy: true, error: '', progress: 'Preparing related queries…' });
    try {
      if (!input.topic.trim() || !input.languages.length)
        throw new Error('Enter a topic and choose at least one language.');
      const key = await getKey('youtube');
      if (!key) throw new Error('Add your YouTube API key in Settings to start research.');
      const cached = forceRefresh ? undefined : get().data.reports.find(
        (r) =>
          JSON.stringify(r.input) === JSON.stringify(input) &&
          Date.now() - r.createdAt < 15 * 60000,
      );
      if (cached) {
        set({ progress: 'Using a recent local search sample.' });
        if (!cached.analyzed) await get().analyze(cached.id);
        recordRuntimeFinish('YouTube', 'partial');
        youtubeRecorded = true;
        return get().data.reports.find((item) => item.id === cached.id) ?? cached;
      }
      const result = await searchYouTube(
        input,
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
      recordRuntimeFinish('YouTube', 'success');
      youtubeRecorded = true;
      const report: Report = {
        ...result,
        input: { ...input, topic: input.topic.trim() },
        id: uid(),
        createdAt: Date.now(),
        analyzed: true,
      };
      const currentData = get().data;
      const availableNews = getCachedSpaceNews(currentData.feedRegistry, currentData.preferences.spaceNewsSources);
      const priorMemory = currentData.researchMemory.find((entry) => normalizeResearchText(entry.topic) === normalizeResearchText(report.input.topic));
      recordRuntimeStart('Engine');
      engineStarted = true;
      const generatedIdeas = generateEditorialIdeas({
        topic: report.input.topic,
        news: availableNews,
        priorMemory,
        existingIdeas: get().data.ideas,
        region: report.input.region,
        languages: report.input.languages,
        language: get().data.preferences.uiLanguage ?? 'fa',
        limit: 5,
      });
      recordRuntimeFinish('Engine', 'success');
      engineRecorded = true;
      await get().commit((data) => ({
        ...data,
        reports: [report, ...data.reports],
        ideas: [...generatedIdeas, ...data.ideas],
        videos: [...new Map([...data.videos, ...result.videos].map((v) => [v.id, v])).values()],
        preferences: { ...data.preferences, lastInput: input },
      }));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Research could not finish. Try again.';
      if (engineStarted && !engineRecorded) {
        recordRuntimeFinish('Engine', 'error', message);
        engineRecorded = true;
      }
      if (!youtubeRecorded) {
        recordRuntimeFinish('YouTube', 'error', message);
        youtubeRecorded = true;
      }
      set({
        error: message,
      });
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
      priorMemory,
      existingIdeas: get().data.ideas,
      region: report.input.region,
      languages: report.input.languages,
      language: get().data.preferences.uiLanguage ?? 'fa',
      limit: 5,
    });
    await get().commit((data) => ({
      ...data,
      reports: data.reports.map((r) => (r.id === id ? { ...r, analyzed: true } : r)),
      ideas: [...generatedIdeas, ...data.ideas],
    }));
    recordRuntimeFinish('Engine', 'success');
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
