# Workspace, dependencies and testing

Part of the [Lace architecture](README.md).

## 6. Repository structure

The engine repository is a pnpm workspace; Turborepo orchestrates and caches
its dependency-aware tasks ([ADR 0028](../adr/0028-spec-driven-delivery-toolchain.md)).

```text
apps/
├── admin/                     # React/Vite admin SPA
├── api/                       # deployable/reference Hono composition root
├── builder/                   # fixed-command VPS Astro build service
├── docs/                      # private static Starlight public documentation
└── site/                      # engine Astro playground and build fixture (never shipped)

packages/
├── domain/                    # pure domain types, rules, and errors
├── application/               # use cases and capability ports
├── server/                    # Hono routes, middleware, app factory
├── mcp/                       # portable stateless MCP adapter and six tools
├── contracts/                 # shared Valibot transport schemas and DTOs
├── content/                   # field DSL, block registry, validation
├── db/                        # Drizzle SQLite schema and repositories
├── auth/                      # Better Auth configuration and authorization
├── config/                    # lace.config.ts definition and loader
├── sdk/                       # build-time and external REST client, published-site loader
├── render/                    # framework-neutral block parsing, block map, rich-text description
├── astro/                     # Astro adapter: LaceBlocks, RichText, loader environment glue
├── platform-cloudflare/       # D1, R2, KV, Worker and deploy-hook adapters
├── platform-node/             # SQLite, MinIO/S3, Node server adapters
├── cli/                       # create, sync, migrate, upgrade, add block, import commands
├── create-lace/               # `create-lace` project generator and starter templates
└── test-utils/                # factories, fixtures, and contract test suites

registry/                      # versioned, framework-keyed block sources for `lace add block`

docs/
├── architecture/              # architecture by domain (this directory)
└── adr/                       # architectural decision records added as needed

openspec/
├── specs/                     # accepted capability specifications
└── changes/                   # active and archived implementation changes
```

Dependency direction (`A -> B` means package A may import package B):

```text
config       -> content
domain       -> content
application  -> domain, content, config
contracts    -> domain, content
mcp          -> application, contracts, domain
db           -> application, domain
auth         -> application, domain
server       -> application, contracts, auth
sdk          -> contracts
render       -> content
astro        -> render, sdk
platform-*   -> application, server, db, auth, config, mcp
cli          -> application, config, contracts, platform-*
apps/api     -> platform-*, server
apps/admin   -> contracts, content
apps/site    -> astro, render, sdk, content
```

Generated starter sites and connected existing sites use the same direct
dependencies as `apps/site`. `registry/` is engine data, not a workspace
package: its files are copied into sites and bundled with `@lacecms/cli`, never
imported by production package modules; integration tests may load registry
components directly.

| Package | Rule |
| --- | --- |
| `content` | Owns the portable shared vocabulary: slug identifiers, model kinds, canonical route rules, transport limits and object helpers. Other packages import or re-export these definitions under their existing public names; failure construction stays local to each layer. |
| `content`, `config` | Stay runtime-portable and import no Node-only API. |
| `domain` | Imports no framework or infrastructure package. |
| `application` | May depend on domain rules, content validation and the normalized configuration, never on REST DTOs, Hono, Drizzle, Cloudflare or Node adapters, and never imports contracts or the MCP SDK. |
| `contracts` | Defines transport DTOs and schemas; never an application-use-case dependency. |
| `db` | Implements application persistence ports; may depend on Drizzle, domain and application. |
| `server` | May use Hono and contracts; receives infrastructure through construction, including an optional structural MCP handler from the platform composition root. |
| `mcp` | Uses application operations and shared contracts, never server, auth, db, platform implementations, configuration loaders or Node-only APIs. REST and MCP share application discovery, authorization, reads and mutations; contracts own their common pure JSON projections and validation. |
| `platform-*` | May depend on application ports and concrete vendor SDKs. |
| `admin` | Depends on contracts and content metadata and owns a credentialed browser transport client; never depends on database schemas. |
| `render` | Framework-neutral: imports no UI framework, Node-only API, SDK or REST contract; accepts a structural block input that the contract block DTO satisfies; reuses `@lacecms/content` validation exclusively. |
| Framework adapter | `@lacecms/astro` (`@lacecms/react`, `@lacecms/vue`, `@lacecms/svelte` are reserved names) holds only code that depends on its framework. Besides the framework, its virtual modules, the render core and the SDK it imports only `node:` builtins (server-only build code such as the image placeholder cache). It never re-exports `render`, `sdk` or `content` APIs, so each symbol has one canonical import path. |
| All packages | No package exports visual block components; block markup is user-owned source installed from `registry/` (sections 7 and 13). |
| `sdk` | Owns transport and the published-site loader; imports neither `content` nor `render`. |
| `cli` | Reaches a running installation only through the admin REST API for `lace import` ([ADR 0017](../adr/0017-content-import-client.md)), validating responses with `contracts`; writes content through platform repositories only in the explicit operator commands `db migrate`, `content sync` and `auth bootstrap`. |
| `site` | Depends on the public SDK, the render core and its framework adapter, `@lacecms/content` for block definitions, and user-owned block markup. |

