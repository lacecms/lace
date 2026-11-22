## Context

The kind union lives in `packages/content/src/shared/identifiers.ts`. The domain and the admin already expose separate singleton and routing helpers. The content validator itself needs kind policy, while config and the admin have no dependency on domain. EX2C consolidated model writes in `db`, so both runtimes can use the same policy at the point where synchronization provisions singletons.

## Goals / Non-Goals

Make each policy choice traceable to one descriptor and make a missing choice a type error. Kind identity still belongs in discriminated types, model constructors, diagnostic messages and wire values. The table owns portable values. Hono paths, React components, Lucide icons, SQL and actor permissions belong to their existing layers.

## Decisions

1. **Keep one table in content.** Use the existing `ContentModelKind` union and an immutable literal table checked with `satisfies Record<ContentModelKind, ModelKindDescriptor>`, following the field capability registry. Derive runtime membership and supported keys from the table. Provide a typed lookup for known keys and an own-key membership check for unknown input, including strings such as `constructor`. Re-export through domain and the existing permitted facades where needed. Placing the table only in domain would force content to duplicate policy or reverse its dependency. The owner selected content on 2026-11-22.

2. **Resolve delivery for a configured model.** Store a fixed-path policy for pages, an absent-path policy for globals and a route-dependent policy for collections. The collection descriptor supplies both delivery outcomes in the [four-row matrix](specs/content-domain-rules/spec.md). A pure resolver selects between them using the configured route. Keep domain type predicates such as `hasPublicRoute` so callers can safely access `path` or `route`. Derive slug editing and preview eligibility from resolved routing. Reference fields may target route-less records even though URL links cannot. Cardinality alone cannot answer either routing or title ownership.

3. **Replace policy at its current call sites.** Use descriptor-backed membership in payload, DTO and stored-row validation. Preserve error codes, pointers and the transport enum order. Use cardinality in sync, draft creation and lifecycle guards, resolved delivery in public model selection and export, and editor behavior in admin navigation, forms and actions. Include CLI import identity and reference handling. Keep the admin's icons and labels local. Preserve direct comparisons of stored and configured kinds during sync and exhaustive discriminant narrowing for distinct DTO shapes. Neither comparison defines reusable kind behavior.

4. **Keep published-state queries set based.** The database stores a model kind and published routes. A published collection entry without a matching published route is a record. Use descriptor-derived kind filters in shared delivery/export SQL alongside that existing predicate. Keep routed entries ordered by path, then records by model key and entry ID, with globals on the first page only. Registration supplies eligibility. Existing repository queries, cursors, snapshot joins and budgets still govern each read.

5. **Generate the live CHECK and preserve migration history.** Build the Drizzle expression in `packages/db/src/schema/content.ts` from trusted descriptor keys via domain. Emit quoted SQL literals in the existing DDL order (`page`, `collection`, `global`) so schema generation reports no diff. Transport picklists can sort the same keys into their existing order. Released SQL, migration snapshots and their checksums stay versioned artifacts. The owner retained database enforcement on 2026-11-22. Application-only validation would allow direct writers to store a value that installed readers cannot interpret.

## Risks / Trade-offs

- **Accidental singleton fallback.** Exercise unknown runtime values at the raw input and persisted-row boundaries, and add negative type cases for an unknown key and an incomplete table.
- **Permission or concurrency regression.** Keep checks for actors and observed revisions in the use cases. Singleton uniqueness, configuration fences, atomic route writes and public-state updates continue to use the existing mutation plans. Verify repeated sync and competing writes through the shared repository contracts.
- **Missed consumers after the original audit.** The roadmap's 32 files are a historical count. Review current model-kind comparisons and SQL predicates across production packages and the admin, including preview and reference handling added since EX2C. Record the remaining identity checks and the reason each category survives.

## Migration Plan

EX5A deploys with the current migration journal. Rollback uses the previous binary against the same schema, model rows, snapshots and configuration hashes. A future kind needs its own reviewed table rebuild, with row preservation, foreign-key verification and migration tests for both runtimes as established by [ADR 0010](../../../../docs/adr/0010-global-models.md).
