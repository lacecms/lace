## ADDED Requirements

### Requirement: Media fields declare accepted media kinds
A media field, at any nesting depth in model fields, block fields, groups and
lists, SHALL accept an optional `accept` option: a non-empty array of unique
media kinds, each `image` or `video`. A media field without `accept` SHALL
accept images only. Normalization SHALL order the kinds as `image`, `video`
and SHALL omit an `accept` equal to `["image"]`, so a configuration that does
not widen a media field keeps its normalized definition, projection hash and
structural hash. The normalized option SHALL appear wherever normalized field metadata is
projected, including the metadata the admin receives.
`accept` SHALL be rejected on every other field kind, and an empty array, an
unknown kind, a duplicate kind or a non-array value SHALL fail configuration
normalization with a descriptive error. The `accept` option SHALL be
structural: it contributes to the structural hash.

#### Scenario: A field accepts videos and images
- **WHEN** configuration defines `field.media({ accept: ["video", "image"] })`
- **THEN** the normalized definition carries `accept: ["image", "video"]`

#### Scenario: The default stays images only
- **WHEN** two configurations differ only in that one media field omits
  `accept` and the other declares `accept: ["image"]`
- **THEN** both normalize to the same definition and the same structural and
  projection hashes, equal to the pinned hashes before this option existed

#### Scenario: Invalid accepted kinds are rejected
- **WHEN** a media field declares `accept: []`, `accept: ["audio"]` or
  `accept: ["video", "video"]`, or a text field declares `accept`
- **THEN** configuration normalization fails before a definition is returned
