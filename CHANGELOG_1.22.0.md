# MOHSEN SCOUT v1.22.0 — Autonomous Researcher

## Research pipeline
- Route autonomous and manual research through the same bounded, provider-reviewed Deep Research workflow.
- Feed the final research dossier, verified citations, counterevidence and unresolved questions directly into editorial idea generation.
- Require original source text, a cross-provider review, two independent publisher groups, and at least one credible primary-source assessment before a hypothesis can be marked supported.

## Autonomous continuity
- Persist interrupted jobs and resume them ahead of stale unstarted discoveries.
- Retry network/provider failures with capped exponential backoff; failed jobs remain recoverable.
- Add Android/iOS background scheduling where the operating system permits it, with foreground resumption as the reliable fallback.
- Expire unstarted discovery candidates after three days so stale topics do not dominate after a long offline period.

## YouTube discovery and opportunity scoring
- Rotate a selected-niche query plus two broad discovery topics through YouTube's official views, newest and relevance search lanes.
- Keep the returned sample boundary and measured-snapshot requirements explicit.
- Score each idea with its own matching evidence rather than borrowing every source attached to the parent topic.
- Separate editorial opportunity priority from scientific research status and confidence.

## Interface
- Move the Home "Start a Research Run" panel into Discover.
- Consolidate duplicate Discover actions while preserving access to all existing research tools.
