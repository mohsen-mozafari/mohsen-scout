# MOHSEN SCOUT engineering handoff

This is Mohsen's personal, local-first Android YouTube research desk. Exact brand: **MOHSEN SCOUT**. UI stays English; source YouTube text stays unchanged. Preserve AMOLED black and violet/indigo actions.

## Guardrails

- No mandatory backend, email registration, bundled/shared API credentials, scraping, media/caption download, or automated engagement.
- Keys only in native SecureStore; browser adapter is memory-only. Never print request URLs, raw API errors or authorization headers. Never include keys in SQLite, localStorage, exports or source.
- YouTube-originated snippets live only in the metadata domain, expire at 29 days, are pruned on read/write/foreground/hourly active sweep, and never enter backups. Personal bookmarks/notes are separate. Prune automated API references that are no longer backed by unexpired metadata or a personal bookmark.
- No views/hour, growth percentages, engagement/subscriber ratios, computed market scores or guarantees. The current engine creates editorial hypotheses from the user's topic. It is not a comprehensive trend detector. Do not pretend sample size proves competition or demand.
- OpenRouter is explicit opt-in per opinion. Send only the user-approved editorial topic/concept/decision. A separate, explicit per-item Translate to Persian action may send only that selected official RSS item's title and summary; disclose this before use. Never send bulk news, YouTube API titles, descriptions, thumbnails, stats or comments. Keep token caps and never retry generation POST automatically. Model IDs come from live zero-price model discovery.
- Background scheduling is native/battery-conscious and OS-controlled. No always-on process or network polling. Surface unsupported environments rather than reporting success.
- Preserve Bilt-managed publish identity environment reads in app.config.ts.

## Architecture

`app/` routes; shared HeroUI-backed UI in `components/`; types/state/API/persistence/retention/backup in `lib/`; explicit `.web.ts` adapters for native integrations. SQLite has separate `personal` and `youtube` tables. Store writes are serialized and native writes are transactional. Persisted input and backup schemas are validated.

`app.config.ts` invokes deterministic PNG generation from the authored compass geometry (`assets/scout-icon.svg` companion; `scripts/scout-icon.cjs`), with no service/network dependency. `eas.json` describes build profiles but is not a built artifact.

## Verification

Run `npm test`, `npm run lint`, `npm run lint:css`, and `npx expo-doctor` after changing dependencies/data rules. Browser tests: Settings → App info → Run mock regression checks, or `/diagnostics?run=1`. They use isolated mocked fetchers and must never mutate the owner's workspace. Node suite execution and native device tests must be recorded separately.

Current recorded browser mock result: 35 passed / 0 failed. Restore uses `restorePersonalData` to preserve current device reports/videos/quota while replacing personal data; keep local AI opinions only when the idea ID and editorial topic/concept/decision still match. Imported idea video references must point to personal saved links. Retention also removes expired report IDs and nested video metadata. Respect Retry-After; stop rather than retry early when the server asks for a wait over 30 seconds. Fonts are bundled, with no extra Google Fonts CDN request. See TEST_RESULTS.md for status, screenshots and unverified items. Never claim a live API success or APK exists without actually observing it. Check Android device keys, SQLite persistence, backup transfer, notifications and background runs before release.

YouTube policy sources reviewed:

- https://developers.google.com/youtube/terms/developer-policies
- https://developers.google.com/youtube/terms/derived-metrics-policy

Do not assume the optional audited analytics amendment applies to this app or that every video ID is exempt from retention.

## Personal research continuity — version 1.3.0

- Keep one local Idea as the anchor when the user moves from an official source story into YouTube sampling, Wikimedia comparison or Deep Research. Reuse the same idea by source URL and topic rather than creating duplicates.
- A linked YouTube report may reference existing expiring report/video metadata. Only a user-selected video may be saved as a durable personal bookmark; save its URL reference only, not its API title, description, thumbnail or statistics.
- Deep Research and Wikimedia comparison notes may carry an optional local ideaId relationship. Keep old notes and version-1 backups valid when that relationship is absent.
- Detail pages should act as a small personal research hub: continue research in existing routes and open only notes/references explicitly linked to that idea.
- Do not introduce teams, accounts, billing, server infrastructure, project boards or background research workflows. Prefer existing SQLite personal tables, current API providers and manual actions.
- Keep OpenRouter strictly opt-in and editorial-only; never send attached research evidence or YouTube metadata as part of these new connections.

## Space research provider rules

- The Space Radar screens are a unified extension of the existing product. Preserve the original YouTube research route (/youtube), Opportunities, Library, Notes, Settings, credentials, quota accounting, SQLite schema boundaries, backup/restore and scheduler.
- Current space-news providers are official RSS sources. Keep source name, original URL and publisher date visible; do not turn publisher headlines into independently verified facts.
- Demand data from Wikimedia is article pageviews in a language edition. Never label it Google search volume, geographic audience demand or YouTube views. Google Trends API access is a limited alpha; do not depend on it without a real approved credential/contract.
- YouTube trend samples must use the official Data API and charge the existing local quota budget. View counts are raw per-video observations; do not infer views/hour, velocity, growth percentages, market-wide saturation or a composite opportunity score.
- Do not add always-on scanning, scheduled news polling, bulk historic collection, backend services or paid providers without explicit approval. Explicitly approved exception: one official RSS-only Space Radar refresh when the user opens the app, using a short in-memory cache; no background polling and no YouTube quota. Space source caches remain short-lived and in memory.
- Deep Research must preserve source URLs and uncertainty. No scientific claim is validated solely because a news headline or encyclopedia summary states it. Do not send news text, YouTube metadata or statistics to OpenRouter; the only news-content exception is a user-tapped translation of one selected RSS title and summary.
- Existing persisted preferences and version-1 backups must migrate with defaults for any new optional Space settings. Do not change the personal/youtube SQLite table separation.
- Android Release must retain R8. The local config plugin plugins/with-workmanager-proguard.js keeps the no-arg Room/WorkManager constructors needed by reflection; verify both keep rules are present and referenced by android/app/build.gradle after prebuild.