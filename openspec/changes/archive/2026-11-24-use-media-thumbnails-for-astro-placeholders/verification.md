# MP2 verification

## Cross-runtime route

The same HTTP acceptance ran against local Node/SQLite/SILO and Worker/D1/R2.
Node used Sharp. The local Worker supplied the deterministic Images test
binding and used native R2 storage. On each runtime the build and admin routes
returned matching stored WebP bytes and validators. A strong, weak or
wildcard match returned a bodyless `304`. A malformed validator returned
`200`. The cold request opened one original inside the CMS; subsequent reads
opened none. Anonymous requests, sessions, import tokens and rejected or
revoked build tokens received the Bearer challenge. The build token was
refused by the admin thumbnail endpoint. Draft-only or unpublished media
returned `404` without storage reads. An injected derivative storage failure
returned sanitized, non-cacheable `503`. The server contract suite confirmed
that the route and its OpenAPI entry are absent without build verification.

## Builds and paint

Cold counts are for the media introduced by each served image fixture. Warm
builds reused the same API base and cache. Bytes are thumbnail response body
bytes and exclude protocol headers.

| Fixture and phase | Original requests | Thumbnail responses | Thumbnail bytes |
| --- | ---: | --- | ---: |
| Reference cold | 5 | 3 × `200`, 1 × `404` | 686 |
| Reference warm | 0 | 2 × `304`, 1 × `200`, 1 × `404` | 292 |
| Packed starter cold, four added assets | 4 | 2 × `200`, 1 × `404` | 456 |
| Packed starter warm, four added assets | 0 | 1 × `304`, 1 × `200`, 1 × `404` | 252 |

Each cold optimized original was requested once by the build, including the
animated and missing-thumbnail cases. Hero and three video posters in the
reference fixture shared one thumbnail read. In the packed starter the same
photo supplied Image, Gallery and a video poster. The alpha-bearing fixture
was read again on the warm build because it produced no cached blur. The
original public URLs, lightbox, WebP variants and GIF frame counts passed the
existing checks. The reference fixture built offline in its default mode.
Static output contained neither the build credential nor the thumbnail path.

Chromium ran at 1280 × 900 with JavaScript disabled. The local server held the
selected responsive WebP response until after the first screenshot sample.
The hero used a blue test derivative so a pixel sample could distinguish the
inline blur from the orange responsive variant. Mean RGB in the same 12 × 12
pixel region was `(41, 98, 199)` before release and `(205, 136, 68)` after
decode. The image box stayed 1200 × 630 CSS pixels at `(8, 269.875)`. The home
HTML body was 4,173 bytes in the final run. The browser made one image request, transferring a
954-byte responsive WebP body, and zero thumbnail requests.

## Checks

- Application media (19), server/public binary/OpenAPI (30), SDK client and
  loader (125), render (107), Astro (93), protected Astro preview (12), and the
  cross-runtime route (2) passed.
- The SDK, render and Astro packaged suites, the reference site's four
  packaged tests and `pnpm acceptance:starter` passed.
- `pnpm openapi:generate` and `pnpm openapi:check` passed. The drift command
  compared the regenerated artifact in a temporary Git index so it could
  verify reproducibility before the working-tree change was committed.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and strict OpenSpec
  validation of MP2 passed.
