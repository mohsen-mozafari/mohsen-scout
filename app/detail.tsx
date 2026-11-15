import { useState } from 'react';
import { Text, Linking } from 'react-native';
import { Skeleton } from 'heroui-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Bookmark, ExternalLink, NotebookPen, Copy, Sparkles } from 'lucide-react-native';
import {
  Page,
  Panel,
  Heading,
  Txt,
  Field,
  Choices,
  Action,
  Fold,
  Empty,
  styles,
  ErrorBox,
  useOperation,
} from '@/components/ScoutUI';
import { VideoRow } from '@/components/VideoRow';
import { useScout } from '@/lib/store';
import { type Idea, statuses, languages } from '@/lib/types';
import { limitations, reasoning } from '@/lib/engine';
import { getKey } from '@/lib/vault';
import { getFreeModels, getOpinion, opinionPrompt } from '@/lib/api';
import { uid } from '@/lib/types';
import { MediaPreview } from '@/components/MediaPreview';
export default function Detail() {
  const params = useLocalSearchParams<{ idea?: string; video?: string }>();
  const data = useScout((s) => s.data);
  const original = data.ideas.find((i) => i.id === params.idea);
  const video = data.videos.find((v) => v.id === params.video);
  const savedLink = data.links.find((v) => v.id === params.video);
  const [edit, setEdit] = useState<Idea | undefined>(original);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [consent, setConsent] = useState(false);
  const op = useOperation();
  const ready = useScout((s) => s.ready);
  const [previousOriginal, setPreviousOriginal] = useState(original);
  if (previousOriginal !== original) {
    setPreviousOriginal(original);
    setEdit(original);
  }
  const idea = edit ?? original;
  const ideaReadyForOpinion = Boolean(
    idea?.topic.trim() &&
    idea.topic.trim().toLowerCase() !== 'untitled idea' &&
    idea.concept.trim(),
  );
  const related = idea ? data.videos.filter((v) => idea.videoIds.includes(v.id)) : [];
  const savedReferences = idea ? data.links.filter((link) => idea.videoIds.includes(link.id)) : [];
  const researchNotes = idea ? data.notes.filter((note) => note.ideaId === idea.id) : [];
  const secondOpinion = () =>
    void op.run(async () => {
      if (!idea) return;
      if (!ideaReadyForOpinion) throw new Error('Complete the idea title and video concept before requesting an AI opinion.');
      const key = await getKey('openrouter');
      if (!key) throw new Error('Add your OpenRouter key in Settings first.');
      const models = await getFreeModels();
      let model = data.preferences.model;
      if (!model) {
        model = models[0]?.id ?? '';
        if (!model) throw new Error('No free models are available. Try refreshing later.');
        await useScout
          .getState()
          .commit((d) => ({ ...d, preferences: { ...d.preferences, model } }));
      }
      if (!models.some((m) => m.id === model))
        throw new Error('The selected free model is unavailable. Refresh models in Settings.');
      const text = await getOpinion(
        key,
        model,
        opinionPrompt(idea.topic, idea.concept, idea.decision),
      );
      await useScout.getState().commit((d) => ({
        ...d,
        opinions: [
          { id: uid(), ideaId: idea.id, text, model, createdAt: Date.now() },
          ...d.opinions,
        ],
      }));
      setConsent(false);
    });
  const saveVideoIdea = () =>
    void op.run(async () => {
      const report = data.reports.find((r) => r.videos.some((v) => v.id === params.video));
      const topic = savedLink?.topic || report?.input.topic || 'My video idea';
      const draft: Idea = {
        id: uid(),
        topic,
        concept: `A practical, original take on ${topic}.`,
        note: '',
        status: 'Saved Opportunities',
        decision: '',
        videoIds: params.video ? [params.video] : [],
        createdAt: Date.now(),
        archived: false,
        assessment: 'Uncertain',
        region: report?.input.region || data.preferences.region,
        languages: report?.input.languages || data.preferences.languages,
        imageUrl: video?.thumbnail || undefined,
      };
      await useScout.getState().saveIdea(draft);
      router.replace({ pathname: '/detail', params: { idea: draft.id } });
    });
  if (!ready)
    return (
      <Page>
        <Skeleton className="h-44 rounded-2xl" />
      </Page>
    );
  if (!idea && !video && !savedLink)
    return (
      <Page>
        <Empty
          title="This item is missing or its YouTube metadata expired."
          action="Go to library"
          onPress={() => router.replace('/library')}
        />
      </Page>
    );
  return (
    <Page>
      {!router.canGoBack() && (
        <Link href={idea ? '/opportunities' : '/library'} style={styles.badge}>
          Back to {idea ? 'Opportunities' : 'My Library'}
        </Link>
      )}
      <Text style={styles.title}>
        {idea?.topic ||
          savedLink?.manualTitle ||
          video?.title ||
          savedLink?.topic ||
          'Saved YouTube link'}
      </Text>
      {video && (
        <>
          <MediaPreview uri={video.thumbnail} aspectRatio={16 / 9} onPress={() => void Linking.openURL('https://www.youtube.com/watch?v=' + video.id).catch(() => {})} alt={video.title} />
          <Txt>
            {video.channel} · {new Date(video.publishedAt).toLocaleDateString('en-US')}
          </Txt>
          <Text style={styles.badge}>YouTube · Original title and description</Text>
          <Txt>{video.description}</Txt>
        </>
      )}
      {!idea && (
        <Panel>
          <Heading>Research context</Heading>
          <Txt>
            Topic:{' '}
            {savedLink?.topic ||
              data.reports.find((r) => r.videos.some((v) => v.id === params.video))?.input.topic ||
              'Not associated with a topic'}
          </Txt>
          <Txt muted>{limitations}</Txt>
          <Action icon={Bookmark} busy={op.busy} onPress={saveVideoIdea}>
            Save Opportunity
          </Action>
          <Action icon={Sparkles} secondary busy={op.busy} onPress={saveVideoIdea}>
            Create idea for AI opinion
          </Action>
        </Panel>
      )}
      {idea && (
        <>
          {idea.imageUrl ? <MediaPreview uri={idea.imageUrl} aspectRatio={16 / 9} viewer alt={idea.topic} /> : null}
          <Panel>
            <Text style={styles.badge}>{idea.assessment}</Text>
            <Heading>Video concept</Heading>
            <Txt>{idea.concept || 'Add your own concept.'}</Txt>
            <Heading>Why investigate it?</Heading>
            <Txt>{reasoning(idea, related.length)}</Txt>
          </Panel>
          <Txt muted>
            {idea.region} · {idea.languages.map((l) => languages[l] || l).join(', ')}
          </Txt>
          <Panel>
            <Heading>Continue this research</Heading>
            <Txt muted>Each tool opens with this idea's topic. Results can be connected back here without creating a second copy of the idea.</Txt>
            <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: idea.topic, idea: idea.id } })}>YouTube research</Action>
            <Action secondary onPress={() => router.push({ pathname: '/trend-intelligence', params: { topic: idea.topic, idea: idea.id } })}>Explore a paginated YouTube sample</Action>
            <Action secondary onPress={() => router.push({ pathname: '/search-demand', params: { topic: idea.topic, idea: idea.id } })}>Compare public interest</Action>
            <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: idea.topic, idea: idea.id } })}>Prepare a deep research brief</Action>
          </Panel>
          {savedReferences.length > 0 && (
            <Fold title={`Saved video references (${savedReferences.length})`}>
              <Txt muted>These are personal YouTube links you chose to keep. API titles, thumbnails and statistics remain temporary and are not copied into your notes or backup.</Txt>
              {savedReferences.map((link) => (
                <Action key={link.id} secondary onPress={() => void Linking.openURL(link.url).catch(() => {})}>
                  {link.manualTitle.trim() || 'Open saved YouTube reference'}
                </Action>
              ))}
            </Fold>
          )}
          {researchNotes.length > 0 && (
            <Fold title={`Linked research notes (${researchNotes.length})`}>
              {researchNotes.map((note) => (
                <Action key={note.id} secondary onPress={() => router.push({ pathname: '/note', params: { id: note.id } })}>
                  {note.title}
                </Action>
              ))}
            </Fold>
          )}
          <Fold title="Observed evidence" open>
            {related.length ? (
              related.map((v) => <VideoRow key={v.id} video={v} topic={idea.topic} />)
            ) : (
              <Txt muted>No unexpired related examples. This idea remains a hypothesis.</Txt>
            )}
          </Fold>
          <Fold title="Limits & internal assessment">
            <Txt muted>{limitations}</Txt>
            <Txt muted>
              Assessment is an editorial suggestion, not a computed API metric. Strong, Promising
              and Highly Competitive labels can be assigned by you; automatic analysis stays
              cautious. No performance statistics are used.
            </Txt>
          </Fold>
          <Action
            icon={Bookmark}
            busy={op.busy}
            secondary={idea.status === 'Saved Opportunities'}
            onPress={() =>
              void op.run(() => useScout.getState().saveIdea(idea), 'Opportunity saved.')
            }
          >
            Save Opportunity
          </Action>
          <Action secondary onPress={() => setEditing(!editing)}>
            {editing ? 'Close editor' : 'Edit idea & personal decision'}
          </Action>
          {editing && (
            <Panel>
              <Field
                label="Topic / niche"
                value={idea.topic}
                onChange={(topic) => setEdit({ ...idea, topic })}
              />
              <Field
                label="Video concept"
                value={idea.concept}
                multiline
                onChange={(concept) => setEdit({ ...idea, concept })}
              />
              <Field
                label="Personal notes"
                value={idea.note}
                multiline
                onChange={(note) => setEdit({ ...idea, note })}
              />
              <Field
                label="Personal decision"
                value={idea.decision}
                multiline
                onChange={(decision) => setEdit({ ...idea, decision })}
              />
              <Choices
                label="Your assessment"
                options={
                  [
                    'Strong Opportunity',
                    'Promising',
                    'Worth Exploring',
                    'Uncertain',
                    'Highly Competitive',
                  ] as const
                }
                selected={[idea.assessment]}
                onChange={(v) => setEdit({ ...idea, assessment: v[0] })}
              />
              <Choices
                label="Collection"
                options={statuses}
                selected={[idea.status]}
                onChange={(v) => setEdit({ ...idea, status: v[0] })}
              />
              <Action
                busy={op.busy}
                onPress={() =>
                  void op.run(async () => {
                    await useScout.getState().commit((d) => ({
                      ...d,
                      ideas: d.ideas.map((i) => (i.id === idea.id ? idea : i)),
                    }));
                    setEditing(false);
                  }, 'Changes saved.')
                }
              >
                Save changes
              </Action>
            </Panel>
          )}
          <Heading>Second opinion</Heading>
          <Txt muted>
            Optional. Sends only your editorial topic, concept and personal decision to OpenRouter.
            No YouTube titles, descriptions, statistics or notes are sent.
          </Txt>
          {!consent ? (
            <>
              {!ideaReadyForOpinion && <Txt muted>AI Second Opinion is enabled after this idea has a real title and a non-empty video concept. Open Edit idea to complete both fields.</Txt>}
              <Action icon={Sparkles} secondary disabled={!ideaReadyForOpinion} onPress={() => setConsent(true)}>
                Request AI Second Opinion
              </Action>
            </>
          ) : (
            <Panel>
              <Heading>Share this idea with OpenRouter?</Heading>
              <Txt muted>
                You choose when to send. Replies are subjective and may disagree with the internal
                assessment. Free models have provider rate limits.
              </Txt>
              <Txt>Topic: {idea.topic}</Txt>
              <Txt>Concept: {idea.concept}</Txt>
              <Txt>Decision: {idea.decision || 'Not set'}</Txt>
              <Action busy={op.busy} disabled={!ideaReadyForOpinion} onPress={secondOpinion}>
                Send for second opinion
              </Action>
              <Action secondary disabled={op.busy} onPress={() => setConsent(false)}>
                Cancel
              </Action>
            </Panel>
          )}
          {data.opinions
            .filter((o) => o.ideaId === idea.id)
            .map((o) => (
              <Panel key={o.id}>
                <Heading>AI opinion · subjective</Heading>
                <Txt muted>{o.model}</Txt>
                <Txt>{o.text}</Txt>
                <Txt muted>Internal: {idea.assessment}</Txt>
                <Txt>Your decision: {idea.decision || 'Not set'}</Txt>
                <Action
                  secondary
                  onPress={() =>
                    void op.run(() =>
                      useScout.getState().commit((d) => ({
                        ...d,
                        opinions: d.opinions.filter((item) => item.id !== o.id),
                      })),
                    )
                  }
                >
                  Delete opinion
                </Action>
              </Panel>
            ))}
          <Action
            secondary
            onPress={() =>
              void op.run(() =>
                useScout.getState().commit((d) => ({
                  ...d,
                  ideas: d.ideas.map((i) =>
                    i.id === idea.id ? { ...i, archived: !i.archived } : i,
                  ),
                })),
              )
            }
          >
            {idea.archived ? 'Unarchive idea' : 'Archive idea'}
          </Action>
          <Action
            secondary
            onPress={() => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              void op.run(async () => {
                await useScout.getState().commit((d) => ({
                  ...d,
                  ideas: d.ideas.filter((i) => i.id !== idea.id),
                  opinions: d.opinions.filter((o) => o.ideaId !== idea.id),
                }));
                router.dismissTo('/opportunities');
              });
            }}
          >
            {confirm ? 'Confirm delete idea' : 'Delete idea'}
          </Action>
        </>
      )}
      {video && (
        <Action
          icon={Bookmark}
          busy={op.busy}
          disabled={Boolean(savedLink)}
          onPress={() => void op.run(() => useScout.getState().saveVideo(video, idea?.topic || ''))}
        >
          {savedLink ? 'Video saved' : 'Save Video'}
        </Action>
      )}
      <Action
        icon={NotebookPen}
        secondary
        onPress={() =>
          router.push({
            pathname: '/note',
            params: idea ? { idea: idea.id } : { video: params.video },
          })
        }
      >
        Add Note
      </Action>
      <Action
        icon={Copy}
        secondary
        onPress={() =>
          void op.run(async () => {
            await Clipboard.setStringAsync(
              idea?.topic || savedLink?.topic || video?.title || savedLink?.url || '',
            );
          }, 'Copied.')
        }
      >
        Copy Topic
      </Action>
      {(video || savedLink) && (
        <Action
          icon={ExternalLink}
          secondary
          onPress={() =>
            void op.run(async () => {
              await Linking.openURL(
                savedLink?.url || `https://www.youtube.com/watch?v=${video?.id}`,
              );
            })
          }
        >
          Open YouTube
        </Action>
      )}
      {!video && savedLink && (
        <Txt muted>Your personal link and notes are retained; API metadata is not available.</Txt>
      )}
      {Boolean(savedLink?.note) && <Txt>{savedLink?.note}</Txt>}
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={op.clear} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </Page>
  );
}
