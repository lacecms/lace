# Opt-in draft preview verification

## Local acceptance on 2026-11-21

`pnpm acceptance:draft-preview` passed all six scenarios with a fresh API
image, builder image and packed consumer graph. The generator produced
byte-stable snapshots for all six starter, existing-site and no-site
variants with and without Cloudflare.

- The reference Node stack started on HTTP without TLS or a preview runner.
  With the preview variant, Chromium created a saved-draft preview from the
  pinned reference commit, opened it on the separate trusted HTTPS host and
  read the original private image. A request without the preview session
  received 401. The Astro development page reloaded over WSS. Stop and
  ordinary restart preserved the local project and removed the preview services.
- Generated Node development and VPS used their shipped Compose entry points,
  migrated SQLite, private SILO and a fixed builder. An editor could create and
  view a committed-source preview after opting in. Incomplete configuration
  rejected creation. Withdrawal rejected the previous preview cookie and
  private runner requests. The published export remained equal across the
  checks, and the VPS served the same public release.
- The standard generated Worker ran the Wrangler bundle with real local D1,
  private R2, persisted Lace sessions and the preview maintenance cron.
  Miniflare supplied the virtual ingress hostname and substituted responses
  for the external GitHub and Pages transports. The preview used the pinned
  commit and private artifacts. Withdrawal rejected the same viewer and
  runner requests and the published export remained equal.
- The previous packed PV1 scenarios also passed, including lifecycle,
  migration and rollback checks.

## Focused and root checks

The focused server, Node, Worker, builder, Astro fixture and published builds,
Compose ingress, generator, doctor, CLI help and managed upgrade suites passed.
The Node suite also passed with disposable SILO. Conflicting manifest retries
check the stored length before opening the object stream. Exact retries still
verify the stored checksum.
`pnpm docs:check` verified 28 pages, local links, resources, OpenAPI and
documentation tests.

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and
`pnpm exec openspec validate enable-opt-in-draft-preview-deployments --type change --strict`
passed.

## Hosted Worker smoke test on 2026-11-21

The authorized `jentix/test-homepage` stand used the packed candidate and
the standard generated `worker/index.ts`. Two Cloudflare Version URLs served
the CMS and preview hosts. Their bindings used a freshly migrated D1 and
separate media and preview R2 buckets with `r2.dev` disabled and zero custom
domains. A temporary GitHub branch used the generated workflow with the
private PV1 builder image pinned by digest and `packages: read` for GHCR.
The candidate cron was exercised in the local Worker acceptance above.
[Cloudflare Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/)

- With `LACE_PREVIEW_ENABLED=false`, admin readiness reported
  `preview-disabled`, preview admission returned 503, and `/admin/` on the
  preview host returned 404. A normal Lace admin session saved revision 1
  of a synthetic blog post with a private PNG.
- With `LACE_PREVIEW_ENABLED=true`, readiness reported `ready` and admission
  returned 202. D1 recorded generation `01M7ZVX3BQ1AB00EPWCEJ4CT1J` at commit
  `9903973177269b21055931a3366ded2889d265d6`. The same GitHub run claimed and
  completed the generation on its first attempt. It produced four files and
  11,416 bytes in 58 seconds. D1 recorded a 24-hour lifetime from readiness.
  [GitHub Actions run 44945182435](https://github.com/jentix/test-homepage/actions/runs/44945182435)
- The authenticated preview returned the draft HTML, external CSS and the
  original PNG. The PNG matched the uploaded SHA-256. Anonymous requests
  for each asset returned 401 and the public media endpoint returned 404.
- Switching both URLs back to `false` denied the previous viewer cookie and
  runner claim with 404. Admission again returned 503. The isolated public
  export remained byte-identical at version 1. The Pages HTML and original
  CMS public home response matched their baseline hashes.

Two earlier provider runs returned `PREVIEW_RENDER_FAILED`. Astro attempted
to rename external CSS across Docker mounts and hit `EXDEV`. The generated
wrapper now renders on one scratch mount with frozen inputs mounted read-only.
The trusted step packages the result against the original staged input. The
focused generator test checks both mount layout and packaging paths.

Both temporary URL aliases now return 404. The temporary D1 database, R2
buckets, GitHub branch, runner secret and repository variable were removed.
The GitHub workflow returned to its disabled state. The original Worker
version still received 100% of traffic, and `main` retained its original SHA.

After the wrapper fix, both focused generator tests and all seven focused
Cloudflare tests passed. The full `pnpm acceptance:draft-preview` rerun passed
all six scenarios. An earlier local pass through the suite hit `PREVIEW_BUSY`
in the packed Node lifecycle scenario. The rerun passed that scenario as
well. Root typecheck, lint, format, OpenAPI and strict change validation passed.
