## Context

`EntryPage` passes `savedEntry ?? entry.data` to both `useDraftEditor` and `useEntryMutations`. The form hook resets on each new `id:revision`. Before a local save, a refetch can therefore replace unsaved values. After a save, the local response can mask every subsequent refetch. Guarding only `form.reset` would leave Save using the newer query revision with values composed against the older draft.

## Goals / Non-Goals

Keep the form values, its displayed draft revision and the revision sent on Save consistent throughout the open editor session. TanStack Query continues to own server reads, and the active editor owns its in-memory working copy. Recovery across a browser reload and collaborative merging are outside this design.

## Decisions

1. **Keep one adopted entry per open editor.** In the entry page and its form hook, distinguish an observed query result from the validated entry used to initialize the working copy. Drive the form's initial values, draft details and revision-dependent commands from the adopted entry. Initialize only when the entry and model match the active route. On confirmed navigation to a different entry, start a fresh baseline and conflict state. Keep the field editor independent of page and query modules.
2. **Reconcile at the point the result arrives.** Use the same dirty predicate as the navigation guard, including `transientDirty`. A numeric list item in a block can still carry its last numeric value while the control visibly holds an empty input. For a newer revision with local work, leave the form and its children mounted, retain validation and slug-editing state, and record a conflict for this entry. For a clean form, update the baseline and reset together. Equal draft revisions can carry updated publication metadata without resetting controls. Ignore older draft results and results for a previous entry. Disabling focus refetch would hide updates from clean editors and leave other cache refresh paths exposed.
3. **Distinguish successful commands from passive reads.** In `use-entry-mutations.ts`, use the adopted revision for Save, including Save and publish. Adopt the validated response to a successful local save even though the submitted form was dirty. A matching cache notification is then harmless. Preserve publish's saved-revision handoff, explicit reload/revert adoption and the independent publication guard on unpublish. An unpublish result can carry concurrent draft changes, so reconcile its draft by revision and dirtiness while updating publication status. Use the existing active-entry guard for late callbacks. A refetch already in flight when a mutation succeeds must never roll that success back.
4. **Reuse explicit recovery.** Extend `EntryConflictAlert` to describe a change detected on refresh without claiming a write failed. One alert handles repeated observations and a subsequent HTTP 409. It stays available until explicit reload succeeds or another intentional action resolves the conflict. Copy uses the existing content-only `localDraftJson` representation. Explicit reload reads the current server draft anew and resets the form and transient controls together only on validated success. Failure leaves recovery available. A detected conflict sends no writes of its own.

## Risks / Trade-offs

- Updating the query cache and the form through separate reset paths could briefly pair old values with a newer save guard. Give adoption a single owner, including for command results.
- Query failures can replace the editor subtree with a page error. For recoverable refetch errors after initial load, keep the working editor mounted and surface the read error without discarding its state. Preserve the Admin's existing expired-session recovery and permission checks.
- A test that merely injects a 409 misses the loss before the first Save. Drive a stale entry query through focus return with the routed editor mounted. Assert that a newer GET actually completed before checking the local controls or request preconditions.

## Migration Plan

Ship the shared Admin bundle through the normal release path. The change uses existing entry reads, revision preconditions and permissions. Deployment and rollback require no schema migration or API coordination.
