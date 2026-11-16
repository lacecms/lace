## Context

[EX2C](../2026-11-15-ex02c-shared-write-plans-configuration-sync/) completed the shared write plans. The repository contract already runs against file-backed SQLite, in-memory SQLite and local D1. REST and MCP source tests currently instantiate `InMemoryContentStore`, while broader application lifecycle tests use it under `test-utils/src/store`. The application package's own unit tests have package-local port fixtures.

The shared SQL reader resolves names for editor descriptions, collection summaries and the media catalog. Snapshot hydration and both platform publication paths also resolve roles from the provider's `user` table. Snapshot hydration serves the range-bounded build export in addition to administrative and public reads.

## Goals / Non-Goals

**Goals**

- Keep the test repository and production Node repository on one implementation and one migration chain. Preserve native transactions, guarded writes and deterministic clocks and IDs.
- Preserve the semantics and query budgets of attribution reads and keep the provider schema behind the security persistence boundary.

**Non-Goals**

- EX1C owns bulk typing of legacy DB and platform tests. EX3 owns the event registry and event emission.
- Account commands, authorization policies, public projections and transport contracts retain their current interfaces. The profile exists for content attribution.

## Decisions

### Share the Node SQLite repository below runtime composition

Move the SQLite repository implementation to a Node-specific `@lacecms/db/node` subpath, with direct imports from its shared DB modules. Keep the existing `@lacecms/platform-node` exports and runtime factory as the production entry points to that same implementation. Move the repository implementation and its native transaction executor together. The Node package keeps connection lifecycle, security, storage, dispatch orchestration and runtime wiring. D1 continues to import the portable `@lacecms/db` entry. The Node subpath accepts the native connection and needs only the driver's types. The shared entry has no imports from the Node subpath.

Expose the migrated SQLite fixture through a source-only `test-utils` subpath. Keep the native driver and Node DB imports inside the fixture so the normal test utility and browser imports remain portable. Open a fresh `:memory:` connection per fixture and apply the checked-in DB migration journal on that connection. Follow the existing Node rebuild procedure and verify foreign-key integrity before enabling foreign keys for repository calls. Close the connection after each test and on setup failure. Reuse the fixture construction in the in-memory repository contract variant, preserving its observations, hooks and second repository over the same database. The file-backed SQLite and D1 variants keep their real runtime boundaries.

A test dependency on the full Node platform would point back to `server` and `mcp` and form a package/Turbo task cycle. A separate SQL fixture repository would restore the duplication EX2D retires. Keep the portable main DB entry and the compiled Node subpath explicit in source and packaged export tests.

### Use SQLite fixtures for persistence and test doubles for external boundaries

Keep the HTTP and MCP harnesses in their packages. Supply their configured model resolvers, run configuration setup or seed the prerequisite stored models and profiles explicitly, and exercise the real repository for writes. Read outbox, build and version assertions from the committed repository state or parameterized inspection SQL. Use narrow port overrides at the consumer boundary for tests that inject a read failure, count invocations or simulate a race. Keep REST/MCP actors, binary storage, clocks, IDs and external protocols deterministic.

Move persistence-backed application cases onto SQLite in the downstream test suite. Keep application unit tests with their package-local port doubles so `application` gains no dependency on `db` or `test-utils`. Port distinct store tests to the shared contracts or the existing use-case and transport suites. Keep pure fixture and parity exports used by browser tests independent of the Node driver.

### Keep attribution as an indexed security projection

Define a Lace-owned `content_actor_profiles` table keyed by actor ID, with the stored display name and validated role. The security schema maintains it from Better Auth's `user` rows. Install insert, update and delete triggers in the forward migration so provider writes and direct Lace account writes share the same atomic projection maintenance. Update only when ID, name or role changes. Disabling an account preserves its historical attribution. Deleting the account removes its projection row. The profile carries no email, session, credential or authorization decision. Content keeps its original actor IDs without foreign keys to the account or profile, and content-only tests can seed the projection without creating provider accounts.

Use the profile in the existing indexed joins for collection summaries, media list and detail, snapshot hydration and export. Redirect the explicit editor-description lookup and both publication role lookups to the same projection. Keep the existing trimming, `System`, `Unknown user` and `viewer` handling. Keep audit roles separate from authenticated request roles. Name or role changes affect subsequent attribution reads without mutating content, incrementing the public version or enqueueing a build.

A batched security port would avoid an extra table, but snapshot roles also travel through the existing transaction and D1 build-export batches. The projection keeps lookup in the same SQL statement and avoids extra statements, page-sized actor binds and a separate consistency window. A view over `user` would still make every content read reach the provider table.

## Risks / Trade-offs

- The projection adds a write to account creation and relevant profile changes. Verify setup, invitation, rename, role changes and rollback on real SQLite and local D1. Check the migration and security flows against existing budgets.
- The fixture conversion exposes assumptions specific to the fake, including missing model rows, unregistered media and mutable diagnostic arrays. Seed legal prerequisites and move assertions to committed persistence or the appropriate narrow port.
- The DB entry point changes the package graph used by test caching and packaged consumers. Verify the compiled Node import, existing platform exports, source and packaged test separation, and the absence of native driver imports in the Worker bundle.

## Migration Plan

Add a forward-only SQLite/D1 migration that creates the indexed projection, backfills the current account rows and installs its triggers in the same migration. Keep the Drizzle schema, snapshot and migration ledger aligned. Exercise upgrades from the previous migration with attributed content, then verify fresh databases and a second migration invocation. Apply the migration before starting consumers that read the projection. Earlier code can still read its original account columns against the additive schema. Use the repository's existing backup and recovery procedure if the forward migration fails.
