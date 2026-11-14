# Lace Extensibility Roadmap

> Selected 2026-11-14 after the [refactoring roadmap](archive/refactoring-roadmap.md)
> (RF1–RF8, RF9A–RF9B) and the four changes from the API, backend and database
> audit of 2026-11-14 were archived. Carries over the unfinished test
> foundation sessions (RF9C–RF9F) and plans every open audit finding. The goal
> is that new features (revision history, webhooks, locales, new model kinds,
> another API version) cost one definition each instead of one copy per runtime.

Future work outside this roadmap stays in the root [backlog](../backlog.md).

## 1. Purpose and source of truth

This roadmap records the owner's selection, the delivery order, the session
boundaries and a compact description of what each step changes and how.
Detailed tasks are written later, one just-in-time OpenSpec change per
session.

Authority follows `AGENTS.md`:

1. [architecture](architecture/README.md) owns product scope and
   invariants.
2. [`openspec/specs/**`](../openspec/specs) owns accepted capability behavior.
3. The selected active OpenSpec change owns the proposed delta.
4. This document owns delivery order, session boundaries and recorded
   decisions for this roadmap.

Steps that change an architecture invariant list the sections to update. The
architecture is updated in the same OpenSpec change, before code, with a short
ADR under [`docs/adr/`](adr) when a recorded decision changes.

## 2. How to use this roadmap

The conventions of the archived
[refactoring roadmap](archive/refactoring-roadmap.md) apply unchanged:

- A **session unit** is one cohesive change set that can be implemented,
  reviewed and verified independently. It maps to one OpenSpec change.
- Size labels: **S** one session, **M** two sessions, **L** three or more.
- OpenSpec change names use the prefix `ex<step><session>-`, for example
  `ex01a-test-size-ceiling` or `ex02a-shared-write-plans-entries`.
- **Behavior-preserving changes** carry `proposal.md`, `design.md` and
  `tasks.md` without delta specs. Gate: existing tests pass with only import
  paths changed, public package exports stay byte-identical, and
  `pnpm spec:validate` stays green.
- **Behavior-touching changes** carry delta specs and the full completion
  gate: runtime validation, types and negative tests; Node SQLite and D1
  parity through the repository contract suite; the narrowest relevant tests,
  then root typecheck, Oxlint, Oxfmt check and strict OpenSpec validation;
  documentation in the same change.
- Each session ends by moving a row of the baseline table in §3 to its new
  value in the progress log.
- "Open questions" in a session are settled with the owner while writing that
  session's specification, not before.
- A session that splits or moves test files types the new companions or lists
  them explicitly in `scripts/test-typecheck-baseline.json`.

Status values: `planned`, `proposed`, `in progress`, `done` (archived).

## 3. Baseline (commit `5bb4cba5`, 2026-11-14)

Already settled by the audit changes and not repeated here: idempotency
expiry and cleanup, snapshot foreign-key indexes, one snapshot-deletion rule
on both runtimes, OpenAPI matching enforced behavior, post-commit dispatch
from committed outbox work, and `401 AUTHENTICATION_REQUIRED`.

| Area | Measure | Baseline |
| --- | --- | --- |
| Tests | test files above 1,000 lines | 8 package tests: `platform-node` `index.test.ts` (1,610), `test-utils` `store/entries.test.ts` (1,328) and `store/media.test.ts` (1,166), `platform-cloudflare` `worker.test.ts` (1,287), `server` `routes/content.test.ts` (1,197), admin `admin-client.test.ts` (1,122) and `EntryPage.test.tsx` (1,082), `sdk` `published-site.test.ts` (1,093); plus `scripts/fixtures/oauth-mcp/compat.test.mjs` (1,759) |
| Tests | test files with `@ts-nocheck` | 132: `contracts` 27, `cli` 21, `db` 18, `platform-node` 12, `platform-cloudflare` 12, `content` 10, `application` 10, `server` 9, `apps/api` 4, `sdk` 2, `create-lace` 2, `apps/builder` 2, `astro`, `mcp`, `render` 1 each |
| Writes | SQL write statements per implementation | `platform-node` 97, `platform-cloudflare` 99, shared in `db` 60 |
| Writes | runtime repository modules | 8 Node and 10 D1 modules (5,575 lines), two 450-line facades |
| Writes | port implementations | 3: Node SQLite, D1 and the `test-utils` in-memory store (1,671 lines), which the repository contract suite does not run against |
| Writes | configuration synchronization | each runtime interprets planned operations and writes `content_models` itself |
| Writes | conflict detection | 3 places map SQLite error-message substrings |
| Writes | authentication-vendor coupling | 7 content queries join Better Auth's `user` table |
| Events | outbox typing | `type: string`, `payload: JsonObject`; event literals in 9 production files including SQL and a partial index; payload built in JS on Node and with `json_patch` on D1 |
| Events | event emission | build requests are a side effect of `bumpPublicState`; use cases emit no events |
| Routes | `/api/v1/...` literals | 92 in `server`, `platform-cloudflare` and `mcp`; body limit, rate limit, import allowlist and 401 challenge choice match paths |
| Routes | authorization outside use cases | 12 route-level checks for tokens, users, settings and accounts; MCP cannot reuse them |
| Routes | `as never` casts in route handlers | 29, rooted in the untyped `validationHook` |
| Routes | build export when `capabilities.buildTokens` is absent | token check skipped (fail-open; only tests omit it) |
| HTTP | optimistic concurrency | 3 mechanisms (`expectedRevision`/`If-Match`, media ETag from `updatedAt`, `expectedPublishedSnapshotId`); entry `GET` returns no ETag |
| HTTP | pagination | OAuth connections use a nullable, transparent cursor; users and invitations are unpaginated; builds are capped at 100; MCP takes `limit` as a number, REST as a string |
| Models | kind literal comparisons | 32 non-test backend and admin files; `isSingletonKind = kind !== "collection"` |
| Limits | list query limits | Node and Cloudflare limits live in `@lacecms/content`; application silently defaults to the Node limits |

