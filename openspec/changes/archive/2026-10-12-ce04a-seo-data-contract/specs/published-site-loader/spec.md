## ADDED Requirements

### Requirement: Published entries pass stored SEO values through
A `PublishedEntry` SHALL expose `seo` exactly as the export carries it: the
stored values with `null` for unset values, for entries of SEO-enabled models,
and `undefined` otherwise. The loader SHALL not resolve fallbacks or apply
site defaults; that is the SEO resolver's responsibility.

#### Scenario: Entry with SEO
- **WHEN** the export entry for `/blog/hello` carries
  `seo: {title: "Hello", description: null, image: null, canonical: null, noindex: true}`
- **THEN** `site.byPath("/blog/hello").seo` equals that object

#### Scenario: Entry without SEO
- **WHEN** an export entry has no `seo` key
- **THEN** the published entry's `seo` is `undefined`
