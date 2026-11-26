# MOHSEN SCOUT 1.28.0 — Full audit closure

## Autonomous discovery and recovery
- Version the durable autonomous queue and migrate existing v1 data without discarding recoverable tasks.
- Serialize queue mutations and atomically claim jobs to prevent duplicate autonomous starts.
- Rank fresh evidence ahead of interrupted backlog and promote a stale same-topic item when fresh evidence arrives.
- Run YouTube, publisher-feed and niche-seed discovery lanes concurrently.
- Keep recovery checkpoints until queue completion is durable, then reconcile against saved analyzed reports.

## Research and source collection
- Collect bounded YouTube, publisher, independent web and Wikimedia evidence concurrently.
- Preserve the same YouTube sample as explicit platform evidence for the internal engine, first research model and independent second-provider reviewer.
- Preserve serialized model-provider execution and maximum-two full research-run concurrency.

## Scheduling, persistence and performance
- Retire the duplicate fixed-interval background task; the preferences-driven scheduler owns OS-scheduled work.
- Manual disables scheduled background execution while foreground autonomy continues unless paused.
- Version and bound pending checkpoints, cache immutable record indexes and batch SQLite migration/writes below the SQL bind-parameter ceiling.
- Preserve indefinite YouTube reports, videos, snapshots and research-memory topics.

## Verification boundary
CI runs the complete regression, lint/type, CSS, Expo Doctor, native prebuild, signing and ARM64 release checks. Synthetic benchmarks remain regression fixtures, not physical-device profiles or live-provider accuracy tests.
