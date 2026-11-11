## ADDED Requirements

### Requirement: Collections may omit their route
Configuration code SHALL be able to define a collection with `defineCollection`
without a `route`. A route-less collection SHALL accept every other collection
option (key, version, label, description, fields, allowed blocks, `listFields`,
`listOptions` and the synchronization hints) with the same validation as a
routed collection, and SHALL reject `seo`. A supplied `route` SHALL keep the
canonical route rules; an empty or otherwise invalid route SHALL still fail. A
route-less collection SHALL take part in no path or route collision check. The
normalized model, the runtime projection and the public projection SHALL carry
`kind: "collection"` and no `route`. Whether a collection has a route SHALL be
part of its structural hash, and a collection that declares a route SHALL keep
the hashes it had before route-less collections existed.

#### Scenario: Define a route-less collection
- **WHEN** configuration defines `defineCollection({ key: "testimonials", version: 1, fields: { quote: field.textarea({ required: true }) }, listFields: ["quote"] })`
- **THEN** the normalized configuration contains a `collection` model
  `testimonials` without a route, with its list fields and deterministic
  hashes

#### Scenario: Route-less collections never collide
- **WHEN** configuration defines two route-less collections and a page at `/`
- **THEN** normalization succeeds without a path or route collision

#### Scenario: Removing a route changes the structure
- **WHEN** two otherwise identical collections differ only in `route: "/cv/:slug"`
  versus no route
- **THEN** their structural hashes differ

#### Scenario: Routed collections keep their hashes
- **WHEN** a collection that declares `route: "/blog/:slug"` is normalized
- **THEN** its structural and projection hashes equal those computed before
  route-less collections existed

## MODIFIED Requirements

### Requirement: Routable models opt into the SEO system group
Configuration code SHALL be able to enable per-entry SEO metadata on a page or
collection that declares a route with `seo: true`, or with `seo: { description?, image? }` naming
fallback fields of the same model. `seo: false` or an absent option SHALL mean
SEO is disabled. A named `description` field SHALL exist on the model and be a
`text` or `textarea` field. A named `image` field SHALL exist and be a `media`
field. Configuration SHALL reject unknown keys in the object, a reference to
an undeclared field, a field of an incompatible type, and `seo` on a global or on a collection without a route.
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

#### Scenario: Reject SEO on a route-less collection
- **WHEN** a collection without a `route` supplies `seo: true`
- **THEN** configuration normalization fails before application startup and
  names the model
