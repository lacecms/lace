# Step 32B verification

Verified on 2026-10-04 with Node `24.12.0`, pnpm `12.3.4`, OrbStack (Docker 29.4.0) on macOS arm64. Candidate: package/generator/image version `0.1.0-alpha.2`, ownership template `0.14.0`, channel `next`. No npm publication, GHCR push, remote release or visibility change was performed.

## Version selection

`0.1.0-alpha.1` (template `0.4.0`) is published and stays immutable; `release/alpha.json` records it in `publishedVersions`, and `pnpm release:check` refuses a candidate listed there. Registry metadata checked on 2026-10-04: the twelve first-alpha scoped packages and `create-lace` list only `0.1.0-alpha.1` (`application`, `cli` and `sdk` also `0.0.0-stage`; `create-lace` has `next` and `latest` at `0.1.0-alpha.1`); `@lacecms/astro` and `@lacecms/render` return 404; `ghcr.io/lacecms/api:0.1.0-alpha.2` and `ghcr.io/lacecms/builder:0.1.0-alpha.2` report `manifest unknown`. This is availability evidence on that date, not a reservation. Recheck before publishing.

`release:check` now also requires the Dockerfile `LACE_VERSION` defaults, the versioned commands in the delivered guides and the block registry's `@lacecms/*` requirements to name the candidate. The registry items still required `0.1.0-alpha.1`; with `0.1.0-alpha.2` packages installed, `lace add block` would have reported the adapter and render core as missing.

## Exact artifact set

Prepared from clean source revision `75026e5fe3a444f8663f2ea885392cfccc9e642a`, fingerprint `7f2a4dce728b23c5c852d97f321c0d8ac6f1039958eab2acf79b56562b7d7449`, with `pnpm release:prepare --output .release-artifacts/alpha-2b`; `pnpm release:verify` recomputed every checksum (`complete: true`, `publicationEligible: true`). The inventory holds fifteen inspected package archives and four saved runtime images. Preparation built, loaded and smoke-tested API (native SQLite, explicit migrations, generated configuration, compiled admin, runtime paths) and builder (health, non-root work/output, pinned pnpm) separately on both platforms. [step-32b-artifacts.json](./step-32b-artifacts.json) records every package checksum, image ID and archive checksum and the consumer receipt. Image IDs are local config identities, not registry digests.

| Runtime | Platform | Local image ID |
| --- | --- | --- |
| API | linux/amd64 | `sha256:d3663200f5e7623b383b5c89c380aa0dd0426454e4566c94fb7a91b4fd37550c` |
| Builder | linux/amd64 | `sha256:1b9fe14dc99705c465705c7718cebea417ca9eed3e2b312df0610e65a0e8eb85` |
| API | linux/arm64 | `sha256:4802544d8fae6341dabd5c64ed145aff6a63c83b3535589ef95e2827432c60e8` |
| Builder | linux/arm64 | `sha256:f4f6bfecbaae628aeb131816efdbb5fa960cb57ec767c36ca68e42e395a24cc5` |

A first set (`.release-artifacts/alpha-2`, revision `4f932fa`) was superseded by the defect fix below. Its runtime package archives are byte-identical to the final set; only `create-lace` differs, because its templates changed.

## Consumer regressions against the exact set

`pnpm acceptance:release --artifacts .release-artifacts/alpha-2b` passed on `linux/arm64` with only the inventory's generator, archives and image IDs (journeys in the receipt: `snapshots`, `node-readme-browser`, `compose-release`, `cloudflare-pages-preview`, `publication-visibility`, `existing-astro`, `cloudflare-consumer`, `template-0.4.0-upgrade`):

