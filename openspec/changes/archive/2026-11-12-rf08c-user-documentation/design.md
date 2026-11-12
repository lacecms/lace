## Context

See proposal.md for motivation. Current state that shapes the approach:

- `apps/docs` is a Starlight site with 20 Markdown pages under
  `src/content/docs/en/latest/`, seven sections declared in
  `src/catalog.json`, overridden `Head` and `LanguageSelect` components and
  the stock `docsSchema()`. `scripts/check.mjs` validates sources (locale,
  version, unique slug, `title`/`description`) and the built output (local
  links, fragments, OpenAPI copy, search index). `pnpm docs:check` runs
  build, typecheck and Vitest.
- The CLI command table lives in `packages/cli/src/bin.ts` and is not
  exported; `lace --help` prints every public command and flag and is pinned
  by `command-help.packaged.test.mjs`. `create-lace --help` prints modes and
  flags.
- MCP tool names are the keys of `mcpToolArgumentSchemas`
  (`@lacecms/contracts`); scopes are `MCP_OAUTH_SCOPES` (`@lacecms/auth`).
- Configuration inputs are the exported interfaces of
  `packages/config/src/models/types.ts`,
  `packages/content/src/blocks/types.ts` and
  `packages/content/src/fields/definitions.ts`; the `field` builder object
  (`group`, `list` and the spread scalar builders) is exported by
  `@lacecms/content`.
- Root tests already execute built `dist/` binaries
  (`tests/content-import-sample.test.mjs`); the root `test` script runs after
  `turbo run test`, which builds dependencies.
- `scripts/docs-inputs.mjs` declares publication inputs by path; it does not
  read `release/alpha.json` today.

## Goals / Non-Goals

**Goals:**

- Reference completeness that a test keeps true without a hand-kept list.
- One owner per user-facing topic, checked by review and by the existing
  link guard after every deletion.
- A page shape the documentation check enforces, so later pages follow it.

**Non-Goals:**

- No change to CLI, OpenAPI, MCP, configuration or runtime packages. If the
  audit finds a page and the product disagree, the page follows the product;
  a product defect found on the way is recorded in `backlog.md`, not fixed
  here.
- No new Starlight plugin or dependency.

## Decisions

### 1. Reference coverage derives every list from shipped artifacts

`tests/docs-reference.test.mjs` (root) collects, then checks that each item's
name occurs in the concatenated text of `en/latest/reference/**/*.md`:

| Kind | Source | Extraction |
| --- | --- | --- |
| CLI command | `node packages/cli/dist/bin.js --help` | `Usage: lace …` and continuation lines; words before the first `[`/`<`/`-`, with `<a\|b\|c>` alternations expanded (`db migrate`, `content sync`, `auth bootstrap`, `env prepare`, `doctor`, `upgrade`, `add block`, `import`, `cloudflare preflight`) |
| CLI flag | same, plus `create-lace --help` | every `--[a-z][a-z-]*` token; `create-lace` modes `create`, `init` |
| Setting | `packages/create-lace/templates/{.env.example,worker/.dev.vars.example,worker/wrangler.jsonc,docker-compose.yml,docs/cloudflare-operator.env.example}` and the `lace --help` text | `LACE_[A-Z0-9_]*[A-Z0-9]`; names ending in `_` (the `LACE_PUBLIC_*` prose prefix) are not settings |
| Config option | scan of the interface bodies (the workspace TypeScript 7 has no JavaScript compiler API) in `config/src/models/types.ts`, `content/src/blocks/types.ts` and `content/src/fields/definitions.ts` | property names of `LaceConfigInput`, `CommonModelInput`, `RoutableModelInput`, `PageModelInput`, `CollectionModelInput`, `CollectionListOptions`, `ModelSeoInput`, `SeoDefaultsInput`, `GlobalModelInput`, `BlockDefinitionInput`, and the field `CommonFieldOptions` |
| Field builder | `Object.keys(field)` from built `@lacecms/content` | twelve builders today; builder-specific options (for example `select` options) are covered by review, not the test |
| REST path | `Object.keys(api-v1.json paths)` | `{param}` and `:param` normalized to one placeholder before matching |
| MCP tool / scope | `mcpToolArgumentSchemas` (contracts), `MCP_OAUTH_SCOPES` (auth) | keys / values |

