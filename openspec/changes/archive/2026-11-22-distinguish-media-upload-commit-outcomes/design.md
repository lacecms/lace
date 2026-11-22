## Context

`MediaUseCases.create` writes the verified bytes to `media/<allocated id>`, then awaits `MediaCommandPort.createMedia` inside the cleanup handler. Node and D1 both run `createMediaWritePlan` and then call `loadMedia` before resolving that command. Only the later application-level `loadMediaCatalogItem` runs outside the handler. The existing application test for a missing catalog item cannot detect loss at the earlier read. Shared contract tests also consume the successful command's returned metadata, including its tags and hash.

## Goals / Non-Goals

The application needs enough evidence to decide whether deleting the object is safe. SQL adapters own the evidence about their writes. Object storage remains outside the database transaction. The upload route continues to report an error when it cannot produce its normal media view. Retried uploads remain independent operations under the existing deduplication contract.

## Decisions

1. **Report the database outcome at the command boundary.** Keep the successful `createMedia` result and use an application-owned failure type carrying the original cause and the adapter's known outcome. In `packages/db/src/node-repository/media.ts` and `packages/platform-cloudflare/src/repository/media.ts`, separate execution of the shared write plan from reading the committed row. Once the executor confirms commit, either a missing row or a thrown read error has a known committed outcome. A statement failure with confirmed transaction or batch rollback has a known uncommitted outcome. If an acknowledgment, result decoding or connection fails without proving either, leave the outcome unknown. Generic exceptions also default to unknown. Classify at the phase that has evidence, before generic database error mapping loses that distinction. Preserve the existing error translation at the transport boundary.
2. **Reconcile by identity and ownership.** On an uncertain outcome, use a bounded authoritative database lookup for the allocated ID and the unique storage key, including rows in every lifecycle status. Use the Node writer database or the D1 primary. A matching row protects the object. A conflicting mapping or an unavailable lookup keeps the outcome unresolved. Absence establishes noncommit only when the adapter also knows the original attempt has settled and can no longer commit. A timeout followed by an empty read is insufficient. Expose this lookup through the media port and reuse shared indexed SQL. The catalog view, usage joins and lookup by non-unique SHA-256 cannot answer the ownership question.
3. **Keep one cleanup decision in the application.** For a known commit, propagate the read failure and keep the bytes. For a verified noncommit, invoke the existing best-effort delete on the allocated, unowned key. If ownership is in doubt, verify it first. For an unresolved outcome, leave the object and emit a distinct operational code through `OperationalLogger`. Preserve the original failure even if verification, cleanup or logging fails. Handle an invalid storage receipt before attempting metadata creation as today. Keep the normal success path free of reconciliation calls.
4. **Exercise the actual failure positions.** Use the production repositories behind `MediaUseCases.create` and the existing byte-retaining `InMemoryObjectStorage`. Run the same assertions on file-backed SQLite, in-memory SQLite and local D1. Reuse the existing tag-insert abort trigger to force a real rollback. Inject a one-shot failure on the repository's first metadata read after the real commit, then inspect durable state through independent SQL reads. Separately simulate a lost acknowledgment after an actual write and a failed reconciliation read. A stub that throws before running the repository cannot cover the post-commit bug.

## Risks / Trade-offs

- An unreachable database can leave a private object awaiting investigation. The opaque key and unresolved-outcome diagnostic let an operator locate it without exposing the filename, payload, credentials or raw provider error.
- Repeating the write internally could create another item or interfere with a completed upload. Reconciliation only reads authoritative metadata. The normal media deletion workflow owns subsequent lifecycle transitions.
- Returning `void` or moving only the repository reread would leave a lost acknowledgment ambiguous. Keeping the successful command contract also preserves direct repository callers.

## Migration Plan

Deploy the application and matching adapters together on each runtime. The change requires no SQL or bucket migration. It governs new upload attempts. Repair of files already missing from storage requires separate evidence and a source for their bytes.
