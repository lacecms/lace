## ADDED Requirements

### Requirement: Acceptance verifies the bundled SILO deployment and volume transition

Acceptance SHALL compare the repository and generated Compose image defaults and check the resolved optional override, private network access, and persistent storage mount in every generated variant. The packed Node consumer SHALL exercise a pull or reuse of the declared prebuilt storage image through development and production startup. It SHALL verify private bucket initialization and media write and read behavior. The storage transition check SHALL start the previously shipped MinIO image on an isolated named volume, store media, replace only the storage image under the same project, and verify that the original media bytes and keys and new media persist across recreation and restart. Checks SHALL use locally owned state and clean up only resources they own.

#### Scenario: Generated development and production start from a pinned image
- **WHEN** a packed consumer starts against a newly initialized store with the default image
- **THEN** the current Compose definition uses SILO without building MinIO, and a private media upload can be read through Lace

#### Scenario: All generated variants resolve the same default and use an explicit override
- **WHEN** Compose resolves the repository development and VPS configurations and all generated variants with unset, empty, and explicitly supplied image values
- **THEN** the same pinned default or the explicitly supplied image is selected while the media mount and private network remain available

#### Scenario: A named volume written by the former release is reused
- **WHEN** the controlled MinIO-to-SILO transition and storage restart run
- **THEN** previously recorded object keys and bytes match on readback, the new write round trip succeeds, and the test leaves ordinary development and deployed volumes untouched
