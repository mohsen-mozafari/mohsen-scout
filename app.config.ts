import type { ConfigContext, ExpoConfig } from '@expo/config';
import { ensureScoutIcons } from './scripts/scout-icon.cjs';

type ExpoPlugins = NonNullable<ExpoConfig['plugins']>;

export default ({ config }: ConfigContext): ExpoConfig => {
  ensureScoutIcons(process.cwd());
  const nativePlugins: ExpoPlugins =
    process.env.EXPO_PLATFORM === 'native'
      ? [['expo-dev-client', { launchMode: 'most-recent' }]]
      : [];

  return {
    ...config,
    name: 'MOHSEN SCOUT',
    slug: 'mohsen-scout',
    icon: './assets/scout-icon.png',
    version: '1.4.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    scheme: 'mohsen-scout',
    runtimeVersion: {
      policy: 'appVersion',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      deploymentTarget: '16.4',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
      supportsTablet: true,
      bundleIdentifier: 'me.bilt.mohsenscout',
    },
    android: {
      versionCode: 14,
      allowBackup: false,
      adaptiveIcon: { foregroundImage: './assets/scout-icon.png', backgroundColor: '#000000' },
      package: 'me.bilt.mohsenscout',
    },
    web: {
      bundler: 'metro',
      // 'single' = SPA export: one index.html + client routing, so edge serving
      // needs only a single 404→index.html fallback rule.
      output: 'single',
      favicon: './public/icons/icon-192.png',
    },
    extra: {},
    plugins: [
      'expo-router',
      'expo-font',
      'expo-secure-store',
      'expo-sqlite',
      'expo-sharing',
      'expo-background-task',
      'expo-notifications',
      'expo-splash-screen',
      'expo-status-bar',
      './plugins/with-workmanager-proguard',
      ...nativePlugins,
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};
