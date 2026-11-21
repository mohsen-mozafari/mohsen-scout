/**
 * Engine v2 — a pure, synchronous, evidence-based analysis pipeline.
 *
 * Design constraints (Phase 0 audit):
 *  - No native/network/storage imports and no `Date.now()`/`Math.random()` in the
 *    analysis functions. A reference time is derived from the input or the data.
 *  - Every idea references real normalized evidence items; nothing is fabricated.
 *  - All signals are explainable and bounded, and all math is guarded for
 *    null/undefined/zero inputs.
 *
 * This module is intentionally self-contained. It reuses only the pure text
 * helpers from `lib/intelligence.ts` (normalization, tokenization, canonical URLs).
 */

import {
  canonicalizeResearchUrl,
  normalizeResearchText,
  tokenizeResearchText,
} from './intelligence';

// ---------------------------------------------------------------------------
// Public model
// ---------------------------------------------------------------------------

export type EvidenceSource = 'news' | 'youtube' | 'wikimedia';

export interface EvidenceItem {
  id: string;
  source: EvidenceSource;
  title: string;
  /** Normalized (lower-cased, Persian-aware) searchable text. */
  text: string;
  /** Publication time in milliseconds; 0 means unknown. */
  publishedAt: number;
  /** Typically 'fa' or 'en'; any string is accepted for other languages. */
  language: string;
  url?: string;
  channelId?: string;
  channelTitle?: string;
  channelSubscribers?: number;
  channelVideoCount?: number;
  views?: number;
  likes?: number;
  comments?: number;
  tags?: string[];
  /** Search bucket label (e.g. a YouTube query) retained from the source. */
  bucket?: string;
  raw?: unknown;
}

export interface SourceCoverage {
  source: EvidenceSource;
  fetched: number;
  normalized: number;
  deduped: number;
}

export interface NormalizationResult {
  items: EvidenceItem[];
  /** Raw records that could not be turned into an EvidenceItem. */
  dropped: number;
  stats: SourceCoverage[];
}

/**
 * Deliberately loose structural input. Existing news items, YouTube sample
 * videos, saved videos and Wikimedia signals can be passed directly without
 * casting. Unknown extra properties are tolerated.
 */
export interface RawEvidenceInput {
  source?: string;
  provider?: string;
  id?: string;
  videoId?: string;
  title?: string;
  articleTitle?: string;
  text?: string;
  summary?: string;
  description?: string;
  extract?: string;
  sourceName?: string;
  sourceId?: string;
  sourceUrl?: string;
  url?: string;
  articleUrl?: string;
  link?: string;
  publishedAt?: string | number | null;
  published?: string | number | null;
  language?: string;
  lang?: string;
  channel?: string;
  channelTitle?: string;
  channelId?: string;
  subscriberCount?: number | string | null;
  subscribers?: number | string | null;
  channelSubscriberCount?: number | string | null;
  channelVideoCount?: number | string | null;
  videoCount?: number | string | null;
  viewCount?: number | string | null;
  views?: number | string | null;
  likeCount?: number | string | null;
  likes?: number | string | null;
  commentCount?: number | string | null;
  comments?: number | string | null;
  tags?: readonly string[] | string;
  query?: string;
  bucket?: string;
  searchBucket?: string;
  monthlyViews?: readonly { month: string; views: number }[];
  raw?: unknown;
  [key: string]: unknown;
}

export interface FeatureContext {
  /** Reference time in milliseconds; never read from a global clock. */
  now: number;
  /** channelId -> median lifetime views observed for that channel. */
  channelMedianViews?: Readonly<Record<string, number>>;
  /** Alternative to channelMedianViews: raw per-channel view observations. */
  channelHistory?: Readonly<Record<string, readonly number[]>>;
  language?: string;
  timezoneOffsetMinutes?: number;
}

export interface TitlePattern {
  hasNumber: boolean;
  isQuestion: boolean;
  curiosityGap: boolean;
  hasPowerWord: boolean;
}

export interface ItemFeatures {
  viewsPerHour: number;
  /** (likes + comments) / views, clamped to 0..1. */
  engagementRate: number;
  /** 0..1, 0.5 is the neutral value when no channel history exists. */
  outlierScore: number;
  /** 0..1 age-based decay. */
  freshness: number;
  titlePattern: TitlePattern;
  /** views / channel subscribers, 0 when either value is unavailable. */
  channelToViewRatio: number;
  /** Short, bounded explanation derived from the actual numbers. */
  explanation: string;
}

export interface Topic {
  id: string;
  label: string;
  keywords: string[];
  itemIds: string[];
  newsCount: number;
  videoCount: number;
  /** Share of dated items published in the recent window (0..1). */
  momentum: number;
  /** Mean item outlier score (0..1, 0.5 neutral). */
  avgOutlier: number;
  /** News demand vs video supply, 0.5 = balanced (0..1). */
  supplyGap: number;
}

export type ScoreComponentName =
  | 'baseline'
  | 'momentum'
  | 'avgOutlier'
  | 'supplyGap'
  | 'freshness'
  | 'newsRecency'
  | 'competition';

export type ScoreWeights = Record<ScoreComponentName, number>;

/**
 * Positive weights sum to 1.0. `baseline` keeps the linear combination in
 * 0..100; `competition` is negative so it is subtracted. Tunable per call.
 */
export const DEFAULT_WEIGHTS: Readonly<ScoreWeights> = Object.freeze({
  baseline: 0.2,
  momentum: 0.2,
  avgOutlier: 0.16,
  supplyGap: 0.16,
  freshness: 0.14,
  newsRecency: 0.14,
  competition: -0.2,
});

/** Explicit RPM assumptions by niche (USD per 1000 monetized views). */
export const NICHE_RPM_USD: Readonly<Record<string, number>> = Object.freeze({
  'space-science': 3.2,
  science: 3.0,
  technology: 4.1,
  education: 2.4,
  general: 2.0,
});

/** Minimum number of real evidence items required to emit a full idea. */
export const MIN_EVIDENCE = 3;

