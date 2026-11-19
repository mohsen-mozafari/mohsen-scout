import { Compass, Telescope, Library, Settings, Newspaper } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { palette as p } from '@/lib/theme';
import { useScout } from '@/lib/store';
import { translateText } from '@/lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const language = useScout((state) => state.data.preferences.uiLanguage ?? 'fa');
  return (
    <>
      {/* eslint-disable-next-line react/style-prop-object -- Expo StatusBar uses a string style enum, not a React Native style object. */}
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: p.background, direction: language === 'fa' ? 'rtl' : 'ltr' },
          tabBarBackground: () => (
            <BlurView
              intensity={38}
              tint="dark"
              style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14, 12, 28, 0.62)' }]}
            />
          ),
          tabBarStyle: {
            direction: language === 'fa' ? 'rtl' : 'ltr',
            backgroundColor: 'rgba(14, 12, 28, 0.76)',
            borderTopColor: p.border,
            borderTopWidth: 1,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            shadowColor: p.violet,
            shadowOpacity: 0.16,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: -4 },
            elevation: 12,
            height: 72 + insets.bottom,
            paddingTop: 8,
            paddingBottom: 8 + insets.bottom,
          },
          tabBarActiveTintColor: p.purple,
          tabBarInactiveTintColor: p.muted,
          tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
          tabBarHideOnKeyboard: true,
        }}
        screenListeners={({ navigation, route }) => ({
          tabPress: () => {
            if (navigation.getState().routes[navigation.getState().index]?.key !== route.key)
              void Haptics.selectionAsync();
          },
        })}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: translateText('MOHSEN SCOUT', language),
            tabBarLabel: translateText('Space Radar', language),
            tabBarIcon: ({ color }) => <Compass size={22} strokeWidth={1.8} color={color} />,
          }}
        />
        <Tabs.Screen
          name="news"
          options={{
            title: translateText('Cosmic News', language),
            tabBarLabel: translateText('News', language),
            tabBarIcon: ({ color }) => <Newspaper size={22} strokeWidth={1.8} color={color} />,
          }}
        />
        <Tabs.Screen
          name="opportunities"
          options={{
            title: translateText('Opportunities', language),
            tabBarLabel: translateText('Ideas', language),
            tabBarIcon: ({ color }) => <Telescope size={22} strokeWidth={1.8} color={color} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: translateText('My Library', language),
            tabBarLabel: translateText('Library', language),
            tabBarIcon: ({ color }) => <Library size={22} strokeWidth={1.8} color={color} />,
          }}
        />
        <Tabs.Screen name="notes" options={{ href: null, title: translateText('Notes', language) }} />
        <Tabs.Screen
          name="settings"
          options={{
            title: translateText('Settings', language),
            tabBarIcon: ({ color }) => <Settings size={22} strokeWidth={1.8} color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}
