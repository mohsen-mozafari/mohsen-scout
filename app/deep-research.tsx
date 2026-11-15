import { useState } from 'react';
import { Linking, View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Panel, Heading, Txt, Field, Action, styles, ErrorBox, useOperation } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { uid } from '@/lib/types';
import { getKey } from '@/lib/vault';
import { searchYouTubeSample, type YouTubeSampleVideo } from '@/lib/api';
import {
  SPACE_NICHES, fetchSpaceNews, newsForNiche, getWikipediaSignal, buildResearchOutline,
  type SpaceNewsItem, type WikiSignal,
} from '@/lib/space';

type Brief = {
  topic: string;
  createdAt: number;
  news: SpaceNewsItem[];
  wiki?: WikiSignal;
  videos: YouTubeSampleVideo[];
  warnings: string[];
  titleIdeas: string[];
  outline: string[];
  verificationQuestions: string[];
  scriptDraft: string[];
};

export default function DeepResearch() {
  const params = useLocalSearchParams<{ topic?: string; niche?: string }>();
  const preferences = useScout((state) => state.data.preferences);
  const [topic, setTopic] = useState(typeof params.topic === 'string' ? params.topic : '');
  const [brief, setBrief] = useState<Brief>();
  const op = useOperation();
  const nicheId = typeof params.niche === 'string' ? params.niche : preferences.selectedSpaceNiche;
  const niche = SPACE_NICHES.find((item) => item.id === nicheId);
  const run = () => void op.run(async () => {
    const query = topic.trim();
    if (!query) throw new Error('Choose a topic before starting deep research.');
    const warnings: string[] = [];
    const newsResult = await fetchSpaceNews(preferences.spaceNewsSources);
    warnings.push(...newsResult.warnings);
    const nicheNews = niche ? newsForNiche(newsResult.items, nicheId) : newsResult.items;
    const topicWords = query.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
    const topicNews = nicheNews.filter((item) => topicWords.some((word) => (item.title + ' ' + item.summary).toLowerCase().includes(word)));
    const selectedNews = topicNews.slice(0, 6);
    let wiki: WikiSignal | undefined;
    try {
      wiki = await getWikipediaSignal(query, preferences.spaceInterestLanguage ?? 'en');
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Public-interest data was unavailable.');
    }
    let videos: YouTubeSampleVideo[] = [];
    try {
      const key = await getKey('youtube');
      if (key) {
        const sample = await searchYouTubeSample(query, {
          key,
          charge: useScout.getState().charge,
          onQuota: () => useScout.getState().commit((data) => ({ ...data, budget: { ...data.budget, exhausted: true } })),
        }, 8);
        videos = sample.videos;
        if (sample.warning) warnings.push(sample.warning);
      } else {
        warnings.push('YouTube view sample skipped: add a YouTube API key in Settings to include it.');
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'YouTube sample was unavailable.');
    }
    if (!selectedNews.length && !wiki && !videos.length) {
      throw new Error('No selected source returned evidence. Check connectivity or enable an official feed, then retry.');
    }
    const outline = buildResearchOutline(query, selectedNews.map((item) => item.title));
    setBrief({
      topic: query,
      createdAt: Date.now(),
      news: selectedNews,
      wiki,
      videos,
      warnings,
      ...outline,
      scriptDraft: [
        'HOOK — Open with the central question: ' + outline.titleIdeas[0],
        'CONTEXT — Explain the mission, telescope or physical process before presenting the new result.',
        ...(selectedNews.length ? ['SOURCE-LED EVIDENCE — Introduce the reported observation using the exact publisher, date and link shown above. Do not add figures or claims absent from that source.'] : ['EVIDENCE — Insert the strongest verified primary-source finding after checking the linked paper or mission release.']),
        'EXPLANATION — Translate the scientific mechanism into plain language and define unfamiliar terms.',
        'LIMITS — State what the observation does not prove and which interpretations remain provisional.',
        'PAYOFF — Explain why the result matters in the wider story of space science.',
        'CLOSING — Return to the opening question and tell viewers what upcoming observation or mission could resolve it.',
      ],
    });
  }, 'Source-backed research brief prepared.');
  const saveToNotes = () => void op.run(async () => {
    if (!brief) throw new Error('Generate a research brief first.');
    const blocks = [
      { id: uid(), type: 'heading' as const, text: 'Source findings' },
      ...(brief.wiki ? [{ id: uid(), type: 'paragraph' as const, text: brief.wiki.articleTitle + ': ' + brief.wiki.summary + '\nArticle: ' + brief.wiki.articleUrl }] : []),
      ...brief.news.map((item) => ({ id: uid(), type: 'link' as const, text: item.sourceName + ': ' + item.title + '\n' + item.summary + '\n' + item.url })),
      { id: uid(), type: 'heading' as const, text: 'Suggested video titles' },
      ...brief.titleIdeas.map((title) => ({ id: uid(), type: 'bullet' as const, text: title })),
      { id: uid(), type: 'heading' as const, text: 'Video outline' },
      ...brief.outline.map((line) => ({ id: uid(), type: 'bullet' as const, text: line })),
      { id: uid(), type: 'heading' as const, text: 'Script draft structure' },
      ...brief.scriptDraft.map((line) => ({ id: uid(), type: 'bullet' as const, text: line })),
      { id: uid(), type: 'heading' as const, text: 'Verification checklist' },
      ...brief.verificationQuestions.map((line) => ({ id: uid(), type: 'checklist' as const, text: line, checked: false })),
      ...brief.warnings.map((warning) => ({ id: uid(), type: 'paragraph' as const, text: 'Limitation: ' + warning })),
    ];
    const note = {
      id: uid(),
      title: ('Space research: ' + brief.topic).slice(0, 120),
      folder: 'Space Research',
      tags: ['space', 'research'],
      blocks,
      updatedAt: Date.now(),
    };
    await useScout.getState().commit((data) => ({ ...data, notes: [note, ...data.notes] }));
  }, 'Research brief saved to Notes.');
  return (
    <Page title="DEEP RESEARCH">
      <Txt muted>Choose a topic. The app combines selected official news, a clearly labelled public-interest proxy and an optional YouTube sample, then prepares a research structure with source links. The final topic choice and research start stay under your control.</Txt>
      <Panel>
        <Field label="Research topic" value={topic} onChange={setTopic} placeholder="e.g. What JWST has found in exoplanet atmospheres" multiline />
        <Action busy={op.busy} disabled={!topic.trim()} onPress={run}>Start deep research</Action>
      </Panel>
      {brief && (
        <>
          <Panel>
            <Heading>{brief.topic}</Heading>
            <Text style={styles.badge}>Prepared {new Date(brief.createdAt).toLocaleString()}</Text>
            <Txt muted>Evidence is presented by provider. Wikipedia is not treated as a primary scientific source; confirm scientific claims in the linked NASA/JPL/ESA material and cited papers.</Txt>
            {brief.warnings.map((warning) => <Txt muted key={warning}>Limitation: {warning}</Txt>)}
          </Panel>
          {brief.wiki && (
            <Panel>
              <Heading>Public-interest context · Wikimedia</Heading>
              <Txt>{brief.wiki.articleTitle}</Txt>
              <Txt muted>{brief.wiki.summary || 'No encyclopedia summary was returned.'}</Txt>
              <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(brief.wiki!.articleUrl).catch(() => {})}>
                <Button.Label>Check the article and its references ↗</Button.Label>
              </Button>
            </Panel>
          )}
          <Panel>
            <Heading>Primary-source news</Heading>
            {!brief.news.length && <Txt muted>No selected-feed headline directly matched this topic. Use the source links from Cosmic News for a broader scan.</Txt>}
            {brief.news.map((item) => (
              <View key={item.id} style={{ gap: 6 }}>
                <Text style={styles.badge}>{item.sourceName} · {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : 'Date not supplied'}</Text>
                <Txt>{item.title}</Txt>
                {Boolean(item.summary) && <Txt muted>{item.summary}</Txt>}
                <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(item.url).catch(() => {})}>
                  <Button.Label>Open publisher source ↗</Button.Label>
                </Button>
              </View>
            ))}
          </Panel>
          <Panel>
            <Heading>YouTube evidence</Heading>
            {brief.videos.length > 0 ? brief.videos.map((video) => (
              <View key={video.id} style={{ gap: 4 }}>
                <Txt>{video.title}</Txt>
                <Text style={styles.badge}>{video.channel} · {video.viewCount === null ? 'Views unavailable' : video.viewCount.toLocaleString() + ' views'}</Text>
                <Txt muted>{video.channelSubscriberCount === null ? 'Subscribers unavailable' : video.channelSubscriberCount.toLocaleString() + ' subscribers'} · {video.channelVideoCount === null ? 'Channel video total unavailable' : video.channelVideoCount.toLocaleString() + ' uploads'}</Txt>
              </View>
            )) : <Txt muted>No YouTube sample was available. This does not block the source-led brief.</Txt>}
          </Panel>
          <Panel>
            <Heading>Suggested video titles</Heading>
            {brief.titleIdeas.map((title) => <Txt key={title}>{title}</Txt>)}
          </Panel>
          <Panel>
            <Heading>Story structure</Heading>
            {brief.outline.map((line) => <Txt key={line}>{line}</Txt>)}
          </Panel>
          <Panel>
            <Heading>Suggested narration draft</Heading>
            <Txt muted>This is a source-aware script scaffold, not a finished fact-checked voiceover. Fill in specific numbers and scientific claims only after checking the linked primary material.</Txt>
            {brief.scriptDraft.map((line) => <Txt key={line}>{line}</Txt>)}
          </Panel>
          <Panel>
            <Heading>Scientific verification checklist</Heading>
            {brief.verificationQuestions.map((line) => <Txt key={line}>• {line}</Txt>)}
          </Panel>
          <Action busy={op.busy} onPress={saveToNotes}>Save full brief to Notes</Action>
          <Action secondary onPress={() => router.push('/notes')}>Open Notes workspace</Action>
        </>
      )}
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={run} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </Page>
  );
}