export interface ScoreComponent {
  name: ScoreComponentName;
  /** Normalized 0..100 value of this component. */
  value: number;
  weight: number;
  /** value * weight (negative for competition). */
  contribution: number;
  evidence: string;
}

export interface RevenueEstimate {
  low: number;
  high: number;
  rpm: number;
  basis: string;
  label: 'estimate';
}

export interface OpportunityScore {
  topicId: string;
  /** 0..100. */
  value: number;
  /** 0..1, lower when evidence is sparse. */
  confidence: number;
  components: ScoreComponent[];
  why: string;
  risk: 'low' | 'medium' | 'high';
  estRevenue: RevenueEstimate;
}

export interface ScoringContext {
  items?: readonly EvidenceItem[];
  itemsById?: ReadonlyMap<string, EvidenceItem>;
  features?: ReadonlyMap<string, ItemFeatures>;
  now?: number;
  niche?: string;
  language?: string;
  weights?: Partial<ScoreWeights>;
}

export interface IdeaEvidenceRef {
  id: string;
  title: string;
  url?: string;
  views?: number;
  source: EvidenceSource;
}

export interface IdeaNewsRef {
  id: string;
  title: string;
  url?: string;
}

export interface GeneratedIdea {
  id: string;
  topicId: string;
  titleSuggestion: string;
  angle: string;
  evidence: IdeaEvidenceRef[];
  supportingNews: IdeaNewsRef[];
  why: string;
  score: OpportunityScore;
  risk: OpportunityScore['risk'];
  bestTimeToPublish: string;
  confidence: number;
  /** False with an explicit message when real evidence is insufficient. */
  dataSufficient: boolean;
  message?: string;
}

export interface IdeaInput {
  topics: readonly Topic[];
  scores: readonly OpportunityScore[];
  items: readonly EvidenceItem[];
  features?: ReadonlyMap<string, ItemFeatures>;
  now?: number;
  language?: string;
  timezoneOffsetMinutes?: number;
}

export interface EngineV2Input {
  evidence: readonly RawEvidenceInput[];
  now?: number;
  niche?: string;
  language?: string;
  timezoneOffsetMinutes?: number;
  channelMedianViews?: Readonly<Record<string, number>>;
  channelHistory?: Readonly<Record<string, readonly number[]>>;
}

export interface EngineV2Options {
  budgetMs?: number;
  weights?: Partial<ScoreWeights>;
  maxTopics?: number;
  ideaLimit?: number;
  /** Injectable monotonic clock, primarily for deterministic budget tests. */
  clock?: () => number;
  /** Last good result; returned (flagged as fallback) on failure. */
  previous?: EngineV2Result;
}

export interface StageTiming {
  stage: string;
  ms: number;
}

export interface EngineV2Result {
  items: EvidenceItem[];
  features: Map<string, ItemFeatures>;
  topics: Topic[];
  scores: OpportunityScore[];
  ideas: GeneratedIdea[];
  coverage: SourceCoverage[];
  dropped: number;
  timings: StageTiming[];
  warnings: string[];
  fallback: boolean;
  now: number;
}

// ---------------------------------------------------------------------------
// Internal constants & numeric helpers
// ---------------------------------------------------------------------------

const SOURCES: readonly EvidenceSource[] = ['news', 'youtube', 'wikimedia'];
const DEFAULT_BUDGET_MS = 1500;
const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_TITLE_CHARS = 240;
const MAX_TEXT_CHARS = 2000;
const NEAR_TITLE_JACCARD = 0.9;
const NEAR_TEXT_JACCARD = 0.86;
const TOPIC_SIMILARITY = 0.18;
const POWER_WORDS: readonly string[] = [
  'breaking', 'exclusive', 'shocking', 'urgent', 'first', 'major', 'record',
  'revealed', 'confirmed', 'critical', 'fوری', 'فوری', 'ویژه', 'انحصاری',
  'شگفت', 'نخستین', 'تازه', 'مهم',
];
const NOISE_PATTERN =
  /\b(?:read more|share this|share on|follow us|subscribe|advertisement|sponsored|all rights reserved|cookie policy|sign up|click here|watch more|related videos)\b/gi;

