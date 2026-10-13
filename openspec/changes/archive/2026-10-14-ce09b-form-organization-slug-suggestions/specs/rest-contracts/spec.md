## ADDED Requirements

### Requirement: Form layouts cross metadata boundaries as validated JSON
Shared model, group and block metadata schemas and converters SHALL retain optional `layout` and block `settingsLayout` with identical behavior on Node and Cloudflare. Schemas SHALL enforce the portable shape and references against each owner's field map, including nested list-item groups. Metadata without layouts SHALL retain its existing representation. Public/admin content mutation payloads and entry/build-export content values SHALL contain no layout or UI state. Existing content create/save revision, validation, authorization and route-conflict rules SHALL remain unchanged.

#### Scenario: Round-trip recursive metadata
- **WHEN** metadata includes model tabs, block sections, a settings layout and nested list-item group layouts
- **THEN** JSON serialization and shared schema parsing preserve their order and options without functions or infrastructure imports

#### Scenario: Refuse malformed metadata
- **WHEN** metadata supplies unknown fields, duplicate placement, an unsupported mode or invalid nested references
- **THEN** shared response validation rejects it at the correct owner

#### Scenario: Keep content transport unchanged
- **WHEN** a draft is created, saved or published using configured layouts
- **THEN** content DTOs retain existing paths and data shapes without layout keys or selected-tab state
