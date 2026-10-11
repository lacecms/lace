## MODIFIED Requirements

### Requirement: The site view exposes only published content
The loader SHALL return a site view with the export `version` and lookups by resolved path, by model key, and by model key and slug, plus a public media URL builder and media lookups. Each entry SHALL expose its identifier, model key, CMS-resolved path, optional slug, title, publication time, field values, and blocks ordered by position, all taken from the published entry of the export; the view SHALL expose no draft snapshot, draft-shaped property, or editorial metadata. Lookups SHALL return no entry rather than fail when nothing matches, and listing an unknown model SHALL return an empty list. Entries listed by model SHALL be ordered by path. The view SHALL use each entry's CMS-resolved path as-is and SHALL NOT derive routes from patterns or depend on particular model keys. The site and each entry SHALL expose `media(id)`, returning the resolved media item of the export's media dictionary or nothing for an unknown ID, and `image(mediaId, usageAlt?)`, returning that item with its `alt` replaced by the effective alt text: the usage alt text when it is non-blank, otherwise the media item's alt text, otherwise an empty string. When a public media base URL is configured, resolved media URLs and the media URL builder SHALL use it; otherwise resolved media URLs SHALL be the URLs from the export, and the media URL builder SHALL return the export URL for a known ID and an API-base URL for an unknown ID. The view SHALL be immutable.

#### Scenario: A page looks up its entry by path
- **WHEN** a site requests the entry at `/` and a published entry has that resolved path
- **THEN** the view returns that entry's published title, publication time, fields, and ordered blocks and no draft data

#### Scenario: A route is not published
- **WHEN** a site requests a path, slug, or model with no published entry
- **THEN** the path and slug lookups return no entry and the model listing is empty

#### Scenario: Any model key can be listed
- **WHEN** an export contains published entries of a model named `recipes`
- **THEN** listing `recipes` returns those entries ordered by path without any loader change

#### Scenario: Media URLs use the public origin
- **WHEN** a public media base URL differs from the API base URL
- **THEN** media URLs from the view, including resolved media items, use the public media base URL and contain no build token

#### Scenario: Media URLs follow the export without a public origin
- **WHEN** no public media base URL is configured and the export's media dictionary gives an item the URL on the API's public origin
- **THEN** `media(id).url` and `mediaUrl(id)` both return that URL

#### Scenario: Usage alt text overrides media alt text
- **WHEN** a site calls `image(id, "Team at work")` for media whose alt text is `Office`
- **THEN** the returned item has alt `Team at work`, and `image(id)` returns alt `Office`

#### Scenario: No alt text anywhere
- **WHEN** a site calls `image(id)` for media without alt text
- **THEN** the returned item has an empty alt text

### Requirement: Inconsistent exports are rejected
The loader SHALL fail with `invalid_export` when an export contains two entries with the same path, or two entries of the same model with the same slug, naming the conflicting path or model and slug. An export whose entries or media dictionary violate the public contract SHALL fail as a contract violation before a site view exists.

#### Scenario: Duplicate slugs in a model
- **WHEN** two published entries of model `posts` share the slug `hello`
- **THEN** the loader fails with `invalid_export` naming `posts` and `hello`

#### Scenario: Duplicate paths across models
- **WHEN** two published entries of different models resolve to the same path
- **THEN** the loader fails with `invalid_export` naming that path