function round(value: number, digits = 3): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function safePositive(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function parseTimestamp(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (/^\d{10,13}$/.test(trimmed)) {
      const numeric = Number(trimmed);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toCount(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value.replace(/,/g, ''));
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
  }
  return undefined;
}

function stripHtml(value: string): string {
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, ' and ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Persian-aware display normalization that keeps case and punctuation. */
function normalizeDisplayText(value: string): string {
  return stripHtml(value)
    .normalize('NFKC')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u200B-\u200F\uFEFF\u200C]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeNoise(value: string): string {
  return value.replace(NOISE_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function pushIndex(index: Map<string, number[]>, token: string, value: number): void {
  const posting = index.get(token);
  if (posting) posting.push(value);
  else index.set(token, [value]);
}

function findNearDuplicate(
  tokens: ReadonlySet<string>,
  index: ReadonlyMap<string, number[]>,
  sets: readonly ReadonlySet<string>[],
  threshold: number,
  minTokens: number,
): number {
  if (tokens.size < minTokens) return -1;
  // Only tokens that already have postings can yield candidates. Probing an
  // unseen token first would silently miss a near-duplicate of an earlier item.
  const ranked = [...tokens]
    .filter((token) => (index.get(token)?.length ?? 0) > 0)
    .sort((left, right) =>
      (index.get(left)?.length ?? 0) - (index.get(right)?.length ?? 0) ||
      left.localeCompare(right));
  const candidates = new Set<number>();
  for (const token of ranked.slice(0, 4)) {
    for (const candidate of index.get(token) ?? []) candidates.add(candidate);
    if (candidates.size > 120) break;
  }
  let best = -1;
  let bestSimilarity = 0;
  for (const candidate of candidates) {
    if (candidate >= sets.length) continue;
    const similarity = jaccard(tokens, sets[candidate]);
    if (similarity >= threshold && similarity > bestSimilarity) {
      bestSimilarity = similarity;
      best = candidate;
    }
  }
  return best;
}

function emptyCoverage(): SourceCoverage[] {
  return SOURCES.map((source) => ({ source, fetched: 0, normalized: 0, deduped: 0 }));
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

function inferSource(raw: RawEvidenceInput): EvidenceSource {
  const hint = typeof raw.source === 'string' ? raw.source.toLowerCase() : '';
  if (hint === 'youtube' || hint === 'video') return 'youtube';
  if (hint === 'wiki' || hint === 'wikimedia') return 'wikimedia';
  if (hint === 'news') return 'news';
  const provider = typeof raw.provider === 'string' ? raw.provider.toLowerCase() : '';
  if (provider.includes('wikimedia') || raw.monthlyViews != null || raw.articleTitle != null) {
    return 'wikimedia';
  }
  const hasVideoSignal = raw.channel != null || raw.channelId != null ||
    raw.channelTitle != null || raw.viewCount != null || raw.views != null ||
    raw.likeCount != null || raw.channelSubscriberCount != null || raw.videoId != null;
  return hasVideoSignal ? 'youtube' : 'news';
}

function detectLanguage(title: string, text: string, raw: RawEvidenceInput): string {
  const declared = typeof raw.language === 'string' ? raw.language.trim().toLowerCase()
    : typeof raw.lang === 'string' ? raw.lang.trim().toLowerCase() : '';
  if (declared) return declared.slice(0, 16);
  return /[\u0600-\u06FF]/.test(title + ' ' + text) ? 'fa' : 'en';
}

function buildEvidenceItem(raw: RawEvidenceInput, source: EvidenceSource): EvidenceItem | null {
  const titleSource = typeof raw.title === 'string' ? raw.title
    : typeof raw.articleTitle === 'string' ? raw.articleTitle : '';
  const textParts: string[] = [];
  for (const part of [raw.text, raw.summary, raw.description, raw.extract]) {
    if (typeof part === 'string' && part.trim()) textParts.push(part);
  }
  if (source === 'wikimedia' && Array.isArray(raw.monthlyViews) && raw.monthlyViews.length) {
    const latest = raw.monthlyViews[raw.monthlyViews.length - 1];
    if (latest && typeof latest.month === 'string') {
      textParts.push('Wikipedia article ' + latest.month + ' pageviews ' + latest.views);
    }
  }
  const rawTitle = normalizeDisplayText(titleSource).slice(0, MAX_TITLE_CHARS);
  const rawText = removeNoise(normalizeDisplayText(textParts.join(' '))).slice(0, MAX_TEXT_CHARS);
  const title = rawTitle || (rawText ? rawText.slice(0, 80) : '');
  if (!title && !rawText) return null;

  const normalizedText = normalizeResearchText(rawText || title).slice(0, MAX_TEXT_CHARS);
  const url = typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim()
    : typeof raw.sourceUrl === 'string' && raw.sourceUrl.trim() ? raw.sourceUrl.trim()
      : typeof raw.articleUrl === 'string' && raw.articleUrl.trim() ? raw.articleUrl.trim()
        : typeof raw.link === 'string' && raw.link.trim() ? raw.link.trim() : undefined;

  const item: EvidenceItem = {
    id: '',
    source,
    title,
    text: normalizedText,
    publishedAt: parseTimestamp(raw.publishedAt ?? raw.published),
    language: detectLanguage(title, normalizedText, raw),
  };
  if (url) item.url = url;
  const channelTitle = typeof raw.channelTitle === 'string' ? raw.channelTitle
    : typeof raw.channel === 'string' ? raw.channel : undefined;
  if (channelTitle) item.channelTitle = channelTitle;
  const channelId = typeof raw.channelId === 'string' ? raw.channelId.trim() : '';
  if (channelId) item.channelId = channelId;
  const subscribers = toCount(raw.channelSubscriberCount ?? raw.subscriberCount ?? raw.subscribers);
  if (subscribers !== undefined) item.channelSubscribers = subscribers;
  const channelVideos = toCount(raw.channelVideoCount ?? raw.videoCount);
  if (channelVideos !== undefined) item.channelVideoCount = channelVideos;
  const views = toCount(raw.viewCount ?? raw.views);
  if (views !== undefined) item.views = views;
  const likes = toCount(raw.likeCount ?? raw.likes);
  if (likes !== undefined) item.likes = likes;
  const comments = toCount(raw.commentCount ?? raw.comments);
  if (comments !== undefined) item.comments = comments;
  if (Array.isArray(raw.tags)) {
    const tags = raw.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())).slice(0, 20);
    if (tags.length) item.tags = tags;
  } else if (typeof raw.tags === 'string' && raw.tags.trim()) {
    item.tags = raw.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20);
  }
  const bucket = typeof raw.bucket === 'string' && raw.bucket.trim() ? raw.bucket.trim()
    : typeof raw.query === 'string' && raw.query.trim() ? raw.query.trim()
      : typeof raw.searchBucket === 'string' && raw.searchBucket.trim() ? raw.searchBucket.trim() : undefined;
  if (bucket) item.bucket = bucket;
  item.raw = raw.raw ?? raw;
  return item;
}

export function normalizeEvidence(input: readonly RawEvidenceInput[]): NormalizationResult {
  const items: EvidenceItem[] = [];
  const fetched: Record<EvidenceSource, number> = { news: 0, youtube: 0, wikimedia: 0 };
  const normalizedCounts: Record<EvidenceSource, number> = { news: 0, youtube: 0, wikimedia: 0 };
  const dedupedCounts: Record<EvidenceSource, number> = { news: 0, youtube: 0, wikimedia: 0 };
  const usedIds = new Set<string>();
  const urlIndex = new Map<string, number>();
  const exactTitleIndex = new Map<string, number>();
  const titleTokenIndex = new Map<string, number[]>();
  const titleTokenSets: ReadonlySet<string>[] = [];
  const textTokenIndex = new Map<string, number[]>();
  const textTokenSets: ReadonlySet<string>[] = [];
  let dropped = 0;

  const entries: readonly unknown[] = Array.isArray(input) ? input : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      dropped += 1;
      continue;
    }
    const raw = entry as RawEvidenceInput;
    const source = inferSource(raw);
    fetched[source] += 1;
    const item = buildEvidenceItem(raw, source);
    if (!item) {
      dropped += 1;
      continue;
    }
    normalizedCounts[source] += 1;

    const canonicalUrl = canonicalizeResearchUrl(item.url);
    const normalizedTitle = normalizeResearchText(item.title);
    const titleTokens = new Set(tokenizeResearchText(item.title));
    const textTokens = new Set(tokenizeResearchText(item.text));
    let duplicateIndex = -1;
    if (canonicalUrl) {
      const byUrl = urlIndex.get(canonicalUrl);
      if (byUrl !== undefined) duplicateIndex = byUrl;
    }
    if (duplicateIndex < 0 && normalizedTitle) {
      const byTitle = exactTitleIndex.get(normalizedTitle);
      if (byTitle !== undefined) duplicateIndex = byTitle;
    }
    if (duplicateIndex < 0) {
      duplicateIndex = findNearDuplicate(titleTokens, titleTokenIndex, titleTokenSets, NEAR_TITLE_JACCARD, 3);
    }
    if (duplicateIndex < 0) {
      duplicateIndex = findNearDuplicate(textTokens, textTokenIndex, textTokenSets, NEAR_TEXT_JACCARD, 6);
    }
    if (duplicateIndex >= 0) {
      dedupedCounts[source] += 1;
      continue;
    }

    const declaredId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    let id = source + ':' + (declaredId || hashText(source + '|' + (canonicalUrl || normalizedTitle || item.text.slice(0, 120))));
    if (usedIds.has(id)) id += ':' + hashText(normalizedTitle + '|' + item.text.slice(0, 120));
    usedIds.add(id);
    item.id = id;
    const index = items.length;
    items.push(item);
    if (canonicalUrl) urlIndex.set(canonicalUrl, index);
    if (normalizedTitle) exactTitleIndex.set(normalizedTitle, index);
    for (const token of titleTokens) pushIndex(titleTokenIndex, token, index);
    titleTokenSets.push(titleTokens);
    textTokenSets.push(textTokens);
    const anchors = [...textTokens]
      .sort((left, right) =>
        (textTokenIndex.get(left)?.length ?? 0) - (textTokenIndex.get(right)?.length ?? 0) ||
        left.localeCompare(right))
      .slice(0, 5);
    for (const token of anchors) pushIndex(textTokenIndex, token, index);
  }

  const stats: SourceCoverage[] = SOURCES.map((source) => ({
    source,
    fetched: fetched[source],
    normalized: normalizedCounts[source],
    deduped: dedupedCounts[source],
  }));
  return { items, dropped, stats };
}

