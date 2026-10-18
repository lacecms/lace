## Why

On the VPS (Docker Compose) deployment every request passes through the
`web` nginx service, whose `deploy/nginx.conf` sets no
`client_max_body_size`. nginx therefore applies its 1 MiB default, so any
media upload above 1 MiB is refused with `413` before it reaches the API,
although the API accepts images up to 10 MiB. This was reproduced on
2026-10-18 with the pinned `nginx:1.27.5-alpine` image and the repository
config: a 500 KB body reached the upstream, a 2 MiB body got `413` from nginx.
Every generated project ships the same managed file.

## Roadmap unit

Standalone fix selected on 2026-10-18 from the designer-portfolio gap
analysis (recorded in `backlog.md`). It is a prerequisite for the draft video
change `video-a-media-upload-delivery`, which raises the upload ceiling and
then only adjusts the configured value.

## What Changes

- Both copies of `deploy/nginx.conf` (repository and the managed template in
  `packages/create-lace/templates/deploy/`) declare an explicit server-wide
  `client_max_body_size 1m`, matching the API's default JSON body limit, and
  an exact `location = /api/v1/admin/media` that allows the API's media upload
  ceiling plus a multipart allowance (`11m`) and forwards the body without
  proxy buffering.
- A repository test ties the proxy values to the API constants and keeps the
  two copies identical, so a future limit change cannot silently diverge.
- A Docker probe script verifies the real nginx image: an 8 MiB upload reaches
  the upstream intact, a 12 MiB upload and a 2 MiB JSON body get `413`.
- Template version `0.31.0` with an upgrade instruction; generated-project
  snapshots regenerated.

## Non-goals

- Raising the API upload limit or adding new media formats (video change,
  image-delivery discussion).
- Caching, compression or other proxy tuning.
- Cloudflare: the Worker has no proxy in front of it and is unaffected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `vps-composition`: the reverse proxy forwards media uploads up to the API's
  upload ceiling and keeps other API bodies at the API's JSON limit.
- `project-generator`: a template upgrade delivers the corrected managed proxy
  configuration and protects ownership.

## Impact

- Files: `deploy/nginx.conf`, `packages/create-lace/templates/deploy/nginx.conf`,
  `packages/create-lace/src/inventory.ts` (`TEMPLATE_VERSION`),
  `packages/create-lace/templates/.lace/upgrade-instructions.json`,
  `tests/fixtures/generated-project/*.json`, a new root test and probe script,
  `deploy/README.md`.
- No API, database, package or image change. Existing VPS installations adopt
  the fix by applying the template upgrade and recreating the `web` service.
