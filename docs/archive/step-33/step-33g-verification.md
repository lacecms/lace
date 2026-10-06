# Step 33G verification — scenario guides and minimum-version policy

Verified 2026-10-06 on the current branch (base revision `ea0a4b0`). Source
template is `0.16.0`; package/image coordinates remain `0.1.0-alpha.2`. No
publication, registry change or Cloudflare account operation occurred.

## Delivered

- The generated root README is a short index: minimum requirements and
  separately pinned/tested versions, site layout and ownership, scenario links,
  references and draft/publication/deployment distinctions. It contains no
  command sequences.
- Managed `docs/lace-compose-dev.md` and `docs/lace-compose-production.md` in
  every site mode and `docs/lace-cloudflare.md` with `--cloudflare`, rendered
  through the existing site/Cloudflare markers. Each states its working
  directory, site mode, prerequisites, one-time and repeat steps, expected
  result, recovery and next step. The stopped-services SQLite rule precedes every
  host database sequence and is labelled a remaining workaround. No-site output
  names no absent site script; existing-site output uses the recorded path.
- The Cloudflare guide starts with the account-free local Worker, then uses the
  33F contract verbatim (`.lace/cloudflare-operator.env`, `--operator-env`,
  `lace cloudflare preflight`, `wrangler whoami`), separates local and remote
  data, the CMS Worker and static-site deployments, and accepted versus tracked
  Pages outcomes, linking the operations guide's credential and recovery tables.
- `docs/lace-operations.md` keeps every section anchor and its accepted
  reference content; only its introduction and prerequisites changed. The
  placeholder setup `curl` example now appears in the development guide and the
  operations guide.
- Node `>=24.12.0` and pnpm `>=12` in the repository root and generated CMS,
  Node `>=24.12.0` in all 15 public packages. `scripts/release-model.mjs`
  rejects any other declaration. `packageManager`, the lockfile/catalog, CI
  Node `24.12.0`, Docker `node:24.12.0` images and pnpm `12.3.4` are unchanged.
  The dependency engine audit and the new-major admission procedure are in
  `docs/compatibility.md`.
- Ownership template `0.16.0` with coherent inventory, upgrade instructions
  (naming the new guide paths and manual README adoption), `release/alpha.json`
  and six refreshed snapshots. Completion output names the scenario guides,
  including for a retained `init .` README.

## Checks

- Generator: 5 files, 64 tests passed, including the new
  `scenario-guides.test.mjs` over all six site/Cloudflare variants (guide
  presence and managed hashes, every local link and anchor, every fenced
  `pnpm` script, ordered development/production/Cloudflare sequences, no old
  engine caps, outer existing-site README bytes unchanged, retained-README
  completion output).
- CLI: 28 files, 256 tests passed, including minimum/newer-major/below-minimum
  and bounded-consumer doctor checks (exit 4, no writes) and template `0.16.0`
  upgrade tests.
- Root `tests/`: 17 files, 93 tests passed, including release-model engine and
  guide-registration rejection, guide drift naming `docs/lace-compose-dev.md`,
  the onboarding feedback map and the unchanged immutable `0.14.0` fixtures.
- `node scripts/release.mjs check` passed with template `0.16.0`.
- `node scripts/generated-project-acceptance.mjs credentials` passed with packed
  packages installed outside the repository: six byte-stable snapshots, the 33F
  credential harness, account-free `cf:build`, and upgrades of the immutable
  `0.14.0` (revision `5f7c19b`) and published `0.4.0` default/Cloudflare
  fixtures. For `0.14.0` a user file at `docs/lace-compose-dev.md` and an edited
  operations guide were refused as conflicts with bytes preserved; apply then
  delivered every applicable scenario guide, the instructions named each guide
  path, README/configuration/private files/site source were unchanged and the
  repeat plan had no changes.
- `node scripts/generated-project-acceptance.mjs starter` passed: packed starter
  installed, typechecked and built all five blocks.
- `node scripts/generated-project-acceptance.mjs node` passed: the development
  guide's setup sequence was extracted and executed against locally built API and
  builder images, followed by browser setup, tour, media, publication and the
  Astro build.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and strict OpenSpec
  change validation passed.

A final Oxfmt pass changed only blank lines around markers in the managed
guides; the generator, consumer-guide, release-model and onboarding-map tests,
the six snapshots and the `0.14.0`/`0.4.0` upgrade journey were re-run after it
and passed.

Registry access and Docker used permitted network/local processes. Not verified
here: the production guide on a real server with TLS, a real Cloudflare account
(OAuth, provisioning, secrets, deploy, Pages tracking), other platforms and any
Node/pnpm major other than Node 24.12.0/pnpm 12.3.4. These remain 33H/34 work.
