# MOHSEN SCOUT — test results

Recorded: 2026-11-15. No real API keys were supplied. API checks use isolated synthetic responses, not live YouTube/OpenRouter calls.

## Current verification

- Browser regression runner `lib/diagnostics.ts`, rendered at `/diagnostics?run=1`: **35 passed, 0 failed, 35 tests**. Verified from the rendered result, not inferred from source or lint.
- Evidence: https://files.bilt.me/app_screenshots/a7e70ac6-993d-4740-923b-65144c2c2410/1794708557.png . No capture diagnostics.
- Final lint and TypeScript report: **clean**, including the Node suite. CSS checking is included in the project lint tool. Safe formatting and source-level shadowing fixes completed.
- Current web Metro bundles successfully. The log retains an earlier staged-creation missing-scheduler error, followed by successful bundles; this is not a current failure.
- Post-change web preview captures: Library at 320pt, missing note route at 320pt, new note editor at 320pt, Discover at 320pt. All rendered without capture diagnostics. No native rendering is claimed. Reordering was checked as pure logic; an interactive multi-block editor was not visually exercised.
- Discover evidence: https://files.bilt.me/app_screenshots/a7e70ac6-993d-4740-923b-65144c2c2410/1794708583.png . New note editor: https://files.bilt.me/app_screenshots/a7e70ac6-993d-4740-923b-65144c2c2410/1794708579.png . Missing note route: https://files.bilt.me/app_screenshots/a7e70ac6-993d-4740-923b-65144c2c2410/1794708560.png .
- Expo Doctor rerun: **19/20 checks passed**, version-alignment check failed with **23 recommendations**. `expo install --check` exit 1. Dependency tree resolves cleanly.
- The native availability check confirmed all 23 installed versions are the versions carried by the current preview. They were preserved rather than installing versions incompatible with that preview. Release dependency alignment remains a separate acceptance check; the warning has not been suppressed.

## Mock coverage

Original 25 checks: Mohsen/manual defaults; persisted schema rejection; 29-day metadata expiry; personal bookmarks; backup round trip and API/AI exclusions; invalid backup and stripped injected credential fields; local quota/Pacific reset; query generation; official endpoint and separate region/language; deduplication; pagination cap; quota-stop hook; pre-network budget gate; malformed responses; concurrent suppression; invalid key/disabled API; bounded retries and per-attempt charging; no automatic AI POST retry; offline; timeout/abort; zero-price model selection; unavailable model; no API metadata in prompts or generated ideas.

Ten new checks:

1. Expired reports lose references, while personally saved URLs remain.
2. Clearing metadata removes automated report/video references.
3. Nested video metadata obeys its own expiry date.
4. Restore replaces personal data but preserves device research and quota, resetting scheduling to Manual.
5. Existing AI opinions are retained only for unchanged editorial prompts, not a colliding idea ID with different content.
6. Imported automated video references must point to personal saved links.
7. Note reordering is immutable, preserves checklist state, and respects list boundaries.
8. Retry-After seconds/dates/invalid values and maximum foreground waiting rules.
9. Non-JSON transient HTTP failures are retried within the existing cap.
10. Long Retry-After responses stop requests instead of retrying prematurely.

## Authored, not independently execution-confirmed

`tests/core.test.ts`: **35 Node/tsx tests**, runnable with `npm test`. Type-checked, but this session cannot independently execute that command. Do not count the Node suite as another passed run. The browser checks above were actually observed.

Native SQLite open-failure retry, the scheduler's failed-storage guard, and credential-read errors were source/type checked, not device fault-injection tested.

## Not executed / not claimed

- Live YouTube search, actual key/API enablement, or a service-generated quota-exhaustion response.
- Live OpenRouter key testing, model discovery, or generation.
- Android build/signing, APK/AAB download, emulator/device install.
- Physical Android SQLite/SecureStore persistence, share sheet, document picker, notification permissions, background scheduling, battery or force-stop behavior.
- Full interactive tap/keyboard end-to-end coverage or a cold-start restore onto a second phone.
- Guaranteed physical deletion while Android keeps the app stopped; expired data is pruned at read/write/foreground/hourly active cleanup.
- A standalone web export or independently executed Node suite.

## Build artifact status

**APK location: none. AAB location: none. No installable package has been generated.**

Source: `/home/daytona/project`.

`eas.json` contains an external APK profile; configuration is not an artifact. No Android build or emulator execution is available in this session. Bilt's documented publishing flow builds a signed AAB through **Settings → Publish → Play Store** and **Build → Android** after the owner configures the package name and Android upload key. A Google Play account/service key is not required when publishing is unchecked. An AAB requires conversion with bundletool for direct installation.

Guide: https://bilt.me/docs/guides/publish-to-google-play#build-an-aab-without-google-play . External EAS APK build instructions are in README_FA.md.

## Release acceptance gate

1. Run `npm test` and a standalone bundle/export in the release environment.
2. Align release dependencies and rerun Expo Doctor; use the carried versions while running the existing preview.
3. Enter personal keys only in Settings and observe live success/error behavior.
4. Generate/sign/install an Android build and test persistence, transfer, permissions, scheduler, battery and keyboard behavior.
5. Record an actual artifact path/download URL and hash only after the file exists.
