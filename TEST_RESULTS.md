# MOHSEN SCOUT — test results

Recorded: 2026-11-15. No real API keys were supplied. All API regression checks below use explicitly isolated synthetic responses, not live YouTube/OpenRouter calls.

## Executed

- Browser regression runner `lib/diagnostics.ts`, rendered at `/diagnostics?run=1`: **25 passed, 0 failed, 25 tests**. Verified from the rendered result, not inferred from code.
- Evidence screenshot: https://files.bilt.me/app_screenshots/a7e70ac6-993d-4740-923b-65144c2c2410/1794707960.png . Capture diagnostics: none.
- Covered: Mohsen/manual defaults; local schema rejection; 29-day metadata expiry; personal bookmarks; backup round trip; exclusion of API/AI data; invalid backup; stripped injected credentials; local quota/Pacific reset; query generation; official endpoint and region/language separation; deduplication; pagination cap; quota stop hook; pre-network budget gate; malformed response; concurrent request suppression; invalid key/disabled API; bounded transient retries and per-attempt charging; no automatic AI POST retry; offline; timeout/abort; dynamic zero-price model selection; unavailable model; no API metadata in prompts or generated ideas.
- Final lint and TypeScript check: **clean** after retention, restore, safe-area and icon-generator refinements. The recorded report below is static verification, separate from browser test execution.
- Web Metro bundled the app successfully. Earlier missing-file error during staged file creation was resolved once the adapter existed.
- Screenshots: Discover 402pt and 320pt, Settings 320pt, Notes 402pt, Library 320pt. An initial empty-string text-node error was fixed at source. Follow-up captures had no diagnostics. Native rendering is not represented by web screenshots.
- Compass PNG was actually generated and read at `assets/scout-icon.png`; source SVG is at `assets/scout-icon.svg`. This is artwork, not an APK.
- Expo Doctor: **19/20 checks passed**, one version-alignment check failed (23 recommendations for newer Expo/RN/native package patches/minor). `expo install --check` exit 1. Dependency tree resolves cleanly. This is an unresolved release-verification warning; it is not silently ignored.

## Final lint/type report

Post-edit status from `lint(action="fix")` (verbatim):

```text
Ran safe autofixes, then the formatter. State below is post-fix — anything still listed needs a hand edit.
Lint: clean.
Types: clean.
```

No remaining lint findings or type errors were reported. The browser mock suite was rerun after the final source changes: **25 passed, 0 failed**. Final evidence: https://files.bilt.me/app_screenshots/a7e70ac6-993d-4740-923b-65144c2c2410/1794708237.png . Additional 320pt captures of the note editor and Opportunities rendered without diagnostics.

## Authored, not independently execution-confirmed

`tests/core.test.ts`: 25 Node/tsx tests, `npm test`. Type-checked, but the available check output did not expose an actual Node test run. Do not count the Node suite as a second successful execution. Browser checks above are independently observed.

## Not executed / not claimed

- Live YouTube key/API enablement, actual official search response, quota-exhaustion service call.
- Live OpenRouter key test/model discovery/generation.
- Android native build, APK/AAB signing, download or install.
- Physical Android SQLite/SecureStore persistence, share sheet, document picker, notifications and background scheduling.
- Full interactive end-to-end tap/keyboard coverage, cold-start restore onto a second phone, or prolonged expiry while OS stops the app.
- Full standalone web export build.

## Build artifact status

**APK location: none. AAB location: none. No installable package has been generated.** Source: `/home/daytona/project`. `eas.json` contains an external internal-distribution APK build profile. Bilt's documented Android output is a signed AAB; it needs conversion before direct phone installation.

## Release acceptance gate

1. Run Node suite and a standalone bundle/export.
2. Align release dependencies and rerun Expo Doctor in the intended build environment; preserve supported preview versions while using that preview.
3. Configure personal keys in Settings and observe live success and error handling.
4. Generate/sign/install an Android build and test persistence, transfer, permission, scheduler, battery and keyboard behavior.
5. Record actual build artifact URL/path and hash only after it exists.
