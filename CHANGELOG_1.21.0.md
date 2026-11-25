# MOHSEN SCOUT v1.21.0 — YouTube-first autonomous research

## Research and discovery
- YouTube becomes the first discovery lane in autonomous, standard research, Deep Research and idea refresh.
- Fresh installs can start from the selected space niche without a previous manual search or saved report.
- The foreground research loop performs a bounded YouTube sample at most once per six-hour discovery window, saves repeat snapshots, and queues strongly topic-matched video topics.
- Autonomous jobs now prioritize YouTube candidates before publisher-feed fallback candidates. Measured velocity and channel-relative outliers influence candidate order; raw lifetime views are only a tie-breaker.
- Publisher RSS, Firecrawl and Wikimedia remain available as independent verification and context lanes after YouTube sampling.

## Internal analysis and output
- Internal video ranking now uses verified repeat-snapshot velocity and channel outlier ratio after topic relevance.
- The temporal reasoning lens reports measured YouTube velocity separately from publisher recency and Wikimedia pageviews, and explicitly marks when repeat-snapshot growth is unavailable.
- Research Activity records bounded autonomous YouTube discovery operations. Raw video metadata remains in the dedicated local video store.
- Opportunity cards and Deep Research overview expose attached evidence counts, distinct channel coverage and verified growth measurements.
- Automatic critique privacy guidance now accurately describes the YouTube platform signals that can be sent to the selected AI provider.

## Reliability
- Autonomous queue ordering is priority-first rather than publication-date-first.
- Legacy queue records migrate safely with a zeroed YouTube discovery timestamp.
- Background scheduling no longer requires a prior manual search; it derives a valid request from the selected niche.
- YouTube discoveries are semantically matched before they become autonomous research jobs.
- API quota accounting, retry limits, evidence boundaries, local storage and cross-provider review contracts remain in place.

## Operational limits
- YouTube requires a saved YouTube Data API key. Without one, the YouTube discovery lane is recorded as skipped and publisher/web fallback lanes can continue.
- Measured growth requires repeat snapshots separated by the existing minimum sampling interval; one view-count snapshot is never described as growth.
- Android WorkManager execution is best-effort and subject to operating-system, network, battery and manufacturer restrictions. No exact background execution time is guaranteed.
- Editorial scores are priority signals, not forecasts of views, revenue or virality.
