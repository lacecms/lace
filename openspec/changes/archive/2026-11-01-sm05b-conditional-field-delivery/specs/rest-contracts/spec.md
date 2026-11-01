## MODIFIED Requirements

### Requirement: Field visibility crosses metadata boundaries as validated JSON
Shared model, group and block metadata schemas and converters SHALL retain
optional `visibility` at model, group (including nested list-item groups at
every allowed depth) and block-data positions with identical behavior on Node
and Cloudflare. Validation SHALL apply the `conditional-fields` load-time
rules against each owner's field map and SHALL accept metadata only when it
equals its own normalization. Generated OpenAPI SHALL describe `visibility`
on content models, group field metadata and block metadata as a map of
`{ field, values }` rules without additional properties, and SHALL state that
a hidden field is not required, is validated and retained as a draft value,
and is omitted from published snapshots, public reads and build exports.
Block settings metadata SHALL keep `settingsVisibility` unchanged. Metadata
without visibility SHALL retain its existing representation. Content mutation
payloads, entry DTOs and build-export values SHALL acquire no visibility keys
or computed visibility state; published values SHALL omit hidden targets
without changing DTO shapes.

#### Scenario: Round-trip recursive visibility
- **WHEN** a model response contains model-level rules, block data rules and rules inside a list-item group
- **THEN** shared schema parsing and JSON serialization preserve them unchanged

#### Scenario: Forged invalid rule
- **WHEN** a response carries a rule with an unknown controller, a chain, an undeclared option or an extra property at any owner
- **THEN** metadata validation rejects it before editable forms are rendered

#### Scenario: Content transport unchanged
- **WHEN** a draft with conditional fields is created, saved or read
- **THEN** content DTOs keep existing paths and shapes, including retained hidden values, without visibility metadata

#### Scenario: Published values validate without hidden targets
- **WHEN** a public entry read or build export page omits a required target that its controller hides
- **THEN** the shared public DTO schemas and the SDK accept the response

#### Scenario: OpenAPI documents published omission
- **WHEN** the generated OpenAPI document is inspected
- **THEN** the `FieldVisibility` schema description states that hidden values are retained in drafts and omitted from published content