## 4. Delivery overview

| Step | Topic | Size | Sessions | Status |
| --- | --- | :---: | --- | --- |
| EX1 | Test foundation (from RF9C–RF9F) | L | EX1A → EX1B → EX1C; EX1D independent | planned |
| EX2 | Shared write plans | L | EX2A → EX2B → EX2C → EX2D | planned |
| EX3 | Typed outbox events | M | EX3A → EX3B | planned |
| EX4 | Route policies and security use cases | L | EX4A → EX4B → EX4C → EX4D | planned |
| EX5 | Model kind descriptor | S | EX5A | planned |
| EX6 | Trusted client identity and production Compose ingress | M | EX6A and EX6B independent | planned |

Dependencies:

| Session | Depends on | May run in parallel with |
| --- | --- | --- |
| EX1A | — | EX4A |
| EX1B | EX1A | EX2A–EX2D (except the `db` tests, which move to EX1C) |
| EX1C | EX2D | EX3, EX4 |
| EX1D | — | everything |
| EX2A | EX1A | EX4A |
| EX2B | EX2A | EX4 |
| EX2C | EX2B | EX4 |
| EX2D | EX2C | EX4 |
| EX3A | EX2B | EX2C, EX4 |
| EX3B | EX3A, EX2D | EX4 |
| EX4A | EX1A | EX2 |
| EX4B | EX4A | EX2, EX3 |
| EX4C | EX4B | EX2, EX3 |
| EX4D | EX4C, EX2D | EX3 |
| EX5A | EX2C | EX3, EX4 |
| EX6A | — | EX6B and sessions outside EX4 |
| EX6B | — | EX1–EX5, EX6A |

**Order rationale:** EX1A first, because `worker.test.ts` and the
`platform-node` tests that EX2 rewrites must already be split. EX2 precedes
EX3 because typed events are enqueued by write plans; doing EX3 first would
write the enqueue path twice. EX4 touches the HTTP layer only and runs beside
EX2. EX1C types platform and `db` tests after EX2 has moved them, as RF9E
waited for RF5. EX5 follows EX2C because configuration synchronization is the
largest consumer of model kinds.

EX6 can start immediately. Prefer EX6A before EX4A so the route-policy
refactor can reuse the corrected client identity handling and its regression
tests. EX6B can proceed independently.

**If the next feature is already known:** webhooks move EX3 before EX2
(accepting a second enqueue path for one step); CE12 revision history adds a
snapshot role marker and a decision on media `RESTRICT` references to EX2A;
locales, multiple sites or Postgres need an ADR before any session (§5).

**Deferred, stays in the backlog:** compacting idempotency `response_json`
(only rows near the 2 MB D1 limit); keeping `site_builds.published_snapshot_id`
after the next publication instead of `SET NULL`; ETag, `Cache-Control` and
CORS on public reads (needed by SSR, preview or mobile clients); one public
endpoint family per content kind; a generated admin API client; pruning
`openspec/changes/archive`.

## 5. Owner decisions (2026-11-14)

1. The refactoring roadmap is archived; its unfinished sessions and the open
   audit findings form this roadmap.
2. Behavior-preserving work needs no delta specs (§2); behavior-touching work
   keeps the full OpenSpec gate.
