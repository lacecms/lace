## MODIFIED Requirements

### Requirement: Media ingestion has an independent streaming size boundary
The HTTP application SHALL accept a media upload on `POST
/api/v1/admin/media` through one of two transports, chosen by the request
`Content-Type`, independently of the general JSON body limit:

- `multipart/form-data`: the application SHALL consume the part as a bounded
  binary stream and reject it at 10 MiB even when the request has no
  trustworthy content length. It SHALL reject missing, duplicate, or non-file
  multipart parts before creating metadata. A multipart upload SHALL be
  subject to the per-kind limits as well, so a video of at most 10 MiB is
  accepted through it.
- `application/octet-stream`: the request body SHALL be the file bytes, the
  display filename SHALL be the required `filename` query parameter, and a
  `Content-Length` header SHALL be required. The application SHALL reject a
  missing, malformed or zero length, and a missing or empty filename, with the
  stable validation envelope before reading the body; SHALL reject a declared
  length above the 64 MiB video limit, or an image whose declared length
  exceeds the 10 MiB image limit, with the stable payload-too-large error; and
  SHALL pass the body to the streamed media creation without buffering it.

Any other request content type SHALL be rejected with the stable validation
envelope at `/file`. The application SHALL discard or cancel a rejected
stream without forwarding bytes beyond the applicable limit to object storage.

#### Scenario: Streaming upload crosses the media limit
- **WHEN** a multipart file's cumulative bytes cross 10 MiB while arriving from
  a chunked request
- **THEN** the route returns the stable payload-too-large error and does not
  create a stored object or media metadata row

#### Scenario: A large video is uploaded as a binary body
- **WHEN** an editor posts a valid 50 MiB MP4 with `Content-Type:
  application/octet-stream`, `Content-Length: 52428800` and
  `filename=reel.mp4`
- **THEN** the route returns `201` with the created video's media DTO

#### Scenario: A binary upload declares too much
- **WHEN** a binary upload declares `Content-Length` 80 MiB, or declares
  12 MiB and begins with PNG bytes
- **THEN** the route returns the stable payload-too-large error, reads no
  further body bytes, and creates neither an object nor metadata

#### Scenario: A binary upload omits required values
- **WHEN** a binary upload has no `Content-Length` header or no `filename`
  query parameter
- **THEN** the route returns `422` `VALIDATION_FAILED` and creates nothing

#### Scenario: A small video arrives through multipart
- **WHEN** an editor uploads a valid 4 MiB WebM as the multipart `file` part
- **THEN** the route returns `201` with MIME type `video/webm`

## ADDED Requirements

### Requirement: Media binary responses serve byte ranges with safe headers
The public media route `GET /api/v1/public/media/:mediaId` and the admin
preview route `GET /api/v1/admin/media/:mediaId/preview` SHALL send
`Accept-Ranges: bytes`, `X-Content-Type-Options: nosniff`, the verified MIME
type and a `Content-Length` on every successful response. A request with one
satisfiable byte range in a `Range` header (`bytes=first-last`,
`bytes=first-` or `bytes=-suffix`) SHALL receive `206 Partial Content` with a
`Content-Range` of `bytes first-last/total` and only those bytes; a last
position beyond the end SHALL be clamped to the last byte. A range whose first
position is at or beyond the total size, or a suffix of zero, SHALL receive
`416 Range Not Satisfiable` with `Content-Range: bytes */total` and no body.
A `Range` header with several ranges, another unit or invalid syntax, and any
request carrying `If-Range`, SHALL receive the complete `200` response.
Authorization, eligibility and not-found behavior SHALL be identical for ranged
and complete requests.

#### Scenario: Safari requests the first two bytes of a video
- **WHEN** a client requests published video media of 5,000 bytes with
  `Range: bytes=0-1`
- **THEN** the response is `206` with `Content-Range: bytes 0-1/5000`,
  `Content-Length: 2`, `Accept-Ranges: bytes` and exactly two bytes

#### Scenario: A suffix range reads the end of a file
- **WHEN** a client requests the same media with `Range: bytes=-1000`
- **THEN** the response is `206` with `Content-Range: bytes 4000-4999/5000`

#### Scenario: An unsatisfiable range is requested
- **WHEN** a client requests the same media with `Range: bytes=5000-`
- **THEN** the response is `416` with `Content-Range: bytes */5000` and no body

#### Scenario: Multiple ranges fall back to the whole file
- **WHEN** a client requests `Range: bytes=0-1,10-20`
- **THEN** the response is `200` with all 5,000 bytes and `Content-Length:
  5000`

#### Scenario: A ranged request for unpublished media
- **WHEN** an anonymous client sends a `Range` header for media that no
  current publication uses
- **THEN** the response is the same not-found response as without a range
