## MODIFIED Requirements

### Requirement: Reference site renders site settings from a global
The reference configuration SHALL declare a `settings` global labelled "Site
settings" with a required text field `siteName` and optional fields
`tagline` (text), `titleTemplate` (text), `description` (textarea) and `image`
(media), and SHALL declare `seoDefaults` on it mapping `siteName`,
`titleTemplate`, `description` and `image`. Every reference-site route SHALL render a site header from the
published `settings` global read through the packaged published-site view of
the same build export, with no additional CMS request. The header SHALL show
the published `siteName`, and the published `tagline` only when it is a
non-empty string. When the global is not published, or a value is missing or
not a non-empty string, the header SHALL fall back to static values defined in
site source. Navigation SHALL stay static site source. The committed export
fixture SHALL contain a published `settings` global.

#### Scenario: Fixture build with a published global
- **WHEN** the committed export fixture with a published `settings` global is
  built
- **THEN** every emitted route shows the fixture's site name and tagline in its
  site header

#### Scenario: Live build without a published global
- **WHEN** a live build reads an export that has no `globals` entry for
  `settings`
- **THEN** the build succeeds with one export read and every route shows the
  static fallback site name and no unpublished value

#### Scenario: A draft-only setting exists
- **WHEN** the CMS draft of `settings` has a site name that was never
  published
- **THEN** the generated site does not contain that draft value

## ADDED Requirements

### Requirement: Reference site emits SEO metadata, a sitemap and robots
The reference configuration SHALL enable SEO on `home`, `about`, `posts` and
`notes`, with `notes` mapping its `summary` field as the description fallback.
Every reference-site route SHALL render its head metadata through the
adapter's SEO head component from `site.seo(entry)`, with `og:type` `article`
for posts and notes and `website` otherwise. The site SHALL provide
user-owned `sitemap.xml` and `robots.txt` endpoints built with the adapter's
helpers. The fixture data mode SHALL pass `LACE_BUILD_SITE_URL` and
`LACE_SITE_INDEXING` from the environment to the loader. The committed export
fixture SHALL contain the `seo` section, stored SEO values on at least one
entry, including one entry with `noindex`, and a published defaults global
with every mapped value.

#### Scenario: Fixture build with a site URL
- **WHEN** the fixture is built with `LACE_BUILD_SITE_URL=https://site.example/`
- **THEN** every route has a templated or stored title and Open Graph tags
  with the resolved image; every route without a stored canonical URL has a
  canonical URL under `https://site.example/`, while the entry with a stored
  canonical URL on another origin keeps it and is absent from `sitemap.xml`;
  the `noindex` entry has `noindex, follow` and is absent from `sitemap.xml`;
  and `robots.txt` names `https://site.example/sitemap.xml`

#### Scenario: Fixture build without a site URL and with indexing off
- **WHEN** the fixture is built without `LACE_BUILD_SITE_URL` and with
  `LACE_SITE_INDEXING=off`
- **THEN** only the entry with a stored canonical URL has a canonical link and
  `og:url`, every route has
  `noindex, nofollow`, no `sitemap.xml` is written, `robots.txt` disallows
  everything, and the build succeeds
