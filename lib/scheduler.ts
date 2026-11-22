import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { useScout } from './store';
import { type Preferences } from './types';
import { researchNotification } from './schedule';
import { fetchSpaceNews } from './space';
const TASK = 'mohsen-scout-research';
if (!TaskManager.isTaskDefined(TASK))
  TaskManager.defineTask(TASK, async () => {
    try {
      const store = useScout.getState();
      if (!store.ready) await store.boot();
      if (!useScout.getState().ready) return BackgroundTask.BackgroundTaskResult.Failed;
      const prefs = useScout.getState().data.preferences;
      if (prefs.paused || prefs.schedule === 'Manual' || !prefs.lastInput)
        return BackgroundTask.BackgroundTaskResult.Success;
      // Refresh selected official publisher feeds during the same scheduled cycle.
      // Feed failures must not prevent independent YouTube research from running.
      let feedWarnings: string[] = [];
      try {
        const feeds = await fetchSpaceNews(prefs.spaceNewsSources, fetch, true);
        feedWarnings = feeds.warnings.map((warning) => warning.slice(0, 240));
        await useScout.getState().commit((data) => ({ ...data, feedRegistry: feeds.registry }));
      } catch {
        // Keep the last successful feed registry; record the failure on this research run.
        feedWarnings = ['Scheduled publisher-feed refresh failed; the last successful cached items were retained.'];
      }
      const result = await useScout.getState().research(prefs.lastInput, 'automatic', true, { limit: 8 });
      if (!result) return BackgroundTask.BackgroundTaskResult.Failed;
      if (feedWarnings.length) {
        await useScout.getState().commit((data) => ({
          ...data,
          reports: data.reports.map((report) => report.id === result.id
            ? { ...report, warnings: [...new Set([...report.warnings, ...feedWarnings])] }
            : report),
        }));
      }
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.granted) await Notifications.scheduleNotificationAsync({
        ...researchNotification,
        content: {
          ...researchNotification.content,
          body: feedWarnings.length
            ? 'Your YouTube research is ready; some publisher feeds used their last saved results.'
            : 'Your scheduled YouTube sample and evidence-linked ideas are ready to review.',
        },
      });
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
export const scheduleNotice =
  'Android chooses execution time; the selected interval (including Every 6 hours) is a minimum, not a guarantee. Doze, battery restrictions and force-stop can delay or prevent runs. Scheduled cycles use the last researched topic and the existing YouTube quota.';
export async function configureSchedule(prefs: Preferences) {
  if (prefs.schedule === 'Manual' || prefs.paused) {
    if (await TaskManager.isTaskRegisteredAsync(TASK))
      await BackgroundTask.unregisterTaskAsync(TASK);
    return;
  }
  if (!prefs.lastInput)
    throw new Error('Run a manual search first so there is a topic to schedule.');
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available)
    throw new Error(
      'Background research is unavailable in this environment. Use a native Android build.',
    );
  const minutes =
    prefs.schedule === 'Every 6 hours' ? 360 :
    prefs.schedule === 'Every 12 hours' ? 720 :
    prefs.schedule === 'Daily' ? 1440 : 10080;
  if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
  await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: minutes });
}
export async function enableNotifications() {
  await Notifications.setNotificationChannelAsync('research', {
    name: 'Research',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  const result = await Notifications.requestPermissionsAsync();
  if (!result.granted)
    throw new Error('Notifications are not allowed. You can enable them in Android settings.');
}
