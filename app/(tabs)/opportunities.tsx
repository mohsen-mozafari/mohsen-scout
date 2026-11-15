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
import { statuses } from '@/lib/types';
import { createManualIdea } from '@/lib/engine';
import { palette as p } from '@/lib/theme';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { MediaPreview } from '@/components/MediaPreview';
export default function Opportunities() {
  const ideas = useScout((s) => s.data.ideas);
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [archive, setArchive] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftTopic, setDraftTopic] = useState('');
  const [draftConcept, setDraftConcept] = useState('');
  const [draftDecision, setDraftDecision] = useState('');
  const preferences = useScout((s) => s.data.preferences);
  const op = useOperation();
  const filtered = ideas.filter(
    (i) =>
      i.archived === archive &&
      (status === 'All' || i.status === status) &&
      `${i.topic} ${i.concept} ${i.note} ${i.decision}`.toLowerCase().includes(search.toLowerCase()),
  );
  const openCreate = () => {
    setDraftTopic(preferences.lastInput?.topic ?? '');
    setDraftConcept('');
    setDraftDecision('');
    setDraftOpen(true);
  };
  const create = () => void op.run(async () => {
    const idea = createManualIdea(
      draftTopic,
      draftConcept,
      draftDecision,
      preferences.region,
      preferences.languages,
    );
    await useScout.getState().commit((data) => ({ ...data, ideas: [idea, ...data.ideas] }));
    setDraftOpen(false);
    router.push({ pathname: '/detail', params: { idea: idea.id } });
  }, 'Complete idea saved.');
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
            {draftOpen && (
              <View style={[styles.panel, { gap: 12 }]}>
                <Text style={styles.heading}>Create a complete idea</Text>
                <Field label="Topic / working title" value={draftTopic} onChange={setDraftTopic} placeholder="e.g. What JWST reveals about exoplanet atmospheres" />
                <Field label="Video concept" value={draftConcept} onChange={setDraftConcept} multiline placeholder="What is the central question, what will the viewer learn, and what makes your explanation useful?" />
                <Field label="Your initial decision (optional)" value={draftDecision} onChange={setDraftDecision} multiline placeholder="What would make this worth producing?" />
                <Txt muted>Ideas are saved only after you provide a real topic and a concept. This prevents empty records from reaching AI Second Opinion.</Txt>
                <Action busy={op.busy} disabled={!draftTopic.trim() || !draftConcept.trim()} onPress={create}>Save idea</Action>
                <Action secondary disabled={op.busy} onPress={() => setDraftOpen(false)}>Cancel</Action>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Action icon={Plus} busy={op.busy} onPress={openCreate}>
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
            {item.imageUrl ? <MediaPreview uri={item.imageUrl} aspectRatio={16 / 9} viewer alt={item.topic} /> : null}
            <Button
              variant="tertiary"
              className="h-auto justify-start px-0"
              onPress={() => router.push({ pathname: '/detail', params: { idea: item.id } })}
            >
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={styles.badge}>{item.assessment} · {item.status}</Text>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 20, color: '#F4F2FF' }}>{item.topic}</Text>
                {item.concept ? <Text numberOfLines={3} style={styles.muted}>{item.concept}</Text> : <Txt muted>Concept missing — open the editor to complete this draft before requesting an AI opinion.</Txt>}
                {item.sourceName ? <Text style={styles.badge}>Source: {item.sourceName}</Text> : null}
                {item.decision ? <Txt muted>{item.decision}</Txt> : null}
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
                : openCreate
            }
          />
        }
      />
    </Page>
  );
}
