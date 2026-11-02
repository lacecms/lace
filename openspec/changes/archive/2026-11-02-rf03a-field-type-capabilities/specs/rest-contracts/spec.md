## ADDED Requirements

### Requirement: OpenAPI descriptor schemas match the shared descriptor normalizer

Generated OpenAPI field descriptor schemas (`FieldDefinition`,
`GroupFieldDefinition`, `ListFieldDefinition`, the block setting alternatives
of `BlockMetadata`) SHALL be derived from the field type capability
declaration of `field-descriptors`: the documented kinds, which kinds carry
`placeholder`, the JSON type of each `defaultValue` and the block setting
kinds. They SHALL document every descriptor property that shared metadata
validation accepts: URL fields SHALL document optional `embedProviders` as a
nonempty unique array of `youtube` and `vimeo`, group fields and
`BlockMetadata` SHALL document optional `layout`, and `BlockMetadata` SHALL
document optional `settingsLayout`, through one `FormLayout` schema with mode
`sections` or `tabs` and nonempty groups of key, label, optional description
and nonempty field keys. Semantic constraints that JSON Schema cannot express
(length and range ordering, default conformance, option uniqueness with
presentation, layout references to sibling fields, composite depth) SHALL
remain enforced by shared runtime validation and SHALL stay described in
schema descriptions.

For a corpus that contains, for every field kind, a descriptor with every
option that kind accepts and descriptors with an unknown property, an option
of another kind or a wrongly typed default, the OpenAPI descriptor schema
and the shared normalizer SHALL accept and reject the same descriptors.
Runtime validation, response shapes and every other generated OpenAPI schema
SHALL remain unchanged.

#### Scenario: Provider-restricted URL metadata is documented

- **WHEN** a model response contains a URL field with `embedProviders:
  ["youtube"]` and a group with a `tabs` layout
- **THEN** the response passes shared metadata validation and validates
  against the generated `FieldDefinition` and `GroupFieldDefinition` schemas

#### Scenario: Schema and normalizer agree on the corpus

- **WHEN** the descriptor corpus derived from the capability declaration is
  checked against both the OpenAPI descriptor schema and the shared
  normalizer
- **THEN** each descriptor receives the same accept or reject verdict from
  both, including rejection of a placeholder on a boolean field and of
  `embedProviders` on a text field

#### Scenario: Unrelated OpenAPI output is unchanged

- **WHEN** `apps/api/openapi/api-v1.json` is regenerated
- **THEN** its diff is limited to the field descriptor schemas,
  `BlockMetadata` and the new `FormLayout` schema
