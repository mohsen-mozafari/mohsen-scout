# Мамия: Фаза 4 — Дашборд и UX (упрощенно)

> Документировано: фаза 4 (dashboard + detail page). Связано: [docs/audit-phase2.md](./audit-phase2.md).

## Что сделано (commit bc3ce24)

### Дашборд (`app/(tabs)/index.tsx`)
- **`EngineV2Opportunities` Fold** — top 5 предложений (от `engineV2Top`): BadgeText `Оценка: <score>`, `Высокий риск` бейдж при riskLevel=high, `Heading` (title/suggestedTitle), `Txt muted` (concept/suggestedAngle), `Оценка дохода: ≈ X USD/мес` при estimatedIncome (label estimate).
- **Tap → `/detail`** (`Action`).
- **Empty state:** `"Движок v2 готовит предложения из данных по видео и публикациям."`
- **Non-blocking:** engine v2 в `store.research/analyze` + `cosmic-news` — фон; legacy `generateEditorialIdeas` работает сразу; engine v2 предложения прилетят позже (async setTimeout(0)).
- **`EngineV2Complement`** (Phase 3): suggestedTitle/suggestedAngle показываются в Fold.
- **Global perf guards (предотвращение регрессий):** `engineV2Top` memo + `useMemo`-зависимости effect + exhaustive-deps warning закрыт.

### Детали (`app/detail.tsx`)
- **Engine V2 details Panel** (для engineV2 ideas):
  - `Оценка: X · Риск: Y`
  - `Лучшее время публикации: ... (в пределах N дн.)`
  - `Оценка дохода: ≈ X USD/мес · Предположения: ...`
  - `Обоснование оценки: reasons.slice(0,4).join(' · ')`
  - **Видео-ориентиры:** reference videos — `Title`, `channel · views · publishedAt`, tap → YouTube.
  - **Поддерживающие новости:** news titles + sourceName.

### UX-правила (соблюдены)
- "Минимальные изменения" — новые Fold/Panel, legacy UI не нарушена.
- "States": empty message в Fold; loading = async показ; errors — complement silent fail → fallback UI; engine v2 fail → legacy fallback.
- "Не блокировать UI": engine v2 в background (`setTimeout`); dashboard не ждет.
- "Tap details": детали — /detail page.

## Verification status

- `npm test` — 217/217 pass.
- `npm run lint` — exit 0 (2 warnings, pre-existing class: `consistent-return` index.tsx:475, `exhaustive-effect-dependencies` — warnings, не errors).
- **Build (GitHub) — блокер: нет write-credentials (см. docs/audit-phase2.md).**

## Известные пробелы / улучшения (не затронуты)

- Risk badges в Fold: `v2.riskLevel` — уникальный ID предложения — engineV2.opportunities.length ≤ 5 (столько же, сколько generateEngineV2Opportunities limit).
- Score badge — `Оценка X` (0-100).
- Не показан `publishWindow.horizonDays` — только bestTime (по сторопному упрощению — bestTime уже содержит окно).
- `app/detail.tsx` — engine v2 details — показывает только related videos (первые 3) + news (первые 3) — лимиты ради размера экрана.
