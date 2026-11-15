# MOHSEN SCOUT — test results

## Space Intelligence + Android startup fix — implementation candidate (2026-11-15)

**Status before CI: source changes prepared; no Actions run or APK build has yet been started.** This section must be replaced with actual CI results after the single authorized run.

- Confirmed Android startup crash: AndroidX Startup could not initialize `WorkManagerInitializer` because R8 removed reflectively-instantiated Room/WorkManager constructors. A local Expo config plugin adds the two upstream keep rules while retaining R8; a post-prebuild check verifies the file is present and referenced by the generated app Gradle configuration.
- Existing `expo-background-task`, scheduler, SQLite, SecureStore, notification, backup/restore, existing Opportunities/Library/Notes and API quota code are preserved. No scheduler feature is removed to hide the startup error.
- New Space Radar replaces the Discover landing view; the original general YouTube research screen is preserved as `/youtube` and reachable from the Radar dashboard. Existing tabs remain one app.
- Added on-demand NASA/JPL/ESA RSS reading, niche-by-source coverage, a bounded official YouTube popularity sample plus public channel-size metadata charged to the existing budget, Wikimedia monthly article pageviews, source-linked Deep Research outline and narration scaffold, and save-to-Notes.
- RSS and Wikimedia results are in-memory cached for 10 minutes. No periodic news polling, server, large history store or new database table is introduced. YouTube key remains in SecureStore.
- Version-1 backups without Space preferences remain importable. Legacy SQLite preferences merge with current defaults before validation. The original My Library continues to enforce its YouTube-link-only contract.
- Google Trends API is not treated as public/available: its current official access is a limited alpha. The UI opens Google Trends for manual checks; Wikimedia Pageviews is explicitly labelled as article attention, not Google search volume or YouTube views.
- Added Node regression coverage for RSS/Atom parsing, unsafe links, malformed XML numeric entities, feed recovery/cache behavior, niche matching, Wikimedia source data, YouTube video/channel quota accounting (102 units), and legacy data/backup migration. These tests are pending actual CI execution.

### Release gate

CI must pass `npm ci`, `npm test`, lint/type checks, CSS lint, `expo-doctor`, prebuild, ProGuard rule verification, release signing, ARM64/package checks and artifact upload in one run. Build success and valid signing do not replace a real cold-launch test on the S23 Ultra. Do not claim a feature is native-device-tested until that test is completed.

Recorded: 2026-11-15. No real API keys were supplied. API checks use isolated synthetic responses, not live YouTube/OpenRouter calls.

## Focused release-readiness recheck — latest pass (2026-11-15)

**Decision: HOLD. No APK build attempted.** This recheck found no new concrete source-level blocker. App code, dependencies, lockfile, design and previous documentation were preserved. No new fixes or regression tests were warranted; the existing eight schedule/channel regressions were rerun as browser mocks. This section records fresh observations; earlier results below remain historical.

### Fresh execution evidence

| Check / command | Fresh observed result |
| --- | --- |
| Browser `/diagnostics?run=1` | **43 passed, 0 failed**, using isolated synthetic responses. Not the Node test command and not native execution. |
| Read-only project validator | **Lint: clean. Types: clean.** Configured scripts are `oxlint --type-aware --type-check` and `node scripts/lint-css.mjs`; validator exposes no separate CSS result or numeric exit codes. No formatting/autofix was requested in this recheck. |
| `expo-doctor` via health checker | **Exit 1; 19/20 passed.** Same 23 version-alignment recommendations listed below. Wrapper invocation flags not exposed. |
| `expo install --check` via health checker | **Exit 1**, same version differences. |
| npm dependency-tree resolution via health checker | **Resolves cleanly**; underlying npm invocation and exit code not exposed. |
| Native package availability | All eight feature packages are carried at their installed versions: background-task 58.0.11, task-manager 58.0.12, secure-store 58.0.2, sqlite 58.0.14, file-system 58.0.11, document-picker 58.0.4, sharing 58.0.20, notifications 58.1.6. Availability does not verify Android execution. |
| Seven routes at 320 × 874 CSS pixels | `/`, `/settings`, `/library`, `/opportunities`, `/notes`, `/note`, `/detail` rendered with no capture diagnostics. Tab labels, wrapping, new-note save footer and missing-detail fallback visually checked. No taps, scrolling, keyboard or native back tests performed. |
| Native preview log | `not_found`: preview never started. Mobile log shows Metro waiting, no device/runtime output. |
| `**/*.{apk,aab}` search including ignored files | No matches; no APK/AAB artifact path. |
| `npm test` → `tsx --test tests/core.test.ts` | **NOT RUN:** no general command executor exposed. Existing 43 registered Node cases are not counted as executed. |
| `npm run export:web` → `expo export -p web` | **NOT RUN:** no general command executor exposed. Preview rendering is not a production export. |
| Standalone `npx tsc --noEmit` | **NOT RUN:** validator type checks passed; no separate tsc execution claimed. |

