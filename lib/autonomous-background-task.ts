import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

/** The legacy fixed-interval task is retired; scheduler.ts owns scheduled work. */
export const AUTONOMOUS_RESEARCH_TASK = 'mohsen-scout-autonomous-research-v1';

export async function unregisterLegacyAutonomousResearchBackgroundTask(): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(AUTONOMOUS_RESEARCH_TASK);
    if (registered) await BackgroundTask.unregisterTaskAsync(AUTONOMOUS_RESEARCH_TASK);
  } catch {
    // Foreground recovery remains available when OS task management is restricted.
  }
}
