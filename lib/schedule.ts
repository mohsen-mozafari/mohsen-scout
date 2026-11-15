import type { Preferences } from './types';

export const researchNotification = {
  content: { title: 'MOHSEN SCOUT', body: 'Your scheduled research is ready to review.' },
  trigger: { channelId: 'research' },
};

export async function commitWithSchedule(
  ready: boolean,
  previous: Preferences,
  next: Preferences,
  commit: () => Promise<void>,
  configure: (preferences: Preferences) => Promise<void>,
): Promise<void> {
  if (!ready) throw new Error('Local data is not ready. Retry opening it.');
  const changed = previous.schedule !== next.schedule || previous.paused !== next.paused;
  if (!changed) {
    await commit();
    return;
  }
  try {
    await configure(next);
    await commit();
  } catch (error) {
    try {
      await configure(previous);
    } catch {
      throw new Error(
        'Could not save or restore the schedule. Pause research and save, then choose your schedule again.',
      );
    }
    throw error;
  }
}
