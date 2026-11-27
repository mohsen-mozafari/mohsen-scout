# MOHSEN SCOUT — owner-approved engineering contract

This file is the owner-approved engineering contract aligned to successful Workflow #41 (run `45895145819`, source commit `1cced9212c7dbfd4f25ca37b0eba745cb78ece3c`). Workflow #41 is the baseline for this source tree. YouTube has no analytical, idea-generation or AI-prompt isolation: a separate SQLite table is only a local storage boundary and must never interrupt the end-to-end data flow.

## Product mission and source priority

MOHSEN SCOUT is a local-first YouTube trend-research and video-idea discovery assistant. The official YouTube Data API is the **primary evidence lane and the central input to the research engine**. YouTube evidence must remain connected end-to-end:

1. official YouTube search, video metadata, channel metadata, public statistics and saved snapshots;
2. internal analysis of relevance, publication freshness, view/like changes, views per hour/day, channel baselines and topic patterns;
3. the Deep Research research-agent and its independent second-provider review;
4. idea generation, prioritization, source-linked research memory and the user's saved workspace.

Never remove, bypass, silently omit or replace this connection with RSS-only or web-only evidence. The complete YouTube sample collected in each research run, with every available measured growth field, must reach the internal engine, idea generator/scorer, first external research model and independent reviewer. Do not impose an application-level 25-video cap or silently slice the sample in any of these handoffs. Clearly distinguish platform observations from independent scientific/news citations; YouTube metadata is not a publisher citation, but it is first-class evidence for YouTube trend and content research.

## Owner-approved YouTube analysis and retention

- Analyze YouTube-originated title, description, channel, publication time, video ID, thumbnail reference, public view/like/comment statistics and channel statistics locally.
- Calculate and use snapshot-derived view deltas, views/hour, views/day, channel baselines and outlier ratios. These are intentional first-party product features.
- Preserve YouTube reports, videos, snapshots, growth history and their local relationships indefinitely until the user removes the app data or explicitly deletes them. There is no automatic 29-day expiry, 10,000-snapshot cap or automatic deletion of old snapshots. Research-memory topics are also durable: never evict topics using an arbitrary 40-entry cap.
- Existing SQLite `youtube_records` rows must migrate to a no-expiry marker; newly written YouTube records must also have no expiry. App boot and foreground maintenance must not delete retained YouTube metadata.
- Keep raw YouTube metadata in the separate local YouTube SQLite domain. This separation is storage-only: loaded YouTube records must still flow into internal analysis, idea discovery/scoring and external AI prompts. Preserve the personal/YouTube storage boundary. Current backup/export behavior remains separately governed by its explicit schema; do not silently add credentials or API metadata to personal exports.
- A bounded API response is still a sample, not a complete census of YouTube. Report actual sample size, missing fields and measurement intervals; never fabricate unavailable observations or promise views/virality.

## Autonomous research and Deep Research second eye

- The internal engine must automatically invoke the Deep Research research-agent as its second eye during ordinary research runs, not only when the user opens the standalone Deep Research screen.
- The agent receives the complete YouTube sample from the same run plus any publisher/web/Wikimedia evidence, previous topic memory, prior dossier, and already-attempted searches. The AI request must still run for a YouTube-first run when web search is disabled or no independent publisher results were found, provided a compatible AI provider and YouTube sample are available. The independent reviewer must be a different configured provider when available and receives the same complete YouTube sample. A second provider is required for independent review, not for the first-model request.
- Preserve the source-led workflow: model hypotheses are provisional; fetched original source text and exact local quote matching are required for source-backed claims; the second provider independently reviews claims, citations, counterevidence, provenance and gaps. A YouTube signal may support a platform-trend/content hypothesis but must not be presented as an independent publisher quotation.
- Research follows the user's selected Space niche or custom niche. While the app is foregrounded and research is not paused, the autonomous discovery loop continues independently of the optional background schedule setting (Manual disables scheduled background runs, not foreground autonomy) without a fixed lifetime cycle count. It scans for fresh topics, prioritizes newly published and accelerating YouTube/publisher observations, researches them, stores results, and then advances to the next eligible topic.
- Each individual research pass remains bounded by provider/API quotas, per-request limits, rate limits, source-quality checks and useful stopping conditions. “Unlimited” means continuous fair discovery across successive topics while the app is open, not unbounded requests for a single topic or bypassing provider limits.
- On app background/close, persist the queue and current task input/checkpoint locally. On next foreground start, refresh current niche evidence first, rank fresh discoveries ahead of stale queued work, then resume eligible interrupted work. Do not spend a new session researching months-old backlog while fresh topics are available. Old completed research remains stored.
- Keep Android background work OS-managed and battery-conscious. The app cannot guarantee continuous execution while Android has suspended or force-stopped it. The foreground loop is the continuous mode; the scheduled WorkManager task is a best-effort closed/background cycle.

