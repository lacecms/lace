# Lace architecture

Lace's architecture owns product scope and the invariants every capability
specification must respect. Sections keep stable numbers across the files of
this directory; cite them as "architecture §N".

## Section map

| Section | File |
| --- | --- |
| 1. Document purpose | [README.md](README.md) |
| 2. Product goals | [README.md](README.md) |
| 3. Explicit MVP scope | [README.md](README.md) |
| 4. Architectural principles | [README.md](README.md) |
| 5. System context | [deployment.md](deployment.md) |
| 6. Repository structure | [workspace.md](workspace.md) |
| 7. Generated user project | [distribution.md](distribution.md) |
| 8. Content configuration | [content-configuration.md](content-configuration.md) |
| 9. Content data model | [data-model.md](data-model.md) |
| 10. Content publication | [publication.md](publication.md) |
| 11. Block registry and rich text | [rendering.md](rendering.md) |
| 12. REST API | [api.md](api.md) |
| 13. Site rendering and block installation | [rendering.md](rendering.md) |
| 14. Authentication and authorization | [security.md](security.md) |
| 15. Infrastructure ports | [runtimes.md](runtimes.md) |
| 16. Database portability and D1 constraints | [runtimes.md](runtimes.md) |
| 17. Admin application | [admin.md](admin.md) |
| 18. Development modes | [deployment.md](deployment.md) |
| 19. Dependency policy | [workspace.md](workspace.md) |
| 20. Testing strategy | [workspace.md](workspace.md) |
| 21. Observability and operations | [deployment.md](deployment.md) |
| 22. Migration and compatibility policy | [distribution.md](distribution.md) |
| 23. Primary implementation sequence | [history.md](history.md) |
| 24. Decisions captured by this document | [README.md](README.md) |
| 25. Planning defaults and remaining release decisions | [distribution.md](distribution.md) |
| 26. External platform references | [README.md](README.md) |

## 1. Document purpose

This directory defines the scope and invariants of Lace (**Lightweight AI Cloud
Engine**), a self-hosted headless CMS paired with a statically generated Astro
website. One installation manages one website, with the same content model and
domain behavior on Cloudflare (Workers, D1, R2, optionally KV) or a VPS (Docker
Compose, Node.js, SQLite, MinIO). Authority order, highest first: this
directory, `openspec/specs/**` (accepted behavior), the active OpenSpec change
(proposed delta), then the [active roadmap](../refactoring-roadmap.md)
(delivery order and decisions), [backlog.md](../../backlog.md) (future work)
and `docs/archive/` (completed roadmaps). A lower level may add detail but
never silently contradicts a higher one.

## 2. Product goals

A user creates a site with one CLI command (starter, existing Astro site or no
site); customizes it and installs editable block renderers without touching
engine or admin files; defines pages, collections, fields and allowed blocks in
typed configuration; edits content, ordered blocks and reusable media in a
browser admin; publishes with an explicit permission, which rebuilds the site;
and upgrades the engine without overwriting site source. "AI" means structure
for agent-assisted development, not a required LLM, chat or source-edit agent.

## 3. Explicit MVP scope

Included: one installation per website; pages, collections and route-less
globals as model kinds; code-first models; draft and published snapshots
only; ordered blocks; Tiptap rich-text blocks; media in R2 or MinIO; Better Auth email/password sign-in;
admin, editor and viewer roles; a versioned, runtime-validated REST API; an
Astro build-time SDK; outbox build-trigger dispatch; Node/Docker and Cloudflare
adapters; CLI initialization and an upgrade-safe project layout. Optional and
never required: OAuth-delegated MCP assistance that inspects models and entries
and creates or saves drafts, publishing only under the separate
`content:publish` scope with explicit administrator consent and never
unpublishing or deleting ([ADR 0015](../adr/0015-mcp-publication-scope.md));
email through the `EmailSender` port (SMTP on Node, Resend on both runtimes,
the Cloudflare Email Service binding on the Worker).

