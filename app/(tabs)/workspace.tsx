import { useState } from 'react';
import { View, Text, Pressable, Platform, StatusBar } from 'react-native';
import { Archive, BookMarked, NotebookPen } from 'lucide-react-native';
import { palette as p } from '@/lib/theme';
import { useScout } from '@/lib/store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Library from './library';
import Notes from './notes';
import ResearchArchive from '@/components/ResearchArchive';

type Section = 'research' | 'library' | 'notes';
export default function Workspace() {
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 0);
  const language = useScout((state) => state.data.preferences.uiLanguage ?? 'fa');
  const [section, setSection] = useState<Section>('research');
  const fa = language === 'fa';
  const tabs: { id: Section; label: string; icon: typeof Archive }[] = [
    { id: 'research', label: fa ? 'گزارش‌ها' : 'Reports', icon: Archive },
    { id: 'library', label: fa ? 'کتابخانه' : 'Library', icon: BookMarked },
    { id: 'notes', label: fa ? 'یادداشت‌ها' : 'Notes', icon: NotebookPen },
  ];
  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <View style={{ paddingHorizontal: 18, paddingTop: safeTop + 8, paddingBottom: 9 }}>
        <View style={{ flexDirection: fa ? 'row-reverse' : 'row', gap: 7, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, padding: 5, borderRadius: 17 }}>
          {tabs.map(({ id, label, icon: Icon }) => {
            const selected = section === id;
            return (
              <Pressable key={id} onPress={() => setSection(id)}
                accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }}
                style={({ pressed }) => ({
                  flex: 1, minHeight: 46, borderRadius: 12,
                  backgroundColor: selected ? p.accentSoft : 'transparent',
                  borderWidth: selected ? 1 : 0, borderColor: selected ? p.accentLine : 'transparent',
                  alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
                  opacity: pressed ? 0.78 : 1, paddingHorizontal: 4,
                })}>
                <Icon size={16} color={selected ? p.accentStrong : p.muted} />
                <Text numberOfLines={1} style={{ color: selected ? p.text : p.muted, fontWeight: '700', fontSize: 12 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {section === 'research' ? <ResearchArchive /> : section === 'library' ? <Library /> : <Notes />}
      </View>
    </View>
  );
}
