# MOHSEN SCOUT 1.19.0 — Verified Researcher & Discovery Engine

## Deep research architecture
- Separates the first-stage researcher (hypothesis generation and discovery planning) from a cross-provider independent reviewer.
- A different configured provider must independently inspect claims. If this is not possible, the dossier fails closed and all claims remain low-confidence and unverified.
- Fetches original Markdown source text through the user's configured Firecrawl key, with bounded source selection and concurrency. The full page text remains transient and is not persisted.
- Sends up to all 48 bounded evidence records to both research stages, using a topic-relevant paragraph excerpt per source rather than silently truncating the list to the first 24.
- Requires exact quotations from fetched source text. The app checks every quote and evidence ID locally before it can be recorded as verified.
- Summary-only results can inform discovery but cannot support a validated claim. Missing dates remain unknown.
- Requires at least two checked quotations from at least two approximated publisher-family groups before a claim can be labelled supported. Verified counterevidence makes a claim contested.
- Groups subdomains and likely syndicated copies to reduce false source diversity; publisher-family detection remains a heuristic, not proof of ownership.
- Replaces first-stage source assessments with the independent reviewer's per-evidence assessment.
- Produces a final conclusion only from the independently reviewed statuses; keeps the first model's conclusion separately labelled as provisional.
- Keeps the old lexical hypothesis engine in an exploration-only role and passes the dossier, counterevidence and research gaps into editorial idea generation.

## Persistence, privacy and safeguards
- Adds dossier and verified-citation validation to local storage and backup schemas.
- Retains transient-only original page text; stores the compact dossier and checked quotations, never full source documents.
- Excludes OpenRouter from Deep Research because project policy prohibits sending external news/source text there.
- Preserves the existing bounded 4-round / 8-query discovery budget, YouTube metadata isolation, quota policy, local-first architecture and signing/release checks.

## Verification
- Adds adversarial tests for fabricated citations, summary-only evidence, same-publisher subdomains, syndicated reports, verified counterevidence, missing second reviewers, complete 48-record prompts, Firecrawl Markdown enrichment and dossier backup round-trips.
- Adds a deterministic synthetic gold-standard benchmark fixture. It tests fail-closed behavior and false-positive resistance; it does not establish factual accuracy on live research topics.
