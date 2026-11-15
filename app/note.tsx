import { useState } from 'react';
import { View, Text, Linking, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Button } from 'heroui-native';
import { router, useLocalSearchParams, Link } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { styles, Field, Choices, Action, Txt, ErrorBox, useOperation } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { uid, type Note, type NoteBlock } from '@/lib/types';
import { palette as p } from '@/lib/theme';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
export default function NoteEditor() {
  const insets = useSafeAreaInsets();
  const { id, video, idea } = useLocalSearchParams<{
    id?: string;
    video?: string;
    idea?: string;
  }>();
  const existing = useScout((s) => s.data.notes.find((n) => n.id === id));
  const ready = useScout((s) => s.ready);
  const [note, setNote] = useState<Note>(
    () =>
      existing ?? {
        id: uid(),
        title: '',
        folder: '',
        tags: [],
        blocks: [
          {
            id: uid(),
            type: video ? 'video' : idea ? 'opportunity' : 'paragraph',
            text: video ? `https://www.youtube.com/watch?v=${video}` : (idea ?? ''),
          },
        ],
        updatedAt: Date.now(),
      },
  );
  const [type, setType] = useState<NoteBlock['type']>('paragraph');
  const [confirm, setConfirm] = useState(false);
  const op = useOperation();
  const [previousExisting, setPreviousExisting] = useState(existing);
  if (previousExisting !== existing) {
    setPreviousExisting(existing);
    if (existing) setNote(existing);
  }
  const changeBlock = (blockId: string, change: Partial<NoteBlock>) =>
    setNote((n) => ({
      ...n,
      blocks: n.blocks.map((b) => (b.id === blockId ? { ...b, ...change } : b)),
    }));
  const save = () =>
    void op.run(async () => {
      if (!note.title.trim()) throw new Error('Give your page a title.');
      const value = { ...note, title: note.title.trim(), updatedAt: Date.now() };
      await useScout
        .getState()
        .commit((d) => ({ ...d, notes: [value, ...d.notes.filter((n) => n.id !== note.id)] }));
      router.dismissTo('/notes');
    });
  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {!router.canGoBack() && (
          <Link href="/notes" style={styles.badge}>
            Back to Notes
          </Link>
        )}
        <Field
          label="Page title"
          value={note.title}
          onChange={(title) => setNote({ ...note, title })}
          placeholder="An idea worth keeping"
        />
        <Field
          label="Folder"
          value={note.folder}
          onChange={(folder) => setNote({ ...note, folder })}
        />
        <Field
          label="Tags (comma separated)"
          value={note.tags.join(',')}
          onChange={(tags) =>
            setNote({
              ...note,
              tags: tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        />
        {note.blocks.map((block, index) => (
          <View key={block.id} style={{ gap: 8 }}>
            <View style={styles.row}>
              <Text style={[styles.label, { flex: 1 }]}>{block.type}</Text>
              {block.type === 'checklist' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    void Haptics.selectionAsync();
                    changeBlock(block.id, { checked: !block.checked });
                  }}
                >
                  <Button.Label>{block.checked ? 'Done' : 'To do'}</Button.Label>
                </Button>
              )}
              <Button
                size="sm"
                isIconOnly
                variant="tertiary"
                accessibilityLabel="Remove block"
                onPress={() =>
                  setNote({ ...note, blocks: note.blocks.filter((b) => b.id !== block.id) })
                }
              >
                <Trash2 size={18} color={p.muted} />
              </Button>
            </View>
            <Field
              label={`Block ${index + 1}`}
              value={block.text}
              multiline={['paragraph', 'bullet', 'heading'].includes(block.type)}
              onChange={(text) => changeBlock(block.id, { text })}
            />
            {['link', 'video', 'opportunity'].includes(block.type) && (
              <Action
                secondary
                onPress={() => {
                  if (block.type === 'opportunity')
                    router.push({ pathname: '/detail', params: { idea: block.text } });
                  else
                    void op.run(async () => {
                      if (!block.text.startsWith('https://'))
                        throw new Error('Use a secure https link.');
                      await Linking.openURL(block.text);
                    });
                }}
              >
                Open reference
              </Action>
            )}
          </View>
        ))}
        <Choices
          label="Add block"
          options={
            ['paragraph', 'heading', 'bullet', 'checklist', 'link', 'video', 'opportunity'] as const
          }
          selected={[type]}
          onChange={(v) => setType(v[0])}
        />
        <Action
          icon={Plus}
          secondary
          onPress={() =>
            setNote({ ...note, blocks: [...note.blocks, { id: uid(), type, text: '' }] })
          }
        >
          Add block
        </Action>
        {Boolean(op.error) && <ErrorBox message={op.error} onRetry={op.clear} />}
        {existing && (
          <Action
            secondary
            busy={op.busy}
            onPress={() => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              void op.run(async () => {
                await useScout
                  .getState()
                  .commit((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== note.id) }));
                router.dismissTo('/notes');
              });
            }}
          >
            {confirm ? 'Confirm delete page' : 'Delete page'}
          </Action>
        )}
        <Txt muted>Pages, checklists and references stay on this device.</Txt>
      </ScrollView>
      <View
        style={{
          padding: 16,
          paddingBottom: 16 + insets.bottom,
          borderTopWidth: 1,
          borderTopColor: p.border,
        }}
      >
        <Action busy={op.busy} disabled={!ready} onPress={save}>
          Save page
        </Action>
      </View>
    </KeyboardAvoidingView>
  );
}