// ---------------------------------------------------------------------------
// FeatureExtractor
// ---------------------------------------------------------------------------

function channelMedian(item: EvidenceItem, ctx: FeatureContext): number | undefined {
  if (!item.channelId) return undefined;
  const explicit = ctx.channelMedianViews?.[item.channelId];
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) return explicit;
  const history = ctx.channelHistory?.[item.channelId];
  if (history?.length) {
    const computed = median(history.filter((value) => Number.isFinite(value) && value >= 0));
    if (computed != null && computed > 0) return computed;
  }
  return undefined;
}

function titlePattern(title: string): TitlePattern {
  const lower = title.toLocaleLowerCase();
  return {
    hasNumber: /\d/.test(title),
    isQuestion: /[?؟]\s*$/.test(title) ||
      /^(why|how|what|when|who|which|چرا|چگونه|چی|آیا|کی)\b/.test(lower),
    curiosityGap: /[:：—–…]|\.\.\./.test(title) ||
      /\b(revealed|secret|truth|shocking|this is why|راز|حقیقت|پشت پرده)\b/.test(lower),
    hasPowerWord: POWER_WORDS.some((word) => lower.includes(word)),
  };
}

export function extractFeatures(item: EvidenceItem, ctx: FeatureContext): ItemFeatures {
  const now = typeof ctx.now === 'number' && Number.isFinite(ctx.now) ? ctx.now : 0;
  const ageMs = item.publishedAt > 0 ? now - item.publishedAt : 0;
  const ageDays = ageMs / 86400000;
  const views = safePositive(item.views);
  const likes = safePositive(item.likes);
  const comments = safePositive(item.comments);

  let viewsPerHour = 0;
  if (item.publishedAt > 0 && ageMs > 0 && views > 0) {
    viewsPerHour = round(views / Math.max(1, ageMs / 3600000), 3);
  }
  const engagementRate = views > 0 ? round(Math.min(1, (likes + comments) / views), 4) : 0;
  const freshness = item.publishedAt > 0 && ageMs >= 0
    ? round(1 / (1 + ageDays / 14), 3) : 0;

  const referenceMedian = channelMedian(item, ctx);
  let outlierScore = 0.5;
  let outlierNote = 'no channel median (neutral default)';
  if (views > 0 && referenceMedian != null && referenceMedian > 0) {
    const ratio = Math.max(views / referenceMedian, 1e-6);
    const log2Ratio = Math.log(ratio) / Math.LN2;
    outlierScore = round(0.5 + Math.max(-0.5, Math.min(0.5, log2Ratio / 6)), 3);
    outlierNote = 'views ' + views + ' vs channel median ' + round(referenceMedian, 1);
  }

  const subscribers = safePositive(item.channelSubscribers);
  const channelToViewRatio = views > 0 && subscribers > 0 ? round(views / subscribers, 4) : 0;

  const explanation = [
    'views=' + views,
    item.publishedAt > 0 ? 'age=' + round(ageDays, 1) + 'd' : 'undated',
    'outlier=' + outlierScore.toFixed(2) + ' (' + outlierNote + ')',
    'freshness=' + freshness.toFixed(2),
  ].join('; ').slice(0, 220);

  return {
    viewsPerHour,
    engagementRate,
    outlierScore,
    freshness,
    titlePattern: titlePattern(item.title),
    channelToViewRatio,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// TopicEngine
// ---------------------------------------------------------------------------

interface TopicCluster {
  /** Running term sums, updated incrementally so assignment stays O(vocabulary). */
  sums: Map<string, number>;
  centroid: Map<string, number>;
  itemIndexes: number[];
}

function cosine(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [key, value] of small) {
    const other = large.get(key);
    if (other !== undefined) dot += value * other;
  }
  return dot;
}

function recomputeCentroid(cluster: TopicCluster): void {
  const divisor = Math.max(1, cluster.itemIndexes.length);
  const entries = [...cluster.sums.entries()]
    .map(([key, value]): [string, number] => [key, value / divisor])
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12);
  const norm = Math.sqrt(entries.reduce((sum, [, value]) => sum + value * value, 0)) || 1;
  cluster.centroid = new Map<string, number>(
    entries.map(([key, value]): [string, number] => [key, value / norm]),
  );
}

