import { getFreeModels, selectFreeModel } from './api';
import {
  requestResearchAgentWithFallback,
  type ProviderAttempt,
  type SecondOpinionProviderConfig,
} from './ai-gateway';
import { getKey } from './vault';
import type { ResearchDossier, SecondOpinionProvider } from './types';
import {
  buildResearchAgentPrompt,
  parseResearchAgentJson,
  parseResearchDossier,
  type ResearchAgentInput,
} from './research-agent-core';
export type { ResearchAgentInput } from './research-agent-core';

export type ResearchAgentOutcome = {
  dossier?: ResearchDossier;
  provider?: SecondOpinionProvider;
  model?: string;
  attempts: ProviderAttempt[];
  warnings: string[];
};

export async function runResearchAgent(input: ResearchAgentInput): Promise<ResearchAgentOutcome> {
  const warnings: string[] = [];
  const order = input.preferences.secondOpinionOrder?.length
    ? input.preferences.secondOpinionOrder
    : (['gemini', 'groq', 'cloudflare', 'openrouter'] as SecondOpinionProvider[]);
  const configs: SecondOpinionProviderConfig[] = [];
  for (const provider of new Set(order)) {
    try {
      const key = await getKey(provider);
      if (!key) continue;
      const accountId = provider === 'cloudflare'
        ? await getKey('cloudflare-account-id') ?? undefined
        : undefined;
      let models = [input.preferences.secondOpinionModels?.[provider] ?? ''];
      if (provider === 'openrouter') {
        const available = await getFreeModels();
        const preferred = selectFreeModel(available, models[0]);
        models = [preferred, ...available.map((item) => item.id).filter((id) => id !== preferred)].filter(Boolean).slice(0, 5);
      }
      models = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
      if (!models.length) {
        warnings.push(provider + ' research analysis skipped: no supported model is selected or available.');
        continue;
      }
      configs.push(...models.map((model) => ({ provider, key, model, ...(accountId ? { accountId } : {}) })));
    } catch (error) {
      warnings.push(provider + ' research setup unavailable: ' + (error instanceof Error ? error.message : 'configuration failed.'));
    }
  }
  if (!configs.length) {
    return {
      attempts: [],
      warnings: [...warnings, 'No configured research AI provider was available; the local evidence-only fallback remains active. Add a provider key in Settings to enable semantic hypothesis review.'],
    };
  }

  try {
    const response = await requestResearchAgentWithFallback(
      configs,
      buildResearchAgentPrompt(input),
      fetch,
      input.beforeProviderRequest,
    );
    const raw = parseResearchAgentJson(response.content);
    const dossier = parseResearchDossier(
      raw,
      input.evidence,
      input.previous,
      input.alreadyAsked ?? [],
      response.provider,
      response.model,
      input.now ?? Date.now(),
    );
    return { dossier, provider: response.provider, model: response.model, attempts: response.attempts, warnings };
  } catch (error) {
    return {
      attempts: error instanceof Error && 'attempts' in error && Array.isArray((error as { attempts?: unknown }).attempts)
        ? (error as { attempts: ProviderAttempt[] }).attempts
        : [],
      warnings: [
        ...warnings,
        'Model-backed research review was unavailable or returned invalid structured output: ' +
          (error instanceof Error ? error.message : 'unknown provider error') +
          '. Local evidence collection and the conservative fallback continue.',
      ],
    };
  }
}
