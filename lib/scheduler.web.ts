import { type Preferences } from './types';
export const scheduleNotice =
  'Scheduled research requires an installed Android build. Browser preview supports manual research only.';
export async function configureSchedule(prefs: Preferences) {
  if (prefs.schedule !== 'Manual' && !prefs.paused)
    throw new Error('Scheduling is available in the Android app, not the browser preview.');
}
export async function enableNotifications() {
  throw new Error('Research notifications are available in the Android app.');
}
