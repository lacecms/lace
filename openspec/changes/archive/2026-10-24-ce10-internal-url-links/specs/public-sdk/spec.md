## ADDED Requirements

### Requirement: The SDK consumes link-aware export versions and manifests
The SDK SHALL support build-export formats 1 and 2, preserve validated
`internalLinks` on every entry/global and assemble them with their source across
existing keyset pages. A format 2 entry/global SHALL carry its manifest; a
format 1 entry/global without it SHALL read as no internal references. Transport
validation SHALL continue to preserve authored JSON unchanged. Format mismatch,
page-version drift, malformed known keys and invalid manifest shape SHALL remain
contract errors. No target fetch, reference recursion or admin API SHALL be
added to public SDK reads. Older SDKs supporting only format 1 SHALL reject
format 2 with the existing actionable upgrade error.

#### Scenario: Target appears on a later export page
- **WHEN** a source on page 1 refers to a target on page 3
- **THEN** the SDK assembles all pages before site resolution without falsely declaring the target missing or issuing a target request

#### Scenario: Legacy fixture
- **WHEN** a valid format 1 fixture has no manifests and uses only manual URLs
- **THEN** the upgraded SDK and loader accept it with unchanged rendering
