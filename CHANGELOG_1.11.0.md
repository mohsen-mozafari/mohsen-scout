# MOHSEN SCOUT 1.11.0

## Independent research and source-backed ideas

- Adds Firecrawl web/news search as an optional independent source, with keyless mode and an optional device-encrypted API key.
- Keeps selected publisher feeds and Wikimedia independent from the YouTube Data API sample.
- Ensures idea generation and editorial scoring ignore YouTube API titles, descriptions, IDs, view counts, likes and thumbnails.
- Stores linked evidence from independent publishers, web search and Wikimedia with generated ideas.
- Adds automatic structured critique through the configured Gemini, Groq, Cloudflare and OpenRouter fallback order. Only the idea topic/concept and independent source summaries/links are sent.
- Preserves local results when optional external sources or AI providers are unavailable.
- Adds additional YouTube result pagination within the existing per-run 12-attempt safety cap.
- Increments Android to version 1.11.0 (versionCode 30).
