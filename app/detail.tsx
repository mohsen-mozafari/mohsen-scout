import { useState } from 'react';
import { Text, Linking, View } from 'react-native';
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
  SourceTitle,
  SourceText,
} from '@/components/ScoutUI';
import { VideoRow } from '@/components/VideoRow';
import { useScout } from '@/lib/store';
import { type Idea, statuses, languages, DEFAULT_SECOND_OPINION_ORDER } from '@/lib/types';
import { buildIdeaAnalysis, limitations } from '@/lib/engine';
import { getIdeaDisplayTitle } from '@/lib/idea-research';
import { getKey } from '@/lib/vault';
import { structuredSecondOpinionPrompt, formatStructuredSecondOpinion, getFreeModels, selectFreeModel } from '@/lib/api';
import { requestSecondOpinionWithFallback, DEFAULT_SECOND_OPINION_MODELS, type SecondOpinionProviderConfig } from '@/lib/ai-gateway';
import { uid } from '@/lib/types';
import { recordRuntimeFinish, recordRuntimeStart } from '@/lib/runtime-metrics';
import { MediaPreview } from '@/components/MediaPreview';
import { palette as p } from '@/lib/theme';
import { getEditorialPriorityBand } from '@/lib/editorial-priority';
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
  const uiLanguage = data.preferences.uiLanguage ?? 'fa';
  const ideaDisplayTopic = idea ? getIdeaDisplayTitle(idea, uiLanguage) : '';
  const hasMeaningfulIdeaTopic = Boolean(
    idea &&
    ((idea.topic.trim() && idea.topic.trim().toLowerCase() !== 'untitled idea') || idea.concept.trim()),
  );
  const ideaOpinionTopic = hasMeaningfulIdeaTopic ? ideaDisplayTopic : '';
  const ideaReadyForOpinion = Boolean(ideaOpinionTopic.trim() && idea?.concept.trim());
  const related = idea ? data.videos.filter((v) => idea.videoIds.includes(v.id)) : [];
  const analysisSections = idea
    ? buildIdeaAnalysis({ ...idea, topic: ideaDisplayTopic }, [], uiLanguage)
    : [];
  const savedReferences = idea ? data.links.filter((link) => idea.videoIds.includes(link.id)) : [];
  const researchNotes = idea ? data.notes.filter((note) => note.ideaId === idea.id) : [];
  const secondOpinion = () =>
    void op.run(async () => {
      if (!idea) return;
      if (!ideaReadyForOpinion) throw new Error('Add a meaningful topic and non-empty video concept before requesting an AI opinion.');
      recordRuntimeStart('AI');
      try {
        const order = data.preferences.secondOpinionOrder?.length
          ? data.preferences.secondOpinionOrder
          : DEFAULT_SECOND_OPINION_ORDER;
        const configuredModels = data.preferences.secondOpinionModels ?? DEFAULT_SECOND_OPINION_MODELS;
        const configs: SecondOpinionProviderConfig[] = [];
        for (const provider of new Set(order)) {
          try {
            const key = await getKey(provider);
            const accountId = provider === 'cloudflare'
              ? await getKey('cloudflare-account-id') ?? undefined
              : undefined;
            let models = [configuredModels[provider] ?? DEFAULT_SECOND_OPINION_MODELS[provider]];
            if (provider === 'openrouter') {
              const liveFreeModels = await getFreeModels();
              const preferred = selectFreeModel(liveFreeModels, models[0]);
              models = liveFreeModels.map((item) => item.id).filter((id) => id !== preferred);
              if (preferred) models.unshift(preferred);
              models = models.filter(Boolean).slice(0, 5);
            }
            for (const model of [...new Set(models.map((item) => item.trim()).filter(Boolean))]) {
              configs.push({ provider, key: key ?? '', model, ...(accountId ? { accountId } : {}) });
            }
          } catch {
            continue;
          }
        }
        const decisionContext = idea.decision.trim()
          ? '\\nUser decision context: ' + idea.decision.trim().slice(0, 600)
          : '';
        const prompt = structuredSecondOpinionPrompt(
          ideaOpinionTopic,
          idea.concept + decisionContext,
          uiLanguage,
        );
        const result = await requestSecondOpinionWithFallback(configs, prompt);
        const formatted = formatStructuredSecondOpinion(result.opinion, uiLanguage);
        await useScout.getState().commit((d) => ({
          ...d,
          opinions: [
            { id: uid(), ideaId: idea.id, text: formatted, model: result.provider + ' / ' + result.model, createdAt: Date.now() },
            ...d.opinions,
          ],
        }));
        recordRuntimeFinish('AI', 'success');
        setConsent(false);
      } catch (error) {
        recordRuntimeFinish('AI', 'error', error instanceof Error ? error.message : String(error));
        throw error;
      }
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
      <Page title="Research details" eyebrow="PERSONAL RESEARCH" showBack>
        <Skeleton className="h-44 rounded-2xl" />
      </Page>
    );
  if (!idea && !video && !savedLink)
    return (
      <Page title="Research details" eyebrow="PERSONAL RESEARCH" showBack>
        <Empty
          title="This item is missing or its YouTube metadata expired."
          action="Go to library"
          onPress={() => router.replace('/library')}
        />
      </Page>
    );
  return (
    <Page
      title={idea ? "Idea workspace" : "Saved video reference"}
      eyebrow="RESEARCH DETAIL"
      subtitle={idea ? "Review the concept, local evidence, linked references and optional second opinion." : "Open the saved source, see its research context and connect it to a personal idea."}
      showBack
    >
      {!router.canGoBack() && (
        <Link href={idea ? '/opportunities' : '/library'} style={styles.badge}>
          Back to {idea ? 'Opportunities' : 'My Library'}
        </Link>
      )}
      <SourceTitle>
        {idea
          ? getIdeaDisplayTitle(idea, data.preferences.uiLanguage ?? 'fa')
          : savedLink?.manualTitle || video?.title || savedLink?.topic || (data.preferences.uiLanguage === 'fa' ? 'پیوند ذخیره‌شده یوتیوب' : 'Saved YouTube link')}
      </SourceTitle>
      {idea ? (
        <Panel>
          {idea.engineScoreBasis === 'publisher-web-only-v2' && typeof idea.engineScore === 'number' && Number.isFinite(idea.engineScore) ? (() => {
            const band = getEditorialPriorityBand(idea.engineScore);
            const tint = band === 'strong' ? p.success : band === 'moderate' ? p.cyan : p.danger;
            const fa = uiLanguage === 'fa';
            return (
              <View style={{ gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ color: tint, fontSize: 12, fontWeight: '800' }}>
                    {(band === 'strong' ? (fa ? 'قوی' : 'STRONG') : band === 'moderate' ? (fa ? 'متوسط' : 'MEDIUM') : (fa ? 'ضعیف' : 'WEAK'))}
                  </Text>
                  <Text style={{ color: tint, fontSize: 17, fontWeight: '800' }}>{idea.engineScore}/100</Text>
                </View>
                <Txt muted>{idea.engineScoreReason?.split(';').slice(0, 2).join(' • ') || (fa ? 'دلیل تفصیلی در دادهٔ این ایده ثبت نشده است.' : 'A detailed rationale is not stored for this idea.')}</Txt>
              </View>
            );
          })() : (
            <Txt muted>{idea.engineScore !== undefined && idea.engineScoreBasis !== 'publisher-web-only-v2'
              ? (uiLanguage === 'fa' ? 'امتیاز نسخه قدیمی نمایش داده نمی‌شود؛ رتبه‌بندی فعلی فقط از شواهد مستقل وب و ناشران استفاده می‌کند.' : 'A legacy score from an older engine version is hidden; current ranking uses independent web/publisher evidence only.')
              : (uiLanguage === 'fa' ? 'این ایده هنوز امتیاز تحریری مستقل ندارد؛ امتیاز یا برچسبی به‌صورت حدسی ساخته نمی‌شود.' : 'This idea has no independent evidence-based editorial score yet. No score or label is fabricated.')}</Txt>
          )}
        </Panel>
      ) : null}
      {video && (
        <>
          <MediaPreview uri={video.thumbnail} aspectRatio={16 / 9} onPress={() => void Linking.openURL('https://www.youtube.com/watch?v=' + video.id).catch(() => {})} alt={video.title} />
          <SourceText>
            {video.channel} · {new Date(video.publishedAt).toLocaleDateString('en-US')}
          </SourceText>
          <Text style={styles.badge}>YouTube · Original title and description</Text>
          <SourceText>{video.description}</SourceText>
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
            <SourceText>{idea.concept || 'Add your own concept.'}</SourceText>
            <Heading>Why investigate it?</Heading>
            <Txt>{data.preferences.uiLanguage === 'fa'
              ? 'امتیاز و اولویت این ایده فقط از خبرهای ناشران، جست‌وجوی وب و زمینه دانشنامه‌ای ساخته شده است. نمونه YouTube در بخش جداگانه دیده می‌شود و در امتیاز یا نقد هوش مصنوعی نقشی ندارد.'
              : 'This idea’s editorial priority uses publisher news, independent web search and encyclopedia context only. The YouTube sample is displayed separately and does not affect the score or AI critique.'}</Txt>
          </Panel>
          <Panel>
            <Heading>{data.preferences.uiLanguage === 'fa' ? 'تحلیل تحریری موتور داخلی' : 'Internal editorial analysis'}</Heading>
            <Txt muted>{data.preferences.uiLanguage === 'fa'
              ? 'این بخش تحلیل تحریری محلی را از نقد خودکار مدل خارجی جدا می‌کند. داده‌های خام YouTube در تحلیل محلی این ایده ادغام نمی‌شوند.'
              : 'This section separates the local editorial checklist from the automatic external-model critique. Raw YouTube API data is not merged into this idea analysis.'}</Txt>
            {analysisSections.map((section) => (
              <View key={section.id} style={{ gap: 6 }}>
                <Heading>{section.title}</Heading>
                <SourceText>{section.body}</SourceText>
                {section.items?.map((item) => <SourceText muted key={item}>{'• ' + item}</SourceText>)}
              </View>
            ))}
          </Panel>
          <Txt muted>
            {idea.region} · {idea.languages.map((l) => languages[l] || l).join(', ')}
          </Txt>
          {idea.sourceUrl ? (
            <Action secondary onPress={() => void Linking.openURL(idea.sourceUrl!).catch(() => {})}>
              {'Open original source · ' + (idea.sourceName || 'Publisher')}
            </Action>
          ) : null}
          {idea.evidenceSources?.length ? (
            <Fold title={uiLanguage === 'fa' ? 'منابع تحقیق' : 'Research sources'} summary={idea.evidenceSources.length + ' independent source(s)'}>
              <Txt muted>{uiLanguage === 'fa'
                ? 'این منابع مستقل پشتوانه ایده و امتیاز تحریری هستند. هر پیوند را پیش از ضبط باز و ادعای اصلی را در منبع اولیه بررسی کن.'
                : 'These independent sources support the idea and its editorial priority. Open each link and verify key claims against the original source before recording.'}</Txt>
              {idea.evidenceSources.map((source) => (
                <View key={source.sourceUrl} style={{ gap: 4 }}>
                  <Text style={styles.badge}>{source.sourceName} · {source.sourceType}</Text>
                  <SourceText>{source.title}</SourceText>
                  {source.summary ? <Txt muted>{source.summary}</Txt> : null}
                  <Action secondary onPress={() => void Linking.openURL(source.sourceUrl).catch(() => {})}>Open source ↗</Action>
                </View>
              ))}
            </Fold>
          ) : null}
          <Panel>
            <Heading>Continue this research</Heading>
            <Txt muted>Each tool opens with this idea&apos;s topic. Results can be connected back here without creating a second copy of the idea.</Txt>
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
          <Fold title="Observed evidence">
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
                    await useScout.getState().updateIdea(idea);
                    setEditing(false);
                  }, 'Changes saved. If distinct retained evidence exists, the next idea is generated locally.')
                }
              >
                Save changes
              </Action>
            </Panel>
          )}
          <Heading>Second opinion</Heading>
          <Txt muted>
            Optional. Sends only your editorial topic, concept and personal decision to the configured AI provider priority chain.
            No YouTube titles, descriptions, statistics or notes are sent.
          </Txt>
          {!consent ? (
            <>
              {!ideaReadyForOpinion && <Txt muted>AI Second Opinion is enabled when a meaningful title and non-empty concept are available. Older drafts with a saved concept can use a derived title; edit the idea to choose your own.</Txt>}
              <Action icon={Sparkles} secondary disabled={!ideaReadyForOpinion} onPress={() => setConsent(true)}>
                Request AI Second Opinion
              </Action>
            </>
          ) : (
            <Panel>
              <Heading>Share this idea with your configured AI providers?</Heading>
              <Txt muted>
                You choose when to send. Replies are subjective and may disagree with the internal
                assessment. The app tries configured providers in priority order when a provider fails.
              </Txt>
              <Txt>Topic: {ideaOpinionTopic}</Txt>
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
      {Boolean(op.error) && <ErrorBox message={op.error} onDismiss={op.clear} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </Page>
  );
}
