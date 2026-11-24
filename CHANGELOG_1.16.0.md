# MOHSEN SCOUT 1.16.0 — research discovery upgrade

Base: Build 26 commit `df2917dca62ef0882fdca0621a42e83b9f84dca2`.
This release candidate is isolated on `feature/v1.16.0-research-discovery-from-build-26`; it does not modify `main`.

## Implemented
- YouTube collection is now the first source phase. A missing key, exhausted quota, network error, or empty YouTube result does not prevent the independent feed, web/news, and Wikimedia phases from running.
- Independent web/news research now performs one initial search and up to two bounded follow-up searches. Follow-up terms are generated deterministically from returned independent web evidence, deduplicated, and capped. Search ranking is not treated as source credibility.
- Added unit tests for bounded query planning, URL validation, and duplicate-query suppression. The planner now suppresses follow-up terms already explored in the current run.
- Added a device-local pending-research checkpoint using AsyncStorage. A run records its input before network work; after an unexpected process exit, the next successful app launch automatically restarts that topic as a fresh research pass. The checkpoint is cleared only after a completed run and expires after 14 days.
- Added an isolated Android 1.16.0 workflow with package version 1.16.0 / Android versionCode 36, preserving signed ARM64 build verification and release publishing.

## Important compliance boundary retained from Build 26
- Raw YouTube API metadata remains isolated from idea generation, scoring, research summaries, durable idea text, and external AI prompts. No derived views/hour, growth, engagement, or market-wide score was added.
- The existing 29-day YouTube metadata retention policy is unchanged.
- No server, scraping, always-on polling, or new paid provider was introduced.

## Not claimed as complete
- Recovery is topic-level, not an exact per-source cursor: if Android kills the process, the app restarts that research topic from the beginning on the next launch. It does not resume midway through a specific API call. The existing Android OS scheduler remains best-effort and cannot guarantee execution after force-stop or battery restrictions.
- This is a bounded discovery improvement, not a claim that the app is an autonomous researcher with unlimited crawling or a market-wide YouTube census.
- Native device testing and the GitHub Actions APK result must be confirmed before treating this candidate as install-ready.