CI rejects cycles and rule-violating imports in production modules. Tests
(`*.test.ts`, `*.test.tsx`) and `src/test-support/` modules are excluded from
import and re-export checks and add no edges to the cycle graph, but still pass
TypeScript, Oxlint and test execution; test dependencies never widen production
edges, and admin source-structure checks keep their own rules
([workspace-governance](../../openspec/specs/workspace-governance/spec.md):
"Architecture dependency enforcement"; [ADR 0001](../adr/0001-package-dependency-boundaries.md)).

The private `apps/docs` application holds the public documentation sources and
publishes them independently of CMS services; it imports no Lace runtime package
and none imports it. Repository `docs/` stays internal engineering
documentation; the product README links to the public site and the root
`DEVELOPMENT.md` contributor guide. Routes carry an explicit locale and version
(English/latest following `main`) without changing CMS localization scope
([public-documentation](../../openspec/specs/public-documentation/spec.md)).

### Source layout

Package `src/` roots hold entry points (`index.ts`, `bin.ts`, declared subpath
entries) and package-level tests; other modules live in domain directories
named by what they own, adopted as soon as a package has a second concern. Each
file owns one responsibility: aim for a few hundred lines and split a file in
the same change before it reaches 1,000. No subdirectory has a barrel
`index.ts`; package entries re-export concrete files, explicitly when a module
also exports internal helpers. Directories depend one way, as documented by the
entry point's `Directory dependencies:` header, and module cycles, including
type-only imports, are forbidden. Tests and type tests sit beside their module;
shared helpers live in `src/test-support/` and are TypeScript.
`@lacecms/test-utils` owns the shared fixture layer (`fixtures/`: role actors, a
delegated-actor builder and the `fakePort` typed partial fake); the packages it
depends on (`content`, `domain`, `config`, `application`, `contracts`) keep
package-local typed test-support. `apps/admin` keeps its section 17
layer/slice structure with the same size limit and no-cycle rule
([ADR 0020](../adr/0020-source-layout.md)).

`scripts/check-boundaries.mjs` enforces the layout through committed files
([workspace-governance](../../openspec/specs/workspace-governance/spec.md)):

| File | Rule it enforces |
| --- | --- |
| `scripts/source-layout.json` | Lists packages that adopted the layout with their directory directions; rejects imports against them, subdirectory `index` modules, root modules that are neither manifest entries nor listed process entries, and entry headers naming other directories. |
| `scripts/source-root-entries.json` | Modules that Node, a container command or a Compose service starts directly stay at an application's `src/` root, each listed with a reason, so operator command paths survive a layout change. |
| `scripts/source-layout-exemptions.json` | A single-concern package stays flat, listed with its reason, and may not gain a directory other than `test-support/` without declaring a layout. |
| `scripts/oversized-source-baseline.json` | Enforces the 1,000-line ceiling: listed legacy files may shrink but not grow; deleted or within-limit files must leave it. |
| `scripts/source-cycle-baseline.json` | Rejects module cycles in every member's production graph except frozen legacy strongly connected components. |
| `scripts/test-typecheck-baseline.json` | Test files may disable type checking only while listed; it only shrinks, and test-support modules never may. |
| `scripts/javascript-source-allowlist.json` | A non-test `.mjs` or `.js` module under `src/`, or a JavaScript test other than a `*.packaged.test.mjs` packaged-output test, needs a reasoned entry. |
| Package manifests | Every `packages/*` export into `dist/` lists the `@lacecms/source` condition first, naming the source module its target is built from; a missing, misplaced or mismatched condition fails, and release preparation strips it from packed manifests. |