The failure message lists `kind: name` for every missing item. A negative test
feeds a fixture reference text without one item of each kind and asserts the
message names it.

*Alternatives:* exporting a `publicCommandNames` list from the CLI (a public
API addition for a test); parsing the help snapshot file (couples to test
fixture layout); a pinned list in the test (drifts silently, rejected by the
spec). The interface name list is the one pinned element: a new option on an
existing input is caught; a new input interface needs a test edit, which the
review of such a change already touches.

### 2. Reference section layout keeps existing routes

| Route | Kind | Holds |
| --- | --- | --- |
| `reference/` | overview | links to the pages below |
| `reference/cli-environment/` | reference | `lace` and `create-lace` commands with flags, targets, exit codes; environment table grouped by runtime (Node `.env`, Worker vars/bindings, operator file, site build, CLI-only) with secret and default/required columns |
| `reference/configuration/` (new) | reference | `defineConfig`, `definePage`, `defineCollection`, `defineGlobal`, `defineBlock` options, list options, SEO inputs, temporary hints, field builders and common field options |
| `reference/api/` | reference | OpenAPI download, `/api/docs`, export consumption, and hand-written REST tables grouped by audience (public, setup/invitation/password reset, account, admin): method, path, purpose, required permission |
| `reference/mcp/` (new) | reference | endpoints, discovery URLs, scopes, tools with required scope, protocol version |

Feature prose now in `reference/api.md` (internal URL destinations,
collection-query semantics, MCP) moves to guide pages; the API page keeps the
request grammar and limits that API consumers need (filters, cursors, `422`
pointers) and links to the guides. The REST table is hand-written (owner
decision 2026-11-12) so it can state audience and permission, which
OpenAPI summaries do not.

### 3. Page kinds and template enforced by `check.mjs`

The content schema extends `docsSchema()` with
`kind: z.enum(["overview","guide","reference"])` and
`verifiedAgainst: z.string()`, both required. `validateSources` parses each
page's H2 headings outside code fences and applies:

- `guide`: body text before the first H2; first H2 `Before you start`; at
  least one further H2; last H2 `Reference` whose section contains a link to
  `…/reference/…`.
- `reference`: path under `reference/`.
- `overview`: no H2 other than link lists (`landing` and section indexes that
  only introduce pages). Section indexes that carry task content today
  (`getting-started/`, `content-modeling/`, `astro-integration/`,
  `operations/`, `editing-content/`) become `guide` pages and take the
  template; their routes do not change.

Errors name the page path and the rule. *Alternative:* path-based kinds
(`index.md` = overview) — rejected because several section indexes are long
guides.

### 4. Verified-against footer

A `Footer` component override renders Starlight's default footer and a line
"Verified against `<verifiedAgainst>`". `check.mjs` reads
`release/alpha.json` and accepts `version` or any `publishedVersions` entry
without `-alpha.`; RF8C sets every audited page to `0.1.0-rc2` (current
`version`). Release preparation does not edit pages: after rc3 is selected,
an untouched page keeps showing `0.1.0-rc2`, which stays valid because rc2 is
then published.

The owner noted that alpha releases are over; alpha entries remain in
`publishedVersions` as release history, so the check excludes them instead of
the metadata changing. The `catalog.json` `target` stays the label of the
latest section; a check asserts it equals `release/alpha.json` `version` so
the two rendered versions cannot disagree.

*Alternative:* one site-wide footer from `version` — rejected: it would claim
every page verified against each newly selected release without a re-check.

### 5. Publication input projection

`scripts/docs-inputs.mjs` adds a synthetic input `release/alpha.json#rendered`
holding `JSON.stringify({ version, publishedVersions })`, so other release
metadata changes stay outside the input set. `tests/docs-publication.test.mjs`
gains fixtures for both scenarios of the delta.

### 6. Internal note dispositions

