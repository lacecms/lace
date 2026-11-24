## ADDED Requirements

### Requirement: Admin thumbnails use private authenticated delivery
The HTTP application SHALL expose `GET /api/v1/admin/media/:mediaId/thumbnail` as a browser-session-only route and require `content:read` with the original admin preview's active-item eligibility. It SHALL return the bounded derivative as `image/webp` with `Cache-Control: private, no-cache` and a strong `ETag` that identifies the returned bytes independently of the original binary and metadata validators. The response SHALL reveal no private storage location or credential.

Authorization and eligibility SHALL be evaluated before opening the stored derivative, attempting generation or evaluating a validator. A matching `If-None-Match`, including its supported weak or wildcard form, SHALL return `304` with the same cache headers and no body only for an available stored derivative. A malformed validator SHALL be ignored. An unknown or inactive item SHALL receive the existing admin media not-found response. An unavailable derivative for an eligible item SHALL return a sanitized `503 MEDIA_THUMBNAIL_UNAVAILABLE` with `Cache-Control: no-store`. This endpoint SHALL NOT redirect to an original.

#### Scenario: A signed-in viewer reads an unpublished thumbnail
- **WHEN** a viewer opens the thumbnail route for an active unpublished media item
- **THEN** the response contains a bounded WebP with private cache control and its own validator

#### Scenario: A previously valid validator is replayed after loss of access
- **WHEN** a request with a cached thumbnail validator arrives anonymously, with an import or build token, without content read permission, or after the item becomes inactive
- **THEN** the caller receives the applicable authentication, authorization or not-found response without thumbnail bytes or a `304`

#### Scenario: A thumbnail and original revalidate independently
- **WHEN** an authorized client sends the original's validator to the thumbnail route and later sends the thumbnail validator
- **THEN** the first response includes the thumbnail bytes and the second is a bodyless `304` with the thumbnail's cache headers

#### Scenario: A wildcard is sent with an unavailable derivative
- **WHEN** an authorized thumbnail request contains `If-None-Match: *` and the derivative is unavailable
- **THEN** the route responds with the sanitized unavailable error and provides no original, redirect or `304`
