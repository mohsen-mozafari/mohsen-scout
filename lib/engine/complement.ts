import { z } from 'zod';
import { getOpinion } from '../api';
import type { EngineV2Opportunity } from './types';

export const engineComplementSchema = z.object({
  opportunities: z.array(z.object({
    id: z.string(),
    suggestedTitle: z.string().optional(),
    suggestedAngle: z.string().optional(),
  })).max(6),
});

export type EngineV2Complement = z.infer<typeof engineComplementSchema>;

const EMPTY_COMPLEMENT: EngineV2Complement = { opportunities: [] };

/**
 * OpenRouter complement for engine v2 proposals. Used ONLY to improve the
 * wording and angle of existing engine-generated ideas; it never invents
 * revenue numbers, views or facts. Returns null on any failure/timeout.
 */
export async function getEngineV2Complement(input: {
  key: string;
  model?: string;
  opportunities: readonly EngineV2Opportunity[];
  fetcher?: typeof fetch;
}): Promise<EngineV2Complement> {
  const key = (input.key ?? '').trim();
  const opportunities = input.opportunities.slice(0, 6);
  if (!key || !opportunities.length) return EMPTY_COMPLEMENT;
  const payload = opportunities.map((opportunity) => ({
    id: opportunity.id,
    score: opportunity.score,
    risk: opportunity.riskLevel,
    title: opportunity.title,
    reasons: opportunity.reasons.slice(0, 2),
    evidence: opportunity.videos.slice(0, 2).map((video) => ({
      title: video.title,
      views: video.views,
      publishedAt: video.publishedAt,
    })),
  }));
  const prompt = 'Improve YouTube trend ideas using ONLY the provided evidence. Return ONLY valid JSON: {"opportunities":[{"id":<existing id>,"suggestedTitle":<improved idea title>,"suggestedAngle":<improved content angle>}]}. Reuse the given ids exactly. Suggested wording must stay grounded in the evidence; do not invent facts, numbers, revenue or specific claims. Do not ask the reader to act. Max 6 entries.\n\nIdeas: ' + JSON.stringify(payload);
  try {
    const raw = await getOpinion(key, input.model?.trim() || '', prompt, undefined, input.fetcher ?? fetch);
    const parsed = engineComplementSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_COMPLEMENT;
  } catch {
    return EMPTY_COMPLEMENT;
  }
}
