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
      // Feed failures must not prevent independent YouTube research from running,
      // but the failure is now recorded instead of being silently swallowed.
      let feedWarning = '';
      try {
        const feeds = await fetchSpaceNews(prefs.spaceNewsSources, fetch, true);
        await useScout.getState().commit((data) => ({ ...data, feedRegistry: feeds.registry }));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        feedWarning = ('Scheduled publisher-feed refresh failed; the last saved feeds were kept. ' + detail).slice(0, 240);
      }
      const result = await useScout.getState().research(prefs.lastInput, 'automatic', true);
      if (!result) return BackgroundTask.BackgroundTaskResult.Failed;
      if (feedWarning) {
        await useScout.getState().commit((data) => ({
          ...data,
          reports: data.reports.map((report) => report.id === result.id
            ? { ...report, warnings: [...new Set([...report.warnings, feedWarning])] }
            : report),
        }));
      }
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.granted) await Notifications.scheduleNotificationAsync({
        ...researchNotification,
        content: {
          ...researchNotification.content,
          body: feedWarning
            ? 'Your scheduled research is ready; some publisher feeds could not be refreshed.'
            : researchNotification.content.body,
        },
      });
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
export const scheduleNotice =
  'Android chooses execution time; intervals are a minimum, not a guarantee. Force-stop and battery restrictions can prevent runs. Requires an installed native build.';
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
    prefs.schedule === 'Every 12 hours' ? 720 : prefs.schedule === 'Daily' ? 1440 : 10080;
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
