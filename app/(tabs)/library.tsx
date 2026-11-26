import { useState } from 'react';
import { translateText } from '@/lib/i18n';
import { View, Text, FlatList } from 'react-native';
import { Button } from 'heroui-native';
import { router } from 'expo-router';
import { ArrowUpRight, Plus, Download, Bookmark } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import {
  Page,
  styles,
  Field,
  Choices,
  Fold,
  Action,
  Empty,
  ErrorBox,
  useOperation,
  Txt,
  Heading,
  ScreenIntro,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { matchesSearchText } from '@/lib/search';
import { type SavedLink } from '@/lib/types';
import { palette as p } from '@/lib/theme';
import { personalLinks } from '@/lib/backup';
import { openExternalUrl } from '@/lib/external-links';
import { shareText } from '@/lib/transfer';
import { MediaPreview } from '@/components/MediaPreview';
export default function Library() {
  const data = useScout((s) => s.data);
  const ready = useScout((s) => s.ready);
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('All');
  const [tag, setTag] = useState('All tags');
  const [sort, setSort] = useState('Newest');
  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<SavedLink>();
  const [confirm, setConfirm] = useState('');
  const op = useOperation();
  const filtered = data.links
    .filter(
      (l) =>
        (folder === 'All' || l.folder === folder) &&
        (tag === 'All tags' || l.tags.includes(tag)) &&
        matchesSearchText(
          `${l.manualTitle} ${data.videos.find((v) => v.id === l.id)?.title ?? ''} ${l.topic} ${l.note} ${l.tags.join(' ')}`,
          search,
        ),
    )
    .sort((a, b) =>
      sort === 'Oldest'
        ? a.savedAt - b.savedAt
        : sort === 'Title'
          ? (a.manualTitle || a.topic).localeCompare(b.manualTitle || b.topic)
          : b.savedAt - a.savedAt,
    );
  const add = () =>
    void op.run(async () => {
      const parsed = new URL(url);
      if (
        !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(
          parsed.hostname,
        ) ||
        parsed.protocol !== 'https:'
      )
        throw new Error('Enter a secure YouTube video link.');
      const id =
        parsed.hostname === 'youtu.be'
          ? parsed.pathname.slice(1)
          : (parsed.searchParams.get('v') ?? parsed.pathname.split('/').pop() ?? '');
      if (!/^[\w-]{11}$/.test(id)) throw new Error('This link does not contain a valid video ID.');
      await useScout.getState().commit((d) => ({
        ...d,
        links: [
          {
            id,
            url: `https://www.youtube.com/watch?v=${id}`,
            manualTitle: title,
            topic: '',
            note: '',
            folder: '',
            tags: [],
            savedAt: Date.now(),
          },
          ...d.links.filter((l) => l.id !== id),
        ],
      }));
      setUrl('');
      setTitle('');
    }, 'Link saved.');
  if (!ready) return <Page safeAreaTop={false} title="Library" showBack><Txt muted>Loading your saved links…</Txt></Page>;
  return (
    <Page safeAreaTop={false} scroll={false}>
      <FlatList
        data={filtered}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 15, marginBottom: 18 }}>
            <ScreenIntro
              eyebrow="PERSONAL LIBRARY"
              title="Your saved references"
              subtitle="Keep the YouTube links you chose to save, with your own labels, folders, tags and notes."
              icon={Bookmark}
            />
            <View style={styles.panel}>
              <Field
                label="Search library"
                value={search}
                onChange={setSearch}
                placeholder="Titles, personal notes or tags"
              />
              <Txt muted>{filtered.length} saved references shown</Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Action icon={Plus} onPress={() => setAddOpen((value) => !value)}>
                    {addOpen ? 'Close add form' : 'Add a link'}
                  </Action>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Action secondary icon={Download} busy={op.busy} onPress={() => void op.run(() => shareText(personalLinks(data), 'mohsen-scout-links.txt'))}>
                    Export links
                  </Action>
                </View>
              </View>
              <Fold title="Filter and sort library" summary={filtered.length + ' shown · ' + data.links.length + ' saved'}>
                <Choices
                  label="Sort"
                  options={['Newest', 'Oldest', 'Title']}
                  selected={[sort]}
                  onChange={(values) => setSort(values[0])}
                />
                <Choices
                  label="Folders"
                  options={['All', ...new Set(data.links.map((link) => link.folder).filter(Boolean))]}
                  selected={[folder]}
                  onChange={(values) => setFolder(values[0])}
                />
                <Choices
                  label="Tags"
                  options={['All tags', ...new Set(data.links.flatMap((link) => link.tags))]}
                  selected={[tag]}
                  onChange={(values) => setTag(values[0])}
                />
              </Fold>
            </View>
            {addOpen ? (
              <View style={styles.panel}>
                <Heading>Add a YouTube reference</Heading>
                <Field label="YouTube URL" value={url} onChange={setUrl} placeholder="https://www.youtube.com/watch?v=…" />
                <Field label="Personal label" value={title} onChange={setTitle} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Action icon={Plus} busy={op.busy} onPress={add}>Save link</Action>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Action secondary onPress={() => setAddOpen(false)}>Cancel</Action>
                  </View>
                </View>
              </View>
            ) : null}
            {Boolean(op.error) && <ErrorBox message={op.error} onDismiss={op.clear} />}
            {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
            {editing ? (
              <View style={styles.panel}>
                <Heading>Edit personal reference</Heading>
                <Field label="Personal label" value={editing.manualTitle} onChange={(value) => setEditing({ ...editing, manualTitle: value })} />
                <Field label="Topic" value={editing.topic} onChange={(value) => setEditing({ ...editing, topic: value })} />
                <Field label="Folder" value={editing.folder} onChange={(value) => setEditing({ ...editing, folder: value })} />
                <Field
                  label="Tags (comma separated)"
                  value={editing.tags.join(',')}
                  onChange={(value) => setEditing({ ...editing, tags: value.split(',').map((tagValue) => tagValue.trim()).filter(Boolean) })}
                />
                <Field label="Personal notes" multiline value={editing.note} onChange={(value) => setEditing({ ...editing, note: value })} />
                <Action
                  busy={op.busy}
                  onPress={() => void op.run(async () => {
                    await useScout.getState().commit((currentData) => ({
                      ...currentData,
                      links: currentData.links.map((link) => (link.id === editing.id ? editing : link)),
                    }));
                    setEditing(undefined);
                  })}
                >
                  Save changes
                </Action>
                <Action secondary onPress={() => setEditing(undefined)}>Cancel</Action>
              </View>
            ) : null}
          </View>

        }
        renderItem={({ item }) => {
          const video = data.videos.find((v) => v.id === item.id);
          return (
            <Animated.View
              entering={FadeIn.duration(160)}
              exiting={FadeOut.duration(100)}
              style={[styles.listCard, { gap: 12, marginBottom: 16 }]}
            >
              {Boolean(video?.thumbnail) && (
                <MediaPreview uri={video?.thumbnail} aspectRatio={16 / 9} viewer alt={video?.title ?? 'Saved video'} />
              )}
              <Button
                variant="tertiary"
                className="h-auto min-w-0 justify-start rounded-2xl px-4 py-3"
                onPress={() => router.push({ pathname: '/detail', params: { video: item.id } })}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.heading}>
                    {item.manualTitle || video?.title || item.topic || translateText('Saved YouTube link', language)}
                  </Text>
                  {video && <Txt muted>{video.channel}</Txt>}
                </View>
                <ArrowUpRight size={18} color={p.purple} />
              </Button>
              {!video && (
                <Txt muted>
                  YouTube metadata expired or was not requested. Your link and notes remain.
                </Txt>
              )}
              <Txt muted>
                {item.folder || 'Unfiled'} · Saved{' '}
                {new Date(item.savedAt).toLocaleDateString(language === 'fa' ? 'fa-IR' : 'en-US')}
              </Txt>
              {Boolean(item.note) && <Txt>{item.note}</Txt>}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Action secondary onPress={() => setEditing(item)}>
                    Edit
                  </Action>
                </View>
                <View style={{ flex: 1 }}>
                  <Action
                    secondary
                    onPress={() => void openExternalUrl(item.url, language)}
                  >
                    YouTube
                  </Action>
                </View>
              </View>
              <Action
                secondary
                busy={op.busy}
                onPress={() => {
                  if (confirm !== item.id) {
                    setConfirm(item.id);
                    return;
                  }
                  void op.run(() =>
                    useScout
                      .getState()
                      .commit((d) => ({ ...d, links: d.links.filter((l) => l.id !== item.id) })),
                  );
                }}
              >
                {confirm === item.id ? 'Confirm delete link' : 'Delete'}
              </Action>
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          <Empty
            title={
              data.links.length
                ? 'No links match this view.'
                : 'Keep video references, never downloads.'
            }
            action={data.links.length ? 'Clear filters' : 'Add a link'}
            onPress={() => {
              setFolder('All');
              setTag('All tags');
              setSearch('');
              if (!data.links.length) setAddOpen(true);
            }}
          />
        }
      />
    </Page>
  );
}
