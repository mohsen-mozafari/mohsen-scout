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
  SourceHeading,
  SourceText,
  BadgeText,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { statuses } from '@/lib/types';
import { getIdeaDisplayTitle, isIdeaDisplayable } from '@/lib/idea-research';
import { createManualIdea } from '@/lib/engine';
import { palette as p } from '@/lib/theme';
import { translateText } from '@/lib/i18n';
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
  const displayableIdeas = ideas.filter(isIdeaDisplayable);
  const filtered = displayableIdeas.filter(
    (i) =>
      i.archived === archive &&
      (status === 'All' || i.status === status) &&
      `${getIdeaDisplayTitle(i, preferences.uiLanguage ?? 'fa')} ${i.concept} ${i.note} ${i.decision}`.toLowerCase().includes(search.toLowerCase()),
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
            <Text style={styles.title}>{translateText("Your next move.", preferences.uiLanguage ?? "fa")}</Text>
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
                <Text style={styles.heading}>{translateText("Create a complete idea", preferences.uiLanguage ?? "fa")}</Text>
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
              className="h-auto min-w-0 justify-start rounded-2xl px-4 py-3"
              onPress={() => router.push({ pathname: '/detail', params: { idea: item.id } })}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                <BadgeText>{item.assessment + ' · ' + item.status}</BadgeText>
                <SourceHeading>{getIdeaDisplayTitle(item, preferences.uiLanguage ?? 'fa')}</SourceHeading>
                {item.concept ? <SourceText muted numberOfLines={3}>{item.concept}</SourceText> : <Txt muted>Concept missing — open the editor to complete this draft before requesting an AI opinion.</Txt>}
                {item.sourceName ? <View style={styles.row}><Txt muted>Source:</Txt><SourceText>{item.sourceName}</SourceText></View> : null}
                {item.decision ? <SourceText muted>{item.decision}</SourceText> : null}
              </View>
              <ArrowUpRight color={p.purple} size={20} />
            </Button>
          </Animated.View>
        )}
        ListEmptyComponent={
          <Empty
            title={
              displayableIdeas.length ? 'No ideas match this view.' : 'Keep your ideas and decisions here.'
            }
            action={displayableIdeas.length ? 'Clear filters' : 'Create an idea'}
            onPress={
              displayableIdeas.length
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
