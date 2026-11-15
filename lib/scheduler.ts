import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { useScout } from './store';
import { type Preferences } from './types';
const TASK = 'mohsen-scout-research';
if (!TaskManager.isTaskDefined(TASK))
  TaskManager.defineTask(TASK, async () => {
    try {
      const store = useScout.getState();
      if (!store.ready) await store.boot();
      const prefs = useScout.getState().data.preferences;
      if (prefs.paused || prefs.schedule === 'Manual' || !prefs.lastInput)
        return BackgroundTask.BackgroundTaskResult.Success;
      const result = await useScout.getState().research(prefs.lastInput);
      if (!result) return BackgroundTask.BackgroundTaskResult.Failed;
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.granted)
        await Notifications.scheduleNotificationAsync({
          content: { title: 'MOHSEN SCOUT', body: 'Your scheduled research is ready to review.' },
          trigger: null,
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
