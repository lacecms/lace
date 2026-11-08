# Generated projects and releases

Part of the [Lace architecture](README.md).

## 7. Generated user project

Users start Lace with the project generator (`pnpm create lace@latest my-site`,
or `pnpm dlx create-lace@latest init .` in an empty repository); copying the
engine source into an arbitrary application is not supported ([ADR 0021](../adr/0021-single-site-static-architecture.md)). The
target must be empty apart from `.git`, `README.md` and `LICENSE`; in-place
installation into a nonempty project is not supported, and an existing Astro
site is connected to a separately generated CMS directory instead. Target
validation, staging and recovery are in
[project-generator](../../openspec/specs/project-generator/spec.md).

```text
my-site/                        # starter site mode
├── site/                       # user-owned Astro source (starter mode only)
│   ├── lace.site.json          # Lace-managed site configuration and block lock
│   └── src/                    # env.d.ts, lib/lace.ts loader, layouts/, pages/,
│                               # styles/, components/lace/ blocks; user-owned
│                               # except hash-guarded block map lace/blocks.ts
├── lace.config.ts              # public, typed Lace configuration
├── package.json, pnpm-workspace.yaml, .env.example
├── docker-compose.yml          # managed infrastructure file
├── .lace/manifest.json         # generator version, site mode, managed hashes
├── worker/                     # optional (--cloudflare): managed index.ts and
│                               # .dev.vars.example, user-owned wrangler.jsonc
└── .github/workflows/          # optional Cloudflare Pages/CI deployment files
```

### Site modes

Creation selects one site mode, recorded in `.lace/manifest.json` as
`site: { mode, path }`: **starter** (`--starter`, path `site`) generates
`site/`; **existing** (`--existing-site <path>`) connects an Astro project
outside the target, typically `..`, which the generator never modifies (the
operator runs `lace add block --all --site <path>` and follows the connection
guide); **none** (`--no-site`, path `null`) generates the CMS only, and its
Compose has no builder, so build dispatch reports that no build trigger or site
is configured. `--cloudflare` combines with every mode (no static-site workflow
without a site).

Managed files that reference the site are rendered from the recorded mode and
path through the build-site selection configuration, never a second selection
mechanism. A manifest without a `site` record is read as starter mode with path
`site`. `lace upgrade` requires a target template of the same mode and path and
never creates `site/` for another mode; changing mode means generating a fresh
project and moving configuration manually. `lace doctor` checks the recorded
site. Flag precedence and path rules are in the project-generator spec.

### Starter and reference site

- The `create-lace` starter is the single source of what users receive: minimal
  `home` and `posts` pages, `settings` and `navigation` globals, a layout,
  global styles, the built-in registry blocks, `lace.site.json`, the block map
  and the loader file, with no tests, fixtures or engine-development routes
  ([generated-project-onboarding](../../openspec/specs/generated-project-onboarding/spec.md)).
  Built-in components carry no `<style>` element, so presentation lives in the
  site stylesheet
  ([block-source-registry](../../openspec/specs/block-source-registry/spec.md)).
  The layout falls back to its built-in navigation while either global is
  unpublished; a published `navigation` global without visible blocks renders
  no navigation.
- `apps/site` is the engine playground and integration fixture; nothing from it
  is copied into generated projects. Both consume the same packages and hold
  byte-identical registry blocks; tests fail on divergence, and CI also builds a
  project generated from the packed starter
  ([generated-project-acceptance](../../openspec/specs/generated-project-acceptance/spec.md)).
- A generated project never contains editable admin source; the admin and the
  engine arrive as versioned packages, bundles or container images.

### Ownership rules

```text
site/**                 user-owned; never overwritten by upgrade
lace.config.ts          user-owned public configuration
.lace/**                Lace-managed metadata
deployment files        managed with hash/conflict detection
CMS engine/admin        versioned dependency or container image
```

In any connected site tree only `lace add block` (never `lace upgrade` or the
generator after creation) maintains three exceptions: `lace.site.json`
(configuration keys user-editable, `items` and hashes CLI-maintained); the
block map, rewritten only while its recorded hash matches, otherwise the CLI
prints the entries to add; and installed block sources, user-owned after
installation and updated only while their recorded hash matches, otherwise
reported as a conflict. The CLI never edits other site source or the site
`package.json` (it prints the `pnpm add` command) and rejects paths outside the
site root.

### Upgrade model

