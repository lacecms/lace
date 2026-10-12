## ADDED Requirements

### Requirement: SEO values have explicit admin and public contracts
Admin snapshot DTOs, both draft and published, SHALL carry
`seo: {title, description, image, canonical, noindex}` for entries of models
with SEO enabled. Unset values are `null` and `noindex` is a boolean. Entries
of other models SHALL omit the key. Create and save requests SHALL accept an
optional, nullable `seo` strict object whose keys are each optional:

- `title`, `description` and `canonical`: nullable strings;
- `image`: a nullable identifier;
- `noindex`: a boolean.

The request schema SHALL apply the shared SEO rules, so an invalid value fails
with `422 VALIDATION_FAILED` and an issue under `/seo`, and an unknown key is
rejected. Public entry DTOs (page, collection item, by-path, collection lists
and build-export `entries`) SHALL carry the same `seo` object for models with
SEO enabled and omit it otherwise. Public globals SHALL never carry `seo`.

#### Scenario: Read and save SEO in the admin
- **WHEN** an admin reads an entry of an SEO-enabled model whose draft has
  `{title: "Hello"}`
- **THEN** the draft DTO has `seo: {title: "Hello", description: null, image: null, canonical: null, noindex: false}`
- **WHEN** the client saves `seo: {canonical: "https://example.com/a"}`
- **THEN** the response draft has that canonical and every other SEO value is
  `null` or `false`

#### Scenario: Reject an invalid SEO request
- **WHEN** a save submits `seo: {canonical: "/a"}` or `seo: {title: 5}` or
  `seo: {keywords: "x"}`
- **THEN** the response is `422 VALIDATION_FAILED` with an issue under `/seo`

#### Scenario: Public entries carry SEO only for enabled models
- **WHEN** the export holds a published entry of an SEO-enabled model with no
  stored group and an entry of a model without SEO
- **THEN** the first carries `seo` with all values `null` and `noindex: false`,
  and the second has no `seo` key

### Requirement: Model DTOs and the build export describe SEO configuration
Content-model DTOs of pages and collections with SEO enabled SHALL carry
`seo: {description, image}`, where each value is a mapped field key or
`null`. The defaults global's DTO SHALL carry
`seoDefaults: {siteName, titleTemplate, description, image}`, with `null` for
unmapped optional values. The build export SHALL carry
`seo: {models, defaults}`:

- `models` maps the key of every SEO-enabled model to its `{description, image}`
  mapping;
- `defaults` is `{modelKey, siteName, titleTemplate, description, image}` for
  the defaults global, or `null` when no global declares `seoDefaults`.

The export schema SHALL treat a missing `seo` as `{models: {}, defaults: null}`,
so older exports stay valid, and the API SHALL always send it.

#### Scenario: Export with SEO configuration
- **WHEN** `posts` declares `seo: { description: "excerpt" }`, `home` declares
  `seo: true` and `settings` declares `seoDefaults: { siteName: "siteName" }`
- **THEN** the export `seo` is
  `{models: {home: {description: null, image: null}, posts: {description: "excerpt", image: null}}, defaults: {modelKey: "settings", siteName: "siteName", titleTemplate: null, description: null, image: null}}`

#### Scenario: Older export without the key
- **WHEN** an export without `seo` is parsed
- **THEN** it parses with `seo` equal to `{models: {}, defaults: null}`

### Requirement: Media usage DTOs name SEO image locations
The admin media usage location SHALL accept a third variant
`{source: "seo", field: "image", states}` alongside the field and block
variants, and admin media details SHALL report an SEO image usage with it.

#### Scenario: Usage of an SEO image
- **WHEN** media is used only as the published SEO image of one entry
- **THEN** its details list that entry with location
  `{source: "seo", field: "image", states: ["published"]}`
