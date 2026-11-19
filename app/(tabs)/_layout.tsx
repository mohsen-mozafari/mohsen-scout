import { Bookmark, Compass, Lightbulb, Newspaper, Settings } from 'lucide-react-native';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { palette as p } from '@/lib/theme';
import { useScout } from '@/lib/store';
import { translateText } from '@/lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';

function TabGlyph({ Icon, focused, color }: { Icon: LucideIcon; focused: boolean; color: unknown }) {
  return (
    <View
      style={{
        width: 40,
        height: 31,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? p.purpleSoft : 'transparent',
        borderWidth: focused ? 1 : 0,
        borderColor: focused ? p.purpleLine : 'transparent',
      }}
    >
      <Icon size={19} strokeWidth={focused ? 2.2 : 1.8} color={String(color)} />
    </View>
  );
}

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
          sceneStyle: {
            backgroundColor: p.background,
            direction: language === 'fa' ? 'rtl' : 'ltr',
          },
          tabBarStyle: {
            direction: language === 'fa' ? 'rtl' : 'ltr',
            backgroundColor: p.nav,
            borderTopColor: p.border,
            borderTopWidth: 1,
            height: 70 + insets.bottom,
            paddingTop: 7,
            paddingBottom: 5 + insets.bottom,
            elevation: 12,
            shadowColor: '#000000',
            shadowOpacity: 0.24,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: -5 },
          },
          tabBarActiveTintColor: p.purple,
          tabBarInactiveTintColor: p.muted,
          tabBarLabelStyle: {
            fontFamily: 'Inter_600SemiBold',
            fontSize: 9,
            letterSpacing: 0.45,
            marginTop: 1,
          },
          tabBarItemStyle: { paddingHorizontal: 2 },
          tabBarIconStyle: { marginTop: 0 },
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
            tabBarLabel: translateText('Radar', language),
            tabBarIcon: ({ color, focused }) => <TabGlyph Icon={Compass} focused={focused} color={color} />,
          }}
        />
        <Tabs.Screen
          name="news"
          options={{
            title: translateText('Cosmic News', language),
            tabBarLabel: translateText('News', language),
            tabBarIcon: ({ color, focused }) => <TabGlyph Icon={Newspaper} focused={focused} color={color} />,
          }}
        />
        <Tabs.Screen
          name="opportunities"
          options={{
            title: translateText('Opportunities', language),
            tabBarLabel: translateText('Ideas', language),
            tabBarIcon: ({ color, focused }) => <TabGlyph Icon={Lightbulb} focused={focused} color={color} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: translateText('My Library', language),
            tabBarLabel: translateText('Library', language),
            tabBarIcon: ({ color, focused }) => <TabGlyph Icon={Bookmark} focused={focused} color={color} />,
          }}
        />
        <Tabs.Screen name="notes" options={{ href: null, title: translateText('Notes', language) }} />
        <Tabs.Screen
          name="settings"
          options={{
            title: translateText('Settings', language),
            tabBarLabel: translateText('Settings', language),
            tabBarIcon: ({ color, focused }) => <TabGlyph Icon={Settings} focused={focused} color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}