3. "Write-path convergence between Node transactions and D1 batches beyond
   statement builders", deferred by the refactoring roadmap, is now selected
   as EX2.

Not sessions; each needs an ADR before work starts, because it revisits a
recorded decision:

- SQLite as the only dialect
  ([ADR 0024](adr/0024-sqlite-dialect-capability-adapters.md)) versus Postgres
  or another host.
- Model fields stored as JSON (`fields_json`): collection filters and sorts
  scan the model twice (page and totals); measured only up to about 1,000
  entries.
- Draft and published only, without history
  ([ADR 0026](adr/0026-code-defined-models-two-snapshots.md)), versus CE12.
- No locales; one site with global singleton counters
  ([ADR 0021](adr/0021-single-site-static-architecture.md)).
- Model keys as foreign keys with `ON UPDATE CASCADE`: renaming a model
  rewrites every entry.

Carried over from the refactoring roadmap, not a session:

4. Run `pnpm verify:security`, `pnpm verify:cross-runtime --baseline …` and
   `pnpm verify:operations` once (refactoring roadmap owner check 8).

## Step EX1 — Test foundation

**Size:** L (four sessions). **Depends on:** RF9A–RF9B (done).

**What:** every test stays under a size ceiling and is type-checked; the
`@ts-nocheck` baseline (132 files) reaches zero and its file is deleted.

### Session EX1A — Test size ceiling (was RF9C)

The boundary checker applies a 1,000-line ceiling with a shrinking baseline
to test files. The eight package tests in §3 split beside their modules.
Open question: whether `scripts/fixtures/oauth-mcp/compat.test.mjs` falls
under the same ceiling or is listed as a fixture exemption.

### Session EX1B — Type core package tests (was RF9D)

Removes `@ts-nocheck` from `contracts` (27), `content` (10), `application`
(10), `server` (9), `sdk` (2) and `astro`, `mcp`, `render` (1 each), using the
RF9B fixture layer. The `db` tests (18) move to EX1C because EX2 rewrites
them.

### Session EX1C — Type `db` and platform tests (was RF9E)

After EX2D: `db` (18), `platform-node` (12) and `platform-cloudflare` (12).

### Session EX1D — Type CLI, generator and app tests (was RF9F)

`cli` (21), `create-lace` (2), `apps/api` (4) and `apps/builder` (2). The
typecheck baseline file is deleted when it is empty.

## Step EX2 — Shared write plans

**Size:** L (four sessions). **Depends on:** EX1A.

**What:** `db` builds one ordered plan of guarded statements per write
command; Node executes it in a transaction and D1 in one guarded batch. The
existing `configurationSyncMigrationStatements` is the template. A new
command or column is written once. Behavior-preserving except where a
session says otherwise; the Node and D1 repository contract suites are the
gate. Architecture §15/§16 (ports, runtime deltas) and `data-model.md` are
updated in each session that removes a delta.

### Session EX2A — Plan executor, entries and publication

The plan type (statement, parameters, guard, expected change count, outbox
marker) and its two executors; entry create, update, delete, publish and
unpublish move to plans. A guard failure becomes a typed conflict instead of
a SQLite error-message match. The executor reports committed outbox work,
which D1's `MutationBatch.addOutbox` does today. Each
composition root passes its list query limits explicitly; application no
longer defaults to the Node limits.

### Session EX2B — Media, builds and outbox

Media writes (upload, metadata, tags, deletion request), site builds
(request, claim, completion) and outbox writes move to plans; payloads are
built once in JS, removing the D1 `json_patch` path.

### Session EX2C — Configuration synchronization

`planConfigurationSynchronization` returns statements, not operations each
runtime interprets; the per-runtime branching on `operation.action` and the
direct `content_models` writes disappear.

### Session EX2D — One test store

The `test-utils` in-memory store is replaced by Node SQLite (in memory) for
`server`, `mcp` and application tests, so the repository contract suite
covers every implementation that tests use. Content queries stop joining
Better Auth's `user` table; open question: whether author display data comes
from a Lace-owned profile row or from a security port lookup.

## Step EX3 — Typed outbox events

**Size:** M (two sessions). **Depends on:** EX2B; EX3B also on EX2D.

**What:** a registry of outbox event types in `contracts` (type, Valibot
payload schema, version) and one `enqueueEvents` path used by every write
plan. Behavior-touching: delta specs for the outbox and dispatch
capabilities; architecture `data-model.md` (outbox) and `publication.md`.

### Session EX3A — Event registry and one enqueue path

