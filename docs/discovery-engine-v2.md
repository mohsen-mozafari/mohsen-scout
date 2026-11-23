# Discovery Engine V2 (incremental implementation)

This branch contains the bounded query planner and loop-control primitives.

## Guardrails
- Query planning is pure and deterministic; network requests remain in the existing provider layer.
- Callers must enforce API quotas, per-request limits and provider backoff.
- Results and scoring must be sourced from official provider metadata; no invented trend or growth values.
- Persist only summaries and query-path metadata, not unnecessary raw user/provider data.
- The loop controller is bounded and filters visited queries.

## Current scope
The planner and loop controller are building blocks. They are not yet wired to the app orchestration, scoring, storage or UI, and no release build has been verified.