Excluded unless a later architectural decision changes it: several sites or
tenants; another database dialect; unlimited revision history; a
`previousPublished` snapshot; real-time collaboration or CRDTs; arbitrarily
nested layout blocks; models created in the admin UI; per-entry or
per-collection ACLs; internationalization and localized snapshots; scheduled
publication; an exact visual site preview; a built-in AI chat or LLM provider;
a plugin marketplace.

## 4. Architectural principles

### 4.1 Single-site deployment

A deployment has one `lace.config.ts`, content database, media store, admin and
public site; multi-tenancy never shapes tables, authentication, routing or
configuration ([ADR 0021](../adr/0021-single-site-static-architecture.md)).

### 4.2 Static public site

Astro builds the site from the public API; page requests are normally served as
static assets without the CMS API.

### 4.3 Code-first structure, CMS-managed content

Models live in version-controlled code, because the site must render them;
values live in the CMS, whose admin renders forms but never defines models.

### 4.4 Two content states

An entry has one mutable draft and zero or one immutable published snapshot,
replaced on publication; no revision history is kept ([ADR 0026](../adr/0026-code-defined-models-two-snapshots.md)).

### 4.5 Portable capabilities, explicit adapters

Domain and application code depend on ports that Cloudflare and Node packages
implement: repositories and transactions, object storage, cache, build
triggering, outbox dispatch, and clock and IDs for deterministic tests
([§15](runtimes.md), [ADR 0024](../adr/0024-sqlite-dialect-capability-adapters.md)). There is no wrapper over SQL, Hono, Drizzle,
React or every Web API; abstractions mark only real environment differences.

### 4.6 Media never lives in SQL

D1 and SQLite hold media metadata and object keys; binaries live in R2 or MinIO.

### 4.7 Published content is immutable

Draft edits never change what the public sees. Sync rewrites a published
snapshot for a schema change (such as a default backfill) only in an atomic
mutation that increments `published_state.version` and requests a build;
block migrations run earlier in guarded resumable per-entry units, visible under
the previous version until the run's (or rerun's) final mutation
([ADR 0007](../adr/0007-schema-evolution-during-sync.md)).

### 4.8 Spec-driven delivery

Work follows the OpenSpec `spec-driven` workflow, normally one just-in-time
change per roadmap session ([ADR 0028](../adr/0028-spec-driven-delivery-toolchain.md)). Proposing writes no production code;
apply needs ready artifacts and an explicit user request; finished changes are
validated, synced into the main specs and archived. A conflict with the
architecture pauses code to revise the plan, or to update this directory and
the roadmap first.

## 24. Decisions captured by this document

Architectural decisions, with their context, alternatives and consequences,
are recorded as ADRs. The [ADR index](../adr/README.md) lists every decision
and its status; ADRs 0021–0028 record the baseline decisions this section used
to list.

## 26. External platform references

- Cloudflare D1 limits: <https://developers.cloudflare.com/d1/platform/limits/>
- Cloudflare D1 pricing: <https://developers.cloudflare.com/d1/platform/pricing/>
- Cloudflare D1 JSON support: <https://developers.cloudflare.com/d1/sql-api/query-json/>
- Cloudflare local development: <https://developers.cloudflare.com/workers/local-development/>
- Cloudflare Pages deploy hooks: <https://developers.cloudflare.com/pages/configuration/deploy-hooks/>
- Astro Cloudflare guidance: <https://docs.astro.build/en/guides/integrations-guide/cloudflare/>
- Better Auth Hono integration: <https://better-auth.com/docs/integrations/hono>
- Better Auth Drizzle adapter: <https://better-auth.com/docs/adapters/drizzle>
- Hono Standard Schema validation: <https://hono.dev/docs/guides/validation>
- Hono OpenAPI with Valibot: <https://hono.dev/examples/hono-openapi>
- Drizzle Valibot integration: <https://orm.drizzle.team/docs/valibot>
- React Hook Form resolvers: <https://github.com/react-hook-form/resolvers>