- The packed generator reproduces the six reviewed byte-stable snapshots.
- README-driven Node consumer: env prepare with review edits, setup doctor, migration without `mkdir`, sync, bootstrap, `dev:api`, browser first-administrator setup, tour with persistence and replay, media upload, refused repeat bootstrap (operation, reason, next action), publication and Astro build/typecheck with all five blocks and media bytes.
- 25C journeys: roles and anonymous/build-token denial, later-draft isolation, Compose production release, terminal build failure with preserved release and explicit retry (builds `76cd306f…` version 3, failed `01M43ZYD8XNW…`, retried `01M43ZZVYH2R…` version 4), persistence across service recreation, and secret exclusion across generated files, extracted archives, image filesystems/configuration, static releases and diagnostics.
- Feedback journeys: static preview of a generated `--cloudflare` project, dev/manual/automatic publication visibility, the existing-Astro consumer (guide files, `lace add block` for all five blocks, safe rich text with an unsafe link failing the build, styling hooks, public media, operator edits kept across rerun and update, build-site mount), the packed Cloudflare consumer (Worker bundle with the packaged admin, local doctor, migrate/sync/bootstrap, expired-token recovery, browser setup/edit/publish, scheduled hook dispatch unavailable then accepted, Astro build, draft isolation, restart persistence, secret scan), and the upgrade of the published template `0.4.0` default and Cloudflare projects (managed conflict refused, upgrade applied, README, configuration and site source unchanged).

Both platforms passed preparation smokes; the full consumer journey ran on arm64 only and does not claim amd64 end-to-end coverage.

## Defect found and fixed

The first exact run stopped in the Compose production smoke: no publication build existed, and the builder failed the configuration-sync build with `version_changed`. Fresh processes in the API and dispatcher containers saw one user and published version 1, while the running API saw three users and version 3. On Docker Desktop and OrbStack the bind-mounted `.lace/data` crosses a VM file share without shared SQLite locks or WAL memory; the host-side refused `pnpm auth:bootstrap` opened and closed the database while the API container held it, and from then on other container processes no longer saw the API's writes. A minimal reproduction with the prepared API image confirmed it (with host access a fresh container reader saw one of two rows; without it, both). The generated README and operations guide now require stopping `api` and `dispatcher` around host database commands (`pnpm db:migrate`, `pnpm content:sync`, `pnpm auth:bootstrap`), the `0.14.0` upgrade instructions name the rule, and the acceptance follows it. Linux hosts share the kernel with their containers and are not affected. A product-level guard is later work.

Acceptance-tooling corrections that do not change shipped artifacts: role sign-ins honor Better Auth's three-per-ten-seconds sign-in limit (`X-Retry-After`) instead of failing; the packed migration smoke expects the actionable 26B diagnostic; the post title published by the Node journey is published again after the 25C recovery journey, before the feedback journeys that expect it; failure output includes dispatcher, API and local Worker logs. During a ten-minute window, the local Cloudflare Worker repeatedly lost its connection right after the post-commit deploy-hook dispatch, also at the unchanged 32A revision. It passed on every later run, including this one, and is recorded as transient local-runtime behavior.

## Quality checks

Release model/artifact/image and acceptance-helper tests (84), `create-lace` (55) and CLI (236 including the new 0.13 → 0.14 upgrade test) passed; the snapshot check, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm release:check` and strict OpenSpec validation passed.

## Remaining before and after publication

- Publication is a separate owner act per [alpha-release.md](../../alpha-release.md): recheck registry state and `create-lace` rights, publish the exact tarballs with `--tag next`, push the saved platform images, assemble manifests, make the GHCR packages public, verify anonymous installs/pulls, then append `0.1.0-alpha.2` to `publishedVersions`.
- Step 33A/33B: cross-runtime and browser suites, and the security pass, including the 32B findings: the Node rate limiter keys clients on the first, client-controlled `X-Forwarded-For` value; Better Auth's sign-in limiter falls back to one shared bucket without a trusted client-IP header; and host database commands are documented, not guarded.
- Step 33C: real VPS and Cloudflare account deployments (see `docs/cloudflare-deployment-handoff.md`); local simulation does not satisfy them. Stable MVP status depends on Step 33.
