# MOHSEN SCOUT v1.29.0 — Research Performance and Reliability

## Research orchestration
- Batch adaptive follow-up searches in groups of up to two concurrent requests.
- Re-run the model researcher once per completed evidence batch instead of after each individual search.
- Remove the redundant final model/reviewer pair when no new source evidence was introduced.
- Prioritize manual research requests ahead of queued autonomous provider work.
- Pause new autonomous research cycles while a manual run is active.
- Use a bounded, short-lived Firecrawl search cache with concurrent-request coalescing and defensive result copies.

## Evidence quality and preflight
- Require two distinct configured model providers, at least two fetched original source texts, and at least two publisher families before model-backed review begins.
- Fall back to explicitly provisional local discovery when independent-review prerequisites are unavailable.
- Preserve verified-quote, provenance and low-confidence safeguards.

## Internal intelligence
- Discover emerging concepts: recurring topic-adjacent terms from actual matched evidence, beyond the fixed entity alias list.
- Build co-occurrence links only when concepts appear together across multiple evidence documents.
- Display the bounded concept-discovery findings and add concept/relation counts to engine self-evaluation.

## User experience and telemetry
- Publish a quick internal evidence brief before adaptive deep research finishes.
- Show when the brief is preliminary and being updated by deeper verification.
- Record last and average duration for each research stage and display the latest stage timings.

## Verification and release
- Add regression tests for manual priority, autonomous pause leases, bounded concurrency, Firecrawl request coalescing/cache isolation and runtime duration metrics.
- Build signed Android ARM64 APK with versionCode 50 and release tag v1.29.0.
