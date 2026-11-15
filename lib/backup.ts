import { z } from 'zod';
import { defaults, type LocalData, regions, statuses } from './types';
const text = z.string().max(50000);
const identifierSchema = z.string().min(1).max(200);
const timestamp = z.number().finite().nonnegative();
const link = z.object({
  id: identifierSchema,
  url: z
    .string()
    .url()
    .refine(
      (s) => /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(s),
      'Only YouTube links are supported.',
    ),
  manualTitle: text,
  topic: text,
  note: text,
  folder: text,
  tags: z.array(text).max(100),
  savedAt: timestamp,
});
const noteSchema = z.object({
  id: identifierSchema,
  title: text,
  folder: text,
  tags: z.array(text).max(100),
  updatedAt: timestamp,
  blocks: z
    .array(
      z.object({
        id: identifierSchema,
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
    )
    .max(1000),
});
const idea = z.object({
  id: identifierSchema,
  topic: text,
  concept: text,
  note: text,
  status: z.enum(statuses),
  decision: text,
  videoIds: z.array(identifierSchema).max(1000),
  createdAt: timestamp,
  archived: z.boolean(),
  assessment: z.enum([
    'Strong Opportunity',
    'Promising',
    'Worth Exploring',
    'Uncertain',
    'Highly Competitive',
  ]),
  region: z.enum(regions),
  languages: z.array(z.string().max(10)).min(1).max(50),
});
const preferences = z.object({
  name: text,
  email: text,
  region: z.enum(regions),
  languages: z.array(z.string().max(10)).min(1).max(50),
  budget: z.number().int().min(100).max(10000),
  model: text,
});
const backupSchema = z.object({
  app: z.literal('MOHSEN SCOUT'),
  version: z.literal(1),
  exportedAt: timestamp,
  personal: z.object({
    links: z.array(link).max(20000),
    notes: z.array(noteSchema).max(20000),
    ideas: z.array(idea).max(20000),
    preferences,
  }),
});
export function exportBackup(data: LocalData) {
  return JSON.stringify(
    {
      app: 'MOHSEN SCOUT',
      version: 1,
      exportedAt: Date.now(),
      personal: {
        links: data.links.map(({ id, url, manualTitle, topic, note, folder, tags, savedAt }) => ({
          id,
          url,
          manualTitle,
          topic,
          note,
          folder,
          tags,
          savedAt,
        })),
        notes: data.notes,
        ideas: data.ideas.map(({ reportId: _reportId, ...value }) => ({
          ...value,
          videoIds: value.videoIds.filter((id) =>
            data.links.some((savedLink) => savedLink.id === id),
          ),
        })),
        preferences: {
          name: data.preferences.name,
          email: data.preferences.email,
          region: data.preferences.region,
          languages: data.preferences.languages,
          budget: data.preferences.budget,
          model: data.preferences.model,
        },
      },
    },
    null,
    2,
  );
}
export function importBackup(raw: string): LocalData {
  if (raw.length > 20_000_000) throw new Error('This backup is too large. Maximum size is 20 MB.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('This file is not a readable JSON backup.');
  }
  const result = backupSchema.safeParse(parsed);
  if (!result.success)
    throw new Error('This is not a valid MOHSEN SCOUT backup. Nothing was changed.');
  const fresh = defaults();
  return {
    ...fresh,
    ...result.data.personal,
    preferences: { ...fresh.preferences, ...result.data.personal.preferences },
  };
}
export function personalLinks(data: LocalData) {
  return data.links
    .map(
      (l) => `${l.manualTitle || l.topic || 'Saved video'}\n${l.url}${l.note ? `\n${l.note}` : ''}`,
    )
    .join('\n\n');
}
