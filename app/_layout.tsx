// oxlint-disable-next-line eslint-plugin-import/no-unassigned-import
import '../global.css';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { AppState, Platform } from 'react-native';
import { useEffect } from 'react';
import { requireOptionalNativeModule } from 'expo';
import * as DevClient from 'expo-dev-client';
import { HeroUINativeProvider } from 'heroui-native';
import { Uniwind } from 'uniwind';
import {
  ErrorBoundary as ExpoErrorBoundary,
  type ErrorBoundaryProps,
  SplashScreen,
  Stack,
} from 'expo-router';

import { patchExpoGoAssetUrls } from '@/lib/expoGoAssets';
import { registerColorTokens } from '@/lib/registerColorTokens';
import { useScout } from '@/lib/store';
// Importing the scheduler registers its native task at module load.
import { configureSchedule } from '@/lib/scheduler';
import { palette } from '@/lib/theme';
import { purgeExpired } from '@/lib/types';
import { registerServiceWorker } from '@/lib/registerServiceWorker';
import { reportErrorToParent } from '@/lib/reportPreviewError';
import { InstallPrompt } from '@/components/InstallPrompt';

/**
 * Custom ErrorBoundary that reports React render errors to the parent window (Bilt preview iframe)
 * and then renders the default Expo error UI.
 */
function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    if (Platform.OS === 'web' && error) {
      const message = [error.message, error.stack].filter(Boolean).join('\n');
      reportErrorToParent(message);
    }
  }, [error]);
  return <ExpoErrorBoundary error={error} retry={retry} />;
}

export { ErrorBoundary };

// Before any screen renders an Image or loads a font.
patchExpoGoAssetUrls();
registerColorTokens();

Uniwind.setTheme('dark');

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Report uncaught JS errors and unhandled promise rejections to parent (Bilt preview iframe)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    const handleError = (event: ErrorEvent) => {
      const message = event.error?.stack ?? event.message ?? 'Unknown error';
      reportErrorToParent(message);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const err = event.reason;
      const message =
        err instanceof Error ? [err.message, err.stack].filter(Boolean).join('\n') : String(err);
      reportErrorToParent(message);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    // Not executionEnvironment: Android Expo Go 58 reports "bare" and has no dev menu module.
    if (__DEV__ && Platform.OS !== 'web' && requireOptionalNativeModule('ExpoDevMenu')) {
      const timer = setTimeout(() => {
        DevClient.closeMenu();
        DevClient.hideMenu();
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  useEffect(() => {
    const syncSchedule = () => {
      const state = useScout.getState();
      if (state.ready) void configureSchedule(state.data.preferences).catch(() => {});
    };
    const unsubscribe = useScout.subscribe((state, previous) => {
      if (state.ready && previous.ready &&
        state.data.preferences.lastInput !== previous.data.preferences.lastInput &&
        state.data.preferences.schedule !== 'Manual' && !state.data.preferences.paused) {
        syncSchedule();
      }
    });
    void useScout.getState().boot().then(syncSchedule);
    const sweep = () => {
      const state = useScout.getState();
      if (state.ready) void state.commit(purgeExpired).catch(() => {});
    };
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') sweep();
    });
    const timer = setInterval(sweep, 60 * 60000);
    return () => {
      unsubscribe();
      listener.remove();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (loaded || error) {
      void SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: palette.background },
            headerTintColor: palette.text,
            headerTitleStyle: { fontFamily: 'Inter_600SemiBold' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: palette.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ title: 'MOHSEN SCOUT', headerShown: false }} />
          <Stack.Screen name="detail" options={{ title: 'Research detail' }} />
          <Stack.Screen name="note" options={{ title: 'Edit page' }} />
          <Stack.Screen name="diagnostics" options={{ title: 'Mock tests' }} />
          <Stack.Screen name="youtube" options={{ title: 'YouTube research' }} />
          <Stack.Screen name="cosmic-news" options={{ title: 'Cosmic News' }} />
          <Stack.Screen name="trend-intelligence" options={{ title: 'Trend Intelligence' }} />
          <Stack.Screen name="search-demand" options={{ title: 'Search Demand' }} />
          <Stack.Screen name="deep-research" options={{ title: 'Deep Research' }} />
        </Stack>
        <InstallPrompt />
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}
