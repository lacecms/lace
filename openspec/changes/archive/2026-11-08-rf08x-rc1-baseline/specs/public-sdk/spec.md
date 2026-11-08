## MODIFIED Requirements

### Requirement: Public SDK rejects unsupported export formats
The SDK SHALL declare the highest build-export format version it supports.
When a validated export carries a higher `formatVersion`, the SDK SHALL reject
it with a typed contract error. The error SHALL name the received and the
supported format versions and tell the operator to upgrade `@lacecms/sdk` to a
release compatible with the Lace API. It SHALL NOT include the export body or
the build credential. An export whose `formatVersion` equals the supported
version SHALL be accepted when it satisfies the tolerant contract; a lower
`formatVersion` SHALL fail tolerant validation as a contract error.

#### Scenario: A newer API changes the export format
- **WHEN** the SDK supports format version 2 and the export carries
  `formatVersion: 3`
- **THEN** the SDK rejects it with a contract error naming versions 3 and 2
  and advising an SDK upgrade, and returns no export

#### Scenario: The export format is supported
- **WHEN** the export carries `formatVersion: 2` and additional unknown keys
- **THEN** the SDK returns the validated export without the unknown keys

#### Scenario: An older export format is rejected
- **WHEN** the export carries `formatVersion: 1`
- **THEN** the SDK rejects it with a contract error and returns no export

## REMOVED Requirements

### Requirement: The SDK consumes link-aware export versions and manifests
**Reason**: The SDK no longer reads build-export format 1 (owner decision 11).
**Migration**: Replaced by "The SDK reads link-aware format 2 exports and manifests", which keeps the current behavior.

## ADDED Requirements

### Requirement: The SDK reads link-aware format 2 exports and manifests
The SDK SHALL support build-export format 2, preserve validated
`internalLinks` on every entry/global and assemble them with their source across
existing keyset pages. Every entry/global SHALL carry its manifest. Transport
validation SHALL continue to preserve authored JSON unchanged. Format mismatch,
page-version drift, malformed known keys and invalid manifest shape SHALL remain
contract errors. No target fetch, reference recursion or admin API SHALL be
added to public SDK reads.

#### Scenario: Target appears on a later export page
- **WHEN** a source on page 1 refers to a target on page 3
- **THEN** the SDK assembles all pages before site resolution without falsely declaring the target missing or issuing a target request

#### Scenario: Entry without a manifest
- **WHEN** an export page holds an entry without `internalLinks`
- **THEN** the SDK rejects the page with a contract error and returns no export
