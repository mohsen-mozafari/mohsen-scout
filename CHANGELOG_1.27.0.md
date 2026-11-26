# MOHSEN SCOUT 1.27.0

## Runtime responsiveness and storage

- Added an immutable YouTube snapshot-history index with incremental updates, preserving the full retained history and growth measurements beyond 10,000 snapshots.
- Computes channel baselines from the indexed history and reuses the index across consecutive samples instead of rebuilding it for every save.
- Batches SQLite record deletes and upserts within the existing exclusive transaction to reduce native bridge round-trips without weakening atomicity.
- Archive hydration validates stored records as they are read and periodically yields to the event loop so large local archives do not monopolize JavaScript execution.
- Removed the arbitrary 40-topic research-memory eviction. Distinct research topics remain in the durable archive; updating an existing topic replaces only that topic's current snapshot.
- Replaced repeated full-video scans during automatic AI review with direct ID-indexed lookups.

## Deep Research and autonomous discovery

- Research execution now consumes the configured two-query fan-out in adaptive rounds, while preserving the global eight-query ceiling, evidence ceiling, source validation, checkpointing and recovery.
- Query checkpoints retain prior attempted searches when a run is resumed.
- The first foreground autonomous discovery cycle now waits for the initial screen to render and accept input. Continuous foreground discovery and the existing 20-second cycle cadence remain enabled.

## Verification

- Added a synthetic regression test with 12,000 retained YouTube snapshots, checking growth continuity and proving that the next sample reuses the index rather than rebuilding the full history.
- Added regression coverage for retaining more than 40 distinct research-memory topics and for Deep Research's query fan-out and global budget.
- GitHub Actions now caches Gradle dependencies to reduce repeated Android build setup time.
- Existing provider limits, YouTube quota accounting, two-run concurrency, source provenance, independent review, privacy boundaries, signing identity and ARM64 release checks remain unchanged.
