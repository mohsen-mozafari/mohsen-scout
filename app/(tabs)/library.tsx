import { useState } from 'react';
import { translateText } from '@/lib/i18n';
import { View, Text, Linking, FlatList } from 'react-native';
import { Button } from 'heroui-native';
import { router } from 'expo-router';
import { ArrowUpRight, Plus, Download } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import {
  Page,
  styles,
  Field,
  Choices,
  Action,
  Empty,
  ErrorBox,
  useOperation,
  Txt,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { matchesSearchText } from '@/lib/search';
import { type SavedLink } from '@/lib/types';
import { palette as p } from '@/lib/theme';
import { personalLinks } from '@/lib/backup';
import { shareText } from '@/lib/transfer';
import { MediaPreview } from '@/components/MediaPreview';
export default function Library() {
  const data = useScout((s) => s.data);
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
  return (
    <Page scroll={false}>
      <FlatList
        data={filtered}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 18, marginBottom: 24 }}>
            <Text style={styles.title}>{translateText("Your reference shelf.", language)}</Text>
            <Field
              label="Search library"
              value={search}
              onChange={setSearch}
              placeholder="Titles, personal notes or tags"
            />
            <Choices
              options={['Newest', 'Oldest', 'Title']}
              selected={[sort]}
              onChange={(v) => setSort(v[0])}
            />
            <Choices
              label="Folders"
              options={['All', ...new Set(data.links.map((l) => l.folder).filter(Boolean))]}
              selected={[folder]}
              onChange={(v) => setFolder(v[0])}
            />
            <Choices
              label="Tags"
              options={['All tags', ...new Set(data.links.flatMap((l) => l.tags))]}
              selected={[tag]}
              onChange={(v) => setTag(v[0])}
            />
            {addOpen && (
              <View style={{ gap: 14 }}>
                <Field
                  label="YouTube URL"
                  value={url}
                  onChange={setUrl}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
                <Field label="Personal label" value={title} onChange={setTitle} />
                <Action icon={Plus} busy={op.busy} onPress={add}>
                  Save link
                </Action>
                <Action secondary onPress={() => setAddOpen(false)}>
                  Cancel
                </Action>
              </View>
            )}
            <Action secondary onPress={() => router.push('/notes')}>
              Open research notes
            </Action>
            <Action secondary icon={Plus} onPress={() => setAddOpen(true)}>
              Add a personal link
            </Action>
            <Action
              icon={Download}
              secondary
              busy={op.busy}
              onPress={() =>
                void op.run(() => shareText(personalLinks(data), 'mohsen-scout-links.txt'))
              }
            >
              Export personal links
            </Action>
            {Boolean(op.error) && <ErrorBox message={op.error} onRetry={op.clear} />}
            {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
            {editing && (
              <View style={styles.panel}>
                <Field
                  label="Personal label"
                  value={editing.manualTitle}
                  onChange={(v) => setEditing({ ...editing, manualTitle: v })}
                />
                <Field
                  label="Topic"
                  value={editing.topic}
                  onChange={(v) => setEditing({ ...editing, topic: v })}
                />
                <Field
                  label="Folder"
                  value={editing.folder}
                  onChange={(v) => setEditing({ ...editing, folder: v })}
                />
                <Field
                  label="Tags (comma separated)"
                  value={editing.tags.join(',')}
                  onChange={(v) =>
                    setEditing({
                      ...editing,
                      tags: v
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                />
                <Field
                  label="Personal notes"
                  multiline
                  value={editing.note}
                  onChange={(v) => setEditing({ ...editing, note: v })}
                />
                <Action
                  busy={op.busy}
                  onPress={() =>
                    void op.run(async () => {
                      await useScout.getState().commit((d) => ({
                        ...d,
                        links: d.links.map((l) => (l.id === editing.id ? editing : l)),
                      }));
                      setEditing(undefined);
                    })
                  }
                >
                  Save changes
                </Action>
                <Action secondary onPress={() => setEditing(undefined)}>
                  Cancel
                </Action>
              </View>
            )}
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
                    onPress={() =>
                      void op.run(async () => {
                        if (!(await Linking.canOpenURL(item.url)))
                          throw new Error('Could not open YouTube on this device.');
                        await Linking.openURL(item.url);
                      })
                    }
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