## 19. Dependency policy

Dependencies use stable compatible releases, pinned exactly in the lockfile and
centralized in pnpm catalogs; framework major upgrades from update tooling merge
only after test and migration review. Engine minimums are separate from pins
([runtime-tooling-minimum-policy](../../openspec/specs/runtime-tooling-minimum-policy/spec.md)).

| Group | Dependencies |
| --- | --- |
| Runtime and tooling | TypeScript; pnpm workspaces; Node.js active LTS for the Node runtime and tooling; Vite; Turborepo; `@fission-ai/openspec`; Oxlint and Oxfmt through `.oxlintrc.json` and `.oxfmtrc.json`; Vitest ([ADR 0028](../adr/0028-spec-driven-delivery-toolchain.md)). |
| Site | Astro; `@lacecms/astro`, `@lacecms/render`, `@lacecms/sdk` and `@lacecms/content`. No UI component library (block markup is user-owned registry source) and no Cloudflare Astro SSR adapter. |
| Documentation | Pinned Astro/Starlight with static Pagefind search; no CMS runtime dependency or SSR adapter; not a public npm artifact or part of the API or builder images. |
| Admin | React and React DOM; TanStack Router and Query; React Hook Form; Tiptap; dnd-kit; Tailwind CSS; individual `@radix-ui/react-*` primitives consumed through shadcn/ui-generated Lace-owned components in `shared/ui`; `clsx`, `tailwind-merge` and `class-variance-authority`; `lucide-react`; `sonner`; `@tanstack/react-table`; `react-dropzone`; `react-day-picker`; `@fontsource-variable/inter`; `@axe-core/playwright` (test only); shared contract and content packages. |
| API and validation | Hono and its Node server adapter; Valibot; `@hono/standard-validator`; `hono-openapi`; `@valibot/to-json-schema` for OpenAPI-compatible JSON Schema ([ADR 0022](../adr/0022-hono-rest-valibot-schemas.md)). |
| Data and authentication | Drizzle ORM and Drizzle Kit; `drizzle-orm/valibot` for database-boundary schemas where useful; `better-sqlite3` as the Node SQLite driver, compatible with Better Auth and the Node LTS; Better Auth with its Drizzle integration; catalog-pinned `@better-auth/oauth-provider` for optional MCP OAuth, with the official MCP TypeScript SDK v2 Web-standard handling and Valibot-derived schemas. |
| Infrastructure | Wrangler and Workers types; the AWS S3 client for MinIO on Node; `nodemailer` for SMTP in `@lacecms/platform-node` only (Resend and the Cloudflare Email Service are called without an SDK); no AWS SDK in the R2 adapter. |

The admin adopts no themed component library at runtime: shadcn/ui output is
committed Lace-owned source, keeping visual design and accessibility under
Lace's control, with no animation plugin such as `tw-animate-css`; motion comes
from the Lace motion tokens
([admin-design-system](../../openspec/specs/admin-design-system/spec.md)). An
approved admin dependency enters the catalog in the change that first imports
it. An executable Node/Worker gate verifies the pinned MCP OAuth versions,
existing login, protocol baseline, portable bundle and SQLite/D1 redemption and
rotation atomicity before production wiring.

REST DTOs stay independent of Drizzle-generated schemas; the Drizzle/Valibot
integration validates internal database boundaries and never makes database
rows the public API contract.

## 20. Testing strategy

[Verification](../verification.md) lists commands, coverage, evidence limits
and owner checks; [documentation maintenance](../documentation-maintenance.md)
maps public and internal topic ownership.