Browser regression evidence: https://files.bilt.me/app_screenshots/a7e70ac6-993d-4740-923b-65144c2c2410/1794709295.png . Settings evidence: https://files.bilt.me/app_screenshots/a7e70ac6-993d-4740-923b-65144c2c2410/1794709245.png . Note evidence: https://files.bilt.me/app_screenshots/a7e70ac6-993d-4740-923b-65144c2c2410/1794709249.png .

### Native boundaries and build gate

SQLite, SecureStore, native file export/import, task registration and notification integration received a fresh **read-only source audit**, not runtime tests. Backup/restore and scheduler commit/recovery/channel-selection logic passed browser synthetic checks; actual SQLite restart/rollback, SecureStore save/read/delete/restart, picker/share behavior, WorkManager execution, notification permissions/delivery, Android back and keyboard behavior remain unverified. No real or dummy credentials were written, no keys were requested, and no live API calls or physical-device/emulator tests occurred.

**An APK build is not executable through this session's available tools.** No command/build executor or Android device/adb execution is exposed; no claim is made about software installed elsewhere. The failed dependency-alignment gate and unexecuted native/Node/export checks prevent release approval, but do not prove a Gradle build failure.

**Lowest-cost next step:** run the existing command block below in a local release checkout before starting any paid/cloud build. Resolve dependency alignment there rather than changing this preview blindly. With an existing Android development client/device, perform smoke checks using disposable dummy credentials and synthetic personal data; do not tap Test key or start research. If no compatible native client exists, record the limitation and clear automated/dependency gates before deciding on a development build for native acceptance testing. No production APK is authorized by this recheck.

## Previous focused pre-build release verification (2026-11-15)

**Decision: HOLD the APK build.** No build was attempted. The code fixes below pass isolated checks, but the Node suite, standalone export and Android device verification cannot be executed through this session. Dependency alignment also remains unresolved; this is a failed readiness gate, not proof that Gradle would fail.

### Actual execution and command evidence

| Check / command | Observed result |
| --- | --- |
| Browser `/diagnostics?run=1` | **43 passed, 0 failed**: 35 existing browser checks plus 8 schedule/channel regressions. No live API requests. This is not execution of `npm test`. |
| Project lint validation, safe autofix then read-only check | **Lint: clean. Types: clean.** Validator includes the configured CSS check. No individual numeric exit codes or separate CSS status were exposed. |
| `oxfmt --write .` | Formatter reported completion on 75 files. This is the exact formatter command printed by validation; numeric exit code not exposed. |
| `expo-doctor` (health checker) | **Exit 1; 19/20 checks passed.** Version alignment failed with 23 recommendations. Wrapper flags were not exposed. |
| `expo install --check` (health checker) | **Exit 1**, same 23 version recommendations. |
| npm dependency-tree resolution (health checker) | **Resolves cleanly**. Exact underlying npm invocation and numeric exit code not exposed. |
| Native package availability | All 23 versions named by Doctor are carried preview versions; all 8 research/storage/transfer native packages are available. This is availability, not Android execution. |
| `npm test` → `tsx --test tests/core.test.ts` | **NOT RUN**: no general command executor available. 43 registered Node tests are type-checked only. |
| `npm run export:web` → `expo export -p web` | **NOT RUN**: no general command executor available. Successful Metro preview bundling is not a standalone release export. |
| Standalone `npx tsc --noEmit` | **NOT RUN**. Type validation was performed by the project validator; do not count a separate tsc command. |
| Native preview log | `not_found`: native preview never started in this session. Mobile Metro log only shows its server waiting; no Android bundle/device output. |
| Artifact search `**/*.{apk,aab}` including ignored files | No matches. APK/AAB path: **none**. |

The configured lint scripts are `oxlint --type-aware --type-check` and `node scripts/lint-css.mjs`. They were checked through the validator, not separately launched with `npm run lint` / `npm run lint:css`.

### Native feature audit and fixes

