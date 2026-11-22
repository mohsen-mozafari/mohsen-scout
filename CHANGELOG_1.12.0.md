# MOHSEN SCOUT 1.12.0

## Reliability and release verification

- Keeps AI second-opinion reviews sequential and bounded, but isolates failures per idea so one unavailable provider chain no longer prevents later ideas from being reviewed.
- Preserves local ideas and the internal engine result when an external review fails.
- Adds regression coverage for per-item failure isolation and review limits.
- Retains the existing official YouTube API sampling, quota accounting, expiring raw-metadata boundary and independent publisher/web editorial-evidence boundary.
- Increments Android to version 1.12.0 (versionCode 31).
