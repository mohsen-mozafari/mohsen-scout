const fs = require('node:fs/promises');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

const MARKER = '# MOHSEN SCOUT: preserve WorkManager and Room reflective constructors';
const RULES = [
  MARKER,
  '# Required by WorkManager 2.9.1 / Room 2.5.0 when R8 full mode is enabled.',
  '# Without these constructors AndroidX Startup crashes before React Native renders.',
  '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
  '-keep class * extends androidx.work.InputMerger { <init>(); }',
  '',
].join('\n');

module.exports = function withWorkManagerProguard(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const appDirectory = path.join(modConfig.modRequest.platformProjectRoot, 'app');
      const rulesPath = path.join(appDirectory, 'proguard-rules.pro');
      await fs.mkdir(appDirectory, { recursive: true });
      const current = await fs.readFile(rulesPath, 'utf8').catch(() => '');
      if (!current.includes(MARKER)) {
        const next = current.trimEnd() + (current.trim() ? '\n\n' : '') + RULES;
        await fs.writeFile(rulesPath, next, 'utf8');
      }
      return modConfig;
    },
  ]);
};
