import { useEffect, useState } from 'react';
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
  buildNicheSuggestions,
  fetchSpaceNews,
  type DiscoveryOpportunity,
  type SpaceNicheSuggestion,
} from '@/lib/space';
import { MediaPreview } from '@/components/MediaPreview';
import { buildInternalResearch, type InternalResearchResult } from '@/lib/engine';

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
  const [analyses, setAnalyses] = useState<Record<string, InternalResearchResult>>({});
  const [nicheSuggestions, setNicheSuggestions] = useState<SpaceNicheSuggestion[]>([]);
  const [radarBrief, setRadarBrief] = useState<InternalResearchResult>();
  const [autoScanning, setAutoScanning] = useState(false);
  const op = useOperation();
  const niche = SPACE_NICHES.find((item) => item.id === preferences.selectedSpaceNiche);
  const nicheTitle = preferences.selectedSpaceNiche === 'all'
    ? 'All space topics'
    : preferences.selectedSpaceNiche === 'custom'
      ? (preferences.customSpaceNiche.trim() || 'Custom niche')
      : niche?.title ?? 'All space topics';
  const discoveryTopic = preferences.selectedSpaceNiche === 'all'
    ? 'Space science and exploration'
    : preferences.selectedSpaceNiche === 'custom'
      ? preferences.customSpaceNiche
      : niche?.topic ?? 'Space science and exploration';
  const applyScan = (result: Awaited<ReturnType<typeof fetchSpaceNews>>) => {
    setOpportunities(buildDiscoveryOpportunities(result.items, preferences.selectedSpaceNiche, Date.now(), preferences.customSpaceNiche));
    setWarnings(result.warnings);
    setLastScannedAt(Date.now());
    setNicheSuggestions(buildNicheSuggestions(result.items, 6));
    setRadarBrief(result.items.length ? buildInternalResearch({
      topic: discoveryTopic,
      news: result.items.slice(0, 12).map((item) => ({
        title: item.title, summary: item.summary, sourceName: item.sourceName,
        sourceUrl: item.url, publishedAt: item.publishedAt, sourceId: item.sourceId,
      })),
    }) : undefined);
  };
  useEffect(() => {
    let active = true;
    setAutoScanning(true);
    void fetchSpaceNews(preferences.spaceNewsSources).then((result) => {
      if (!active) return;
      setOpportunities(buildDiscoveryOpportunities(result.items, preferences.selectedSpaceNiche, Date.now(), preferences.customSpaceNiche));
      setWarnings(result.warnings);
      setLastScannedAt(Date.now());
      setNicheSuggestions(buildNicheSuggestions(result.items, 6));
      setRadarBrief(result.items.length ? buildInternalResearch({
        topic: discoveryTopic,
        news: result.items.slice(0, 12).map((item) => ({
          title: item.title, summary: item.summary, sourceName: item.sourceName,
          sourceUrl: item.url, publishedAt: item.publishedAt, sourceId: item.sourceId,
        })),
      }) : undefined);
    }).catch(() => {
      if (active) setWarnings(['Official news feeds could not be reached. Check the network and retry.']);
    }).finally(() => {
      if (active) setAutoScanning(false);
    });
    return () => { active = false; };
  }, [preferences.spaceNewsSources, preferences.selectedSpaceNiche, preferences.customSpaceNiche]);
  const discover = () => void op.run(async () => {
    const result = await fetchSpaceNews(preferences.spaceNewsSources, fetch, true);
    applyScan(result);
    if (!result.items.length && result.warnings.length) throw new Error(result.warnings.join(' '));
  }, 'Discovery scan completed from selected official feeds without spending YouTube quota.');

  const saveIdea = (opportunity: DiscoveryOpportunity) => void op.run(async () => {
    const existing = useScout.getState().data.ideas.some((idea) => idea.topic === opportunity.topic && idea.sourceUrl === opportunity.sourceUrl);
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

  const runInternalEngine = (opportunity: DiscoveryOpportunity) => {
    const result = buildInternalResearch({
      topic: opportunity.topic,
      news: [{
        title: opportunity.topic,
        summary: opportunity.summary,
        sourceName: opportunity.sourceName,
        sourceUrl: opportunity.sourceUrl,
        publishedAt: opportunity.publishedAt,
        sourceCount: opportunity.sourceCount,
      }],
    });
    setAnalyses((current) => ({ ...current, [opportunity.id]: result }));
  };

  const saveAngle = (opportunity: DiscoveryOpportunity, angle: InternalResearchResult['angles'][number]) =>
    void op.run(async () => {
      const topic = opportunity.topic + ' · ' + angle.title;
      const exists = useScout.getState().data.ideas.some((idea) => idea.topic === topic && idea.sourceUrl === opportunity.sourceUrl);
      if (exists) return;
      const idea: Idea = {
        id: uid(),
        topic,
        concept: angle.hook + '\n\n' + angle.approach,
        note: 'Generated by the local Internal Research Engine. This is an editorial hypothesis; verify every scientific claim against the original source.\n\nSource: ' + opportunity.sourceUrl,
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
    }, 'Engine angle saved to Ideas.');

  const saved = (opportunity: DiscoveryOpportunity) => ideas.some((idea) => idea.topic === opportunity.topic && idea.sourceUrl === opportunity.sourceUrl);

  return (
    <Page title="MOHSEN SCOUT">
      <View style={{ gap: 7 }}>
        <Text style={[styles.title, { fontSize: 30, lineHeight: 36 }]}>Find your next story.</Text>
        <Txt muted>A source-led discovery desk for your next space video. Choose an opportunity, then decide what deserves deeper research.</Txt>
      </View>
      <Panel>
        <Text style={styles.badge}>ACTIVE NICHE</Text>
        <Heading>{nicheTitle}</Heading>
        <Txt muted>{niche?.description ?? 'The app checks all selected NASA, JPL and ESA feeds, then groups their current reports into research topics.'}</Txt>
        <Txt muted>Research defaults are managed in Settings. Current region: {preferences.region} · Languages: {preferences.languages.map((code) => languages[code] ?? code).join(', ')}</Txt>
        <Action busy={op.busy || autoScanning} onPress={discover}>Refresh Space Radar</Action>
        <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: niche.topic } })}>Search Manually</Action>
        <Action secondary onPress={() => router.push('/settings')}>Change discovery settings</Action>
        {lastScannedAt ? <Txt muted>Last scanned {new Date(lastScannedAt).toLocaleString()}</Txt> : <Txt muted>Checking official feeds when Space Radar opens…</Txt>}
        <Txt muted>News and niche suggestions refresh on entry using a short in-memory cache. No background polling or YouTube quota is used. The local Story Engine analyzes loaded reports without sending them to AI.</Txt>
      </Panel>

      {warnings.map((warning) => <Txt muted key={warning}>{warning}</Txt>)}

      {nicheSuggestions.length > 0 && (
        <Panel>
          <Heading>Active topics in official feeds</Heading>
          <Txt muted>These are topics with the most matching stories in the selected publisher feeds—not audience-demand or YouTube trend rankings.</Txt>
          {nicheSuggestions.map((suggestion) => (
            <View key={suggestion.id} style={{ gap: 5 }}>
              <Text style={styles.badge}>{suggestion.id.startsWith('story:') ? 'FRESH OFFICIAL STORY' : 'ACTIVE FEED NICHE'}</Text>
              <Heading>{suggestion.title}</Heading>
              <Txt muted>{suggestion.description}</Txt>
              <Txt muted>{suggestion.matchedStories} matching publisher stories{suggestion.newestAt ? ' · latest ' + new Date(suggestion.newestAt).toLocaleDateString() : ''}</Txt>
              <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: suggestion.topic } })}>Research {suggestion.title}</Action>
            </View>
          ))}
        </Panel>
      )}

      {radarBrief && (
        <Panel>
          <Text style={styles.badge}>LOCAL INTERNAL STORY ENGINE</Text>
          <Heading>What the current evidence can support</Heading>
          <Txt muted>{radarBrief.summary}</Txt>
          {radarBrief.evidence.map((item) => (
            <View key={item.id} style={{ gap: 3 }}>
              <Text style={styles.badge}>{item.label}</Text>
              <Txt muted>{item.detail}</Txt>
            </View>
          ))}
          <Fold title="Editorial angles generated from current sources">
            {radarBrief.angles.map((angle) => (
              <View key={angle.id} style={{ gap: 5 }}>
                <Heading>{angle.title}</Heading>
                <Txt>{angle.hook}</Txt>
                <Txt muted>{angle.approach}</Txt>
                <Txt muted>Verify: {angle.verification}</Txt>
                <Action secondary onPress={() => router.push({ pathname: '/deep-research', params: { topic: discoveryTopic } })}>Deep Research this angle</Action>
              </View>
            ))}
            {radarBrief.limitations.map((item) => <Txt muted key={item}>{item}</Txt>)}
          </Fold>
        </Panel>
      )}
      {lastScannedAt !== null && opportunities.length === 0 && (
        <Panel>
          <Heading>No matching opportunities found</Heading>
          <Txt muted>{warnings.length && !nicheSuggestions.length
            ? 'The official feeds did not return readable items. Review the source-specific warnings and retry.'
            : 'Current source items did not match ' + nicheTitle + '. Other space topics remain available above.'}</Txt>
          <Action secondary onPress={() => void op.run(async () => {
            await useScout.getState().commit((data) => ({ ...data, preferences: { ...data.preferences, selectedSpaceNiche: 'all' } }));
          }, 'Discovery scope changed to all space topics.')}>Show all space topics</Action>
          <Action secondary onPress={() => router.push({ pathname: '/youtube', params: { topic: discoveryTopic } })}>Search this niche manually</Action>
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
          <Action secondary onPress={() => runInternalEngine(opportunity)}>Run Internal Story Engine</Action>
          <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(opportunity.sourceUrl).catch(() => {})}>
            <Button.Label>Open original source ↗</Button.Label>
          </Button>
          {analyses[opportunity.id] ? (
            <Panel>
              <Heading>Internal Story Engine</Heading>
              <Txt muted>{analyses[opportunity.id].summary}</Txt>
              {analyses[opportunity.id].evidence.map((item) => (
                <View key={item.id} style={{ gap: 3 }}>
                  <Text style={styles.badge}>{item.label}</Text>
                  <Txt muted>{item.detail}</Txt>
                </View>
              ))}
              {analyses[opportunity.id].angles.map((angle) => (
                <View key={angle.id} style={{ gap: 5 }}>
                  <Heading>{angle.title}</Heading>
                  <Txt>{angle.hook}</Txt>
                  <Txt muted>{angle.approach}</Txt>
                  <Txt muted>Verify: {angle.verification}</Txt>
                  <Action
                    secondary
                    disabled={ideas.some((idea) => idea.topic === opportunity.topic + ' · ' + angle.title && idea.sourceUrl === opportunity.sourceUrl)}
                    onPress={() => saveAngle(opportunity, angle)}
                  >
                    Save this angle to Ideas
                  </Action>
                </View>
              ))}
              <Fold title="Verification questions & limitations">
                {analyses[opportunity.id].verificationQuestions.map((question) => <Txt muted key={question}>{question}</Txt>)}
                {analyses[opportunity.id].limitations.map((limitation) => <Txt muted key={limitation}>{limitation}</Txt>)}
              </Fold>
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
