## ADDED Requirements

### Requirement: Builder keeps bounded persistent build caches
When its deployment provides a cache directory, the builder SHALL reuse the
package store and the site's Astro cache directory (image variants and image
placeholders) across builds. The caches SHALL NOT be selectable or
influenced by request data, SHALL NOT be copied into a release, and SHALL NOT
change build results, failure reasons or the version and atomic-release
checks. Before a build the builder SHALL clear the whole cache when it
exceeds 2 GiB. After a failed site build it SHALL clear the Astro cache. A
missing, unwritable or otherwise unusable cache directory SHALL make the
build run without cache instead of failing. Cache events SHALL be logged in
fixed vocabulary without paths or secrets.

#### Scenario: Second build reuses the cache
- **WHEN** a build succeeds and a later build of the same site runs
- **THEN** the later build installs from the persisted package store and its
  Astro build sees the cache entries written by the first build

#### Scenario: Cache never reaches the release
- **WHEN** a build with a populated cache succeeds
- **THEN** the published release contains only the selected output directory
  and the release metadata

#### Scenario: Oversized cache is cleared
- **WHEN** the cache holds more than 2 GiB before a build
- **THEN** the builder removes it, logs the clearing and builds normally

#### Scenario: Failed build drops the Astro cache
- **WHEN** the site build fails
- **THEN** the Astro cache is removed, the package store is kept, and the
  failure reason is `build_failed` as before

#### Scenario: Unusable cache directory
- **WHEN** the cache directory is missing or not writable
- **THEN** the build runs without cache and its result is the same as an
  uncached build

#### Scenario: Request cannot address the cache
- **WHEN** a caller extends the trigger with a cache path or cache option
- **THEN** the closed request contract rejects the call without running
  install or build
