# Мамия: Фаза 3 — AI дополнение (OpenRouter complement)

> Документировано: фаза 3. Связано: [docs/audit-phase2.md](./audit-phase2.md).

## Что сделано

- **`lib/engine/complement.ts`** (commit 3375042):
  - `engineComplementSchema` — строгий zod schema: `{opportunities: [{id, suggestedTitle?, suggestedAngle?}]}` (max 6).
  - `getEngineV2Complement({key, model?, opportunities, fetcher?})` — строит compact payload (id, score, risk, title, reasons, evidence refs) + строгий prompt ("return ONLY valid JSON", reuse ids, "no invented facts/numbers/revenue/claims, no asks to act"), вызов `getOpinion` (api.ts:967), `JSON.parse` + `safeParse` → result | `{opportunities: []}`.
  - **На любой ошибке/timeout → `{opportunities: []}` (null-fallback).**
- **Dashboard integration (index.tsx, bc3ce24):**
  - `getKey('openrouter')` → `getEngineV2Complement({key, opportunities: engineV2Top})` в effect; state `engineV2Complement`.
  - Fold показывает `suggestedTitle`/`suggestedAngle` при наличии, иначе fallback на локальный title/concept.
- **Тесты (tests/engine-v2.test.ts):** valid JSON → parse OK; bad JSON → empty; 401 → empty; empty → empty; no key → empty. (9/9 pass.)

## Требование пользователя

- "базовая реализация комплемента" ✓; "строгий schema и prompt без новых фактов/призывов к действию" ✓; "потери/timeout → null" ✓ (EMPTY_COMPLEMENT); "интеграция в dashboard" ✓ (Fold + fallback).
- Дополнительно: строгая schema (без loose parsing).

## Известные пробелы

1. Complement не записывается в `Idea`/store — показывается в UI (dashboard Fold) как предложение; idea-page показывает локальный engine v2 текст. (Требование: "AI дополняет внутренний движок" — применено к предложениям в dashboard.)
2. `getEngineV2Complement` — no timeout param — наследует requestJson default (15s).
3. Не использует `getFreeModels`/`selectFreeModel` — модель берется из preferences.model (как у других getOpinion-вызовов).

## Итог Phase 3

Готово: complement + dashboard + тесты + документация (этот файл). **Build: блокер — без GitHub-credentials (см. audit-phase2.md).**