function docKeyphrases(item: EvidenceItem): string[] {
  const tokens = tokenizeResearchText(item.title + ' ' + item.text).slice(0, 60);
  const phrases: string[] = [];
  for (let index = 0; index < tokens.length && phrases.length < 70; index += 1) {
    phrases.push(tokens[index]);
    if (index + 1 < tokens.length && phrases.length < 70) {
      phrases.push(tokens[index] + ' ' + tokens[index + 1]);
    }
  }
  return phrases;
}

function resolveTopicNow(items: readonly EvidenceItem[], requested?: number): number {
  if (typeof requested === 'number' && Number.isFinite(requested) && requested > 0) return requested;
  let latest = 0;
  for (const item of items) if (item.publishedAt > latest) latest = item.publishedAt;
  return latest;
}

export interface BuildTopicsOptions {
  maxTopics?: number;
  /** Optional reference time; defaults to the newest item publication time. */
  now?: number;
}

export function buildTopics(
  items: readonly EvidenceItem[],
  features: ReadonlyMap<string, ItemFeatures>,
  opts: BuildTopicsOptions = {},
): Topic[] {
  if (!items.length) return [];
  const maxTopics = Math.max(1, Math.min(48, Math.floor(safePositive(opts.maxTopics) || 12)));
  const referenceNow = resolveTopicNow(items, opts.now);

  const phraseCounts: Map<string, number>[] = [];
  const documentFrequency = new Map<string, number>();
  const corpusFrequency = new Map<string, number>();
  for (const item of items) {
    const counts = new Map<string, number>();
    for (const phrase of docKeyphrases(item)) {
      counts.set(phrase, Math.min(5, (counts.get(phrase) ?? 0) + 1));
    }
    phraseCounts.push(counts);
    for (const phrase of counts.keys()) {
      documentFrequency.set(phrase, (documentFrequency.get(phrase) ?? 0) + 1);
      corpusFrequency.set(phrase, (corpusFrequency.get(phrase) ?? 0) + 1);
    }
  }

  const vocabulary = new Set(
    [...corpusFrequency.entries()]
      .sort((left, right) =>
        (right[1] * Math.sqrt(documentFrequency.get(right[0]) ?? 0)) -
        (left[1] * Math.sqrt(documentFrequency.get(left[0]) ?? 0)) ||
        left[0].localeCompare(right[0]))
      .slice(0, 400)
      .map(([phrase]) => phrase),
  );

  const documentCount = Math.max(1, items.length);
  const vectors: Map<string, number>[] = [];
  for (const counts of phraseCounts) {
    const entries: [string, number][] = [];
    for (const [phrase, count] of counts) {
      if (!vocabulary.has(phrase)) continue;
      const idf = Math.log(1 + documentCount / (1 + (documentFrequency.get(phrase) ?? 0)));
      entries.push([phrase, (1 + Math.log(count)) * idf]);
    }
    entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    const top = entries.slice(0, 12);
    const norm = Math.sqrt(top.reduce((sum, [, weight]) => sum + weight * weight, 0)) || 1;
    vectors.push(new Map<string, number>(
      top.map(([phrase, weight]): [string, number] => [phrase, weight / norm]),
    ));
  }

  const clusters: TopicCluster[] = [];
  for (let index = 0; index < items.length; index += 1) {
    let best = -1;
    let bestSimilarity = 0;
    for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex += 1) {
      const similarity = cosine(vectors[index], clusters[clusterIndex].centroid);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        best = clusterIndex;
      }
    }
    if (best >= 0 && (bestSimilarity >= TOPIC_SIMILARITY || clusters.length >= maxTopics)) {
      const cluster = clusters[best];
      for (const [key, value] of vectors[index]) {
        cluster.sums.set(key, (cluster.sums.get(key) ?? 0) + value);
      }
      cluster.itemIndexes.push(index);
      recomputeCentroid(cluster);
    } else {
      const centroid = new Map(vectors[index]);
      clusters.push({ sums: new Map(vectors[index]), centroid, itemIndexes: [index] });
    }
  }

  const topics: Topic[] = clusters.map((cluster) => {
    const itemIds = cluster.itemIndexes.map((index) => items[index].id);
    const topicItems = cluster.itemIndexes.map((index) => items[index]);
    const newsCount = topicItems.filter((item) => item.source === 'news').length;
    const videoCount = topicItems.filter((item) => item.source === 'youtube').length;
    const keywords = [...cluster.centroid.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 8)
      .map(([phrase]) => phrase);
    let recent = 0;
    let older = 0;
    for (const item of topicItems) {
      if (item.publishedAt <= 0 || referenceNow <= 0) continue;
      if (item.publishedAt <= referenceNow && referenceNow - item.publishedAt <= RECENT_WINDOW_MS) {
        recent += 1;
      } else if (item.publishedAt > referenceNow || referenceNow - item.publishedAt > RECENT_WINDOW_MS) {
        older += 1;
      }
    }
    const dated = recent + older;
    const outlierValues = itemIds
      .map((id) => features.get(id)?.outlierScore)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const supplyBase = newsCount + videoCount;
    return {
      id: 'topic:' + hashText(itemIds.slice().sort().join('|')),
      label: keywords[0] ?? ('topic-' + hashText(itemIds.join('|')).slice(0, 6)),
      keywords,
      itemIds,
      newsCount,
      videoCount,
      momentum: dated ? round(recent / dated, 3) : 0,
      avgOutlier: round(mean(outlierValues.length ? outlierValues : [0.5]), 3),
      supplyGap: round(0.5 + 0.5 * ((newsCount - videoCount) / Math.max(1, supplyBase)), 3),
    };
  });

  return topics
    .sort((left, right) =>
      right.itemIds.length - left.itemIds.length ||
      right.avgOutlier - left.avgOutlier ||
      left.label.localeCompare(right.label) ||
      left.id.localeCompare(right.id))
    .slice(0, maxTopics);
}

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

