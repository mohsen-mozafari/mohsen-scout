import { Bookmark, Compass, Lightbulb, Newspaper, Search } from 'lucide-react-native';
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
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: p.background, direction: language === 'fa' ? 'rtl' : 'ltr' },
          tabBarStyle: {
            direction: language === 'fa' ? 'rtl' : 'ltr',
            backgroundColor: p.nav, borderTopColor: p.border, borderTopWidth: 1,
            height: 70 + insets.bottom, paddingTop: 6, paddingBottom: 4 + insets.bottom,
            elevation: 0, shadowOpacity: 0,
          },
          tabBarActiveTintColor: p.accentStrong,
          tabBarInactiveTintColor: p.muted,
          tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 10, lineHeight: 14, marginTop: 2 },
          tabBarItemStyle: { paddingHorizontal: 1, paddingTop: 2 },
          tabBarIconStyle: { marginTop: 0 },
          tabBarHideOnKeyboard: true,
        }}
        screenListeners={({ navigation, route }) => ({
          tabPress: () => {
            if (navigation.getState().routes[navigation.getState().index]?.key !== route.key) void Haptics.selectionAsync();
          },
        })}
      >
        <Tabs.Screen name="index" options={{
          title: translateText('YouTube Trend Scout', language),
          tabBarLabel: translateText('Scout', language),
          tabBarIcon: ({ color, focused }) => <Compass size={21} strokeWidth={focused ? 2.15 : 1.7} color={color} />,
        }} />
        <Tabs.Screen name="news" options={{
          title: translateText('Cosmic News', language),
          tabBarLabel: translateText('News', language),
          tabBarIcon: ({ color, focused }) => <Newspaper size={21} strokeWidth={focused ? 2.15 : 1.7} color={color} />,
        }} />
        <Tabs.Screen name="discover" options={{
          title: translateText('Research Discovery', language),
          tabBarLabel: translateText('Discover', language),
          tabBarIcon: ({ color, focused }) => <Search size={21} strokeWidth={focused ? 2.15 : 1.7} color={color} />,
        }} />
        <Tabs.Screen name="opportunities" options={{
          title: translateText('Opportunities', language),
          tabBarLabel: translateText('Ideas', language),
          tabBarIcon: ({ color, focused }) => <Lightbulb size={21} strokeWidth={focused ? 2.15 : 1.7} color={color} />,
        }} />
        <Tabs.Screen name="workspace" options={{
          title: translateText('Library and Notes', language),
          tabBarLabel: translateText('Workspace', language),
          tabBarIcon: ({ color, focused }) => <Bookmark size={21} strokeWidth={focused ? 2.15 : 1.7} color={color} />,
        }} />
        <Tabs.Screen name="library" options={{ href: null }} />
        <Tabs.Screen name="notes" options={{ href: null }} />
      </Tabs>
    </>
  );
}
