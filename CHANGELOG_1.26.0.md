# MOHSEN SCOUT 1.26.0

## Dashboard and workspace

- Removed the redundant “Research at a glance” and “Unified research workspace” panels from the home page. The featured idea, second-opinion review and measured session-health report remain available.
- Deferred the dashboard's synchronous local evidence summary until its analysis section is explicitly expanded and ongoing UI interactions have completed. The research engine, evidence inputs, scoring rules and collection capabilities are unchanged.
- Replaced the reports archive's eager ScrollView rendering with a virtualized FlatList. Reports, deep-research briefs, ideas, personal links and notes remain stored and accessible; only on-screen rows are mounted.
- Narrowed archive state subscriptions so unrelated local-data changes do not force the full archive screen to re-render.
- Added Android status-bar safe-area spacing to the three-section workspace header and coordinated child pages to avoid applying the inset twice.

## Visual system

- Changed the shared application canvas and bottom navigation background to pure black (#000000) for AMOLED screens.
- Preserved the existing accent, status, text and surface colors. App icon background now matches the AMOLED canvas.

## Release

- App version: 1.26.0
- Android version code: 47
- Artifact: MOHSEN-SCOUT-1.26.0-arm64.apk

## Validation scope

- CI runs the Node regression suite, source lint/type checks, CSS lint, Expo dependency checks, Android prebuild, WorkManager R8 rule verification, signed ARM64 APK build, package/version/ABI checks, certificate fingerprint validation and release-download checksum verification.
- These checks do not substitute for physical-device visual inspection, TalkBack testing or on-device frame-time profiling. Those must be reported separately rather than implied by a successful CI build.
