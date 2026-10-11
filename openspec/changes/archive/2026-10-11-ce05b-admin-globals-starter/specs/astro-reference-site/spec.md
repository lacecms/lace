## ADDED Requirements

### Requirement: Reference site renders site settings from a global
The reference configuration SHALL declare a `settings` global labelled "Site
settings" with a required text field `siteName` and an optional text field
`tagline`. Every reference-site route SHALL render a site header from the
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