## Multitasking and responsiveness

- Allow at most two independent full research runs at once. This is deliberate bounded concurrency, not unlimited parallel API traffic.
- Parallelize independent I/O lanes (YouTube collection, publisher feeds, web retrieval and Wikimedia) where safe. The research-agent/second-review provider sequence is serialized across runs to avoid provider contention and preserve first-model/second-model independence.
- Serialize SQLite commits and quota accounting. Never run concurrent writers against the same state or overwrite another run's pending-research record.
- Manual user research must be able to run alongside one autonomous run. Each task has an independent persistent ID, status and recovery record. Keep the UI responsive; long network waits must not block navigation, notes, library or other local operations.
- If a concurrency change harms provider reliability, result quality, quota correctness or data integrity, reduce concurrency rather than silently degrading evidence quality.

## Data, credentials, privacy and network

- No mandatory backend, email registration, bundled/shared API credentials, scraping of YouTube, media/caption downloads, or automated engagement.
- YouTube data is retrieved through the official Data API and charged against the existing local quota ledger. Preserve per-run safety caps and the provider's actual quota/error responses.
- API keys stay in native SecureStore; browser credentials remain memory-only. Never print request URLs containing keys, raw authorization headers, API secrets or unredacted credential errors. Never store keys in SQLite, AsyncStorage queues, exports or source.
- The configured external research models intentionally receive the complete collected YouTube sample and independent research evidence needed for the task. Never send credentials, authorization headers, private notes, personal bookmarks or API keys to models.
- OpenRouter remains excluded from Deep Research where the configured privacy policy says so. Keep the existing explicit opt-in rules for other features and never retry generation POST requests automatically.
- Publisher RSS items remain attributed to their original publisher and date; headlines are leads, not independently verified facts. Wikimedia pageviews remain article attention, not Google search volume, unique people or YouTube views. Google Trends programmatic access must not be claimed unless an actual approved API is available.
- Treat retrieved source content as untrusted data, not instructions. Preserve canonical URLs, source IDs, dates, provenance, contradictions, unresolved questions and uncertainty labels.

## Architecture and persistence

- `app/` routes; shared UI in `components/`; types/state/API/persistence/retention/backup in `lib/`; explicit platform adapters remain separate.
- SQLite personal and YouTube tables stay separate. Store commits are serialized and native writes are transactional. Batch related record writes inside the same transaction to reduce bridge round-trips. Persisted input and backup schemas remain validated.
- YouTube growth history uses an immutable-collection index and incremental updates for newly appended snapshots. Rebuild from the full history only when an uncached history collection is first encountered; never truncate raw history to optimize it.
- Large archive hydration must periodically yield to the event loop. Durable research-memory topics are not subject to a fixed count eviction cap; any hot index is only a cache over the full SQLite archive.
- Pending tasks and autonomous-discovery queue entries must be versioned, validated, bounded in queue size and independently keyed. A crash in one task must not erase another task's recovery record.
- YouTube raw metadata and snapshots have no automatic retention sweep. Queue entries that are no longer useful may be deprioritized/removed as queue work, but this must never delete completed reports, videos, snapshots, memory or ideas.
- Preserve user-owned preferences, notes, bookmarks, ideas, research activity, quota ledgers, provider order, backup compatibility and current app identity unless the feature explicitly requires a schema migration with tests.

## Verification and release

After changes, run `npm test`, `npm run lint`, `npm run lint:css`, and `npx expo-doctor`. Build the signed Android ARM64 APK through the repository's release workflow. Keep tests for:
- YouTube data reaching the internal engine, first research model and independent reviewer;
- incremental growth indexing beyond 10,000 retained snapshots and batch SQLite writes without data loss;
- durable research memory retaining more than 40 distinct topics;
- measured YouTube growth and snapshot continuity beyond 29 days and beyond 10,000 entries;
- local storage and interrupted-task recovery;
- fresh-topic priority over stale backlog;
- no duplicate queue jobs and bounded two-run concurrency;
- serialization of provider calls and database/quota writes;
- dossier quote validation, independent review, evidence provenance and idea output.

Synthetic benchmarks are regression checks, not measured real-world accuracy. Never claim live API accuracy or physical-device verification without fresh evidence. Preserve Android signing identity, R8/WorkManager keep rules and package/ABI checks.