function resolveRevenue(topicItems: readonly EvidenceItem[], ctx: ScoringContext): RevenueEstimate {
  const niche = typeof ctx.niche === 'string' && ctx.niche.trim() ? ctx.niche.trim().toLowerCase() : 'general';
  const rpm = NICHE_RPM_USD[niche] ?? NICHE_RPM_USD.general ?? 2;
  const observedViews = topicItems
    .filter((item) => item.source === 'youtube' && item.views != null && item.views > 0)
    .map((item) => item.views as number);
  const typicalViews = median(observedViews);
  if (typicalViews == null || typicalViews <= 0) {
    return {
      low: 0,
      high: 0,
      rpm: round(rpm, 2),
      basis: 'Insufficient observed video view counts for this topic, so no revenue estimate is produced; zeros are placeholders, not predictions. Assumptions: RPM table by niche, views must come from supplied evidence.',
      label: 'estimate',
    };
  }
  const baseline = (typicalViews * rpm) / 1000;
  return {
    low: round(baseline * 0.5, 2),
    high: round(baseline * 2, 2),
    rpm: round(rpm, 2),
    basis: 'Estimate only (not a forecast): assumes a future video reaches 50%-200% of the median observed sample views (' +
      round(typicalViews, 1) + ' across ' + observedViews.length + ' supplied video(s)), at an assumed ' +
      niche + ' RPM of $' + round(rpm, 2) + ' per 1000 monetized views.',
    label: 'estimate',
  };
}

function scoreConfidence(topic: Topic, topicItems: readonly EvidenceItem[], datedNews: number, videosWithViews: number): number {
  const distinctSources = new Set(topicItems.map((item) => item.source)).size;
  const confidence = 0.2 +
    0.2 * Math.min(1, topicItems.length / 8) +
    0.15 * Math.min(1, distinctSources / 2) +
    0.15 * Math.min(1, datedNews / 4) +
    0.15 * Math.min(1, videosWithViews / 3) +
    0.15 * Math.min(1, topic.newsCount / 3);
  return round(clamp01(confidence), 2);
}

export function scoreOpportunity(
  topic: Topic,
  ctx: ScoringContext,
  opts: { weights?: Partial<ScoreWeights> } = {},
): OpportunityScore {
  const byId: ReadonlyMap<string, EvidenceItem> = ctx.itemsById ??
    new Map<string, EvidenceItem>((ctx.items ?? []).map((item): [string, EvidenceItem] => [item.id, item]));
  const topicItems = topic.itemIds
    .map((id) => byId.get(id))
    .filter((item): item is EvidenceItem => Boolean(item));
  const features = ctx.features ?? new Map<string, ItemFeatures>();
  const now = typeof ctx.now === 'number' && Number.isFinite(ctx.now) && ctx.now > 0
    ? ctx.now : resolveTopicNow(topicItems);

  const freshnessValues = topic.itemIds
    .map((id) => features.get(id)?.freshness)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const avgFreshness = mean(freshnessValues);

  const newsItems = topicItems.filter((item) => item.source === 'news');
  const recencyValues = newsItems
    .filter((item) => item.publishedAt > 0 && now > 0)
    .map((item) => clamp01(1 - (now - item.publishedAt) / (30 * 86400000)));
  const newsRecency = mean(recencyValues);

  const videoItems = topicItems.filter((item) => item.source === 'youtube');
  const distinctChannels = new Set(videoItems
    .map((item) => item.channelId || item.channelTitle || '')
    .filter(Boolean)).size;
  const videoShare = videoItems.length / Math.max(1, newsItems.length + videoItems.length);
  const competition = clamp01(0.7 * videoShare + 0.3 * Math.min(1, distinctChannels / 5));
  const videosWithViews = videoItems.filter((item) => item.views != null && item.views > 0).length;

  const weights: ScoreWeights = { ...DEFAULT_WEIGHTS, ...(ctx.weights ?? {}), ...(opts.weights ?? {}) };
  const rawValues: Record<ScoreComponentName, number> = {
    baseline: 100,
    momentum: topic.momentum * 100,
    avgOutlier: topic.avgOutlier * 100,
    supplyGap: topic.supplyGap * 100,
    freshness: avgFreshness * 100,
    newsRecency: newsRecency * 100,
    competition: competition * 100,
  };
  const evidenceText: Record<ScoreComponentName, string> = {
    baseline: 'constant offset that keeps the weighted sum on a 0-100 scale',
    momentum: topic.momentum.toFixed(2) + ' of dated items are from the recent window',
    avgOutlier: 'mean item outlier ' + topic.avgOutlier.toFixed(2) + ' across ' + topic.itemIds.length + ' item(s)',
    supplyGap: topic.supplyGap.toFixed(2) + ' from ' + topic.newsCount + ' news vs ' + topic.videoCount + ' video item(s)',
    freshness: 'mean item freshness ' + avgFreshness.toFixed(2),
    newsRecency: newsItems.length ? 'mean news recency ' + newsRecency.toFixed(2) + ' across ' + newsItems.length + ' item(s)' : 'no news evidence',
    competition: 'video share ' + videoShare.toFixed(2) + ' across ' + distinctChannels + ' distinct channel(s)',
  };
  const order: readonly ScoreComponentName[] = [
    'baseline', 'momentum', 'avgOutlier', 'supplyGap', 'freshness', 'newsRecency', 'competition',
  ];
  const components: ScoreComponent[] = order.map((name) => {
    const value = round(clamp01(rawValues[name] / 100) * 100, 1);
    return {
      name,
      value,
      weight: weights[name],
      contribution: round(value * weights[name], 2),
      evidence: evidenceText[name],
    };
  });
  const value = Math.round(clamp01(components.reduce((sum, part) => sum + part.contribution, 0) / 100) * 100);
  const confidence = scoreConfidence(topic, topicItems, recencyValues.length, videosWithViews);

  const why = [
    'Score ' + value + '/100',
    'momentum ' + topic.momentum.toFixed(2),
    'supply gap ' + topic.supplyGap.toFixed(2),
    'competition ' + competition.toFixed(2),
    'from ' + topicItems.length + ' real evidence item(s)',
    'limited local sample, not a performance forecast',
  ].join('; ') + '.';

  const risk: OpportunityScore['risk'] =
    competition >= 0.65 || confidence < 0.35 || topic.supplyGap < 0.35 ? 'high'
      : competition >= 0.4 || confidence < 0.6 ? 'medium' : 'low';

  return {
    topicId: topic.id,
    value,
    confidence,
    components,
    why,
    risk,
    estRevenue: resolveRevenue(topicItems, ctx),
  };
}