### Source tests and packaged output

Package and app `test` tasks run TypeScript tests against source with no build
prerequisite; `*.packaged.test.mjs` tests check built exports under
`test:packaged`, which depends on the package and dependency builds. Root
`pnpm test` runs both before the root governance and integration suite, which
may consume built output
([workspace-governance](../../openspec/specs/workspace-governance/spec.md):
"Package tests run from source and packaged output separately").

- The `@lacecms/source` condition resolves workspace specifiers to source via
  the `sourceCondition()` plugin in `vitest.shared.mjs` (every package and app
  test), the admin Vite configuration in test mode only, and `customConditions`
  in `tsconfig.test.json`, `tsconfig.type-test.json` and the admin project;
  builds, development servers and packaged tests keep `dist/`. Tests use public
  package specifiers, typecheck covers tests and test-support modules,
  `test:watch` re-runs on save, and Astro component tests use source components.
- Node integration and product tests open runtimes through
  `platform-node/src/test-support/node-runtime-harness.ts`, the source-only
  `@lacecms/platform-node/test` export dropped from the packed manifest. It owns
  the test actor resolver and settings and takes the source or compiled
  platform module, so packaged product tests run the same scenario on `dist/`.
- Source `test` hashes follow dependency edges through the `test:transit` Turbo
  task; a test reading a repository file outside its dependency closure
  declares it as an input of its package's task.
- Each converted package pins its literal public export list (Astro also its
  four copied component subpaths). Process, packed-consumer, Worker-bundle,
  bundled-asset and Astro fixture-build checks run only under `test:packaged`;
  `apps/site test` succeeds with no source test files.

### Test levels

| Level | Covers |
| --- | --- |
| Unit | Pure domain and application behavior: page cardinality, model validation, permission policies, route resolution, block ordering, optimistic concurrency, publication state transitions, outbox coalescing and retry decisions. |
| Repository contract | One behavior suite in `packages/test-utils/src/repository-contract/` runs against Node SQLite (file-backed and in-memory) and local D1/Miniflare (per-case isolation and timeout), rather than an abstraction making the two Drizzle drivers look identical. Its index concatenates area cases in a fixed order pinned by a literal case-name test; adapters, assertions and the in-memory content store sit behind the test-utils public entry. |
| API integration | Authentication and authorization, REST schema validation, draft isolation, publish atomicity, route conflicts, media metadata and storage cleanup, idempotent publication, build-event recovery. |
| Browser (Playwright) | The critical editor path: sign in; open a page or collection entry; add, edit and reorder blocks; save a draft; verify that an editor cannot publish; publish as an admin; observe build status. |
| Build fixture | `apps/site`, the engine playground and integration fixture, is built in CI from a seeded API export so public contracts stay compatible with Astro generation. CI also generates and builds a project from the packed `create-lace` starter, and a parity test keeps starter, `apps/site` and `registry/` block sources identical. |
| Render core | Rich-text acceptance and rejection match `@lacecms/content` exactly; the render core imports no framework. |
| Documentation | Part of the root build, typecheck, lint and test gates without CMS services: static links and resources, locale/version identity, production-base search, changed-input main-only Pages publication ([documentation-publication](../../openspec/specs/documentation-publication/spec.md)). |
| Local verification | `pnpm verify:cross-runtime` runs cross-runtime product checks against an explicit prepared artifact directory; `pnpm verify:security` runs the source security and resilience suites. Their named projects share `vitest.verification.config.mjs`, separate from ordinary root tests. |

Composite bounds, list and snapshot totals, defaults, hidden data, exact paths,
byte and media limits, scalar hash regressions, and the D1 100-bind and
50-query maximum-save budgets without per-item queries are specified by
[content-repository-contracts](../../openspec/specs/content-repository-contracts/spec.md),
[field-descriptors](../../openspec/specs/field-descriptors/spec.md) and
[content-validation](../../openspec/specs/content-validation/spec.md); generated
starter builds and block-source parity by
[generated-project-acceptance](../../openspec/specs/generated-project-acceptance/spec.md)
and [block-source-registry](../../openspec/specs/block-source-registry/spec.md).