`site.build.requested` and `media.delete.requested` are registry entries;
string literals in SQL, the partial index and dispatchers are generated from
or checked against the registry. Dispatchers are looked up by event type.

### Session EX3B — Use cases emit events

Use cases return the events they cause; write plans enqueue them in the same
transaction or batch. Build requests stop being a side effect of
`bumpPublicState`. Adding an event such as `entry.published` for future
webhooks is one registry entry plus the emitting use case.

## Step EX4 — Route policies and security use cases

**Size:** L (four sessions). **Depends on:** EX1A.

**What:** HTTP policies are declared on routes, authorization lives in use
cases for every resource, and handlers are typed end to end.

### Session EX4A — Route metadata

Each route declares `auth` (session, import, build, public), `bodyLimit`,
`rateLimit` and, for MCP-reachable operations, its scope. Body-limit,
rate-limit, import-allowlist and 401-challenge middleware read the metadata
instead of matching paths; MCP delegated scopes have one definition instead
of four. Each API version is a sub-application, so `/api/v2` is one mount.
The build export becomes fail-closed: a route declaring `auth: build` refuses
to register without a build-token verifier. Behavior-touching for the build
export only.

### Session EX4B — Security use cases

Build and import tokens, users, invitations, settings and account operations
move into application use cases that check permissions themselves, like
content. Routes and MCP call the same use cases; the 12 route-level checks
disappear. Architecture `security.md` is updated.

### Session EX4C — Typed handlers

`validationHook` is typed, handlers return typed responses so the Hono client
infers them, and the 29 `as never` casts in routes are removed.
Behavior-preserving.

### Session EX4D — HTTP consistency

Behavior-touching, with delta specs for the affected REST contracts:

- One optimistic-concurrency model: entry `GET` returns the ETag that
  `If-Match` accepts; open question whether media and publication adopt the
  same validator or keep theirs documented.
- One opaque cursor pagination for OAuth connections, users and invitations;
  builds paginate instead of the fixed cap.
- REST and MCP parse `limit` through one shared schema.

## Step EX5 — Model kind descriptor

**Size:** S (one session). **Depends on:** EX2C.

### Session EX5A — Kind descriptor table

A descriptor per model kind in `domain` (singleton or collection, routed,
public endpoint family, export section, admin behavior), like the field-type
capability registry. `isSingletonKind` and the kind literal comparisons in
32 files read the table; an unknown kind fails at compile time instead of
becoming a singleton. The `kind` CHECK constraint is generated from the table.
Open question: whether a future kind still needs a table rebuild migration or
the constraint moves to application validation.

## Step EX6 — Trusted client identity and production Compose ingress

**Size:** M (two independent sessions).

### Session EX6A — Preserve trusted client identity through body handling

The patched Hono `bodyLimit()` still replaces `Request` when it buffers a
streamed body. Lace associates the ingress-resolved client address with the
original request object, so downstream rate limiting and the Better Auth
sign-in wrapper can fall back to a shared `0.0.0.0` identity. Carry the
trusted identity through body handling in request-scoped context that is
independent of the `Request` object.

Verify on Node and Cloudflare that a request whose body is replaced keeps the
same identity for Lace rate limiting and Better Auth sign-in, and that two
trusted client addresses retain separate buckets. Cover caller-supplied
forwarding headers and the conservative fallback when trusted identity is
unavailable. Add regression coverage for the existing rules in
[bootstrap-user-token-abuse-controls](../openspec/specs/bootstrap-user-token-abuse-controls/spec.md)
and keep it through EX4A.

### Session EX6B — Restrict host port bindings in production Compose

The generated production template publishes the Node API and Nginx HTTP ports
on all host interfaces. Keep the API reachable over the Compose network and
remove its default host-port publication. Bind Nginx to loopback by default for
a host TLS proxy. Document explicit ingress configuration for other proxy
topologies. Update the repository's production Compose example alongside the
generated template, and document migration for existing installs and the
supported endpoint for host-side commands and manual builds.

Verify the resolved Compose port bindings across generated site modes and
check that Nginx can still reach the API and serve the admin through the
documented ingress path. Update [deployment architecture](architecture/deployment.md)
and the affected Compose, project generator and generated acceptance specs in
the OpenSpec change.

## 6. Progress log

One row per change; detailed decisions, verification and synchronized deltas
are preserved in the linked archives. Dates refer to the final recorded event.

| Date | Session | Change | Status |
| --- | --- | --- | --- |
| 2026-11-15 | EX6A | [Preserve trusted client identity](../openspec/changes/archive/2026-11-15-ex06a-preserve-trusted-client-identity/) | done: request identity survives body replacement on Node and Worker |
