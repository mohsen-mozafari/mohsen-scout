# MOHSEN SCOUT 1.18.0 — Adaptive Deep Research

## Research engine
- Replaced the fixed two-round follow-up loop with an adaptive, explicitly bounded research planner.
- The planner prioritizes non-repeating questions and diversifies query purposes, including primary-source discovery and counterevidence.
- A manual run may perform up to four follow-up rounds and eight focused searches, with at most two searches per round, four results per search, and 48 independent evidence records overall.
- Failed searches are recorded as attempted so they cannot repeat indefinitely.
- Research stops with an explicit reason when the search budget, round limit, evidence ceiling, novelty, or new-evidence yield is exhausted.
- Canonical URL handling removes common tracking parameters, rejects unsafe URLs and YouTube/video hosts, and deduplicates evidence before it enters the dossier.
- Evidence coverage reports distinct web hosts and publication-date availability without pretending that host diversity proves editorial independence.

## YouTube and privacy boundaries
- Official YouTube Data API sampling remains a separate, bounded raw-display lane.
- No YouTube API title, description, thumbnail, view count, like count, channel statistic, or identifier is sent to external AI review or used in editorial scoring.
- No views-per-hour, growth rate, derived market score, demand forecast, or virality promise is introduced.
- Existing local-first storage, SecureStore credentials, quota accounting, retention, backup boundaries, and opt-in provider settings remain in force.

## Verification
- Added deterministic tests for adaptive stopping, query diversity, URL canonicalization, duplicate rejection, source-host coverage and hard budgets.
- The GitHub Actions release workflow runs the complete Node regression suite, lint, CSS lint, Expo Doctor, Android release build, signing verification, package identity and ARM64 ABI checks, then verifies the downloaded release APK checksum.
