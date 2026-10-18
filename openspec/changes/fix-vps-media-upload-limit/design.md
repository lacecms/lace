## Context

See proposal.md for the reproduced failure. `docker-compose.yml` (repository
and template) mounts `deploy/nginx.conf` into `nginx:1.27.5-alpine` as the only
public entry point. The file has `location /api/`, `/admin`, `/health/` and
the static site, and no body-size directive. The API enforces its own limits:
`maxBodyBytes` 1,048,576 for JSON on both runtimes, and the media route skips
that limit and streams multipart up to `MAX_MEDIA_BYTES` (10 MiB) in
`packages/server/src/app.ts`. The template file is `managed`, so changing it
needs a template version, upgrade instruction and snapshot refresh, as in
template 0.8.0 (publication visibility).

## Goals / Non-Goals

**Goals:** let every upload the API accepts through the proxy; keep the
proxy from becoming a second, divergent source of limits; keep non-upload
routes as strict as the API.

**Non-Goals:** changing API limits, error-page styling, gzip or caching.

## Decisions

### D1. Server-wide 1m plus one exact media location

```nginx
client_max_body_size 1m;

location = /api/v1/admin/media {
    client_max_body_size 11m;
    proxy_request_buffering off;
    proxy_pass http://api:3000;
    # same proxy_set_header lines as /api/
}
```

`= /api/v1/admin/media` matches only the collection route (upload and list);
`/api/v1/admin/media/<id>` stays under `/api/` with 1m, which is enough for
metadata updates and deletes. `11m` is the 10 MiB ceiling plus 1 MiB for the
multipart envelope. `proxy_request_buffering off` hands bytes to the API as
they arrive, so the API's streaming boundary rejects an oversize chunked body
early and memory/disk use in nginx stays small; with a `Content-Length` above
`11m` nginx answers `413` before reading.

*Alternatives:* raising `client_max_body_size` for all of `/api/` (simpler,
but lets 11 MiB JSON reach the API on every route); `client_max_body_size 0`
on the media route (unbounded at the proxy, relies only on the API).

### D2. A consistency test instead of a comment

`tests/deploy-proxy.test.mjs` reads both `nginx.conf` copies, asserts they are
byte-identical, parses the server-level `client_max_body_size` (must be `1m`)
and the media location's value (must be ≥ `MAX_MEDIA_BYTES` and ≤
`MAX_MEDIA_BYTES + 1 MiB`, imported from `@lacecms/application`), and checks
`proxy_request_buffering off` and that the media location forwards the same
headers as `/api/`. When the video change raises the ceiling, this test fails
until the proxy follows.

### D3. Docker probe against the real image

`scripts/nginx-upload-probe.mjs` (run with `pnpm proxy:probe`) starts a Node
stub upstream on the host that counts received bytes and answers `201`, runs
`nginx:1.27.5-alpine` with the repository config and
`--add-host api:host-gateway` mapped to the stub's port, then sends: an 8 MiB
binary body to the media route (expect `201` and 8 MiB received upstream), a
12 MiB body (expect `413`, nothing received), and a 2 MiB JSON body to
`/api/v1/admin/models/posts/entries` (expect `413`). It removes the container
on exit. It is a manual/CI acceptance step like the other Docker probes, not
part of `pnpm test`.

### D4. Template 0.31.0

`TEMPLATE_VERSION` becomes `0.31.0`. A new first `configuration` entry in
`.lace/upgrade-instructions.json`: "Template 0.31.0: the managed
deploy/nginx.conf now allows media uploads up to the API limit (previously
nginx's 1 MiB default refused larger images) … recreate the web service with
`docker compose up -d web` … no new API, admin, CLI or builder artifacts."
Generated-project snapshots are refreshed with
`node scripts/generated-project-acceptance.mjs snapshots --update`.

## Risks / Trade-offs

- [A body between the API ceiling and `11m` receives the API's JSON
  `PAYLOAD_TOO_LARGE`, while a body above `11m` receives nginx's HTML `413`]
  → the admin checks size locally before sending; both are `413`.
- [Operators who edited `deploy/nginx.conf` get an upgrade conflict] →
  existing conflict reporting; the instruction quotes the two directives to
  merge by hand.

## Migration Plan

New projects get the fixed file. Existing VPS projects run the template
upgrade, then `docker compose up -d web`. Rollback restores the previous
managed file; no data is involved.
