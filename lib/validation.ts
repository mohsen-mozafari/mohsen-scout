import { z } from 'zod';
import { DEFAULT_CLOUDFLARE_FREE_MODEL, DEFAULT_SECOND_OPINION_ORDER, type LocalData, type SecondOpinionProvider, regions, statuses } from './types';
import type { RecordDomain } from './storage-records';

const id = z.string().min(1);
const text = z.string();
const time = z.number().finite().nonnegative();
const secondOpinionProviderSchema = z.enum(['gemini', 'xai', 'groq', 'cloudflare', 'openrouter'])
  .transform((provider): SecondOpinionProvider => provider === 'groq' ? 'xai' : provider);
export const inputSchema = z.object({
  topic: text,
  region: z.enum(regions),
  languages: z.array(text).min(1),
  days: z.number().int().nonnegative(),
  duration: z.enum(['any', 'short', 'medium', 'long']),
  category: text,
  maxResults: z.number().int().min(1).max(100),
});
export const researchDossierSchema = z.object({
  version: z.literal(1),
  updatedAt: time,
  provider: secondOpinionProviderSchema,
  model: text.max(160),
  hypotheses: z.array(z.object({
    id: id.max(90), claim: text.max(420), rationale: text.max(1400),
    status: z.enum(['supported', 'contested', 'insufficient-evidence']),
    confidence: z.enum(['low', 'moderate', 'high']),
    supportingEvidenceIds: z.array(text.max(120)).max(12),
    challengingEvidenceIds: z.array(text.max(120)).max(12),
    missingEvidence: z.array(text.max(280)).max(5),
    modelProposedStatus: z.enum(['supported', 'contested', 'insufficient-evidence']).optional(),
    supportingQuotes: z.array(z.object({
      evidenceId: text.max(120), quote: text.max(260), sourceName: text.max(160),
      sourceUrl: text.url(), publisherFamily: text.max(180), verification: z.literal('verbatim-checked'),
    })).max(8).optional(),
    challengingQuotes: z.array(z.object({
      evidenceId: text.max(120), quote: text.max(260), sourceName: text.max(160),
      sourceUrl: text.url(), publisherFamily: text.max(180), verification: z.literal('verbatim-checked'),
    })).max(8).optional(),
  })).max(6),
  evidenceReviews: z.array(z.object({
    evidenceId: text.max(120), role: z.enum(['supports', 'challenges', 'context', 'irrelevant']),
    credibility: z.enum(['high', 'medium', 'low', 'unknown']),
    sourceType: z.enum(['primary', 'secondary', 'opinion', 'unknown']), freshness: z.enum(['recent', 'old', 'unknown']),
    reason: text.max(500),
  })).max(48),
  nextQueries: z.array(z.object({
    query: text.max(220), purpose: z.enum(['independent-confirmation', 'counterevidence', 'mechanism', 'alternate-explanation', 'primary-source']),
    hypothesisId: text.max(90), priority: z.number().int().min(1).max(5), reason: text.max(320), searchedAt: time.optional(),
  })).max(4),
  completedQueries: z.array(z.object({
    query: text.max(220), purpose: z.enum(['independent-confirmation', 'counterevidence', 'mechanism', 'alternate-explanation', 'primary-source']),
    hypothesisId: text.max(90), priority: z.number().int().min(1).max(5), reason: text.max(320), searchedAt: time.optional(),
  })).max(40),
  contradictions: z.array(z.object({ description: text.max(500), evidenceIds: z.array(text.max(120)).max(8) })).max(8),
  gaps: z.array(text.max(420)).max(10), conclusion: text.max(1400),
  confidence: z.enum(['low', 'moderate', 'high']),
  provisionalConclusion: text.max(1400).optional(),
  stoppingReason: text.max(420),
  reviewedEvidenceCount: z.number().int().min(0).max(48).optional(),
  reviewStatus: z.enum(['pending-independent-review', 'partially-reviewed', 'independently-reviewed', 'review-unavailable']).optional(),
  reviewerProvider: secondOpinionProviderSchema.optional(),
  reviewerModel: text.max(160).optional(),
  fullTextEvidenceCount: z.number().int().min(0).max(48).optional(),
  summaryOnlyEvidenceCount: z.number().int().min(0).max(48).optional(),
  publisherFamilyCount: z.number().int().min(0).max(48).optional(),
  syndicatedItemCount: z.number().int().min(0).max(48).optional(),
  verifiedCitationCount: z.number().int().min(0).max(200).optional(),
});

