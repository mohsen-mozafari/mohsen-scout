import { Compass, Telescope, Library, NotebookPen, Settings } from 'lucide-react-native';
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
          headerStyle: { backgroundColor: p.background },
          headerTintColor: p.text,
          headerTitleStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
          headerShadowVisible: false,
          sceneStyle: { backgroundColor: p.background, direction: language === 'fa' ? 'rtl' : 'ltr' },
          tabBarStyle: {
            direction: language === 'fa' ? 'rtl' : 'ltr',
            backgroundColor: p.background,
            borderTopColor: p.border,
            shadowColor: p.background,
            shadowOpacity: 0,
            shadowRadius: 0,
            elevation: 0,
            height: 66 + insets.bottom,
            paddingTop: 8,
            paddingBottom: 8 + insets.bottom,
          },
          tabBarActiveTintColor: p.purple,
          tabBarInactiveTintColor: p.muted,
          tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
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
        <Tabs.Screen
          name="notes"
          options={{
            title: translateText('Notes', language),
            tabBarIcon: ({ color }) => <NotebookPen size={22} strokeWidth={1.8} color={color} />,
          }}
        />
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
