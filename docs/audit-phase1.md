# Мамия: Фаза 1 — Полнота канала (совместимость + coverage)

> Документировано: фаза 1 (feed completeness). Связано с аудитом фазы 0: [docs/audit-phase0.md](./audit-phase0.md).

## Что сделано

1. **`lib/api.ts` — commentCount в каналах статистики.**
   - `searchYouTube` (auto-search, `search.list`, `statistics`): `fields: 'items(id,statistics(viewCount,likeCount,commentCount))'`, парсинг в `Video.commentCount` (тип `Video` — lib/types.ts).
   - `searchYouTubeSample` (ручной sample): те же поля + `YouTubeSampleVideo.commentCount`.
   - Входящие `searchSchema`/`spaceStatsSchema` дополнены (`channelId`, `commentCount`) — иначе zod отбрасывает.
2. **`lib/dashboard.ts` — Detailed + coverage.**
   - `collectEngineVideoEvidenceDetailed(reports, videos, now, limit)` возвращает `{ videos, coverage }`; дефолтный лимит 300→**500** (`ENGINE_VIDEO_EVIDENCE_LIMIT`).
   - `EngineVideoEvidence` + `channelId` (из `Video.channelId`).
3. **`lib/engine.ts` — coverage на вход мотора.**
   - `InternalResearchInput.coverage?: EngineCoverage` (новый тип в lib/types.ts: `VideoCoverageData`, `NewsCoverage`, `EngineCoverage`).
   - `selfEvaluation.coverage`: для news — `{total, bySource, reachingEngine, matched}`; для videos — `{videosFromReports, videosFromStored, uniqueVideos, droppedMissingFields, droppedAsExpired, coverageLimit, reachingEngine, retainedVideos}`.
4. **Проводники вызова:**
   - `app/cosmic-news.tsx` — `newsBySource` из `allEngineNews` (sourceId → кол-во), coverage в `buildInternalResearch`.
   - `app/(tabs)/index.tsx` — coverage в вызове `buildInternalResearch` (store-driven).
   - `lib/store.ts` — `commentCount` pass-through в engine inputs research/analyze.
5. **`lib/space.ts`** — `newsItemLimitPerFeed` 80→200 (RSS parse per feed).
6. **Тесты:** `tests/dashboard.test.ts` — ожидание капсы 300→320.

## Что гарантируется (verification status)

- `npm test` — 216 тестов: PASS (включая `tests/engine-v2.test.ts` из фазы 2).
- Повторные прогоны — стабильно 0 fail.

## Известные пробелы / незакрытые вопросы

- **Пробел G1 (исправлен)**: ранее `collectEngineVideoEvidence` отсекал до 300 — теперь 500 и Detailed+coverage.
- **Пробел G2/G3 (исправлен)**: commentCount добавлен в search + sample.
- **Пробел H9 (частично закрыт, Phase 2)**: coverage записан в selfEvaluation для App; вариант возвращать покрытие из `collectEngineVideoEvidenceDetailed` для разработчиков — есть, но не вызывается на экране.
- **Пробел G6 (частично закрыт, Phase 2)**: engine v2 принимает `commentCount` + `channelId` — stats уже наружу выходят из каналов; subscriber/videoCount на store.videos отсутствуют — функционально для outlierScore не сильно нужны (используются channelId).
- **Семантическое:** coverage по sourceId для новостей — для undated новостей `sourceId` может быть пустым (попадают под bySource['']).
- **Baseline JVM** (фаза 2): см. `tests/engine-v2.test.ts` — `[engine-v2] JVM baseline` ~784ms (300 видео + 200 новостей), limit 4s.
