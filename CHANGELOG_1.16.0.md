# MOHSEN SCOUT 1.16.0 — resilient research pipeline

This release is based on the exact source commit used by the successful GitHub Actions Build #26 (df2917dca62ef0882fdca0621a42e83b9f84dca2), not on the current main branch.

## Reliability changes

- Start each research run with the bounded YouTube Data API discovery sample, then run selected publisher feeds, independent Firecrawl web/news search, and Wikimedia as isolated fallback/evidence stages.
- A failed or quota-exhausted YouTube stage is recorded as a warning and cannot cancel independent web/news, publisher-feed, or Wikimedia work.
- An unexpected rejection from one provider is isolated with Promise.allSettled; remaining providers still finish and the local evidence engine can continue.
- An automatic second-opinion AI provider failure no longer turns an already-saved local report and generated ideas into a failed research run.
- Added regression coverage for provider-failure isolation.

## Important limits

- YouTube API requests remain quota-accounted and bounded. When YouTube quota is exhausted, the app does not bypass the quota or scrape YouTube; it continues with independent sources.
- Background execution remains subject to Android scheduling, battery restrictions, and force-stop behavior.
- AI opinions remain advisory and cannot overwrite the local evidence ranking.
