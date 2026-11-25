# MOHSEN SCOUT 1.24.0 — Complete UI/UX audit implementation

Android version code: 45  
Branch: `feature/v1.22.0-autonomous-researcher`

## Implemented in this release

- Reworked the dashboard’s first view around a compact, device-local research summary; moved the detailed chart and second-opinion panel behind an expandable section.
- Reduced the featured opportunity card to its decision-critical information, clarified that priority is based on independent publisher/web evidence, and stopped unscored ideas from being mislabeled as weak.
- Grouped long idea-detail sections into expandable panels so the concept, internal analysis, and follow-on research tools no longer dominate one continuous scroll.
- Improved the Cosmic News hierarchy and replaced silent publisher/source link failures with visible, localized feedback.
- Clarified the standard YouTube research path versus the advanced multi-lane Discovery Mix. The advanced path is explicitly described as a bounded, paginated API sample—not continuous trend monitoring or a platform-wide growth forecast.
- Reframed Search Demand as public-attention/search signals, replaced the fixed three-topic form with add/remove topic rows (maximum eight per run), and retained the distinction between Wikimedia pageviews, Google Trends, YouTube views, and publisher coverage.
- Added in-WebView Back, Forward, and Refresh controls, retaining HTTP/HTTPS navigation restrictions and external-browser fallback.
- Added local-store hydration handling to Notes, Library, Research Activity and the archive; exposed note tags and links back to related ideas.
- Expanded the Research Archive into a unified index of YouTube reports, Deep Research briefs, saved ideas, personal video links and other notes, with each item reopening by its real record ID.
- Expanded legacy Deep Research detection to include known folder names as well as the explicit tag/title markers.
- Made Discover reopen the exact saved Deep Research note by ID when a saved brief exists.
- Reorganized Settings into Profile & Discovery, Connections & AI Providers, Automation & Quota Management, and Backup/Privacy/Diagnostics groups.
- Marked the Diagnostics screen as local synthetic/mock regression checks, not end-to-end tests against live providers.
- Added a shared external-link handler with URL validation and visible failure feedback; applied it to research sources, publisher links, YouTube references, and provider settings links.
- Expanded Persian UI translations for the revised navigation, labels, controls, and diagnostics.
- Added static UI-audit regression tests for these behaviors.

## Validation

The new GitHub Actions workflow runs the existing Node regression suite (including the new UI audit tests), source lint/type checks, CSS lint, Expo dependency validation, Android prebuild, R8/signing checks, a signed ARM64 APK build, APK identity/ABI/certificate verification, and release asset checksum verification.

A passing CI run and on-device visual/accessibility testing are separate validation gates; this changelog does not claim those gates have passed until their results are observed.

Build gate: the v1.24.0 full-audit workflow validates the source, signed ARM64 APK identity, certificate and release checksum.
