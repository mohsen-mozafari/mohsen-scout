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
import { ApiError, nextBudget, searchYouTube } from './api';
import { generateEditorialIdeas } from './idea-generation';
import { attachReportToIdea as attachReport, attachVideoReferenceToIdea as attachVideoReference, getOrCreateSourceIdea, type SourceIdeaInput } from './idea-research';
type State = {
  data: LocalData;
  ready: boolean;
  busy: boolean;
  progress: string;
  error: string;
  boot: () => Promise<void>;
  commit: (change: (data: LocalData) => LocalData) => Promise<void>;
  research: (input: ResearchInput) => Promise<Report | undefined>;
  analyze: (id: string) => Promise<void>;
  saveVideo: (video: Video, topic: string) => Promise<void>;
  saveIdea: (idea: Idea) => Promise<void>;
  ensureSourceIdea: (input: SourceIdeaInput) => Promise<Idea>;
  linkReportToIdea: (ideaId: string, reportId: string) => Promise<void>;
  bookmarkVideoForIdea: (ideaId: string, videoId: string) => Promise<void>;
  charge: (units: number) => Promise<void>;
  clearError: () => void;
};
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
      set({ data: await readData(), ready: true, error: '' });
    } catch {
      set({ error: 'Could not open local data. Retry before making changes.', ready: false });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  },
  commit: async (change) => {
    const action = queue.then(async () => {
      if (!get().ready) throw new Error('Local data is not ready. Retry opening it.');
      const data = purgeExpired(change(get().data));
      try {
        await writeData(data);
        set({ data });
      } catch {
        set({ error: 'Could not save on this device. Check available storage.' });
        throw new Error('Could not save on this device. Check available storage.');
      }
    });
    queue = action.catch(() => {});
    await action;
  },
  charge: async (units) => {
    await get().commit((data) => ({
      ...data,
      budget: nextBudget(data.budget, data.preferences.budget, units),
    }));
  },
  research: async (input) => {
    if (get().busy) return undefined;
    set({ busy: true, error: '', progress: 'Preparing related queries…' });
    try {
      if (!input.topic.trim() || !input.languages.length)
        throw new Error('Enter a topic and choose at least one language.');
      const key = await getKey('youtube');
      if (!key) throw new Error('Add your YouTube API key in Settings to start research.');
      const cached = get().data.reports.find(
        (r) =>
          JSON.stringify(r.input) === JSON.stringify(input) &&
          Date.now() - r.createdAt < 15 * 60000,
      );
      if (cached) {
        set({ progress: 'Using a recent local search sample.' });
        if (!cached.analyzed) await get().analyze(cached.id);
        return get().data.reports.find((item) => item.id === cached.id) ?? cached;
      }
      const result = await searchYouTube(
        input,
        {
          key,
          charge: get().charge,
          onQuota: () =>
            get().commit((data) => ({ ...data, budget: { ...data.budget, exhausted: true } })),
        },
        (progress) => set({ progress }),
      );
      const report: Report = {
        ...result,
        input: { ...input, topic: input.topic.trim() },
        id: uid(),
        createdAt: Date.now(),
        analyzed: true,
      };
      const generatedIdeas = generateEditorialIdeas({
        topic: report.input.topic,
        videos: result.videos.map((video) => ({
          id: video.id, title: video.title, description: video.description,
          channel: video.channel, publishedAt: video.publishedAt,
          viewCount: video.viewCount ?? null, likeCount: video.likeCount ?? null,
        })),
        reportId: report.id,
        existingIdeas: get().data.ideas,
        region: report.input.region,
        languages: report.input.languages,
        language: get().data.preferences.uiLanguage ?? 'fa',
      });
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
      if (error instanceof ApiError && error.code === 'quota')
        await get().commit((data) => ({ ...data, budget: { ...data.budget, exhausted: true } }));
      set({
        error: error instanceof Error ? error.message : 'Research could not finish. Try again.',
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
    const generatedIdeas = generateEditorialIdeas({
      topic: report.input.topic,
      videos: report.videos.map((video) => ({
        id: video.id, title: video.title, description: video.description,
        channel: video.channel, publishedAt: video.publishedAt,
        viewCount: video.viewCount ?? null, likeCount: video.likeCount ?? null,
      })),
      reportId: report.id,
      existingIdeas: get().data.ideas,
      region: report.input.region,
      languages: report.input.languages,
      language: get().data.preferences.uiLanguage ?? 'fa',
    });
    await get().commit((data) => ({
      ...data,
      reports: data.reports.map((r) => (r.id === id ? { ...r, analyzed: true } : r)),
      ideas: [...generatedIdeas, ...data.ideas],
    }));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
