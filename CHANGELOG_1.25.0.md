# MOHSEN SCOUT 1.25.0 — Unified research workspace and final UI audit pass

Android version code: 46  
Branch: `feature/v1.22.0-autonomous-researcher`  
Base: workflow 12 source commit `3506284eb339b92e1979b4f8802f7f451b9ac2f2`

## Changes completed in this single audit update

- Unified standard YouTube research and the advanced paginated multi-lane Discovery Mix inside one YouTube Research workspace. The old Trend Intelligence route redirects to the same screen and preserves topic/idea context.
- Embedded the advanced sampler without duplicating the page shell, retaining official API usage, pagination, quota disclosure, deduplication, local snapshot persistence and evidence limitations.
- Redirected idea-detail links into the unified YouTube workspace in advanced mode.
- Split Cosmic News into a compact public-signal overview and a separate publisher-feed area, clarifying that publisher coverage, Wikimedia pageviews and YouTube evidence are distinct signals.
- Folded optional AI second-opinion controls and archive/delete actions on idea detail, reducing the default scroll while preserving every action.
- Added accessible names and state hints for collapsible sections, visible labels for text inputs, and accessible labels for selectable options.
- Added Persian localization for browser navigation, the unified YouTube research modes, Cosmic News sections and new accessibility hints.
- Expanded static regression coverage for unified routing, Persian UI, accessibility, detail folding and release metadata.
- Bumped Android app version to 1.25.0 / versionCode 46 and aligned the signed ARM64 APK workflow with the new artifact, package/version/ABI/certificate checks and checksum.

## CI correction

- Removed an unused legacy page-shell import from the now-embeddable advanced sampler; the regression suite now guards against reintroducing that import. The workflow file path filter is aligned with the repository's actual workflow filename.

## Validation boundary

GitHub Actions runs the Node regression suite, TypeScript/source lint, CSS lint, Expo dependency validation, Android prebuild, R8/signing checks, a signed ARM64 APK build, package/version/ABI/certificate verification and artifact/checksum preparation. Green CI validates those automated gates; physical-device visual inspection is not represented as passed unless separately performed.
