import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { useScout } from './store';
import { type Preferences } from './types';
import { researchNotification } from './schedule';
import { runAutonomousResearchCycle } from './autonomous-research';
const TASK = 'mohsen-scout-research';
if (!TaskManager.isTaskDefined(TASK))
  TaskManager.defineTask(TASK, async () => {
    try {
      const store = useScout.getState();
      if (!store.ready) await store.boot();
      if (!useScout.getState().ready) return BackgroundTask.BackgroundTaskResult.Failed;
      const prefs = useScout.getState().data.preferences;
      if (prefs.paused || prefs.schedule === 'Manual')
        return BackgroundTask.BackgroundTaskResult.Success;
      // This cycle resolves the selected niche itself, so a first-run install does
      // not need a manual search before background research can begin.
      const processed = await runAutonomousResearchCycle(1);
      if (processed > 0) {
        const permissions = await Notifications.getPermissionsAsync();
        if (permissions.granted) await Notifications.scheduleNotificationAsync({
          ...researchNotification,
          content: {
            ...researchNotification.content,
            body: 'Your YouTube-first research cycle is ready. Open MOHSEN SCOUT to review the evidence and ideas.',
          },
        });
      }
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
export const scheduleNotice =
  'Android chooses execution time; the selected interval is a minimum, not a guarantee. Doze, battery restrictions and force-stop can delay or prevent runs. Scheduled cycles start from the selected niche, discover YouTube topics first, and use the existing YouTube quota.';
export async function configureSchedule(prefs: Preferences) {
  if (prefs.schedule === 'Manual' || prefs.paused) {
    if (await TaskManager.isTaskRegisteredAsync(TASK))
      await BackgroundTask.unregisterTaskAsync(TASK);
    return;
  }
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
