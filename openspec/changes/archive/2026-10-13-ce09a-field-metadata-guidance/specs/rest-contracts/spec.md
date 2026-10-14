## ADDED Requirements

### Requirement: Placeholder metadata crosses validated recursive boundaries
Model and registered-block metadata, including block settings, SHALL transport supported optional placeholders at every allowed composite depth as JSON strings. Shared response validation and generated OpenAPI SHALL describe the supported kinds and reject malformed or misplaced placeholders. Public content values SHALL remain unchanged and SHALL NOT acquire descriptor metadata as stored content properties.

#### Scenario: Portable model and block guidance
- **WHEN** a model response or configuration metadata export contains nested model, block data and block settings fields with valid placeholders
- **THEN** clients validate the metadata without server code and retain all placeholder strings

#### Scenario: Forged unsupported placeholder
- **WHEN** a response carries a non-string placeholder or one on an unsupported descriptor kind at a nested depth
- **THEN** metadata validation rejects it before editable forms are rendered
