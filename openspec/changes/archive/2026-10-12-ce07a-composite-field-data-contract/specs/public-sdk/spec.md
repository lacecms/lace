## ADDED Requirements

### Requirement: Public SDK preserves composite published values
Every existing page, collection, slug, path, global and build-export operation
SHALL preserve nested objects, arrays, order and media IDs through validated
response parsing. Published-site views SHALL expose those values unchanged and
resolve nested media IDs with the existing site/entry media and image helpers.
Merged collection dictionaries SHALL retain existing merging rules. The SDK
SHALL retain its transport boundary without executing definitions or importing
CMS validation/render packages.

#### Scenario: Nested collection and global values
- **WHEN** a client loads a collection with nested fields and a global with a nested block through public reads and the export loader
- **THEN** both paths retain their exact nested values and resolve the referenced published media through existing helpers

#### Scenario: Empty composites are retained
- **WHEN** a response contains a present `{}` group and `[]` list
- **THEN** SDK parsing preserves both values rather than treating them as absent
