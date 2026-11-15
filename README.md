# MOHSEN SCOUT

Personal, English-language YouTube research assistant for Mohsen. AMOLED black, violet/indigo action gradient, and a visible query map rather than invented trend charts.

## Implemented

- Five workspaces: Discover, Opportunities, My Library, Notes, Settings. Short tab labels `Ideas` and `Library` keep navigation readable at 320pt; screen titles retain the full names.
- Native SQLite separates personal content from YouTube metadata. Keys use Expo SecureStore; browser preview keeps keys in memory only.
- Official YouTube Data API v3 search: independent region/language, recency, duration, category, maximum results, query expansion, two-page/query and twelve-search/run caps, deduplication, timeouts, bounded GET retries, per-attempt budget, quota-stop handling, 15-minute result reuse.
- Separate CONTINUE ANALYSIS produces explicitly labeled editorial hypotheses and actual reference videos, never performance scores. Automatic labels are cautious; all assessment/collection labels are available for personal decisions.
- Opt-in OpenRouter opinions use live-discovered zero-price models and a consent preview. Only editorial topic, concept, personal decision are sent; no API titles/descriptions/statistics. POST generation is not automatically retried.
- Editable local opportunities, bookmarks/folders/tags/notes, block-based pages, personal-link export, validated JSON backup/restore, Android share sheet, optional background research and notification permissions.
- Native/PWA compass artwork, Persian setup/handoff documentation, isolated mocked regression checks.

## Verification

25 isolated mock regression checks executed in the web preview: **25 passed, 0 failed**. Open Settings → App info → Run mock regression checks. `npm test` provides a separate Node/tsx suite; it was authored and type-checked, but its execution was not independently confirmed here. Lint and TypeScript checks are clean after the final handoff refinements; see `TEST_RESULTS.md` for the recorded status.

**Not claimed:** live YouTube/OpenRouter access, an APK/AAB artifact, physical Android SQLite/SecureStore/share-sheet/scheduler verification. Expo Doctor resolves dependencies but reports newer recommended SDK patches; native preview-supported package versions are intentionally retained. Align and rerun checks before an external release build.

## Setup and transfer

See `README_FA.md` and `HANDOFF_FA.md`. Enter keys in Settings only, never in chat or source. Research needs a YouTube key; notes and personal links work without one. OpenRouter is optional.

Source is this project root. No backend or registration is required. `eas.json` includes an internal Android APK profile for an exported source build; it does not mean a build exists. Bilt documents signed **AAB** downloads, not a directly installable APK: https://bilt.me/docs/guides/publish-to-google-play#build-an-aab-without-google-play . Export source: https://bilt.me/docs/features/code-export .

```sh
npm install
npx expo start
npm test
npm run lint
npm run lint:css
# Optional external cloud build, requires your own Expo account/signing setup:
npx eas-cli build --platform android --profile preview
```

No media download, unofficial endpoint, automated engagement, paid server, or AI hardware dependency.
