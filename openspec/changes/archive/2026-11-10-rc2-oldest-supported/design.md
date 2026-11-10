## Context

ADR 0029 made rc1 the oldest supported state when the 16 incremental database
migrations were squashed into one baseline (RF8X). The baseline shipped in rc2,
so an rc1 database predates it: `lace db migrate` and `lace doctor` refuse it
with `SCHEMA_UNSUPPORTED`, and the rc1 → rc2 upgrade path recreates the
database. Since rc2 nothing changed in `packages/db/drizzle` (still only
`0000_baseline.sql`) or in built-in block definitions.

The repository still carries rc1 as the support floor:

- `tests/fixtures/template-0.46.0/{default,cloudflare}.json`, generated from
  `create-lace@0.1.0-rc1`, are the only published-template fixtures.
  `tests/template-fixture.test.mjs` and `scripts/template-upgrade-acceptance.mjs`
  discover every `tests/fixtures/template-*` directory and name no version.
- The current template is `0.47.0`, identical to the published rc2 template. Its
  `.lace/upgrade-instructions.json` describes the rc1 → `0.47.0` recreation.
- `templates/docs/lace-operations.md` ends with "Database baseline and
  upgrading from rc1"; `docs/compatibility.md` has "Upgrading from rc1";
  the public operations page has an rc1 paragraph; `docs/alpha-release.md`
  and `docs/personal-site-guide.md` link `#upgrading-from-rc1`.

The template upgrade acceptance needs at least one managed file whose hash
differs between the fixture and the current template (`.env.example` or
`docs/lace-operations.md`), otherwise it fails with "no conflict candidate
changes". With an rc2 fixture and an unchanged `0.47.0` template no file would
differ.

## Goals / Non-Goals

**Goals:**

- One support floor, rc2, across ADRs, architecture, specs, generated
  instructions, guides and fixtures.
- The rc2 → current template upgrade is proven by the existing acceptance
  against fixtures generated from the immutable published package.

**Non-Goals:**

- Changing `lace upgrade`, the migration ledger checks, the block migration
  mechanism, `SCHEMA_UNSUPPORTED` or the baseline migration.
- Release coordinates, `publishedVersions`, changelog entries or release
  evidence.

## Decisions

### D1 ADR 0030 supersedes only the support floor of ADR 0029

New `docs/adr/0030-rc2-oldest-supported.md`: rc2 is the oldest supported
release and the upgrade fixture origin; later releases keep compatibility with
rc2 by forward migrations, block definition migrations and versioned formats;
rc1 and earlier installations are unsupported and their pre-baseline databases
stay refused. ADR 0029 stays accepted for the baseline migration, built-in
blocks without migrations and export format 2; its index row and status line
note "support floor superseded by ADR 0030". Architecture §22 names rc2 and
links both ADRs.

Alternative rejected: editing ADR 0029 in place. ADRs record dated decisions;
a new ADR keeps the rc1 decision traceable.

### D2 rc2 fixtures come from the published package

Repeat RF8X D7 with rc2: `npm pack create-lace@0.1.0-rc2` into a scratch
directory, check the tarball against registry integrity
`sha512-m2AApGLJ…`, record its SHA-256, run the packaged generator with
`--starter` and with `--starter --cloudflare` for project name
`acceptance-site` (the name the existing fixtures and acceptance use), and write
`tests/fixtures/template-0.47.0/{default,cloudflare}.json` in the existing
format with `provenance` (`generator` `create-lace@0.1.0-rc2`,
`templateVersion` `0.47.0`, `sourceRevision`
`e82670cccb64073df7af585209bbb502427bbeb9`, `registryIntegrity`,
`archiveSha256`, `retrievedAt`). The generation script lives in the scratchpad,
not in the repository, as in RF8X. Then delete `tests/fixtures/template-0.46.0/`.
The file list and capture rules are taken from the rc1 fixture so the format
stays identical.

Alternative rejected: generating the fixture from the `v0.1.0-rc2` tag in a
worktree. The accepted requirement forbids reconstruction from source; the
registry package is the immutable artifact users received.

### D3 Template 0.48.0 with rc2-based instructions

The guide changes make the template differ from rc2, so it advances to
`0.48.0` (`TEMPLATE_VERSION`, generator packaged test, CLI upgrade packaged
test expecting `Template 0.48.0`, the six generated-project snapshots).
`.lace/upgrade-instructions.json` for `0.48.0`:

- database: one entry — an rc2 database already starts from the baseline; stop
  Compose `api`/`dispatcher`, back up `.lace/data` and objects, run
  `pnpm db:migrate` (Cloudflare targets as today), which applies only checked-in
  forward migrations; databases created before rc2 are refused with
  `SCHEMA_UNSUPPORTED` and are not supported;
- configuration: one entry — "Template 0.48.0: guides and upgrade instructions
  start at rc2 (template 0.47.0)", upgrade packages and images together, run
  content sync and rebuild.

The operations guide section becomes "Database baseline and upgrading from
rc2": baseline plus forward migrations, the rc2 steps above, and one sentence
that older databases are refused. `docs/lace-operations.md` changes, so the
acceptance always has a conflict candidate.

`release/alpha.json` keeps `templateVersion` `0.47.0` (published rc2);
`pnpm release:check` reports the template identity mismatch until the next
candidate is selected, the same state as between RF8X and rc2.

### D4 Permanent and public documentation

- `docs/compatibility.md`: opening paragraph names rc2 (template `0.47.0`) as
  the oldest supported release and rc1/alpha releases as unsupported; the
  release table lists rc2 as the oldest supported release (rc1 row removed);
  "Upgrading from rc1" becomes "Upgrading from rc2" with backup, coordinated
  package/image/source update, `lace db migrate`, content sync, rebuild and
  backup-based rollback.
- Public operations page: the rc1 paragraph is replaced with the rc2 path.
- `docs/alpha-release.md`, `docs/personal-site-guide.md`: rc2 is the oldest
  supported release; links move to `#upgrading-from-rc2`.
- `docs/README.md` and `docs/adr/README.md` index ADR 0030.

The public-documentation and generated guide checks are run after the edits;
any assertion on the old anchor or wording is updated in the same task.

## Risks / Trade-offs

- [The npm tarball differs from what the tag would produce] → The fixture
  records registry integrity and archive digest; the fixture test verifies
  managed digests against its own manifest, independent of the workspace.
- [Network access is needed to pack rc2] → Only during apply; tests and
  acceptance read the committed fixture offline.
- [An rc1 project is left without written upgrade steps] → Intended by the
  owner decision; the engine still refuses its database instead of damaging
  it.

## Migration Plan

No runtime migration. rc2 installations upgrade with the new instructions; rc1
installations are recreated from a fresh rc2-or-later project if they are kept.
Rollback of this change is a revert of the commit.
