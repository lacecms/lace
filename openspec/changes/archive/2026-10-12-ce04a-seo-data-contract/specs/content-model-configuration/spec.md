## ADDED Requirements

### Requirement: Routable models opt into the SEO system group
Configuration code SHALL be able to enable per-entry SEO metadata on a page or
collection with `seo: true`, or with `seo: { description?, image? }` naming
fallback fields of the same model. `seo: false` or an absent option SHALL mean
SEO is disabled. A named `description` field SHALL exist on the model and be a
`text` or `textarea` field. A named `image` field SHALL exist and be a `media`
field. Configuration SHALL reject unknown keys in the object, a reference to
an undeclared field, a field of an incompatible type, and `seo` on a global.
The normalized model SHALL record an enabled group with its mapping. A model
without SEO SHALL carry no `seo` property, so existing models keep their
hashes. Whether SEO is enabled SHALL be part of the structural hash. The
fallback mapping SHALL be excluded from the structural hash and included in
the projection hash and the public projection, like `listFields`.

#### Scenario: Enable SEO with fallback fields
- **WHEN** a collection declares `fields: { excerpt: field.textarea(), cover: field.media() }` and `seo: { description: "excerpt", image: "cover" }`
- **THEN** the normalized model and its public projection carry SEO enabled
  with that mapping

#### Scenario: Enable SEO without a mapping
- **WHEN** a page declares `seo: true`
- **THEN** the normalized model carries SEO enabled with no fallback fields

#### Scenario: Reject an incompatible fallback field
- **WHEN** `seo.image` names a `text` field, or `seo.description` names a
  `media`, `richText` or undeclared field
- **THEN** configuration normalization fails and names the model and field

#### Scenario: Reject SEO on a global
- **WHEN** a global definition supplies `seo`
- **THEN** configuration normalization fails before application startup

#### Scenario: Enabling SEO is structural, the mapping is not
- **WHEN** two otherwise identical models differ only in `seo: true` versus no
  `seo`
- **THEN** their structural hashes differ
- **WHEN** two otherwise identical models with SEO enabled differ only in
  their fallback mapping
- **THEN** their structural hashes are equal and their projection hashes differ

#### Scenario: Models without SEO keep their hashes
- **WHEN** a model that declares no `seo` option is normalized
- **THEN** its structural and projection hashes equal those computed before
  the SEO option existed

### Requirement: One global may declare site SEO defaults
A global SHALL be able to declare
`seoDefaults: { siteName, titleTemplate?, description?, image? }`. Each value
names a field of that global. `siteName`, `titleTemplate` and `description`
SHALL name `text` or `textarea` fields, and `image` SHALL name a `media`
field. Configuration SHALL reject a missing `siteName`, unknown keys, an
undeclared or incompatible field, `seoDefaults` on a page or collection, and a
second global that declares `seoDefaults`. `seoDefaults` SHALL be excluded
from the structural hash and included in the projection hash and the public
projection. No storage other than the global's own entry SHALL hold the
defaults.

#### Scenario: Declare site defaults on the settings global
- **WHEN** the `settings` global declares fields `siteName`, `titleTemplate`,
  `metaDescription` and `shareImage`, and
  `seoDefaults: { siteName: "siteName", titleTemplate: "titleTemplate", description: "metaDescription", image: "shareImage" }`
- **THEN** the normalized global and its public projection carry that mapping

#### Scenario: Reject two defaults globals
- **WHEN** two globals both declare `seoDefaults`
- **THEN** configuration normalization fails and names both model keys

#### Scenario: Reject defaults outside a global
- **WHEN** a page or collection declares `seoDefaults`
- **THEN** configuration normalization fails

#### Scenario: Changing the defaults mapping is projection-only
- **WHEN** a global's `seoDefaults` mapping changes and nothing else does
- **THEN** its structural hash is unchanged and its projection hash changes

### Requirement: Disabling SEO with stored data requires an explicit hint
A page or collection SHALL accept the temporary synchronization hint
`removedSeo: true`. Like the other hints, it SHALL be excluded from the
canonical structure, both hashes and the public projection. Configuration
SHALL reject `removedSeo` on a model that enables `seo` or on a global, and
any value other than `true`.

#### Scenario: Declare the hint after disabling SEO
- **WHEN** a collection that no longer declares `seo` declares `removedSeo: true`
- **THEN** normalization succeeds and its hashes equal those of the same model
  without the hint

#### Scenario: Reject the hint while SEO is enabled
- **WHEN** a model declares both `seo: true` and `removedSeo: true`
- **THEN** configuration normalization fails
