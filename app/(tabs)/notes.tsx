import { useState } from 'react';
import { Text, View, FlatList } from 'react-native';
import { Button } from 'heroui-native';
import { router } from 'expo-router';
import { NotebookPen, Plus, ArrowUpRight } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Page, styles, Field, Choices, Action, Empty, Txt } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { palette as p } from '@/lib/theme';
export default function Notes() {
  const notes = useScout((s) => s.data.notes);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('All');
  const [tag, setTag] = useState('All tags');
  const filtered = notes
    .filter(
      (n) =>
        (folder === 'All' || n.folder === folder) &&
        (tag === 'All tags' || n.tags.includes(tag)) &&
        `${n.title} ${n.blocks.map((b) => b.text).join(' ')} ${n.tags.join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <Page scroll={false}>
      <FlatList
        data={filtered}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 18, marginBottom: 24 }}>
            <Text style={styles.title}>Room to think.</Text>
            <Field label="Search pages" value={search} onChange={setSearch} />
            <Choices
              label="Folders"
              options={['All', ...new Set(notes.map((n) => n.folder).filter(Boolean))]}
              selected={[folder]}
              onChange={(v) => setFolder(v[0])}
            />
            <Choices
              label="Tags"
              options={['All tags', ...new Set(notes.flatMap((n) => n.tags))]}
              selected={[tag]}
              onChange={(v) => setTag(v[0])}
            />
            <Action icon={Plus} onPress={() => router.push('/note')}>
              New page
            </Action>
          </View>
        }
        renderItem={({ item }) => (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(100)}
            style={[styles.rule, { marginBottom: 20 }]}
          >
            <Button
              variant="tertiary"
              onPress={() => router.push({ pathname: '/note', params: { id: item.id } })}
              className="h-auto justify-start px-0"
            >
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={styles.heading}>{item.title}</Text>
                <Txt muted>
                  {item.folder || 'Unfiled'} ·{' '}
                  {new Date(item.updatedAt).toLocaleDateString('en-US')}
                </Txt>
              </View>
              <ArrowUpRight size={18} color={p.purple} />
            </Button>
          </Animated.View>
        )}
        ListEmptyComponent={
          <Empty
            icon={NotebookPen}
            title={notes.length ? 'No pages match this view.' : 'Your ideas deserve a page.'}
            action={notes.length ? 'Clear filters' : 'Create a page'}
            onPress={() =>
              notes.length
                ? (setSearch(''), setFolder('All'), setTag('All tags'))
                : router.push('/note')
            }
          />
        }
      />
    </Page>
  );
}