- **SQLite — static only:** WAL setup; parameterized values; exclusive transaction across both tables; validation/retention at read/write; rejected open promise resets for retry. Restart persistence, actual rollback, disk-full errors and SQLite execution **not tested on Android**.
- **SecureStore — static only:** native get/set/delete use per-provider slots; blank values rejected and saved values trimmed; credential UI clears input after successful save. No real or synthetic key was written to a device, requested from the owner, or logged. Save/replace/delete/restart encryption behavior **not device-tested**.
- **File transfer — static plus pure-data mocks:** installed Android File.write implementation creates a missing file and overwrites by default, so no speculative create-file fix was made. Sharing availability, cached document selection, cancel and 20 MB limit are present. Native picker/share/permission flows **not executed**. Pure backup round-trip, invalid file rejection, credential stripping, restore/device-quota preservation and metadata exclusion checks passed in the browser runner.
- **Schedule — confirmed defects fixed:** unrelated preference saves no longer reset task registration; unavailable storage prevents scheduling side effects; failed configuration or commit attempts to restore prior registration and explicitly reports recovery failure. This shared guard now covers saves, restore and clearing data. Native registration/unregistration, cold-start WorkManager execution, notification permission/delivery and force-stop/battery behavior **not executed**. Clear-all remains a multi-step operation, not an atomic transaction across SecureStore and SQLite.
- **Notifications — confirmed channel mismatch fixed:** immediate research notification now selects `research`, matching the channel created before permission request. Installed SDK 58.1.6 parser accepts the channel-aware immediate trigger. Real delivery remains unverified.
- **Navigation/layout — browser rendering and source inspection only:** all five workspaces, a directly opened new note editor and missing-detail fallback rendered at 320pt without screenshot diagnostics. Note editor shows its fallback link and save footer. Native system back, gestures, tapped fallback behavior, keyboard appearance and filled/long-data flows remain untested. No redesign, routes or features added.

Eight added shared checks cover unchanged scheduling, storage readiness, ordered configuration/commit, write rollback, registration rollback, recovery failure reporting, pause/Manual transitions, and notification channel selection. They use injected synthetic operations, not native modules. The shared cases are included in both the Node and browser runners.

Latest browser regression evidence: https://files.bilt.me/app_screenshots/a7e70ac6-993d-4740-923b-65144c2c2410/1794709169.png . Post-fix Settings at 320pt: https://files.bilt.me/app_screenshots/a7e70ac6-993d-4740-923b-65144c2c2410/1794709104.png . New note at 320pt: https://files.bilt.me/app_screenshots/a7e70ac6-993d-4740-923b-65144c2c2410/1794709085.png .

### Dependency gate and lowest-cost next step

Doctor recommends these installed → expected versions:

```text
expo 58.0.19 → ~58.0.25
expo-background-task 58.0.11 → ~58.0.13
expo-blur 58.0.5 → ~58.0.6
expo-constants 58.0.13 → ~58.0.16
expo-dev-client 58.0.15 → ~58.0.20
expo-document-picker 58.0.4 → ~58.0.5
expo-file-system 58.0.11 → ~58.0.13
expo-font 58.0.10 → ~58.0.12
expo-haptics 58.0.7 → ~58.0.8
expo-linear-gradient 58.0.3 → ~58.0.4
expo-linking 58.0.14 → ~58.0.17
expo-notifications 58.1.6 → ~58.1.9
expo-router 58.0.26 → ~58.0.31
expo-secure-store 58.0.2 → ~58.0.3
expo-sharing 58.0.20 → ~58.0.23
expo-splash-screen 58.0.11 → ~58.0.14
expo-sqlite 58.0.14 → ~58.0.17
expo-status-bar 58.0.4 → ~58.0.5
expo-system-ui 58.0.6 → ~58.0.7
expo-task-manager 58.0.12 → ~58.0.14
react-native 0.88.0 → 0.88.1
react-native-safe-area-context 5.10.1 → ~5.11.1
react-native-screens 4.30.0 → ~4.30.1
```

Preserved package versions and lockfile: preview carries the installed native versions. No blind SDK upgrade or suppression was applied.

**Lowest-cost next step:** use a local/exported checkout and existing Node installation to run the commands below before paying for or starting any cloud build. These are instructions, **not commands executed in this session**:

```sh
npm ci
npm test
npm run lint
npm run lint:css
npx tsc --noEmit
npm run export:web
npx expo-doctor
npm run expo-check
```

Resolve release version alignment in that separate release checkout, then repeat checks. Keep this preview unchanged. If an existing Android development client/device is already available, use it for native smoke tests with disposable synthetic strings only; do not call Test key or start research. Verify persistence after restart, export/import/cancel/invalid-file/restore, schedule register/unregister and permissions without live requests. Otherwise device verification still requires a future native development build after the pre-build gates clear.

An APK build cannot be launched or verified from this session: no build executor, Android SDK/adb execution, connected Android device or signing context is exposed. This does not establish that an SDK is absent from every host. `eas.json` has an APK profile, not proof of a viable build. Bilt's separate documented cloud flow produces a signed AAB, not a direct APK: https://bilt.me/docs/guides/publish-to-google-play#step-5-build-and-upload-your-first-app-bundle . No build was triggered.

## Previous verification (historical)

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