const youtubeGrowth = z.object({
  snapshotCount: z.number().int().min(1).max(10000),
  deltaViews: z.number().finite().nullable(),
  viewsPerHour: z.number().finite().nonnegative().nullable(),
  viewsPerDay: z.number().finite().nonnegative().nullable(),
  channelBaselineViewsPerDay: z.number().finite().nonnegative().nullable(),
  channelOutlierRatio: z.number().finite().nonnegative().nullable(),
  measuredAt: time,
  status: z.enum(['insufficient-history', 'measured']),
});
const youtubeSnapshot = z.object({
  id, videoId: id, channelId: text.optional(), channel: text,
  capturedAt: time,
  viewCount: z.number().nonnegative().nullable(),
  likeCount: z.number().nonnegative().nullable(),
  commentCount: z.number().nonnegative().nullable(),
});
const video = z.object({
  id,
  title: text,
  description: text,
  channel: text,
  thumbnail: text,
  publishedAt: z.string().datetime(),
  fetchedAt: time,
  query: text,
  viewCount: z.number().nonnegative().nullable().optional(),
  likeCount: z.number().nonnegative().nullable().optional(),
  commentCount: z.number().nonnegative().nullable().optional(),
  channelId: text.optional(),
  growth: youtubeGrowth.optional(),
});
const schema = z.object({
  preferences: z.object({
    uiLanguage: z.enum(['fa', 'en']).optional().default('fa'),
    name: text,
    email: text,
    region: z.enum(regions),
    languages: z.array(text).min(1),
    defaultResearchDays: z.union([z.literal(0), z.literal(7), z.literal(30), z.literal(90)]).optional().default(30),
    budget: z.number().int().min(100).max(10000),
    model: text,
    hybridIntelligence: z.boolean().optional().default(false),
    webResearchEnabled: z.boolean().optional().default(true),
    automaticExternalReview: z.boolean().optional().default(true),
    secondOpinionProvider: secondOpinionProviderSchema.optional().default('gemini'),
    secondOpinionOrder: z.array(secondOpinionProviderSchema).min(1).max(4).optional().default(DEFAULT_SECOND_OPINION_ORDER),
    secondOpinionModels: z.object({ gemini: z.string().max(120).optional().default('gemini-3.8-flash'), xai: z.string().max(120).optional().default('grok-4.7'), cloudflare: z.string().max(160).optional().default(DEFAULT_CLOUDFLARE_FREE_MODEL), openrouter: z.string().max(160).optional().default('') }).optional().default({ gemini: 'gemini-3.8-flash', xai: 'grok-4.7', cloudflare: DEFAULT_CLOUDFLARE_FREE_MODEL, openrouter: '' }),
    openRouterUsageDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    openRouterRequestsToday: z.number().int().min(0).max(10000).optional(),
    openRouterDailyLimit: z.number().int().min(0).max(10000).optional(),
    openRouterDailyUsed: z.number().int().min(0).max(10000).optional(),
    openRouterDailyRemaining: z.number().int().min(0).max(10000).optional(),
    openRouterQuotaCheckedAt: time.optional(),
    youtubeRefreshTimestamps: z.array(time).max(5000).optional().default([]),
    schedule: z.enum(['Manual', 'Every 6 hours', 'Every 12 hours', 'Daily', 'Weekly']),
    paused: z.boolean(),
    lastInput: inputSchema.optional(),
    spaceNewsSources: z.array(z.enum(['nasa', 'jpl', 'cneos', 'esa-space', 'esa-science', 'space-com', 'phys-space', 'universe-today', 'sky-telescope'])).max(9).optional().default(['nasa', 'jpl', 'cneos', 'esa-space', 'esa-science', 'space-com', 'phys-space', 'universe-today', 'sky-telescope']),
    spaceNewsSourcesVersion: z.literal(2).optional().default(2),
    spaceInterestLanguage: z.enum(['en', 'fa', 'de', 'fr', 'es', 'ja']).optional().default('en'),
    selectedSpaceNiche: z.string().max(100).optional().default('all'),
    customSpaceNiche: z.string().max(160).optional().default(''),
  }),
  ideas: z.array(
    z.object({
      id,
      topic: text,
      concept: text,
      note: text,
      status: z.enum(statuses),
      decision: text,
      videoIds: z.array(text),
      createdAt: time,
      archived: z.boolean(),
      assessment: z.enum([
        'Strong Opportunity',
        'Promising',
        'Worth Exploring',
        'Uncertain',
        'Highly Competitive',
      ]),
      region: z.enum(regions),
      languages: z.array(text),
      reportId: text.optional(),
      imageUrl: text.url().optional(),
      sourceUrl: text.url().optional(),
      sourceName: text.optional(),
      engineGenerated: z.boolean().optional(),
      ideaCategory: text.max(80).optional(),
      generationKey: text.max(1200).optional(),
      engineScore: z.number().int().min(0).max(100).optional(),
      engineScoreReason: text.max(600).optional(),
      engineScoreBasis: z.literal('publisher-web-only-v2').optional(),
      evidenceSources: z.array(z.object({
        sourceType: z.enum(['publisher', 'web', 'encyclopedia']),
        sourceName: text.max(160),
        title: text.max(500),
        summary: text.max(1500).optional(),
        sourceUrl: text.url(),
        publishedAt: z.string().datetime().optional(),
      })).max(8).optional(),
    }),
  ),
  links: z.array(
    z.object({
      id,
      url: text,
      manualTitle: text,
      topic: text,
      note: text,
      folder: text,
      tags: z.array(text),
      savedAt: time,
    }),
  ),
  notes: z.array(
    z.object({
      id,
      title: text,
      folder: text,
      tags: z.array(text),
      blocks: z.array(
        z.object({
          id,
          type: z.enum([
            'heading',
            'paragraph',
            'bullet',
            'checklist',
            'link',
            'video',
            'opportunity',
          ]),
          text,
          checked: z.boolean().optional(),
        }),
      ),
      updatedAt: time,
      ideaId: text.optional(),
    }),
  ),
  opinions: z.array(z.object({ id, ideaId: text, text, model: text, createdAt: time })),
  reports: z.array(
    z.object({
      id,
      input: inputSchema,
      videos: z.array(video),
      queries: z.array(text),
      warnings: z.array(text),
      createdAt: time,
      analyzed: z.boolean(),
    }),
  ),
  videos: z.array(video),
  youtubeSnapshots: z.array(youtubeSnapshot).max(10000).optional().default([]),
  researchActivity: z.array(z.object({
    id: id.max(120),
    engine: z.enum(['YouTube Data API', 'Firecrawl Search', 'Publisher Feeds', 'Wikimedia', 'Internal Engine', 'AI Provider Review']),
    query: text.max(1600),
    topic: text.max(180),
    niche: text.max(180),
    startedAt: time,
    completedAt: time.optional(),
    durationMs: z.number().int().min(0).max(3600000).optional(),
    status: z.enum(['running', 'success', 'partial', 'empty', 'error', 'skipped']),
    resultCount: z.number().int().min(0).max(100000),
    analyzedCount: z.number().int().min(0).max(100000),
    results: z.array(z.object({
      id: text.max(1000),
      title: text.max(500),
      sourceName: text.max(160),
      url: text.url().optional(),
      summary: text.max(1200),
      publishedAt: z.string().datetime().optional(),
      relevanceScore: z.number().int().min(0).max(100),
      relevanceBand: z.enum(['high', 'medium', 'low']),
      sourceAssessment: z.enum(['configured-feed', 'not-assessed']),
      includedInAnalysis: z.boolean(),
      decisionReason: text.max(700),
      feedback: z.enum(['useful', 'irrelevant', 'duplicate', 'weak-source']).optional(),
    })).max(8),
    warnings: z.array(text.max(700)).max(12),
    error: text.max(700).optional(),
    reportId: id.optional(),
  })).max(400).optional().default([]),
  feedRegistry: z.array(z.object({
    sourceId: z.enum(['nasa', 'jpl', 'cneos', 'esa-space', 'esa-science', 'space-com', 'phys-space', 'universe-today', 'sky-telescope']),
    configuredUrl: text.url(),
    endpoint: text.url(),
    format: z.enum(['rss', 'atom', 'json', 'unknown']),
    status: z.enum(['healthy', 'stale', 'unavailable', 'unknown']),
    lastCheckedAt: time,
    lastSuccessAt: time,
    failureCount: z.number().int().min(0).max(10000),
    retryAt: time,
    lastError: text.max(1000),
    etag: text.max(500).optional(),
    lastModified: text.max(200).optional(),
    cachedItems: z.array(z.object({
      id: text.max(500),
      sourceId: z.enum(['nasa', 'jpl', 'cneos', 'esa-space', 'esa-science', 'space-com', 'phys-space', 'universe-today', 'sky-telescope']),
      sourceName: text.max(160),
      title: text.max(500),
      summary: text.max(4000),
      url: text.url(),
      publishedAt: z.string().datetime().nullable(),
      imageUrl: text.url().optional(),
    })).max(100),
  })).max(9).optional().default([]),
  researchMemory: z.array(z.object({
    topic: text.max(180),
    updatedAt: time,
    sources: z.array(z.object({
      sourceId: text.optional(),
      sourceName: text.max(160),
      title: text.max(500),
      sourceUrl: text.url().or(z.literal('')),
      publishedAt: z.string().datetime().nullable(),
    })),
    keyFindings: z.array(text.max(2000)).max(12),
    unresolvedQuestions: z.array(text.max(500)).max(12),
    contradictions: z.array(text.max(500)).max(8),
    confidence: z.enum(['low', 'moderate', 'high']),
    history: z.array(z.object({
      capturedAt: time,
      sourceFingerprint: text.max(64),
      sourceCount: z.number().int().min(0),
      newSourceCount: z.number().int().min(0),
      updatedSourceCount: z.number().int().min(0),
      keyFindings: z.array(text.max(2000)).max(8),
      unresolvedQuestions: z.array(text.max(500)).max(12),
      contradictions: z.array(text.max(500)).max(8),
      confidence: z.enum(['low', 'moderate', 'high']),
      changes: z.array(text.max(300)).max(4),
    })).optional().default([]),
    researchDossier: researchDossierSchema.optional(),
  })).optional().default([]),
  budget: z.object({
    date: text, units: z.number().nonnegative(), requests: z.number().int().nonnegative(), exhausted: z.boolean(),
    searchManualRequests: z.number().int().min(0).optional().default(0),
    searchAutomaticRequests: z.number().int().min(0).optional().default(0),
    searchReserveRequests: z.number().int().min(0).optional().default(0),
    searchExhausted: z.boolean().optional().default(false),
    otherExhausted: z.boolean().optional().default(false),
    otherManualUnits: z.number().nonnegative().optional().default(0),
    otherAutomaticUnits: z.number().nonnegative().optional().default(0),
    otherReserveUnits: z.number().nonnegative().optional().default(0),
  }),
});
export function validateLocal(raw: unknown): LocalData {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error('Saved data is unreadable. Import a valid personal backup.');
  return parsed.data;
}

export function validateLocalEntry<K extends keyof LocalData>(key: K, value: unknown): LocalData[K] {
  const parsed = schema.shape[key].safeParse(value);
  if (!parsed.success) throw new Error('Saved ' + String(key) + ' data is unreadable. Retry the last change.');
  return parsed.data as LocalData[K];
}

/** Validate a single SQLite record rather than parsing a potentially huge collection. */
export function validateLocalRecord(domain: RecordDomain, value: unknown): unknown {
  const parsed = schema.shape[domain].safeParse([value]);
  if (!parsed.success) throw new Error('Saved ' + domain + ' record is unreadable. Retry the last change.');
  return (parsed.data as unknown[])[0];
}
