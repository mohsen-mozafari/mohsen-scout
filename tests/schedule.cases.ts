import { commitWithSchedule, researchNotification } from '../lib/schedule';
import { defaults, type Preferences } from '../lib/types';

type Check = [string, () => Promise<void> | void];
const check = (value: unknown) => {
  if (!value) throw new Error('Schedule regression assertion failed');
};
const rejected = async (work: () => Promise<void>, message: string) => {
  try {
    await work();
  } catch (error) {
    check(error instanceof Error && error.message === message);
    return;
  }
  throw new Error('Expected rejection');
};
const active = (): Preferences => ({
  ...defaults().preferences,
  schedule: 'Daily',
  lastInput: {
    topic: 'Synthetic topic',
    region: 'Worldwide',
    languages: ['en'],
    days: 30,
    duration: 'any',
    category: '',
    maxResults: 10,
  },
});

export const scheduleChecks: Check[] = [
  [
    'Schedule: unrelated saves leave active registration untouched',
    async () => {
      const previous = active();
      let commits = 0;
      let configurations = 0;
      await commitWithSchedule(
        true,
        previous,
        { ...previous, name: 'Updated name', budget: 3000, model: 'synthetic' },
        async () => {
          commits++;
        },
        async () => {
          configurations++;
        },
      );
      check(commits === 1 && configurations === 0);
    },
  ],
  [
    'Schedule: unavailable storage prevents all native side effects',
    async () => {
      let calls = 0;
      const effect = async () => {
        calls++;
      };
      await rejected(
        () => commitWithSchedule(false, defaults().preferences, active(), effect, effect),
        'Local data is not ready. Retry opening it.',
      );
      check(calls === 0);
    },
  ],
  [
    'Schedule: changed frequency configures once before commit',
    async () => {
      const order: string[] = [];
      await commitWithSchedule(
        true,
        defaults().preferences,
        active(),
        async () => {
          order.push('commit');
        },
        async (prefs) => {
          order.push(prefs.schedule);
        },
      );
      check(order.join(',') === 'Daily,commit');
    },
  ],
  [
    'Schedule: failed persistence restores the previous registration',
    async () => {
      const previous = active();
      const order: string[] = [];
      await rejected(
        () =>
          commitWithSchedule(
            true,
            previous,
            { ...previous, schedule: 'Manual' },
            async () => {
              order.push('commit');
              throw new Error('Synthetic storage failure');
            },
            async (prefs) => {
              order.push(prefs.schedule);
            },
          ),
        'Synthetic storage failure',
      );
      check(order.join(',') === 'Manual,commit,Daily');
    },
  ],
  [
    'Schedule: registration failure restores previous schedule without committing',
    async () => {
      const order: string[] = [];
      await rejected(
        () =>
          commitWithSchedule(
            true,
            active(),
            { ...active(), schedule: 'Weekly' },
            async () => {
              order.push('commit');
            },
            async (prefs) => {
              order.push(prefs.schedule);
              if (prefs.schedule === 'Weekly') throw new Error('Synthetic registration failure');
            },
          ),
        'Synthetic registration failure',
      );
      check(order.join(',') === 'Weekly,Daily');
    },
  ],
  [
    'Schedule: failed recovery is reported instead of claiming consistency',
    async () => {
      await rejected(
        () =>
          commitWithSchedule(
            true,
            active(),
            defaults().preferences,
            async () => {
              throw new Error('Synthetic write failure');
            },
            async (prefs) => {
              if (prefs.schedule === 'Daily') throw new Error('Synthetic recovery failure');
            },
          ),
        'Could not save or restore the schedule. Pause research and save, then choose your schedule again.',
      );
    },
  ],
  [
    'Schedule: pause and restore-to-Manual both update registration',
    async () => {
      const order: string[] = [];
      await commitWithSchedule(
        true,
        active(),
        { ...active(), paused: true },
        async () => {},
        async (prefs) => {
          order.push(prefs.paused ? 'paused' : 'active');
        },
      );
      await commitWithSchedule(
        true,
        active(),
        defaults().preferences,
        async () => {},
        async (prefs) => {
          order.push(prefs.schedule);
        },
      );
      check(order.join(',') === 'paused,Manual');
    },
  ],
  [
    'Notifications: immediate research notification targets the Research channel',
    () => {
      check(researchNotification.trigger.channelId === 'research');
      check(researchNotification.content.title === 'MOHSEN SCOUT');
    },
  ],
];
