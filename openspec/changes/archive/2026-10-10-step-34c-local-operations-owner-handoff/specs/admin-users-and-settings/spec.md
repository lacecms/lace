## ADDED Requirements

### Requirement: Settings displays the running CMS release
Settings → Site status SHALL show a read-only card labelled "CMS version" using `engineVersion` from the validated authenticated status response. It SHALL preserve the full release string including prerelease suffixes, remain readable on narrow screens and use the existing UI tokens. It SHALL NOT substitute the Astro, generator, ownership-template, database migration or browser asset version. Refresh status SHALL refresh this value with the other status data. Initial loading SHALL use the existing loading pattern; unavailable data SHALL show an unavailable value with the existing retry/error behavior, never a guessed release or `0.0.0` fallback. A previously confirmed value retained after a refresh failure SHALL be identified as stale. Session expiry SHALL clear protected status through the existing recovery flow; editors/viewers SHALL retain their existing access-denied behavior.

#### Scenario: Administrator identifies a prerelease
- **WHEN** the API confirms `engineVersion` equal to `0.1.0-alpha.4`
- **THEN** the CMS version card displays `0.1.0-alpha.4` without shortening or substituting it

#### Scenario: Status cannot be loaded
- **WHEN** no confirmed status exists and the status request fails
- **THEN** no release number is invented and the administrator can retry through the existing error action

#### Scenario: Refresh fails after a successful read
- **WHEN** a refresh fails while a previously confirmed CMS version remains visible
- **THEN** the UI identifies that value as stale and offers retry

#### Scenario: Updated runtime is refreshed
- **WHEN** the administrator refreshes status after replacing the runtime with another release
- **THEN** the displayed version updates to the new server-confirmed value

#### Scenario: Session expires
- **WHEN** the status request establishes that the administrator session expired
- **THEN** protected status is cleared and the existing sign-in recovery runs
