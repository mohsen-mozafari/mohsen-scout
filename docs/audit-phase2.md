# Мамия: Фаза 2 — Движок v2 (сильный, основанный на шансах)

> Документировано: фаза 2 + фаза 3 (complement). Связано: [docs/audit-phase0.md](./audit-phase0.md), [docs/audit-phase1.md](./audit-phase1.md).

## Что сделано — архитектура (`lib/engine/`, commit 596df4c)

Модульная платформа, все функции — чистые (JVM-testable, без RN-импортов):

| Модуль | Ответственность |
|---|---|
| `types.ts` | Типы: weights, video/news inputs, features, topics, opportunities, timings, result |
| `features.ts` | `percentile/median`, `parseTimeMs`, `computeVideoFeatures` (growthRate, engagementRatio, outlierScore, titlePatterns, recencyHours, channelSizeRatio) |
| `topics.ts` | TF-IDF + n-gram (bigram) кластеризация (connected components через termDocs), `momentum` (за 7 дней/14 дней новостей + тренд от Wikimedia), `confidence`, `findGapsAndRisks` (gap: новости ≥2 + видео ≤1; risk: ≥4 видео + share каналов ≥0.6) |
| `opportunity.ts` | `scoreFeatures` — взвешенная оценка (score 0-100) + explainable reasons (momentum, growth, outlier, engagement, titlePattern, channelSize, gap, freshness, risk) |
| `idea-generator.ts` | `generateEngineV2Opportunities` — сортировка desc, diversification ≤2 на cluster, limit default 5/max 10 |
| `income.ts` | `findNicheByTopic` (ratio ≥ 0.5 по tokenized niche topics), `estimateIncomeByNiche` — label `estimate`, RPM ranges по niche, explicit assumptions |
| `orchestrator.ts` | `runEngineV2` — стадии: setup → features → topics → opportunity → income, timings per stage, `stageFallbacks` (budget/error), `processingMs`, `coverage` |
| `idea-mapper.ts` | `engineV2OpportunityToIdea` (Idea ← EngineV2Opportunity: topic/concept/videoIds/engineScore/engineScoreReason/engineV2), `engineV2VideoInputFromVideo` |
| `complement.ts` | OpenRouter complement (Phase 3): strict schema, prompt с payload, `getOpinion`, null при ошибке |

## Продукция (Phase 2/3/4)

- **Wire-up (a90354d):** `store.research` + `store.analyze` — engine v2 предложения → `Idea` (`engineGenerated`, `engineV2`, status `Strong Opportunities`), тайминги в логе `console.log('[engine-v2]', ...)`; `cosmic-news` — radar ideas; **dashboard (index.tsx)** — Fold "Engine v2 opportunities": top 5, badge score/risk, доход, tap → `/detail`; **detail.tsx** — Engine V2 details (score basis, bestTime, est. income, reference videos с дата/канал/views, supporting news).
- **Dashboard (bc3ce24):** OpenRouter complement (опционально, безопасно — при ошибке `null`), suggestedTitle/suggestedAngle.
- **JVM baseline (Phase 0)** (`tests/engine-v2.test.ts`): 300 видео + 200 новостей → **setup 1ms, features 5ms, topics 217ms, opportunity 557ms, income 4ms — total ~784ms** (цель < 4s).

## Тесты (текущие)

`npx tsx --test tests/engine-v2.test.ts` — **9 тестов: PASS** (features, income, gaps, risks, timing baseline, budget fallback, complement: valid/bad JSON/401/empty/no-key).

## Известные пробелы / незавершенное

1. **Builds не запущены** — нет write-credentials (push: 401/`could not read Username`, dispatch: 401, cancel: 401). Run #153 in_progress (branch `upgrade/intelligence-performance-1.7.0`) — cancel невозможен (401).
2. **Фаза 5 (сборка): не запущена** — блокер: авторизация GitHub.
3. Пробел J (consistent-return warning, index.tsx:475) — warning, не error — CI зеленый.
4. Семантический пробел: engine v2 не интегрирован в `app/youtube.tsx` auto-refresh (было не требование в аудите — dashboard/research/radar).
5. Логгирование: timings есть в результате + console.log; в `store.research` — `console.log('[engine-v2]', ...)`.
6. Требование пользователя: "генерируется идея видео" — Idea topic/concept заполнены из engineV2Opportunity (topic = заголовок предложения, concept = hook + evidence).
7. `data.preferences.uiLanguage` — `UiLanguage` ('fa'|'en'), поэтому тернарные виды `=== 'fa' ? 'fa' : 'en'` — корректны.
8. Budget: `budgetMs: 40` на engine v2 (store.research/analyze + cosmic-news) — stage-level (после стадии если overBudget → stopped).
9. Несерьезный: `EngineV2Opportunity.id = 'e2-' + videoId` — уникальность через videoId ✓.