// ---------------------------------------------------------------------------
// IdeaGenerator
// ---------------------------------------------------------------------------

function suggestTitle(topic: Topic, topItem: EvidenceItem, pattern: TitlePattern | undefined): string {
  const label = topic.label.slice(0, 90);
  const suffix = pattern?.isQuestion ? 'answering the open question in the latest reports'
    : pattern?.hasNumber ? 'what the numbers in the latest reports actually show'
      : pattern?.curiosityGap ? 'beyond the headline: what the sources establish'
        : 'what the supplied evidence actually establishes';
  const topicHint = topItem.title ? ' · grounded in “' + topItem.title.slice(0, 60) + '”' : '';
  return (label + ': ' + suffix + topicHint).slice(0, 200);
}

function suggestAngle(topic: Topic, score: OpportunityScore): string {
  const get = (name: ScoreComponentName): number =>
    score.components.find((part) => part.name === name)?.value ?? 0;
  if (get('supplyGap') >= 65 && get('newsRecency') >= 50) {
    return 'A timely explainer that fills the gap between recent reporting and the limited video examples in the sample.';
  }
  if (get('momentum') >= 60) {
    return 'Anchor the story to the newest dated reports and separate measured findings from interpretation.';
  }
  if (get('avgOutlier') >= 60) {
    return 'Compare the strongest observed examples against their channel norm and explain what the sample can and cannot show.';
  }
  return 'An evidence-first explainer that verifies each factual claim against the cited sources before adding interpretation.';
}

function publishingWindow(
  newsItems: readonly EvidenceItem[],
  timezoneOffsetMinutes: number,
): string {
  const datedHours = newsItems
    .filter((item) => item.publishedAt > 0)
    .map((item) => (new Date(item.publishedAt).getUTCHours() + timezoneOffsetMinutes / 60 + 48) % 24);
  if (!datedHours.length) {
    return 'No reliable publish window: no dated news evidence; validate manually before scheduling. Assumption: timing would follow source posting rhythm.';
  }
  const histogram = new Map<number, number>();
  for (const hour of datedHours) {
    const bucket = Math.floor(hour + 0.5) % 24;
    histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
  }
  const bestHour = [...histogram.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0][0];
  const sign = timezoneOffsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(timezoneOffsetMinutes);
  const zone = 'UTC' + sign + String(Math.floor(absolute / 60)).padStart(2, '0') + ':' +
    String(absolute % 60).padStart(2, '0');
  return 'Around ' + String(bestHour).padStart(2, '0') + ':00 local (' + zone +
    '), just after the most common sourcing hour. Assumption: this audience follows the cited sources\' posting rhythm; this is not a measured viewership peak.';
}

