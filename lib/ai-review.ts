import { formatStructuredSecondOpinion, getFreeModels, selectFreeModel, structuredSecondOpinionPrompt } from './api';
import { requestSecondOpinionWithFallback, type SecondOpinionProviderConfig } from './ai-gateway';
import { getKey } from './vault';
import { DEFAULT_SECOND_OPINION_ORDER, uid, type Idea, type Opinion, type Preferences, type SecondOpinionProvider } from './types';
export async function reviewIdeasAutomatically(
  ideas: readonly Idea[],
  preferences: Preferences,
  options: { language?: 'fa' | 'en'; maxIdeas?: number; beforeProviderRequest?: (config: SecondOpinionProviderConfig) => Promise<void> } = {},
): Promise<{ opinions: Opinion[]; warnings: string[] }> {
  const language = options.language ?? preferences.uiLanguage ?? 'fa';
  const warnings: string[] = [];
  const order = preferences.secondOpinionOrder?.length ? preferences.secondOpinionOrder : DEFAULT_SECOND_OPINION_ORDER;
  const configs: SecondOpinionProviderConfig[] = [];
  for (const provider of [...new Set(order)] as SecondOpinionProvider[]) {
    try {
      const key = await getKey(provider);
      if (!key) continue;
      const accountId = provider === 'cloudflare' ? await getKey('cloudflare-account-id') ?? undefined : undefined;
      let model = preferences.secondOpinionModels?.[provider] ?? '';
      if (provider === 'openrouter') model = selectFreeModel(await getFreeModels(), model);
      if (!model.trim()) { warnings.push(provider + ' skipped: no supported model selected.'); continue; }
      configs.push({ provider, key, model, ...(accountId ? { accountId } : {}) });
    } catch (error) { warnings.push(provider + ' setup unavailable: ' + (error instanceof Error ? error.message : 'configuration failed.')); }
  }
  if (!configs.length) return { opinions: [], warnings: [...warnings, language === 'fa'
    ? 'نقد خودکار اجرا نشد؛ هیچ کلید Provider سازگار ذخیره نشده است. ایده‌های محلی حفظ شدند.'
    : 'Automatic critique skipped because no supported provider key is saved. Local ideas were preserved.'] };
  const opinions: Opinion[] = [];
  for (const idea of ideas.slice(0, Math.max(1, Math.min(8, options.maxIdeas ?? 8)))) {
    try {
      const prompt = structuredSecondOpinionPrompt(idea.topic, idea.concept, language, idea.evidenceSources ?? []);
      const result = await requestSecondOpinionWithFallback(configs, prompt, fetch, options.beforeProviderRequest);
      opinions.push({ id: uid(), ideaId: idea.id, text: formatStructuredSecondOpinion(result.opinion, language), model: result.provider + '/' + result.model, createdAt: Date.now() });
    } catch (error) {
      warnings.push((language === 'fa' ? 'نقد خودکار ایده «' : 'Automatic critique failed for “') +
        idea.topic.slice(0, 100) + (language === 'fa' ? '»: ' : '”: ') +
        (error instanceof Error ? error.message : 'provider fallback failed.') +
        (language === 'fa' ? ' ایده محلی حفظ شد.' : ' Local idea preserved.'));
      break;
    }
  }
  return { opinions, warnings: warnings.slice(0, 12) };
}