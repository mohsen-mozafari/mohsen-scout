import { useState } from 'react';
import { Linking, View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button } from 'heroui-native';
import { Page, Panel, Heading, Txt, Field, Action, Fold, styles, ErrorBox, useOperation, SourceText } from '@/components/ScoutUI';
import { palette as p } from '@/lib/theme';
import { useScout } from '@/lib/store';
import { translateText } from '@/lib/i18n';
import { uid, RETENTION_MS, type Idea } from '@/lib/types';
import { getKey } from '@/lib/vault';
import { fetchWebResearch, type WebResearchItem } from '@/lib/web-research';
import { buildInternalResearch, rankNewsForTopic, type InternalResearchResult } from '@/lib/engine';
import { buildResearchInterestProfile, normalizeResearchText } from '@/lib/intelligence';
import { MediaPreview } from '@/components/MediaPreview';
import { ResearchOverviewChart } from '@/components/ResearchOverviewChart';
import { getTopicDossier, rememberTopicDossier } from '@/lib/topic-dossier';
import { generateEditorialIdeas } from '@/lib/idea-generation';
import { buildPublisherIntelligence, type PublisherIntelligence } from '@/lib/news-intelligence';
import { createResearchMemoryEntry } from '@/lib/research-memory';
import { recordRuntimeFinish, recordRuntimeStart } from '@/lib/runtime-metrics';
import { type YouTubeSampleVideo } from '@/lib/api';
import { runAutonomousYouTubeResearch } from '@/lib/autonomous-youtube-research';
import {
  SPACE_NICHES, fetchSpaceNews, newsForNiche, getWikipediaSignal, buildResearchOutline,
  type SpaceNewsItem, type WikiSignal,
} from '@/lib/space';

