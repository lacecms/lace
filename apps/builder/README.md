# Fixed-command VPS builder (Step 21B)

Build the image from the repository root:

```sh
docker build -f apps/builder/Dockerfile -t lace-builder:local .
```

The image runs Node 24.12.0 and pnpm 12.3.4. Mount a Lace project at `/source`
read-only, a scratch volume at `/work`, and a static-output volume at `/output`.
Select the Astro project through deployment-only `LACE_BUILD_SITE_DIR` (default `site`) and `LACE_BUILD_OUTPUT_DIR` (default `dist`). Reference Compose explicitly selects `apps/site`. Standalone installations select `.` and require root `package.json`, `pnpm-lock.yaml` and a direct Astro dependency; selected workspace packages also require the root `pnpm-workspace.yaml` and the same installation lockfile. Host `LACE_BUILD_SOURCE_ROOT` is a Compose bind source, never a path interpreted by this process. The source mount must exist, be readable and remain read-only.

The service validates paths, copies filtered source to scratch, runs fixed `pnpm install --frozen-lockfile`, then `pnpm --dir <site> exec astro build --outDir <output>`. It requires complete static output, rejects linked/special output, and serves no public traffic. Traversal, absolute/option-like relative paths, symlink source, independent nested lockfiles and output overlapping source are invalid. Environment files, credentials, dependencies, prior output and CMS data are excluded. Custom package build scripts are not selected. Workspace dependencies must be consumable by that direct build; the reference Astro configuration bundles local SDK dependencies from source without relying on old `dist` files.

For an existing root Astro site with CMS in `cms/`, use host source `..`, site `.` and output `dist`; for a workspace with `web/`, use host source `..`, site `web` and output `dist`. External source needs the user-owned published-export SDK/version integration. See the generated operations guide's Selecting the build site section. Use compatible Step 29A or later artifacts; published alpha images do not acquire these settings retroactively.

Provide `LACE_BUILDER_SECRET` (at least 32 characters, shared only with the API),
`LACE_API_BASE_URL` (trailing slash), `LACE_BUILD_TOKEN` (read-only published
export token), and optionally `LACE_PUBLIC_BASE_URL`. Configure the Node API
with `LACE_BUILDER_URL` and the same `LACE_BUILDER_SECRET`. The builder listens
on container port 8788; Compose connects it to the API through an internal
network without publishing that port. `/health` returns only `{"status":"ok"}`.

The API sends `POST /build` with `Authorization: Bearer <secret>` and exactly
`{"buildId":"...","targetVersion":N}`. Responses contain a fixed status, a
fixed-vocabulary log summary, and on failure one safe reason code. Build output
and environment values are never returned. Static output is under
`/output/releases/`; `/output/current` is a
relative symlink switched only after a complete version-matched build. The two
most recent successful releases are kept. If a build fails, `current` remains
unchanged. Roll back by atomically replacing `current` with a relative symlink
to the retained previous release.

## Source failures (33C)

The disposable copy excludes only the installation-root `AGENTS.md` and
`CLAUDE.md` service documents in addition to the existing exclusions. These
entries are skipped whether regular files or links; their targets are never
read. The same filenames inside site source are not excluded. All other
included links fail, even if their targets are inside the installation.

Authenticated failures may include `path`, an installation-relative ASCII
entry of at most 512 characters. Absolute locations, link targets, credential
paths, unsafe filenames and raw tool output are omitted. Responses are bounded
to 1024 bytes. Builds preserves the specific reason as `error`, the optional
entry as `errorPath`, and shows the build ID and a correction. Pending failures
are automatically retried; after eight failed attempts administrators can retry.

| Reason | Correction |
| --- | --- |
| `source_symlink` | Replace the included link with a regular source entry. |
| `source_unreadable` | Restore read/traverse access for the image's `node` user. |
| `source_missing` | Restore the required file or directory, such as the root lockfile. |
| `source_special_file` | Replace the FIFO/socket/device with regular source. |
| `source_invalid` | Check selected paths, manifests, Astro dependency and layout. |
| `install_failed` | Check the frozen root lockfile and dependency availability. |
| `build_failed` | Run the selected Astro build locally and correct its source/output. |
| `version_changed` | Build the latest version after publication settles. |

The application also recognizes `trigger_unavailable`, `build_timeout`, and
`invalid_build_event`; `provider_failed` is the unknown-error fallback. Neither
failure nor a queued retry changes the last successful release.

Upgrade API, dispatcher, admin and builder together. Existing reason-only build
errors remain readable; path-bearing errors use JSON in the existing SQL text
column without a schema migration. Before downgrading, stop dispatch, back up
state and replace validated structured errors with their reason strings,
discarding path metadata. Do not delete history or change statuses/attempts.
