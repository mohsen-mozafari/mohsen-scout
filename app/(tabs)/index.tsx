import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Button } from 'heroui-native';
import { router } from 'expo-router';
import {
  Page, Panel, Heading, Txt, Action, Fold, styles, ErrorBox, useOperation,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { uid, type Idea, languages } from '@/lib/types';
import {
  SPACE_NICHES,
  buildDiscoveryOpportunities,
  fetchSpaceNews,
  type DiscoveryOpportunity,
} from '@/lib/space';
import { MediaPreview } from '@/components/MediaPreview';
import { getKey } from '@/lib/vault';
import { getOpinion } from '@/lib/api';

export default function DiscoveryDashboard() {
  const ready = useScout((state) => state.ready);
  if (!ready) {
    return (
      <Page title="MOHSEN SCOUT">
        <Txt muted>Loading your local research workspace…</Txt>
      </Page>
    );
  }
  return <DiscoveryDashboardReady />;
}

function DiscoveryDashboardReady() {
  const preferences = useScout((state) => state.data.preferences);
  const ideas = useScout((state) => state.data.ideas);
  const [opportunities, setOpportunities] = useState<DiscoveryOpportunity[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);
  const [angles, setAngles] = useState<Record<string, string>>({});
  const op = useOperation();
  const niche = SPACE_NICHES.find((item) => item.id === preferences.selectedSpaceNiche) ?? SPACE_NICHES[0];

  const discover = () => void op.run(async () => {
    const result = await fetchSpaceNews(preferences.spaceNewsSources);
    const built = buildDiscoveryOpportunities(result.items, preferences.selectedSpaceNiche);
    setOpportunities(built);
    setWarnings(result.warnings);
    setLastScannedAt(Date.now());
    if (!result.items.length && result.warnings.length) throw new Error(result.warnings.join(' '));
  }, 'Discovery scan completed. This scan used official RSS feeds and did not consume YouTube quota.');

  const saveIdea = (opportunity: DiscoveryOpportunity) => void op.run(async () => {
    const existing = useScout.getState().data.ideas.some((idea) => idea.sourceUrl === opportunity.sourceUrl);
    if (existing) return;
    const idea: Idea = {
      id: uid(),
      topic: opportunity.topic,
      concept: opportunity.summary || 'Review the official source and develop an original explanatory angle.',
      note: '',
      status: 'Saved Opportunities',
      decision: '',
      videoIds: [],
      createdAt: Date.now(),
      archived: false,
      assessment: 'Worth Exploring',
      region: preferences.region,
      languages: preferences.languages,
      imageUrl: opportunity.imageUrl,
      sourceUrl: opportunity.sourceUrl,
      sourceName: opportunity.sourceName,
    };
    await useScout.getState().saveIdea(idea);
  }, 'Opportunity saved to Ideas.');

  const generateAngles = (opportunity: DiscoveryOpportunity) => void op.run(async () => {
    const key = await getKey('openrouter');
    if (!key) throw new Error('Add your OpenRouter key in Settings to generate AI video angles.');
    if (!preferences.model) throw new Error('Choose a free OpenRouter model in Settings first.');
    const prompt =
      'You are a careful science-video story editor. Use only the supplied source details as facts. Suggest three distinct video angles, three concise title options, and one opening hook. Clearly label editorial framing as a suggestion; do not invent scientific findings, measurements, dates, or claims. Preserve uncertainty and mention that the original publisher must be checked before scripting.\\n' +
      'Topic: ' + opportunity.topic.slice(0, 400) + '\\n' +
      'Publisher: ' + opportunity.sourceName + '\\n' +
      'RSS summary: ' + opportunity.summary.slice(0, 1400);
    const reply = await getOpinion(key, preferences.model, prompt);
    setAngles((current) => ({ ...current, [opportunity.id]: reply }));
  }, 'AI video angles generated.');

  const saved = (opportunity: DiscoveryOpportunity) => ideas.some((idea) => idea.sourceUrl === opportunity.sourceUrl);

  return (
    <Page title="MOHSEN SCOUT">
      <View style={{ gap: 7 }}>
        <Text style={[styles.title, { fontSize: 30, lineHeight: 36 }]}>Find your next story.</Text>
        <Txt muted>A source-led discovery desk for your next space video. Choose an opportunity, then decide what deserves deeper research.</Txt>
      </View>
      <Panel>
        <Text style={styles.badge}>ACTIVE NICHE</Text>
        <Heading>{niche.title}</Heading>
        <Txt muted>{niche.description}</Txt>
        <Txt muted>Research defaults are managed in Settings. Current region: {preferences.region} · Languages: {preferences.languages.map((code) => languages[code] ?? code).join(', ')}</Txt>
        <Action busy={op.busy} onPress={discover}>Discover Opportunities</Action>
        <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: niche.topic } })}>Search Manually</Action>
        <Action secondary onPress={() => router.push('/settings')}>Change discovery settings</Action>
        {lastScannedAt ? <Txt muted>Last scanned {new Date(lastScannedAt).toLocaleString()}</Txt> : <Txt muted>Run a scan when you are ready. Nothing polls in the background.</Txt>}
        <Txt muted>Initial discovery checks official RSS feeds only. YouTube quota is used only when you choose to check a topic.</Txt>
      </Panel>

      {warnings.map((warning) => <Txt muted key={warning}>{warning}</Txt>)}
      {lastScannedAt !== null && opportunities.length === 0 && (
        <Panel>
          <Heading>No matching opportunities found</Heading>
          <Txt muted>No current items from the selected official feeds matched {niche.title}. Try another niche in Settings or use manual search.</Txt>
          <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: niche.topic } })}>Search this niche manually</Action>
        </Panel>
      )}

      {opportunities.map((opportunity) => (
        <Panel key={opportunity.id}>
          {opportunity.imageUrl ? <MediaPreview uri={opportunity.imageUrl} aspectRatio={16 / 9} viewer alt={opportunity.topic} /> : null}
          <View style={{ gap: 7 }}>
            <Text style={styles.badge}>{opportunity.sourceName} · {opportunity.publishedAt ? new Date(opportunity.publishedAt).toLocaleDateString() : 'Date not supplied'}</Text>
            <Heading>{opportunity.topic}</Heading>
            {Boolean(opportunity.summary) && <Txt muted>{opportunity.summary}</Txt>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {opportunity.labels.map((label) => <Text key={label} style={styles.badge}>{label}</Text>)}
            </View>
            <Txt muted>{opportunity.reason}</Txt>
            <Txt muted>{opportunity.sourceCount} matching official feed source{opportunity.sourceCount === 1 ? '' : 's'} · No YouTube competition check yet</Txt>
          </View>
          <Action onPress={() => router.push({ pathname: '/trend-intelligence', params: { topic: opportunity.topic } })}>Check YouTube Competition</Action>
          <Action secondary onPress={() => router.push({ pathname: '/search-demand', params: { topic: opportunity.topic } })}>Compare Public Interest</Action>
          <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: opportunity.topic, niche: preferences.selectedSpaceNiche } })}>Deep Research</Action>
          <Action secondary disabled={saved(opportunity)} onPress={() => saveIdea(opportunity)}>{saved(opportunity) ? 'Saved to Ideas' : 'Save Idea'}</Action>
          <Action secondary onPress={() => generateAngles(opportunity)}>Generate Video Angles with AI</Action>
          <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(opportunity.sourceUrl).catch(() => {})}>
            <Button.Label>Open original source ↗</Button.Label>
          </Button>
          {angles[opportunity.id] ? (
            <Panel>
              <Heading>AI editorial suggestions</Heading>
              <Txt>{angles[opportunity.id]}</Txt>
              <Txt muted>Suggestions only. Verify all scientific facts against the original source before scripting.</Txt>
            </Panel>
          ) : null}
        </Panel>
      ))}

      <Fold title="More research tools">
        <Txt muted>Use these when you already know what you want to investigate.</Txt>
        <Action secondary onPress={() => router.push('/cosmic-news')}>Open Cosmic News</Action>
        <Action secondary onPress={() => router.push('/trend-intelligence')}>Trend Intelligence</Action>
        <Action secondary onPress={() => router.push('/search-demand')}>Compare public interest</Action>
        <Action secondary onPress={() => router.push('/deep-research')}>Start Deep Research manually</Action>
        <Action secondary onPress={() => router.push('/opportunities')}>Open saved Ideas</Action>
      </Fold>
      <Fold title="How opportunities are selected">
        <Txt muted>Recommendations come from title and summary matches in the selected official NASA, JPL and ESA feeds. Multiple Source Coverage means matching headlines appeared in more than one selected feed; it is not a formal independent fact-check. News coverage is not proof of audience demand. Check YouTube and public-interest evidence separately before prioritizing a topic.</Txt>
      </Fold>
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={discover} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </Page>
  );
}
