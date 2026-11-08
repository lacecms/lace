## MODIFIED Requirements

### Requirement: Field-map owners declare sibling visibility rules
Models, group descriptors (including groups used as list items or reached
through nested groups and lists at every permitted composite depth) and block data
SHALL accept an optional `visibility` map. Each key SHALL name an immediate
sibling field of that owner (the target); each value SHALL be a rule of
exactly `{ field, values }`, where `field` names an immediate sibling field of
the same owner (the controller). An owner SHALL declare at most one rule per
target. Scalar descriptors, list descriptors, scalar list items and block
settings SHALL NOT accept `visibility`; block settings keep
`settingsVisibility`. System title, slug, SEO and block envelope values are
not fields of any owner and SHALL NOT be targets or controllers.

TypeScript inputs SHALL restrict targets and controllers to the owner's
immediate field keys, the controller to a `select` or `boolean` field, and
`values` to that controller's option literals or to booleans. Omitting
`visibility` SHALL preserve existing descriptors, metadata encodings and
hashes. Normalized rules SHALL be detached, deeply frozen, portable JSON and
round trip through JSON unchanged.

#### Scenario: Gallery item kinds
- **WHEN** a list's group item declares `kind` as a required select of `image` and `video` with default `image`, and `visibility` makes `media` depend on `["image"]` and `videoUrl` on `["video"]`
- **THEN** configuration loads, metadata round trips, and each item evaluates its own rules

#### Scenario: Boolean controller
- **WHEN** block data declares optional boolean `hasCta` and `visibility: { ctaUrl: { field: "hasCta", values: [true] } }`
- **THEN** configuration loads and `ctaUrl` applies only to blocks whose `hasCta` is true

#### Scenario: Unsupported placement
- **WHEN** `visibility` is supplied on a text descriptor, a list descriptor, a scalar list item, or names a block setting as target
- **THEN** normalization rejects it before startup with the owner path

#### Scenario: Unopted configuration
- **WHEN** a configuration declares no `visibility`
- **THEN** its normalized metadata, projection hash and structure hash equal those produced before this change