export function generateIdeas(input: IdeaInput, opts: { limit?: number } = {}): GeneratedIdea[] {
  const limit = Math.max(1, Math.min(25, Math.floor(safePositive(opts.limit) || 5)));
  const byId = new Map<string, EvidenceItem>(
    input.items.map((item): [string, EvidenceItem] => [item.id, item]),
  );
  const scoreByTopic = new Map<string, OpportunityScore>(
    input.scores.map((score): [string, OpportunityScore] => [score.topicId, score]),
  );
  const features = input.features ?? new Map<string, ItemFeatures>();
  const offset = typeof input.timezoneOffsetMinutes === 'number' && Number.isFinite(input.timezoneOffsetMinutes)
    ? input.timezoneOffsetMinutes : 0;
  const ordered = [...input.topics].sort((left, right) =>
    (scoreByTopic.get(right.id)?.value ?? -1) - (scoreByTopic.get(left.id)?.value ?? -1) ||
    left.id.localeCompare(right.id));

  const ideas: GeneratedIdea[] = [];
  for (const topic of ordered) {
    if (ideas.length >= limit) break;
    const score = scoreByTopic.get(topic.id);
    if (!score) continue;
    const topicItems = topic.itemIds
      .map((id) => byId.get(id))
      .filter((item): item is EvidenceItem => Boolean(item));
    const newsItems = topicItems.filter((item) => item.source === 'news');

    if (topicItems.length < MIN_EVIDENCE) {
      ideas.push({
        id: 'idea:' + hashText(topic.id + '|insufficient'),
        topicId: topic.id,
        titleSuggestion: 'Insufficient evidence — no idea generated',
        angle: 'Gather more real evidence before drafting an angle.',
        evidence: topicItems.map((item) => ({
          id: item.id, title: item.title, ...(item.url ? { url: item.url } : {}), source: item.source,
        })),
        supportingNews: newsItems.map((item) => ({
          id: item.id, title: item.title, ...(item.url ? { url: item.url } : {}),
        })),
        why: 'Only ' + topicItems.length + ' real evidence item(s) are linked to this topic; MIN_EVIDENCE is ' + MIN_EVIDENCE + '.',
        score,
        risk: score.risk,
        bestTimeToPublish: 'Not scheduled: insufficient evidence.',
        confidence: score.confidence,
        dataSufficient: false,
        message: 'Insufficient evidence: fewer than ' + MIN_EVIDENCE + ' real evidence items were linked to this topic. No title, viewpoint or reference was invented.',
      });
      continue;
    }

    const rank = (item: EvidenceItem): number => item.source === 'youtube' ? 2 : item.source === 'wikimedia' ? 1 : 0;
    const topItems = [...topicItems].sort((left, right) =>
      rank(right) - rank(left) ||
      safePositive(right.views) - safePositive(left.views) ||
      right.publishedAt - left.publishedAt ||
      left.id.localeCompare(right.id));
    const topItem = topItems[0];
    const pattern = features.get(topItem.id)?.titlePattern;
    const evidence: IdeaEvidenceRef[] = topItems.slice(0, 5).map((item) => ({
      id: item.id,
      title: item.title,
      ...(item.url ? { url: item.url } : {}),
      ...(item.views != null ? { views: item.views } : {}),
      source: item.source,
    }));
    const supportingNews: IdeaNewsRef[] = [...newsItems]
      .sort((left, right) => right.publishedAt - left.publishedAt || left.id.localeCompare(right.id))
      .slice(0, 4)
      .map((item) => ({ id: item.id, title: item.title, ...(item.url ? { url: item.url } : {}) }));
    const titleSuggestion = suggestTitle(topic, topItem, pattern);

    ideas.push({
      id: 'idea:' + hashText(topic.id + '|' + titleSuggestion),
      topicId: topic.id,
      titleSuggestion,
      angle: suggestAngle(topic, score),
      evidence,
      supportingNews,
      why: score.why + ' References ' + evidence.length + ' real item(s), including ' +
        newsItems.length + ' news item(s); no reference is fabricated.',
      score,
      risk: score.risk,
      bestTimeToPublish: publishingWindow(newsItems, offset),
      confidence: score.confidence,
      dataSufficient: true,
    });
  }
  return ideas;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function defaultClock(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof perf?.now === 'function' ? perf.now() : 0;
}

function resolveReferenceNow(now: number | undefined, evidence: readonly RawEvidenceInput[] | undefined): number {
  if (typeof now === 'number' && Number.isFinite(now) && now > 0) return now;
  let latest = 0;
  if (Array.isArray(evidence)) {
    for (const entry of evidence) {
      if (!entry || typeof entry !== 'object') continue;
      const parsed = parseTimestamp((entry as RawEvidenceInput).publishedAt ?? (entry as RawEvidenceInput).published);
      if (parsed > latest) latest = parsed;
    }
  }
  return latest;
}

function stageTiming(stage: string, started: number, clock: () => number): StageTiming {
  const ended = clock();
  const ms = Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, ended - started) : 0;
  return { stage, ms: round(ms, 3) };
}

export function runEngineV2(input: EngineV2Input, opts: EngineV2Options = {}): EngineV2Result {
  const clock = typeof opts.clock === 'function' ? opts.clock : defaultClock;
  const timings: StageTiming[] = [];
  const warnings: string[] = [];
  const requestedBudget = safePositive(opts.budgetMs);
  const budgetMs = requestedBudget > 0 ? requestedBudget : DEFAULT_BUDGET_MS;
  let now = 0;

  try {
    now = resolveReferenceNow(input?.now, input?.evidence);
    const runStarted = clock();
    const checkBudget = (): void => {
      if (clock() - runStarted > budgetMs) throw new Error('budget of ' + budgetMs + 'ms exceeded');
    };

    let started = clock();
    const normalized = normalizeEvidence(input?.evidence ?? []);
    timings.push(stageTiming('normalize', started, clock));
    checkBudget();

    started = clock();
    const featureContext: FeatureContext = {
      now,
      channelMedianViews: input?.channelMedianViews,
      channelHistory: input?.channelHistory,
      language: input?.language,
      timezoneOffsetMinutes: input?.timezoneOffsetMinutes,
    };
    const features = new Map<string, ItemFeatures>();
    for (const item of normalized.items) features.set(item.id, extractFeatures(item, featureContext));
    timings.push(stageTiming('features', started, clock));
    checkBudget();

    started = clock();
    const topics = buildTopics(normalized.items, features, { maxTopics: opts.maxTopics, now });
    timings.push(stageTiming('topics', started, clock));
    checkBudget();

    started = clock();
    const scoringContext: ScoringContext = {
      items: normalized.items,
      features,
      now,
      niche: input?.niche,
      language: input?.language,
      weights: opts.weights,
    };
    const scores = topics.map((topic) => scoreOpportunity(topic, scoringContext));
    timings.push(stageTiming('scoring', started, clock));
    checkBudget();

    started = clock();
    const ideas = generateIdeas({
      topics,
      scores,
      items: normalized.items,
      features,
      now,
      language: input?.language,
      timezoneOffsetMinutes: input?.timezoneOffsetMinutes,
    }, { limit: opts.ideaLimit });
    timings.push(stageTiming('ideas', started, clock));
    checkBudget();

    if (normalized.dropped > 0) {
      warnings.push(normalized.dropped + ' raw evidence record(s) were dropped as malformed.');
    }
    const duplicates = normalized.stats.reduce((sum, coverage) => sum + coverage.deduped, 0);
    if (duplicates > 0) warnings.push(duplicates + ' duplicate evidence record(s) were merged.');
    for (const coverage of normalized.stats) {
      if (coverage.fetched === 0) warnings.push('No ' + coverage.source + ' evidence was supplied.');
    }

    return {
      items: normalized.items,
      features,
      topics,
      scores,
      ideas,
      coverage: normalized.stats,
      dropped: normalized.dropped,
      timings,
      warnings,
      fallback: false,
      now,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push('Engine v2 stage failed: ' + message);
    if (opts.previous) {
      return {
        ...opts.previous,
        timings: [...(opts.previous.timings ?? []), { stage: 'fallback', ms: 0 }],
        warnings: [...(opts.previous.warnings ?? []), ...warnings],
        fallback: true,
      };
    }
    return {
      items: [],
      features: new Map<string, ItemFeatures>(),
      topics: [],
      scores: [],
      ideas: [],
      coverage: emptyCoverage(),
      dropped: 0,
      timings,
      warnings,
      fallback: true,
      now,
    };
  }
}
