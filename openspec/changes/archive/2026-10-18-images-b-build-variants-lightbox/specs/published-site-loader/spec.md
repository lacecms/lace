## ADDED Requirements

### Requirement: Resolved media carry a build source URL
Each resolved media item of the site view SHALL carry `sourceUrl`, the public media URL of the item under the configured API base URL (the origin the build already reads the export from), independent of the public media base URL and of the export's media URL. The build token SHALL never appear in `sourceUrl`. The loader SHALL accept an `optimizeImages` option, default `true`; when it is `false`, resolved media items SHALL carry no `sourceUrl`, and every other view value SHALL be unchanged. The media item returned by `image(mediaId, usageAlt?)` SHALL carry the same `sourceUrl` as `media(mediaId)`.

#### Scenario: Build source differs from the public URL
- **WHEN** the API base URL is `http://api:8787/lace` and the public media base URL is `https://cms.example.com`
- **THEN** `media(id).url` is `https://cms.example.com/api/v1/public/media/<id>` and `media(id).sourceUrl` is `http://api:8787/lace/api/v1/public/media/<id>`

#### Scenario: Build source without a public origin
- **WHEN** no public media base URL is configured
- **THEN** `media(id).url` is the export's URL and `media(id).sourceUrl` is the item's public media URL under the API base URL

#### Scenario: Optimization switched off
- **WHEN** a loader is created with `optimizeImages: false`
- **THEN** no resolved media item or `image()` result carries `sourceUrl`, and URLs, dimensions and alt texts are unchanged

#### Scenario: Token stays out of build sources
- **WHEN** a view is built with a build token
- **THEN** no `sourceUrl` contains the token
