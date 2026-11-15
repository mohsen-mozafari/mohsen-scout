import { useState } from 'react';
import { FlatList, View, Text } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { ArrowUpRight, Plus, Archive } from 'lucide-react-native';
import {
  Page,
  styles,
  Choices,
  Field,
  Empty,
  Action,
  ErrorBox,
  useOperation,
  Txt,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { statuses, uid, type Idea } from '@/lib/types';
import { palette as p } from '@/lib/theme';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
export default function Opportunities() {
  const ideas = useScout((s) => s.data.ideas);
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [archive, setArchive] = useState(false);
  const op = useOperation();
  const filtered = ideas.filter(
    (i) =>
      i.archived === archive &&
      (status === 'All' || i.status === status) &&
      `${i.topic} ${i.note} ${i.decision}`.toLowerCase().includes(search.toLowerCase()),
  );
  const create = () =>
    void op.run(async () => {
      const id = uid();
      const prefs = useScout.getState().data.preferences;
      const idea: Idea = {
        id,
        topic: 'Untitled idea',
        concept: '',
        note: '',
        decision: '',
        videoIds: [],
        createdAt: Date.now(),
        archived: false,
        status: 'New Discoveries',
        assessment: 'Uncertain',
        region: prefs.region,
        languages: prefs.languages,
      };
      await useScout.getState().commit((data) => ({ ...data, ideas: [idea, ...data.ideas] }));
      router.push({ pathname: '/detail', params: { idea: id } });
    });
  return (
    <Page scroll={false}>
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 18, marginBottom: 20 }}>
            <Text style={styles.title}>Your next move.</Text>
            <Field
              label="Search ideas"
              value={search}
              onChange={setSearch}
              placeholder="Topic or personal decision"
            />
            <Choices
              options={['All', ...statuses]}
              selected={[status]}
              onChange={(v) => setStatus(v[0])}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Action icon={Plus} busy={op.busy} onPress={create}>
                  New idea
                </Action>
              </View>
              <View style={{ flex: 1 }}>
                <Action secondary icon={Archive} onPress={() => setArchive(!archive)}>
                  {archive ? 'Active ideas' : 'Archived'}
                </Action>
              </View>
            </View>
            {Boolean(op.error) && <ErrorBox message={op.error} onRetry={op.clear} />}
          </View>
        }
        renderItem={({ item }) => (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(100)}
            style={[styles.rule, { marginBottom: 18 }]}
          >
            <Button
              variant="tertiary"
              className="h-auto justify-start px-0"
              onPress={() => router.push({ pathname: '/detail', params: { idea: item.id } })}
            >
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={styles.badge}>{item.assessment}</Text>
                <Text style={styles.heading}>{item.topic}</Text>
                <Txt muted>{item.status}</Txt>
                {item.decision ? <Txt>{item.decision}</Txt> : null}
              </View>
              <ArrowUpRight color={p.purple} size={20} />
            </Button>
          </Animated.View>
        )}
        ListEmptyComponent={
          <Empty
            title={
              ideas.length ? 'No ideas match this view.' : 'Keep your ideas and decisions here.'
            }
            action={ideas.length ? 'Clear filters' : 'Create an idea'}
            onPress={
              ideas.length
                ? () => {
                    setSearch('');
                    setStatus('All');
                    setArchive(false);
                  }
                : create
            }
          />
        }
      />
    </Page>
  );
}