`lace upgrade` updates engine dependencies and image tags automatically,
updates generated infrastructure files only when their recorded hash proves
they are unchanged (otherwise it reports a diff or conflict), and never
silently rewrites user-owned files: required changes arrive as migration
instructions or explicit codemods. `.lace/manifest.json` records the
generator/template version and managed-file hashes
([upgrade-planner](../../openspec/specs/upgrade-planner/spec.md),
[upgrade-apply-recovery](../../openspec/specs/upgrade-apply-recovery/spec.md)).

`lace add block` updates installed registry items and `lace upgrade` the
template's managed files; both share one three-way hash decision, diff and
guarded atomic-write implementation in `@lacecms/cli`. `lace add block` needs
no rollback journal: every write is compare-and-swap, `lace.site.json` is
written last as the commit record, and a re-run adopts files that already match
the registry. Database migrations are versioned with the engine and always run
as an explicit deployment step.

## 22. Migration and compatibility policy

Compatibility exists at three boundaries: the database schema version, the
`lace.config.ts` API version, and the REST/build-export contract version.

- Database changes use forward migrations after one baseline migration, the
  oldest supported schema (rc1, [ADR 0029](../adr/0029-rc1-baseline.md)). A
  database migrated by an older engine is refused, not upgraded, and is
  recreated. Automatic database or content-schema downgrade is not promised.
- Content blocks and field objects carry `schema_version`. Stored block data is
  migrated only by configuration synchronization through the block's declared
  migrations (§8, §11, [ADR 0007](../adr/0007-schema-evolution-during-sync.md)),
  never when loaded or rendered. Silent destructive conversion is forbidden.
- Public REST endpoints stay under `/api/v1` until a breaking contract requires
  `/api/v2`. Internal TypeScript types alone are not a compatibility contract.
- An optional key, or one older consumers may ignore, is compatible within
  `/api/v1` and an export `formatVersion`; removing a key, changing its type or
  a meaning consumers rely on needs a new `formatVersion` or `/api/v2`
  ([rest-contracts](../../openspec/specs/rest-contracts/spec.md)).
- Within one major line the API must be the same or a newer minor than the
  site's `@lacecms/sdk`.
- Rich-text grammar, block `schemaVersion` matching and block data validation
  stay strict by design: they are safety and rendering contracts, not transport
  shapes. [Compatibility](../compatibility.md#public-contract-evolution) details
  this policy and each release's upgrade, migration and rollback steps.

## 25. Planning defaults and remaining release decisions

Resolved defaults: pnpm workspaces with Turborepo ([ADR 0028](../adr/0028-spec-driven-delivery-toolchain.md)); `better-sqlite3`
for the Node adapter; Tailwind CSS over Lace design tokens with
shadcn/ui-generated, Lace-owned admin components on Radix UI primitives
([ADR 0005](../adr/0005-admin-owned-component-source.md)); a small built-in
block set and no reference fields; a no-op cache by default, with optional KV
only after the uncached path is correct; a first-party fixed-command VPS
builder rather than an arbitrary command or external CI dependency
([ADR 0004](../adr/0004-fixed-command-vps-builder.md)); npm scope `@lacecms/*`,
generator `create-lace` and images `ghcr.io/lacecms/api` and
`ghcr.io/lacecms/builder`; prerelease versions on npm channel `next` with an
independent ownership template version. If package-name ownership differs, only
published names and generator templates change; package boundaries and domain
contracts stay the same.

`release/alpha.json` records the selected candidate and the published,
immutable versions; [`alpha-release.md`](../alpha-release.md) covers
preparation and owner publication. Preparation, publication, GitHub release
finalization and cleanup are separate owner gates bound to the exact verified
artifact ([alpha-release-artifacts](../../openspec/specs/alpha-release-artifacts/spec.md)).
Real VPS and Cloudflare deployment acceptance is a further release requirement
that local simulation does not satisfy; the owner records exact candidate
versions and results under
[owner checks on real infrastructure](../verification.md#owner-checks-on-real-infrastructure)
before claiming deployment readiness. Beta and stable approval are separate.

Open decisions: the signing/provenance process for published artifacts; hosted
release channels and update metadata for `create-lace`; and confirming, in the
owner-operated deployment gate, the Git-connected Cloudflare Pages project as
the reference static host for hook-driven rebuilds
(`docs/cloudflare-deployment-handoff.md`).
