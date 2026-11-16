import { useState } from 'react';
import { Linking, View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Panel, Heading, Txt, Field, Action, styles, ErrorBox, useOperation, SourceText } from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { translateText } from '@/lib/i18n';
import { uid, RETENTION_MS } from '@/lib/types';
import { getKey } from '@/lib/vault';
import { buildInternalResearch, rankNewsForTopic, type InternalResearchResult } from '@/lib/engine';
import { buildResearchInterestProfile, normalizeResearchText } from '@/lib/intelligence';
import { MediaPreview } from '@/components/MediaPreview';
import { getTopicDossier, rememberTopicDossier } from '@/lib/topic-dossier';
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
  internalAnalysis: InternalResearchResult;
};

export default function DeepResearch() {
  const params = useLocalSearchParams<{ topic?: string; niche?: string; idea?: string }>();
  const preferences = useScout((state) => state.data.preferences);
  const linkedIdea = useScout((state) => state.data.ideas.find((idea) => idea.id === params.idea));
  const reports = useScout((state) => state.data.reports);
  const ideas = useScout((state) => state.data.ideas);
  const researchMemory = useScout((state) => state.data.researchMemory);
  const feedback = buildResearchInterestProfile(ideas);
  const [topic, setTopic] = useState(typeof params.topic === 'string' ? params.topic : '');
  const [brief, setBrief] = useState<Brief>();
  const op = useOperation();
  const nicheId = typeof params.niche === 'string' ? params.niche : preferences.selectedSpaceNiche;
  const niche = SPACE_NICHES.find((item) => item.id === nicheId);
  const run = () => void op.run(async () => {
    const query = topic.trim();
    if (!query) throw new Error('Choose a topic before starting deep research.');
    const warnings: string[] = [];
    const priorMemory = researchMemory.find((entry) => normalizeResearchText(entry.topic) === normalizeResearchText(query));
    if (priorMemory) warnings.push(preferences.uiLanguage === 'fa' ? 'حافظه تحقیق محلی قبلی برای مقایسه بارگذاری شد؛ ادعاهای منابع ذخیره‌شده با نتایج فعلی بررسی می‌شوند.' : 'Previous local research memory was loaded for comparison; saved source claims may be checked against this run.');
    const cachedDossier = getTopicDossier(query);
    const cachedNews = (cachedDossier?.news ?? []).filter((item) => preferences.spaceNewsSources.includes(item.sourceId));
    const newsResult = cachedNews.length
      ? { items: cachedNews, warnings: [] as string[] }
      : await fetchSpaceNews(preferences.spaceNewsSources);
    warnings.push(...newsResult.warnings);
    if (cachedNews.length) warnings.push(preferences.uiLanguage === 'fa' ? 'شواهد خبری تازه از پرونده محلی موضوع دوباره استفاده شد؛ درخواست دیگری برای خوراک خبری ارسال نشد.' : 'Reused recent publisher evidence from the local topic dossier; no additional feed request was made.');
    const nicheNews = niche
      ? newsForNiche(newsResult.items, nicheId)
      : nicheId === 'custom'
        ? newsForNiche(newsResult.items, nicheId, preferences.customSpaceNiche)
        : newsResult.items;
    const selectedNews = rankNewsForTopic(query, nicheNews, 6, feedback);
    let wiki: WikiSignal | undefined;
    if (cachedDossier?.wiki?.language === (preferences.spaceInterestLanguage ?? 'en')) {
      wiki = cachedDossier.wiki;
      warnings.push('Reused recent Wikimedia evidence from the local topic dossier; no additional pageview request was made.');
    } else {
      try {
        wiki = await getWikipediaSignal(query, preferences.spaceInterestLanguage ?? 'en');
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : 'Public-interest data was unavailable.');
      }
    }
    let videos: YouTubeSampleVideo[] = [];
    let videoCriteria = cachedDossier?.videoCriteria;
    const linkedReport = linkedIdea?.reportId ? reports.find((report) => report.id === linkedIdea.reportId) : undefined;
    const reusableReport = linkedReport && linkedReport.videos.length > 0 && Date.now() - linkedReport.createdAt < RETENTION_MS
      ? linkedReport
      : undefined;
    if (reusableReport) {
      videoCriteria = undefined;
      videos = reusableReport.videos.map((video) => ({
        id: video.id, title: video.title, description: video.description,
        channel: video.channel, channelId: '', publishedAt: video.publishedAt,
        thumbnailUrl: video.thumbnail, viewCount: video.viewCount ?? null,
        likeCount: video.likeCount ?? null, channelSubscriberCount: null,
        channelVideoCount: null, url: 'https://www.youtube.com/watch?v=' + video.id,
      }));
      warnings.push('Reused the YouTube report already linked to this idea; no additional YouTube quota was used.');
    } else if (cachedDossier?.videos.length && cachedDossier.videoCriteria?.days === (preferences.defaultResearchDays ?? 30) && cachedDossier.videoCriteria.region === preferences.region && cachedDossier.videoCriteria.language === (preferences.languages[0] ?? '') && cachedDossier.videoCriteria.order === 'viewCount') {
      videos = cachedDossier.videos;
      warnings.push('Reused a recent matching YouTube sample from the local topic dossier; no additional YouTube quota was used.');
    } else {
      try {
        const key = await getKey('youtube');
        if (key) {
          const sample = await searchYouTubeSample(query, {
            key,
            charge: useScout.getState().charge,
            onQuota: () => useScout.getState().commit((data) => ({ ...data, budget: { ...data.budget, exhausted: true } })),
          }, 25, { days: preferences.defaultResearchDays ?? 30, region: preferences.region, language: preferences.languages[0] });
          videos = sample.videos;
          videoCriteria = {
            days: preferences.defaultResearchDays ?? 30,
            region: preferences.region,
            language: preferences.languages[0] ?? '',
            order: 'viewCount',
          };
          if (sample.warning) warnings.push(sample.warning);
        } else {
          warnings.push('YouTube view sample skipped: add a YouTube API key in Settings to include it.');
        }
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : 'YouTube sample was unavailable.');
      }
    }
    if (!selectedNews.length) {
      warnings.push(preferences.uiLanguage === 'fa' ? 'مقاله ناشر با ارتباط مستقیم با این موضوع در دسترس نبود. گزارش داخلی تا زمان یافتن شواهد اولیه اکتشافی باقی می‌ماند.' : 'No directly relevant publisher article was available for this topic. The internal report will remain exploratory until primary evidence is found.');
    }
    if (!wiki && !videos.length) {
      warnings.push(preferences.uiLanguage === 'fa' ? 'شواهد ویکی‌مدیا یا یوتیوب در دسترس نبود. از این اجرا نمی‌توان درباره تقاضا یا رقابت نتیجه‌گیری کرد.' : 'No Wikimedia or YouTube evidence was available. No demand or competition conclusion can be drawn from this run.');
    }
    const outline = buildResearchOutline(query, selectedNews.map((item) => item.title), preferences.uiLanguage ?? 'fa');
    const internalAnalysis = buildInternalResearch({
      topic: query,
      news: selectedNews.map((item) => ({
        title: item.title,
        summary: item.summary,
        sourceName: item.sourceName,
        sourceUrl: item.url,
        publishedAt: item.publishedAt,
        sourceId: item.sourceId,
      })),
      wiki,
      videos,
      feedback,
      priorMemory,
      language: preferences.uiLanguage ?? 'fa',
    });
    rememberTopicDossier(query, {
      news: selectedNews.length ? selectedNews : cachedDossier?.news ?? [],
      wiki, videos, videoCriteria, internalAnalysis,
    });
    const memoryEntry = {
      topic: query,
      updatedAt: Date.now(),
      sources: selectedNews.slice(0, 12).map((item) => ({
        sourceId: item.sourceId?.slice(0, 80),
        sourceName: item.sourceName.slice(0, 160),
        title: item.title.slice(0, 500),
        sourceUrl: item.url,
        publishedAt: item.publishedAt,
      })),
      keyFindings: internalAnalysis.evidence.map((item) => item.detail.slice(0, 2000)).slice(0, 8),
      unresolvedQuestions: [...internalAnalysis.intelligence.gaps, ...internalAnalysis.verificationQuestions].map((item) => item.slice(0, 500)).slice(0, 12),
      contradictions: internalAnalysis.intelligence.potentialContradictions.map((item) => item.slice(0, 500)).slice(0, 8),
      confidence: internalAnalysis.intelligence.confidence.level,
    };
    await useScout.getState().commit((data) => ({
      ...data,
      researchMemory: [
        memoryEntry,
        ...data.researchMemory.filter((entry) => normalizeResearchText(entry.topic) !== normalizeResearchText(query)),
      ].slice(0, 40),
    }));
    setBrief({
      topic: query,
      createdAt: Date.now(),
      news: selectedNews,
      wiki,
      videos,
      warnings,
      internalAnalysis,
      ...outline,
      scriptDraft: preferences.uiLanguage === 'fa' ? [
        'قلاب — با پرسش اصلی شروع کن: ' + outline.titleIdeas[0],
        'زمینه — پیش از بیان نتیجه جدید، مأموریت، تلسکوپ یا فرایند فیزیکی را توضیح بده.',
        ...(selectedNews.length ? ['شواهد مبتنی بر منبع — مشاهده گزارش‌شده را با نام ناشر، تاریخ و پیوند اصلی معرفی کن. عدد یا ادعایی خارج از منبع اضافه نکن.'] : ['شواهد — پس از بررسی مقاله یا اطلاعیه مأموریت، قوی‌ترین یافته تأییدشده را وارد کن.']),
        'توضیح — سازوکار علمی را به زبان ساده شرح بده و اصطلاحات ناآشنا را تعریف کن.',
        'محدودیت‌ها — بگو این مشاهده چه چیزی را ثابت نمی‌کند و کدام تفسیرها هنوز موقت‌اند.',
        'اهمیت — توضیح بده این نتیجه در داستان گسترده‌تر علم فضا چه اهمیتی دارد.',
        'پایان — به پرسش آغازین برگرد و بگو کدام مشاهده یا مأموریت آینده می‌تواند پاسخ را روشن کند.',
      ] : [
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
      { id: uid(), type: 'heading' as const, text: 'Internal research engine' },
      { id: uid(), type: 'paragraph' as const, text: brief.internalAnalysis.summary },
      ...brief.internalAnalysis.evidence.map((item) => ({ id: uid(), type: 'bullet' as const, text: item.label + ': ' + item.detail })),
      ...brief.internalAnalysis.angles.map((angle) => ({ id: uid(), type: 'bullet' as const, text: angle.title + '\n' + angle.hook + '\n' + angle.approach + '\nVerify: ' + angle.verification })),
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
      ...(linkedIdea ? { ideaId: linkedIdea.id } : {}),
    };
    await useScout.getState().commit((data) => ({ ...data, notes: [note, ...data.notes] }));
  }, 'Research brief saved to Notes.');
  return (
    <Page title="DEEP RESEARCH">
      <Txt muted>Choose a topic. The app combines selected official news, a clearly labelled public-interest proxy and an optional YouTube sample, then prepares a research structure with source links. The final topic choice and research start stay under your control.</Txt>
      {linkedIdea ? <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: linkedIdea.id } })}>{'Research linked to: ' + linkedIdea.topic + ' · Open idea'}</Action> : null}
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
          <Panel>
            <Heading>Internal Research Engine</Heading>
            <Txt muted>{brief.internalAnalysis.summary}</Txt>
            {brief.internalAnalysis.evidence.map((item) => (
              <View key={item.id} style={{ gap: 3 }}>
                <Text style={styles.badge}>{item.label}</Text>
                <Txt muted>{item.detail}</Txt>
                {item.sourceUrl ? (
                  <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(item.sourceUrl!).catch(() => {})}>
                    <Button.Label>Open evidence source ↗</Button.Label>
                  </Button>
                ) : null}
              </View>
            ))}
            {brief.internalAnalysis.angles.map((angle) => (
              <View key={angle.id} style={{ gap: 5 }}>
                <Heading>{angle.title}</Heading>
                <Txt>{angle.hook}</Txt>
                <Txt muted>{angle.approach}</Txt>
                <Txt muted>Verify: {angle.verification}</Txt>
              </View>
            ))}
            {brief.internalAnalysis.verificationQuestions.map((question) => <Txt muted key={question}>{question}</Txt>)}
            {brief.internalAnalysis.limitations.map((limitation) => <Txt muted key={limitation}>{limitation}</Txt>)}
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: '#343047', paddingTop: 12 }}>
              <Heading>Evidence quality & confidence</Heading>
              <Txt muted>{'Confidence: ' + translateText(brief.internalAnalysis.intelligence.confidence.level.charAt(0).toUpperCase() + brief.internalAnalysis.intelligence.confidence.level.slice(1), preferences.uiLanguage ?? 'fa') + ' — ' + brief.internalAnalysis.intelligence.confidence.reason}</Txt>
              <Txt muted>{'Feeds represented: ' + brief.internalAnalysis.intelligence.sourceQuality.feedsRepresented + ' · Independent publisher groups: ' + brief.internalAnalysis.intelligence.sourceQuality.independentPublishers}</Txt>
              <Txt muted>{'Duplicate stories merged: ' + brief.internalAnalysis.intelligence.sourceQuality.duplicateStoriesMerged + ' · Undated: ' + brief.internalAnalysis.intelligence.sourceQuality.undatedItems + ' · Older than 90 days: ' + brief.internalAnalysis.intelligence.sourceQuality.staleItems}</Txt>
              <Heading>Trend signal</Heading>
              <Txt muted>{'Direction: ' + translateText(brief.internalAnalysis.intelligence.trend.direction === 'insufficient-data' ? 'Insufficient-data' : brief.internalAnalysis.intelligence.trend.direction.charAt(0).toUpperCase() + brief.internalAnalysis.intelligence.trend.direction.slice(1), preferences.uiLanguage ?? 'fa') + ' · Monthly observations: ' + brief.internalAnalysis.intelligence.trend.observations}</Txt>
              {brief.internalAnalysis.intelligence.trend.changePercent !== null ? <Txt muted>{'Recent change between halves of the returned series: ' + brief.internalAnalysis.intelligence.trend.changePercent + '%'}</Txt> : null}
              {brief.internalAnalysis.intelligence.trend.anomaly ? <Txt muted>{'Potential anomaly: ' + translateText(brief.internalAnalysis.intelligence.trend.anomaly.charAt(0).toUpperCase() + brief.internalAnalysis.intelligence.trend.anomaly.slice(1), preferences.uiLanguage ?? 'fa')}</Txt> : null}
              {brief.internalAnalysis.intelligence.gaps.map((gap) => <Txt muted key={gap}>{'Research gap: ' + gap}</Txt>)}
              {brief.internalAnalysis.intelligence.followUpQueries.map((query) => <View key={query} style={{ gap: 2 }}><Txt muted>Follow-up search:</Txt><SourceText>{query}</SourceText></View>)}
              {brief.internalAnalysis.intelligence.sharedConcepts.length ? <Txt muted>{'Shared terms across publisher and video samples: ' + brief.internalAnalysis.intelligence.sharedConcepts.join(', ') + '. This is wording overlap only.'}</Txt> : null}
              {brief.internalAnalysis.intelligence.scenarios.map((scenario) => <Txt muted key={scenario}>{scenario}</Txt>)}
              {brief.internalAnalysis.intelligence.potentialContradictions.map((item) => <Txt muted key={item}>{'Potential discrepancy: ' + item}</Txt>)}
            </View>
          </Panel>
          {brief.wiki && (
            <Panel>
              <Heading>Public-interest context · Wikimedia</Heading>
              <SourceText>{brief.wiki.articleTitle}</SourceText>
              <SourceText muted>{brief.wiki.summary || 'No encyclopedia summary was returned.'}</SourceText>
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
                {item.imageUrl ? <MediaPreview uri={item.imageUrl} aspectRatio={16 / 9} viewer alt={item.title} /> : null}
                <Text style={styles.badge}>{item.sourceName} · {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : 'Date not supplied'}</Text>
                <SourceText>{item.title}</SourceText>
                {Boolean(item.summary) && <SourceText>{item.summary}</SourceText>}
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
                <MediaPreview uri={video.thumbnailUrl} aspectRatio={16 / 9} onPress={() => void Linking.openURL(video.url).catch(() => {})} alt={video.title} />
                <SourceText>{video.title}</SourceText>
                <Text style={styles.badge}>{video.channel} · {video.viewCount === null ? 'Views unavailable' : video.viewCount.toLocaleString() + ' views'} · {video.likeCount === null ? 'Likes unavailable' : video.likeCount.toLocaleString() + ' likes'}</Text>
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
