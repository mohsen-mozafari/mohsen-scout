import { z } from 'zod';
import { type LocalData, regions, statuses } from './types';
const id = z.string().min(1);
const text = z.string();
const time = z.number().finite().nonnegative();
export const inputSchema = z.object({
  topic: text,
  region: z.enum(regions),
  languages: z.array(text).min(1),
  days: z.number().int().nonnegative(),
  duration: z.enum(['any', 'short', 'medium', 'long']),
  category: text,
  maxResults: z.number().int().min(1).max(100),
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
    schedule: z.enum(['Manual', 'Every 12 hours', 'Daily', 'Weekly']),
    paused: z.boolean(),
    lastInput: inputSchema.optional(),
    spaceNewsSources: z.array(z.enum(['nasa', 'jpl', 'esa-space', 'esa-science'])).max(4).optional().default(['nasa', 'jpl', 'esa-space', 'esa-science']),
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
  researchMemory: z.array(z.object({
    topic: text.max(180),
    updatedAt: time,
    sources: z.array(z.object({
      sourceId: text.optional(),
      sourceName: text.max(160),
      title: text.max(500),
      sourceUrl: text.url().or(z.literal('')),
      publishedAt: z.string().datetime().nullable(),
    })).max(12),
    keyFindings: z.array(text.max(2000)).max(12),
    unresolvedQuestions: z.array(text.max(500)).max(12),
    contradictions: z.array(text.max(500)).max(8),
    confidence: z.enum(['low', 'moderate', 'high']),
  })).max(40).optional().default([]),
  budget: z.object({
    date: text,
    units: z.number().nonnegative(),
    requests: z.number().int().nonnegative(),
    exhausted: z.boolean(),
  }),
});
export function validateLocal(raw: unknown): LocalData {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error('Saved data is unreadable. Import a valid personal backup.');
  return parsed.data;
}
