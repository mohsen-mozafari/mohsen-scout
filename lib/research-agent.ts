import {
  requestResearchAgentWithFallback,
  type ProviderAttempt,
  type SecondOpinionProviderConfig,
} from './ai-gateway';
import { getKey } from './vault';
import type { ResearchDossier, SecondOpinionProvider } from './types';
import {
  applyIndependentResearchReview,
  buildIndependentReviewPrompt,
  buildResearchAgentPrompt,
  markResearchReviewUnavailable,
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
    : (['gemini', 'groq', 'cloudflare'] as SecondOpinionProvider[]);
  const configs: SecondOpinionProviderConfig[] = [];
  for (const provider of new Set(order)) {
    if (provider === 'openrouter') {
      warnings.push('OpenRouter is excluded from Deep Research because project privacy policy prohibits sending external news and source text to OpenRouter.');
      continue;
    }
    try {
      const key = await getKey(provider);
      if (!key) continue;
      const accountId = provider === 'cloudflare'
        ? await getKey('cloudflare-account-id') ?? undefined
        : undefined;
      const models = [...new Set([input.preferences.secondOpinionModels?.[provider] ?? '']
        .map((model) => model.trim()).filter(Boolean))];
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
    let dossier = parseResearchDossier(
      raw,
      input.evidence,
      input.previous,
      input.alreadyAsked ?? [],
      response.provider,
      response.model,
      input.now ?? Date.now(),
    );
    let attempts = [...response.attempts];

    // Independent validation requires a different configured provider.
    const independentConfigs = configs.filter((config) => config.provider !== response.provider);
    if (!independentConfigs.length) {
      dossier = markResearchReviewUnavailable(dossier, input.evidence, input.preferences.uiLanguage ?? 'fa');
      warnings.push('Independent cross-provider review was not possible because no second AI provider is configured. All hypotheses remain unverified and low-confidence.');
    } else {
      try {
        const reviewResponse = await requestResearchAgentWithFallback(
          independentConfigs,
          buildIndependentReviewPrompt(
            input.topic,
            dossier,
            input.evidence,
            input.preferences.uiLanguage ?? 'fa',
            input.youtubeSignals ?? [],
          ),
          fetch,
          input.beforeProviderRequest,
        );
        const reviewRaw = parseResearchAgentJson(reviewResponse.content);
        dossier = applyIndependentResearchReview(
          dossier,
          reviewRaw,
          input.evidence,
          reviewResponse.provider,
          reviewResponse.model,
          input.now ?? Date.now(),
          input.preferences.uiLanguage ?? 'fa',
        );
        attempts = [...attempts, ...reviewResponse.attempts];
      } catch (reviewError) {
        dossier = markResearchReviewUnavailable(dossier, input.evidence, input.preferences.uiLanguage ?? 'fa');
        warnings.push(
          'Independent cross-provider review failed. The dossier was retained, but all hypotheses were downgraded to insufficient evidence: ' +
          (reviewError instanceof Error ? reviewError.message : 'review unavailable.'),
        );
      }
    }
    return {
      dossier,
      provider: response.provider,
      model: response.model,
      attempts,
      warnings,
    };
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