Rule: user guidance (procedures, settings, examples, editor steps, site code)
→ public page; engineering content (invariants, SQL/runtime policy,
verification evidence, release and real-account procedures, contributor
workflows) → stays. A note with nothing left is deleted.

| Note | Disposition | Public owner |
| --- | --- | --- |
| `alpha-release.md` | internal | — |
| `auth-operations.md` | internal, trimmed | `editing-content/accounts/`, `operations/` |
| `cloudflare-deployment-handoff.md` | internal | `deployment/cloudflare/` |
| `cloudflare-worker.md` | internal, trimmed | `deployment/cloudflare/`, `reference/cli-environment/` |
| `collection-queries.md` | internal | `content-modeling/`, `reference/api/` |
| `compatibility.md` | internal, trimmed: keeps the policy, supported origin, refusal and rollback boundary of the permanent compatibility guide and links to `operations/#upgrade-and-roll-back` for the steps (modified *Upgrade guidance covers only the oldest supported release onward*); build-export paging rules moved to `reference/api/#consume-exports-safely` | `operations/`, `getting-started/`, `reference/api/` |
| `composite-fields.md` | promoted, deleted | `content-modeling/composites/` |
| `configuration-synchronization.md` | internal (planner) | `content-modeling/synchronization/` |
| `content-import.md` | internal (invariants, tiers) | `editing-content/import/` |
| `database-migrations.md` | internal, trimmed | `operations/` |
| `documentation-maintenance.md` | internal | — |
| `field-guidance.md` | promoted, deleted | `content-modeling/`, `reference/configuration/` |
| `form-organization.md` | promoted, deleted | `content-modeling/`, `editing-content/` |
| `internal-url-links.md` | internal, trimmed (persistence, rollback) | `content-modeling/links/` (new) |
| `mcp.md` | promoted, deleted | `operations/mcp/` (new), `reference/mcp/` |
| `media-tags.md` | promoted, deleted | `editing-content/rich-text-media/`, `reference/api/` |
| `node-api.md` | internal, trimmed (contributor runtime) | `deployment/node/`, `reference/cli-environment/` |
| `personal-site-guide.md` | deleted (owner decision 2026-11-12, superseded) | `getting-started/`, `astro-integration/`, `deployment/` |
| `rich-text-authoring.md` | promoted, deleted | `editing-content/rich-text-media/`, `astro-integration/` |
| `site-styling.md` | promoted, deleted | `astro-integration/styling/` (new) |
| `verification.md` | internal | — |

If, while trimming, a note marked "internal, trimmed" turns out to hold only
user guidance, it is deleted instead and the table in this design is updated.
`docs/README.md` gains a "Public owner" column and a "Promoted and deleted"
table (file → public page). Incoming links in `docs/**` (including
`docs/archive/*`), `DEVELOPMENT.md` and `README.md` are rewritten; the
existing `tests/docs-links.test.mjs` guard proves none dangles.

### 7. Settled roadmap questions

- **Pinned version route:** none during prereleases. The catalog already
  supports another version section without renaming `en/latest`; the first
  stable release adds it in its own change. No spec change.
- **Generated consumer guides:** stay generated assets of the template
  (`packages/create-lace/templates/docs/*`), checked by
  `scripts/consumer-guides.mjs`; public pages name them where a reader needs
  them. Recorded in the modified ownership requirement.

## Risks / Trade-offs

- [Mention-based coverage passes on a name that appears without
  explanation] → the reference pages use tables with one row per item;
  review checks each row has purpose text.
- [Help parsing breaks when help formatting changes] → the parser has unit
  cases over the current help text; a format change fails loudly, never
  silently passes, because an empty command list is an error.
- [Trimming notes loses engineering detail] → only text that the public page
  now carries is removed; each trimmed note is diffed against its public page
  during review.
- [Large documentation diff] → tasks go section by section, each ending with
  `pnpm docs:check`.
- [`verifiedAgainst` becomes a ritual bump] → the spec ties the value to a
  re-check of the page; reviewers reject bumps without content review.

## Migration Plan

Documentation-only. Publication happens through the existing Pages workflow
after merge to `main`; rollback is a revert commit. No route is renamed, so
existing links keep working.