type Brief = {
  topic: string;
  createdAt: number;
  news: SpaceNewsItem[];
  webResults: WebResearchItem[];
  wiki?: WikiSignal;
  videos: YouTubeSampleVideo[];
  warnings: string[];
  titleIdeas: string[];
  outline: string[];
  verificationQuestions: string[];
  scriptDraft: string[];
  internalAnalysis: InternalResearchResult;
  publisherIntelligence?: PublisherIntelligence;
  generatedIdeas: Idea[];
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
    let newsResult: Awaited<ReturnType<typeof fetchSpaceNews>>;
    if (cachedNews.length) {
      newsResult = { items: cachedNews, warnings: [], registry: useScout.getState().data.feedRegistry };
    } else {
      recordRuntimeStart('Sources');
      try {
        newsResult = await fetchSpaceNews(preferences.spaceNewsSources);
        recordRuntimeFinish('Sources', newsResult.warnings.length ? 'partial' : 'success');
      } catch (error) {
        recordRuntimeFinish('Sources', 'error', error instanceof Error ? error.message : String(error));
        throw error;
      }
    }
    warnings.push(...newsResult.warnings);
    if (cachedNews.length) warnings.push(preferences.uiLanguage === 'fa' ? 'شواهد خبری تازه از پرونده محلی موضوع دوباره استفاده شد؛ درخواست دیگری برای خوراک خبری ارسال نشد.' : 'Reused recent publisher evidence from the local topic dossier; no additional feed request was made.');
    let webResults: WebResearchItem[] = [];
    if (preferences.webResearchEnabled) {
      try {
        const firecrawlKey = await getKey('firecrawl').catch(() => undefined);
        const web = await fetchWebResearch(query, {
          apiKey: firecrawlKey ?? undefined,
          limit: 6,
          days: preferences.defaultResearchDays,
        });
        webResults = web.items;
        warnings.push(...web.warnings);
      } catch (error) {
        warnings.push('Independent web search unavailable: ' + (error instanceof Error ? error.message : 'Firecrawl request failed.') + ' Official feeds and Wikimedia continue independently.');
      }
    }
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
      recordRuntimeStart('Wikimedia');
      try {
        wiki = await getWikipediaSignal(query, preferences.spaceInterestLanguage ?? 'en');
        recordRuntimeFinish('Wikimedia', wiki ? 'success' : 'partial');
      } catch (error) {
        recordRuntimeFinish('Wikimedia', 'error', error instanceof Error ? error.message : String(error));
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
          recordRuntimeStart('YouTube');
          try {
            const sample = await runAutonomousYouTubeResearch(query, {
              key,
              charge: useScout.getState().charge,
              onQuota: () => useScout.getState().commit((data) => ({ ...data, budget: { ...data.budget, exhausted: true } })),
            }, { days: preferences.defaultResearchDays ?? 30, region: preferences.region, language: preferences.languages[0] }, { rounds: 2, resultsPerQuery: 10 });
            videos = sample.videos;
            warnings.push(preferences.uiLanguage === 'fa'
              ? 'اکتشاف چندمرحله‌ای YouTube اجرا شد: ' + sample.queries.join(' ← ') + ' | ویدئوهای تکراری ادغام شدند.'
              : 'Iterative YouTube exploration ran: ' + sample.queries.join(' → ') + ' | duplicate videos merged.');
            warnings.push(...sample.warnings);
            videoCriteria = {
              days: preferences.defaultResearchDays ?? 30,
              region: preferences.region,
              language: preferences.languages[0] ?? '',
              order: 'viewCount',
            };
            recordRuntimeFinish('YouTube', sample.warnings.length ? 'partial' : videos.length ? 'success' : 'partial');
          } catch (error) {
            recordRuntimeFinish('YouTube', 'error', error instanceof Error ? error.message : String(error));
            throw error;
          }
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
    if (!wiki) {
      warnings.push(preferences.uiLanguage === 'fa' ? 'نمونه توجه ویکی‌مدیا در دسترس نبود؛ داده‌های YouTube در بخش جداگانه نمایش داده می‌شوند و برای امتیازدهی ناشران استفاده نمی‌شوند.' : 'No Wikimedia attention sample was available. The separately displayed YouTube sample is not used to infer publisher momentum, demand or competition.');
    }
    recordRuntimeStart('Engine');
    try {
    let publisherIntelligence: PublisherIntelligence | undefined;
    try {
      publisherIntelligence = await buildPublisherIntelligence(selectedNews, Date.now(), 7);
    } catch {
      warnings.push(preferences.uiLanguage === 'fa'
        ? 'خوشه‌بندی خبرهای ناشران کامل نشد؛ تحلیل و ایده‌های اصلی ادامه پیدا می‌کنند.'
        : 'Publisher clustering could not finish; the core analysis and idea generation will continue.');
    }
    const outline = buildResearchOutline(query, selectedNews.map((item) => item.title), preferences.uiLanguage ?? 'fa');
    const internalAnalysis = buildInternalResearch({
      topic: query,
      news: [
        ...selectedNews.map((item) => ({
        title: item.title,
        summary: item.summary,
        sourceName: item.sourceName,
        sourceUrl: item.url,
        publishedAt: item.publishedAt,
        sourceId: item.sourceId,
      })),
        ...webResults.map((item) => ({
          title: item.title,
          summary: item.summary,
          sourceName: item.sourceName,
          sourceUrl: item.url,
          publishedAt: item.publishedAt ?? null,
          sourceId: 'web:' + item.sourceName,
        })),
      ],
      wiki,
      feedback,
      priorMemory,
      language: preferences.uiLanguage ?? 'fa',
    });
    rememberTopicDossier(query, {
      news: selectedNews.length ? selectedNews : cachedDossier?.news ?? [],
      wiki, videos, videoCriteria, internalAnalysis,
    });
    // Long-lived memory is deliberately built from official publisher RSS only.
    // YouTube and Wikimedia evidence stays in its short-lived/ephemeral domains.
    const memoryAnalysis = buildInternalResearch({
      topic: query,
      news: selectedNews.map((item) => ({
        title: item.title,
        summary: item.summary,
        sourceName: item.sourceName,
        sourceUrl: item.url,
        publishedAt: item.publishedAt,
        sourceId: item.sourceId,
      })),
      feedback,
      priorMemory,
      language: preferences.uiLanguage ?? 'fa',
    });
    const memoryEntry = createResearchMemoryEntry({
      topic: query,
      news: selectedNews,
      analysis: memoryAnalysis,
      previous: priorMemory,
      now: Date.now(),
      language: preferences.uiLanguage ?? 'fa',
    });
    if (memoryEntry && priorMemory) {
      const latestSnapshot = memoryEntry.history?.[0];
      if (latestSnapshot?.capturedAt === memoryEntry.updatedAt && latestSnapshot.changes.length) {
        warnings.push(latestSnapshot.changes.join(' '));
      }
    }
    const generatedIdeas = generateEditorialIdeas({
      topic: query,
      news: selectedNews,
      context: [
        ...webResults.map((item) => ({ title: item.title, summary: item.summary, sourceUrl: item.url, sourceName: item.sourceName, publishedAt: item.publishedAt ?? null })),
        ...(wiki ? [{ title: wiki.articleTitle, summary: wiki.summary, sourceUrl: wiki.articleUrl, sourceName: 'Wikimedia' }] : []),
      ],
      existingIdeas: useScout.getState().data.ideas,
      region: preferences.region,
      languages: preferences.languages,
      language: preferences.uiLanguage ?? 'fa',
      limit: 25,
    });
    await useScout.getState().commit((data) => ({
      ...data,
      ideas: [...generatedIdeas, ...data.ideas],
      researchMemory: memoryEntry
        ? [
            memoryEntry,
            ...data.researchMemory.filter((entry) => normalizeResearchText(entry.topic) !== normalizeResearchText(query)),
          ].slice(0, 40)
        : data.researchMemory,
    }));
    setBrief({
      topic: query,
      createdAt: Date.now(),
      news: selectedNews,
      webResults,
      wiki,
      videos,
      warnings,
      internalAnalysis,
      publisherIntelligence,
      generatedIdeas,
      ...outline,
      scriptDraft: preferences.uiLanguage === 'fa' ? [
        'شروع ویدئو — با یک پرسش روشن آغاز کن: ' + outline.titleIdeas[0],
        'زمینه — قبل از گفتن نتیجه، فقط پیش‌زمینه لازم را توضیح بده؛ مثلاً مأموریت، ابزار یا فرایند علمی.',
        ...(selectedNews.length ? ['شواهد و منبع — مشاهده گزارش‌شده را با نام ناشر، تاریخ و پیوند اصلی معرفی کن. چیزی فراتر از آنچه منبع گفته اضافه نکن.'] : ['شواهد — پس از بررسی مقاله یا اطلاعیه رسمی، مهم‌ترین یافته‌ای را که واقعاً تأیید شده وارد کن.']),
        'توضیح ساده — سازوکار علمی را با زبان قابل فهم توضیح بده و اصطلاحات ناآشنا را همان‌جا معنی کن.',
        'آنچه هنوز نمی‌دانیم — روشن کن این مشاهده چه چیزی را ثابت نمی‌کند و کدام برداشت‌ها هنوز قطعی نیستند.',
        'اهمیت — توضیح بده این یافته چه چیزی به دانسته‌های ما اضافه می‌کند.',
        'پایان‌بندی — به پرسش اول برگرد و بگو کدام داده یا مشاهده آینده می‌تواند پاسخ دقیق‌تری بدهد.',
      ] : [
        'OPENING — Start with one clear question: ' + outline.titleIdeas[0],
        'CONTEXT — Give viewers only the background they need to understand the mission, instrument or scientific process.',
        ...(selectedNews.length ? ['WHAT THE SOURCE SAYS — Name the publisher, date and original link. Do not add a figure or claim that the source does not report.'] : ['EVIDENCE — After checking the linked paper or official mission update, add the strongest finding that is actually supported.']),
        'PLAIN-LANGUAGE EXPLANATION — Explain the scientific process in everyday language and define unfamiliar terms as they appear.',
        'WHAT IS STILL UNKNOWN — Say what the observation does not prove and which explanations remain provisional.',
        'WHY IT MATTERS — Explain what this result adds to our understanding.',
        'ENDING — Return to the opening question and point to the next observation or data that could answer it.',
      ],
    });
    recordRuntimeFinish('Engine', 'success');
    } catch (error) {
      recordRuntimeFinish('Engine', 'error', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, 'Source-backed research brief prepared.');
  const saveToNotes = () => void op.run(async () => {
    if (!brief) throw new Error('Generate a research brief first.');
    const fa = preferences.uiLanguage === 'fa';
    const blocks = [
      { id: uid(), type: 'heading' as const, text: fa ? 'یافته‌های منابع' : 'Source findings' },
      ...(brief.wiki ? [{ id: uid(), type: 'paragraph' as const, text: brief.wiki.articleTitle + ': ' + brief.wiki.summary + (fa ? '\nمقاله: ' : '\nArticle: ') + brief.wiki.articleUrl }] : []),
      ...brief.news.map((item) => ({ id: uid(), type: 'link' as const, text: item.sourceName + ': ' + item.title + '\n' + item.summary + '\n' + item.url })),
      { id: uid(), type: 'heading' as const, text: fa ? 'موتور تحقیق داخلی' : 'Internal research engine' },
      { id: uid(), type: 'paragraph' as const, text: brief.internalAnalysis.summary },
      ...brief.internalAnalysis.evidence.map((item) => ({ id: uid(), type: 'bullet' as const, text: item.label + ': ' + item.detail })),
      ...brief.internalAnalysis.angles.map((angle) => ({ id: uid(), type: 'bullet' as const, text: angle.title + '\n' + angle.hook + '\n' + angle.approach + (fa ? '\nراستی‌آزمایی: ' : '\nVerify: ') + angle.verification })),
      { id: uid(), type: 'heading' as const, text: fa ? 'عنوان‌های پیشنهادی ویدئو' : 'Suggested video titles' },
      ...brief.titleIdeas.map((title) => ({ id: uid(), type: 'bullet' as const, text: title })),
      { id: uid(), type: 'heading' as const, text: fa ? 'طرح ویدئو' : 'Video outline' },
      ...brief.outline.map((line) => ({ id: uid(), type: 'bullet' as const, text: line })),
      { id: uid(), type: 'heading' as const, text: fa ? 'پیش‌نویس ساختار روایت' : 'Script draft structure' },
      ...brief.scriptDraft.map((line) => ({ id: uid(), type: 'bullet' as const, text: line })),
      { id: uid(), type: 'heading' as const, text: fa ? 'فهرست راستی‌آزمایی' : 'Verification checklist' },
      ...brief.verificationQuestions.map((line) => ({ id: uid(), type: 'checklist' as const, text: line, checked: false })),
      ...brief.warnings.map((warning) => ({ id: uid(), type: 'paragraph' as const, text: (fa ? 'محدودیت: ' : 'Limitation: ') + warning })),
    ];
    const note = {
      id: uid(),
      title: ((fa ? 'پژوهش فضایی: ' : 'Space research: ') + brief.topic).slice(0, 120),
      folder: fa ? 'پژوهش فضایی' : 'Space Research',
      tags: fa ? ['فضا', 'پژوهش'] : ['space', 'research'],
      blocks,
      updatedAt: Date.now(),
      ...(linkedIdea ? { ideaId: linkedIdea.id } : {}),
    };
    await useScout.getState().commit((data) => ({ ...data, notes: [note, ...data.notes] }));
  }, 'Research brief saved to Notes.');
  return (
    <Page title="Deep Research" eyebrow="3-STEP RESEARCH WORKSPACE" showBack subtitle="Choose a question, build one evidence-backed brief, then review the sections you need.">
      <Txt muted>Step 1 · Choose the topic. Step 2 · Build the brief. Step 3 · Review the evidence, sources and production plan. Research begins only when you press the action.</Txt>
      {linkedIdea ? <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: linkedIdea.id } })}>{'Research linked to: ' + linkedIdea.topic + ' · Open idea'}</Action> : null}
      <Action secondary onPress={() => router.push('/browser')}>Open internal web browser</Action>
      <Panel>
        <Heading>1 · Choose the research question</Heading>
        <Field label="What should this brief investigate?" value={topic} onChange={setTopic} placeholder="e.g. What JWST has found in exoplanet atmospheres" multiline />
        <Txt muted>Uses selected publisher feeds and a clearly labelled Wikimedia attention proxy for the editorial engine. The separately collected YouTube sample is displayed below and is not merged into publisher scoring or idea generation.</Txt>
        <Action busy={op.busy} disabled={!topic.trim()} onPress={run}>2 · Build research brief</Action>
      </Panel>
      {brief && (
        <>
          <Panel>
            <Heading>Research overview · {brief.topic}</Heading>
            <Text style={styles.badge}>Prepared {new Date(brief.createdAt).toLocaleString()}</Text>
            <Txt muted>{brief.news.length} publisher reports · {brief.videos.length} YouTube sample videos · {brief.generatedIdeas.length} generated ideas · {brief.wiki ? 'Wikimedia context available' : 'No Wikimedia result'}.</Txt>
            <Txt muted>Wikimedia pageviews indicate article attention, not YouTube demand. Treat generated angles as research candidates and verify claims against the linked primary sources.</Txt>
            {brief.warnings.length ? <Fold title="Coverage limits & warnings" summary={brief.warnings.length + ' item(s) to review'}>{brief.warnings.map((warning) => <Txt muted key={warning}>Limitation: {warning}</Txt>)}</Fold> : null}
          </Panel>
          <Fold title="3 · Recommended content ideas" summary={brief.generatedIdeas.length + ' evidence-backed ideas'}>          <Panel>
            <Heading>Ideas generated from this research</Heading>
            {brief.generatedIdeas.length ? brief.generatedIdeas.map((idea) => (
              <View key={idea.id} style={{ gap: 5 }}>
                <Text style={styles.badge}>{idea.ideaCategory ?? 'Generated'} · {idea.assessment}</Text>
                <Heading>{idea.topic}</Heading>
                <Txt muted>{idea.concept}</Txt>
                <Action secondary onPress={() => router.push({ pathname: '/detail', params: { idea: idea.id } })}>Open idea details</Action>
              </View>
            )) : <Txt muted>No sufficiently distinct angle could be generated from the returned evidence. Add more source material or choose a narrower question.</Txt>}
          </Panel>
</Fold>          <Fold title="4 · Engine findings, evidence & confidence" summary={brief.internalAnalysis.evidence.length + ' evidence signals · ' + brief.internalAnalysis.angles.length + ' content angles'}>          <Panel>
            <Heading>Internal Research Engine</Heading>
            <ResearchOverviewChart
              topic={brief.topic}
              analysis={brief.internalAnalysis}
              ideas={brief.generatedIdeas}
              language={preferences.uiLanguage ?? 'fa'}
            />
            {brief.publisherIntelligence?.clusters.length ? (
              <Fold title="Publisher-only topic clusters" summary={brief.publisherIntelligence.clusters.length + ' clusters · ' + brief.publisherIntelligence.uniqueCount + ' unique reports'}>
                <Txt muted>Coverage and momentum are computed only from selected publisher RSS records. This is not audience demand, YouTube popularity or monetization.</Txt>
                {brief.publisherIntelligence.clusters.slice(0, 5).map((cluster) => (
                  <View key={cluster.id} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <SourceText>{cluster.title}</SourceText>
                      <Text style={styles.badge}>{cluster.publisherCoverageScore}/100 coverage</Text>
                    </View>
                    <Txt muted>{cluster.articleCount} stories · {cluster.publishers.length} publisher groups · {cluster.momentum}</Txt>
                    <Txt muted>{cluster.currentWindowCount} stories in the latest 7 days · {cluster.previousWindowCount} in the preceding 7 days</Txt>
                    {cluster.evidence.slice(0, 2).map((reference) => (
                      <Button key={reference.url} variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(reference.url).catch(() => {})}>
                        <Button.Label>{reference.sourceName + ': ' + reference.title + ' ↗'}</Button.Label>
                      </Button>
                    ))}
                  </View>
                ))}
              </Fold>
            ) : null}
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
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 12 }}>
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
              {brief.internalAnalysis.intelligence.sharedConcepts.length ? <Txt muted>{'Shared terms across publisher records: ' + brief.internalAnalysis.intelligence.sharedConcepts.join(', ')}</Txt> : null}
              {brief.internalAnalysis.intelligence.scenarios.map((scenario) => <Txt muted key={scenario}>{scenario}</Txt>)}
              {brief.internalAnalysis.intelligence.potentialContradictions.map((item) => <Txt muted key={item}>{'Potential discrepancy: ' + item}</Txt>)}
            </View>
            <Fold
              title={preferences.uiLanguage === 'fa' ? 'تحلیل چندپارادایمی موتور هوشمند' : 'Multi-paradigm engine analysis'}
              summary={brief.internalAnalysis.intelligence.paradigms.readinessLabel}
            >
              <Txt>{brief.internalAnalysis.intelligence.paradigms.synthesis}</Txt>
              {brief.internalAnalysis.intelligence.paradigms.lenses.map((item) => (
                <View key={item.id} style={{ gap: 4, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 9 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Heading>{item.title}</Heading>
                    <Text style={styles.badge}>{item.statusLabel}</Text>
                  </View>
                  <Txt muted>{item.summary}</Txt>
                  {item.findings.map((finding) => <Txt key={item.id + '-finding-' + finding}>{'• ' + finding}</Txt>)}
                  {item.caveats.map((caveat) => <Txt muted key={item.id + '-caveat-' + caveat}>{caveat}</Txt>)}
                </View>
              ))}
            </Fold>
          </Panel>
</Fold>          {brief.wiki && (
          <Fold title="5 · Wikimedia context" summary={brief.wiki.articleTitle}>            <Panel>
              <Heading>Public-interest context · Wikimedia</Heading>
              <SourceText>{brief.wiki.articleTitle}</SourceText>
              <SourceText muted>{brief.wiki.summary || 'No encyclopedia summary was returned.'}</SourceText>
              <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(brief.wiki!.articleUrl).catch(() => {})}>
                <Button.Label>Check the article and its references ↗</Button.Label>
              </Button>
            </Panel>
          </Fold>
          )}
          <Fold title="6 · Official publisher news" summary={brief.news.length + ' source-linked reports'}>          <Panel>
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
</Fold>          <Fold title="7 · Independent web research" summary={brief.webResults.length + ' search result(s)'}>
            <Panel>
              <Heading>Web and news search</Heading>
              {brief.webResults.length ? brief.webResults.map((item) => (
                <View key={item.id} style={{ gap: 5 }}>
                  <Text style={styles.badge}>{item.sourceName} · {item.category}</Text>
                  <SourceText>{item.title}</SourceText>
                  <Txt muted>{item.summary}</Txt>
                  <Button variant="tertiary" className="h-auto justify-start px-0" onPress={() => void Linking.openURL(item.url).catch(() => {})}>
                    <Button.Label>Open web source ↗</Button.Label>
                  </Button>
                </View>
              )) : <Txt muted>Firecrawl returned no usable results. The official publisher feeds and Wikimedia sources above remain available.</Txt>}
            </Panel>
</Fold>          <Fold title="8 · YouTube sample (separate API data)" summary={brief.videos.length + ' videos · source links retained'}>          <Panel>
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
</Fold>          <Fold title="9 · Production plan & verification" summary={brief.titleIdeas.length + ' title ideas · ' + brief.outline.length + ' story steps'}>          <Panel>
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
</Fold>          <Action busy={op.busy} onPress={saveToNotes}>Save full brief to Notes</Action>
          <Action secondary onPress={() => router.push('/notes')}>Open Notes workspace</Action>
        </>
      )}
      {Boolean(op.error) && <ErrorBox message={op.error} onRetry={run} />}
      {Boolean(op.message) && <Txt muted>{op.message}</Txt>}
    </Page>
  );
}
