import { useEffect, useState } from 'react';
import { Linking, View, Text } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import {
  Page, Panel, Heading, Txt, Choices, Action, Fold, styles, ErrorBox, useOperation,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import {
  SPACE_NICHES, SPACE_NEWS_SOURCES, DEFAULT_SPACE_NEWS_SOURCES,
  fetchSpaceNews, newsForNiche,
  type SpaceNewsSourceId, type WikiLanguage,
} from '@/lib/space';

export default function SpaceRadar() {
  const preferences = useScout((state) => state.data.preferences);
  const ready = useScout((state) => state.ready);
  const [selectedId, setSelectedId] = useState(preferences.selectedSpaceNiche || 'exoplanets');
  const [sources, setSources] = useState<SpaceNewsSourceId[]>(preferences.spaceNewsSources ?? DEFAULT_SPACE_NEWS_SOURCES);
  const [language, setLanguage] = useState<WikiLanguage>(preferences.spaceInterestLanguage ?? 'en');
  const [news, setNews] = useState<Awaited<ReturnType<typeof fetchSpaceNews>>>();
  const op = useOperation();
  const selected = SPACE_NICHES.find((niche) => niche.id === selectedId) ?? SPACE_NICHES[0];

  useEffect(() => {
    setSelectedId(preferences.selectedSpaceNiche || 'exoplanets');
    setSources(preferences.spaceNewsSources ?? DEFAULT_SPACE_NEWS_SOURCES);
    setLanguage(preferences.spaceInterestLanguage ?? 'en');
  }, [preferences.selectedSpaceNiche, preferences.spaceNewsSources, preferences.spaceInterestLanguage]);

  const saveSettings = () => void op.run(async () => {
    if (!ready) throw new Error('Local settings are still loading.');
    await useScout.getState().commit((data) => ({
      ...data,
      preferences: {
        ...data.preferences,
        selectedSpaceNiche: selectedId,
        spaceNewsSources: sources,
        spaceInterestLanguage: language,
      },
    }));
  }, 'Space preferences saved on this device.');

  const scan = () => void op.run(async () => {
    const result = await fetchSpaceNews(sources);
    setNews(result);
    if (!result.items.length && result.warnings.length) throw new Error(result.warnings.join(' '));
  }, 'Official space feeds refreshed.');

  const matched = news ? newsForNiche(news.items, selectedId) : [];
  const nicheCoverage = news ? SPACE_NICHES.map((niche) => ({
    ...niche,
    items: newsForNiche(news.items, niche.id),
  })).sort((a, b) => b.items.length - a.items.length) : [];
  const navigate = (path: '/cosmic-news' | '/trend-intelligence' | '/search-demand' | '/deep-research') =>
    router.push({ pathname: path, params: { niche: selectedId, topic: selected.topic } });

  return (
    <Page title="SPACE RADAR">
      <View style={{ gap: 8 }}>
        <Text style={[styles.title, { fontSize: 34, lineHeight: 40 }]}>Find the next space story.</Text>
        <Txt muted>One research desk for space niches, primary-source news, YouTube competition and public-interest signals.</Txt>
      </View>
      <Panel>
        <Heading>Choose a niche</Heading>
        <Choices
          options={SPACE_NICHES.map((niche) => niche.title)}
          selected={[selected.title]}
          onChange={(values) => {
            const next = SPACE_NICHES.find((niche) => niche.title === values[0]);
            if (next) setSelectedId(next.id);
          }}
        />
        <View style={{ gap: 6 }}>
          <Text style={styles.heading}>{selected.title}</Text>
          <Txt muted>{selected.description}</Txt>
          <Text style={styles.badge}>Starting query: {selected.topic}</Text>
        </View>
        <Action disabled={!ready || op.busy} onPress={saveSettings} busy={op.busy}>Save niche & source settings</Action>
      </Panel>

      <Panel>
        <Heading>Official news providers</Heading>
        <Txt muted>Choose which public RSS feeds are included in scans. No API key or account is required.</Txt>
        <Choices
          options={SPACE_NEWS_SOURCES.map((source) => source.label)}
          selected={sources.map((id) => SPACE_NEWS_SOURCES.find((source) => source.id === id)?.label ?? id)}
          multiple
          onChange={(labels) => setSources(SPACE_NEWS_SOURCES.filter((source) => labels.includes(source.label)).map((source) => source.id))}
        />
        <Heading>Public-interest language</Heading>
        <Choices
          options={['en', 'fa', 'de', 'fr', 'es', 'ja']}
          selected={[language]}
          onChange={(values) => setLanguage(values[0] as WikiLanguage)}
        />
        <Txt muted>Wikipedia language projects are not country-level audience data. This setting changes the language edition used for pageview comparisons.</Txt>
        <Action secondary busy={op.busy} onPress={scan}>Scan official news now</Action>
        {Boolean(news) && (
          <View style={{ gap: 6 }}>
            <Text style={styles.badge}>{news?.items.length ?? 0} source items · {matched.length} matched to {selected.title}</Text>
            {news?.warnings.map((warning) => <Txt muted key={warning}>{warning}</Txt>)}
          </View>
        )}
        {news && (
          <View style={{ gap: 10 }}>
            <Heading>News coverage by niche</Heading>
            <Txt muted>Ranked by matching items in the selected publisher feeds. This is source coverage, not audience demand or a trend score.</Txt>
            {nicheCoverage.map((niche) => (
              <Button key={niche.id} variant={selectedId === niche.id ? 'secondary' : 'tertiary'} className="h-auto justify-start px-0" onPress={() => setSelectedId(niche.id)}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Button.Label>{niche.title}</Button.Label>
                  <Text style={styles.badge}>{niche.items.length} matching source items</Text>
                  {Boolean(niche.items[0]) && <Txt muted>{niche.items[0].title}</Txt>}
                </View>
              </Button>
            ))}
          </View>
        )}
        {news?.items.slice(0, 3).map((item) => (
          <Button key={item.id} variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(item.url).catch(() => {})}>
            <View style={{ flex: 1, gap: 4 }}>
              <Button.Label numberOfLines={2}>{item.title}</Button.Label>
              <Text style={styles.badge}>{item.sourceName} · {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : 'Date not supplied'}</Text>
            </View>
          </Button>
        ))}
      </Panel>

      <Panel>
        <Heading>Research this niche</Heading>
        <Txt muted>Run each evidence stream on demand. Space Radar does not poll in the background or rank topics with a fabricated market score.</Txt>
        <Action onPress={() => navigate('/cosmic-news')}>Open Cosmic News</Action>
        <Action secondary onPress={() => navigate('/trend-intelligence')}>Check YouTube competition</Action>
        <Action secondary onPress={() => navigate('/search-demand')}>Compare public interest</Action>
        <Action secondary onPress={() => navigate('/deep-research')}>Build a source-backed research brief</Action>
        <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => router.push({ pathname: '/youtube', params: { topic: selected.topic } })}>
          <Button.Label>Open the original general YouTube research workspace →</Button.Label>
        </Button>
        <Txt muted>The original Discover workflow, ideas, library, notes, API keys, budget controls and scheduler remain available.</Txt>
      </Panel>
      <Fold title="How opportunity signals are interpreted">
        <Txt muted>Fresh NASA/JPL/ESA reporting indicates a new source-led story angle, not proven audience demand. YouTube view counts belong to individual sampled videos and are not hourly growth. Wikimedia pageviews indicate attention to an encyclopedia article, not Google searches or YouTube views. The evidence streams are displayed separately so their limitations remain visible.</Txt>
      </Fold>
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={scan} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </Page>
  );
}
