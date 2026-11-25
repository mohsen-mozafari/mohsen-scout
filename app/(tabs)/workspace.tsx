import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { BookMarked, NotebookPen } from 'lucide-react-native';
import { Page, styles, ScreenIntro } from '@/components/ScoutUI';
import { palette as p } from '@/lib/theme';
import { useScout } from '@/lib/store';
import Library from './library';
import Notes from './notes';

type Section = 'library' | 'notes';

export default function Workspace() {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const [section, setSection] = useState<Section>('library');
  const fa = language === 'fa';
  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10, gap: 14 }}>
        <ScreenIntro
          eyebrow={fa ? 'فضای کاری شخصی' : 'PERSONAL WORKSPACE'}
          title={fa ? 'کتابخانه و یادداشت‌ها' : 'Library & Notes'}
          subtitle={fa ? 'همه منابع ذخیره‌شده، صفحات پژوهش، یادداشت‌ها و تصمیم‌ها در یک فضای یکپارچه؛ بدون جابه‌جایی یا حذف اطلاعات.' : 'Saved references, research pages, notes and decisions in one workspace. Your existing content and actions remain available.'}
          icon={BookMarked}
        />
        <View style={{ flexDirection: fa ? 'row-reverse' : 'row', gap: 8, backgroundColor: p.panel, borderWidth: 1, borderColor: p.border, padding: 5, borderRadius: 16 }}>
          <Pressable onPress={() => setSection('library')} style={{ flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: section === 'library' ? p.accentSoft : 'transparent', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}>
            <BookMarked size={17} color={section === 'library' ? p.accentStrong : p.muted} />
            <Text style={{ color: section === 'library' ? p.text : p.muted, fontWeight: '700' }}>{fa ? 'کتابخانه' : 'Library'}</Text>
          </Pressable>
          <Pressable onPress={() => setSection('notes')} style={{ flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: section === 'notes' ? p.accentSoft : 'transparent', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}>
            <NotebookPen size={17} color={section === 'notes' ? p.accentStrong : p.muted} />
            <Text style={{ color: section === 'notes' ? p.text : p.muted, fontWeight: '700' }}>{fa ? 'یادداشت‌ها' : 'Notes'}</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {section === 'library' ? <Library /> : <Notes />}
      </View>
    </View>
  );
}
