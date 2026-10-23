## ADDED Requirements

### Requirement: URL fields declare embed provider restrictions

A URL descriptor SHALL accept optional `embedProviders`, a non-empty array of
unique values from `youtube` and `vimeo`. It SHALL normalize order to `youtube`,
then `vimeo`, retain the restriction in serializable field metadata, preserve
string value inference and reject unknown, duplicate, empty or incorrectly typed
values and usage on another field kind. Restricted default URLs SHALL satisfy
the provider grammar. Omitting the option SHALL preserve existing ordinary URL
behavior, metadata and configuration hashes. The option SHALL be structural;
config synchronization SHALL treat adding or narrowing a restriction as breaking
and removing or widening it as compatible, subject to other simultaneous changes.

#### Scenario: Portable provider metadata
- **WHEN** a URL descriptor declares `embedProviders: ["vimeo", "youtube"]`
- **THEN** metadata round-trips with `["youtube", "vimeo"]` and its inferred value remains a string

#### Scenario: Reject invalid declarations
- **WHEN** a descriptor declares an empty list, duplicate or unknown providers, a non-array, the option on a text field or a default outside its declared providers
- **THEN** definition fails before startup with an error identifying the option or default

#### Scenario: Ordinary fields remain stable
- **WHEN** an existing configuration does not use `embedProviders`
- **THEN** its URL validation, normalized structure and hashes remain unchanged

#### Scenario: Provider changes affect schema safety
- **WHEN** a synchronized descriptor gains a restriction or narrows from both providers to Vimeo
- **THEN** evolution classifies it as breaking; the reverse changes are compatible unless another change is breaking
