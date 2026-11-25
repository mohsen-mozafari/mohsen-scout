import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { runAutonomousResearchCycle } from './autonomous-research';
import { useScout } from './store';

export const AUTONOMOUS_RESEARCH_TASK = 'mohsen-scout-autonomous-research-v1';

TaskManager.defineTask(AUTONOMOUS_RESEARCH_TASK, async ({ error }) => {
  if (error) return BackgroundTask.BackgroundTaskResult.Failed;
  try {
    const state = useScout.getState();
    if (!state.ready) await state.boot();
    await runAutonomousResearchCycle(1);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerAutonomousResearchBackgroundTask(): Promise<boolean> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    const registered = await TaskManager.isTaskRegisteredAsync(AUTONOMOUS_RESEARCH_TASK);
    if (!registered) {
      await BackgroundTask.registerTaskAsync(AUTONOMOUS_RESEARCH_TASK, { minimumInterval: 15 });
    }
    return true;
  } catch {
    // Foreground recovery remains available even when OS background scheduling is restricted.
    return false;
  }
}
