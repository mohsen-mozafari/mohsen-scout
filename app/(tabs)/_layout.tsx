import { Bookmark, Compass, Lightbulb, NotebookPen, Newspaper, Settings } from 'lucide-react-native';
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
      {/* Expo StatusBar expects a string enum rather than a React Native style object. */}
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: {
            backgroundColor: p.background,
            direction: language === 'fa' ? 'rtl' : 'ltr',
          },
          tabBarStyle: {
            direction: language === 'fa' ? 'rtl' : 'ltr',
            backgroundColor: p.nav,
            borderTopColor: p.border,
            borderTopWidth: 1,
            height: 64 + insets.bottom,
            paddingTop: 5,
            paddingBottom: 3 + insets.bottom,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarActiveTintColor: p.accentStrong,
          tabBarInactiveTintColor: p.muted,
          tabBarLabelStyle: {
            fontFamily: 'Inter_600SemiBold',
            fontSize: 9,
            marginTop: 1,
          },
          tabBarItemStyle: { paddingHorizontal: 0 },
          tabBarIconStyle: { marginTop: 0 },
          tabBarHideOnKeyboard: true,
        }}
        screenListeners={({ navigation, route }) => ({
          tabPress: () => {
            if (navigation.getState().routes[navigation.getState().index]?.key !== route.key) {
              void Haptics.selectionAsync();
            }
          },
        })}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: translateText('Space Radar', language),
            tabBarLabel: translateText('Radar', language),
            tabBarIcon: ({ color, focused }) => <Compass size={21} strokeWidth={focused ? 2.15 : 1.7} color={color} />,
          }}
        />
        <Tabs.Screen
          name="news"
          options={{
            title: translateText('Cosmic News', language),
            tabBarLabel: translateText('News', language),
            tabBarIcon: ({ color, focused }) => <Newspaper size={21} strokeWidth={focused ? 2.15 : 1.7} color={color} />,
          }}
        />
        <Tabs.Screen
          name="opportunities"
          options={{
            title: translateText('Opportunities', language),
            tabBarLabel: translateText('Ideas', language),
            tabBarIcon: ({ color, focused }) => <Lightbulb size={21} strokeWidth={focused ? 2.15 : 1.7} color={color} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: translateText('My Library', language),
            tabBarLabel: translateText('Library', language),
            tabBarIcon: ({ color, focused }) => <Bookmark size={21} strokeWidth={focused ? 2.15 : 1.7} color={color} />,
          }}
        />
        <Tabs.Screen
          name="notes"
          options={{
            title: translateText('Notes', language),
            tabBarLabel: translateText('Notes', language),
            tabBarIcon: ({ color, focused }) => <NotebookPen size={21} strokeWidth={focused ? 2.15 : 1.7} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: translateText('Settings', language),
            tabBarLabel: translateText('Settings', language),
            tabBarIcon: ({ color, focused }) => <Settings size={20} strokeWidth={focused ? 2.15 : 1.7} color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}
