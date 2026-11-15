# MOHSEN SCOUT engineering handoff

This is Mohsen's personal, local-first Android YouTube research desk. Exact brand: **MOHSEN SCOUT**. UI stays English; source YouTube text stays unchanged. Preserve AMOLED black and violet/indigo actions.

## Guardrails

- No mandatory backend, email registration, bundled/shared API credentials, scraping, media/caption download, or automated engagement.
- Keys only in native SecureStore; browser adapter is memory-only. Never print request URLs, raw API errors or authorization headers. Never include keys in SQLite, localStorage, exports or source.
- YouTube-originated snippets live only in the metadata domain, expire at 29 days, are pruned on read/write/foreground/hourly active sweep, and never enter backups. Personal bookmarks/notes are separate. Prune automated API references that are no longer backed by unexpired metadata or a personal bookmark.
- No views/hour, growth percentages, engagement/subscriber ratios, computed market scores or guarantees. The current engine creates editorial hypotheses from the user's topic. It is not a comprehensive trend detector. Do not pretend sample size proves competition or demand.
- OpenRouter is explicit opt-in per opinion. Send only the user-approved editorial topic/concept/decision. No YouTube API titles, descriptions, thumbnails, stats or comments. Keep token caps and never retry generation POST automatically. Model IDs come from live zero-price model discovery.
- Background scheduling is native/battery-conscious and OS-controlled. No always-on process or network polling. Surface unsupported environments rather than reporting success.
- Preserve Bilt-managed publish identity environment reads in app.config.ts.

## Architecture

`app/` routes; shared HeroUI-backed UI in `components/`; types/state/API/persistence/retention/backup in `lib/`; explicit `.web.ts` adapters for native integrations. SQLite has separate `personal` and `youtube` tables. Store writes are serialized and native writes are transactional. Persisted input and backup schemas are validated.

`app.config.ts` invokes deterministic PNG generation from the authored compass geometry (`assets/scout-icon.svg` companion; `scripts/scout-icon.cjs`), with no service/network dependency. `eas.json` describes build profiles but is not a built artifact.

## Verification

Run `npm test`, `npm run lint`, `npm run lint:css`, and `npx expo-doctor` after changing dependencies/data rules. Browser tests: Settings → App info → Run mock regression checks, or `/diagnostics?run=1`. They use isolated mocked fetchers and must never mutate the owner's workspace. Node suite execution and native device tests must be recorded separately.

Current recorded browser mock result: 25 passed / 0 failed. See TEST_RESULTS.md for status, screenshots and unverified items. Never claim a live API success or APK exists without actually observing it. Check Android device keys, SQLite persistence, backup transfer, notifications and background runs before release.

YouTube policy sources reviewed:

- https://developers.google.com/youtube/terms/developer-policies
- https://developers.google.com/youtube/terms/derived-metrics-policy

Do not assume the optional audited analytics amendment applies to this app or that every video ID is exempt from retention.
