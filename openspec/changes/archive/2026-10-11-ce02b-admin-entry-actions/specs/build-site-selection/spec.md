## MODIFIED Requirements

### Requirement: Current site identity is read-only and safe
The shared REST contract SHALL provide `GET /api/v1/admin/build-site` returning exactly `{ site: { id, label, url? } | null }`. `id` SHALL be 1–64 lowercase ASCII kebab-case characters and `label` SHALL be 1–80 ASCII letters, digits, spaces, hyphens or underscores, beginning and ending with a letter or digit. This identity SHALL be supplied explicitly by deployment configuration, never derived from filesystem paths, URLs, package metadata or credentials. The optional `url` SHALL come only from the `LACE_BUILD_SITE_URL` deployment setting and SHALL be the public site's base URL: an absolute `http` or `https` URL of at most 2048 characters with no credentials, query or fragment, returned with a trailing slash. An empty `LACE_BUILD_SITE_URL` SHALL count as unset. It SHALL NOT be derived from `LACE_PUBLIC_BASE_URL`, the admin origin or provider deployment data. Missing identity SHALL return `null`; partial or malformed configuration, including a site URL without an identity or a malformed site URL, SHALL fail startup with sanitized setting-name guidance that names the invalid settings and not their values. Node and Worker SHALL use the same contract. Callers SHALL require `content:read`; anonymous access SHALL fail with the existing authentication envelope. This endpoint SHALL accept no configuration mutations and return no source/output/lockfile paths or build credentials.

#### Scenario: Authenticated roles read the selected site
- **WHEN** an administrator, editor or viewer requests the current site
- **THEN** the response contains only its validated ID, label and configured site URL, or `null`, without changing configuration or queue state

#### Scenario: Anonymous access or malformed identity
- **WHEN** an anonymous caller requests identity or startup receives a label containing a path or credential punctuation
- **THEN** anonymous access is rejected and malformed startup configuration is rejected without exposing its value

#### Scenario: A site URL is configured
- **WHEN** a deployment sets `LACE_BUILD_SITE_ID=main-site`, `LACE_BUILD_SITE_LABEL=Main site` and `LACE_BUILD_SITE_URL=https://example.com/blog`
- **THEN** the identity read returns the URL `https://example.com/blog/`

#### Scenario: A malformed or orphaned site URL
- **WHEN** startup receives a site URL with credentials, a query, a fragment or a non-HTTP scheme, or a site URL without a site ID and label
- **THEN** startup fails naming `LACE_BUILD_SITE_URL` without exposing its value

#### Scenario: An empty site URL
- **WHEN** Compose passes an empty `LACE_BUILD_SITE_URL` with a valid identity
- **THEN** the identity read returns the ID and label without a URL
