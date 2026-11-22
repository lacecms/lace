## 1. Reproduce the data loss at the repository boundary

- [x] 1.1 Add a shared upload regression using `MediaUseCases.create`, the production repositories and byte-retaining object storage. Fault the first repository metadata read after the real commit. Demonstrate the current failure on SQLite and local D1 by checking the active SQL row, tags, SHA-256 and stored bytes after the request rejects.
- [x] 1.2 Use the tag-insert abort trigger with the same upload fixture. Verify that row and tag inserts roll back together, the failure reaches the caller and the unreferenced object is deleted.

## 2. Distinguish write outcomes and make cleanup conditional

- [x] 2.1 Define the media-create failure outcome in the application port and report it at the Node and D1 write/read boundaries. Verify direct command success still returns the expected metadata, and tests distinguish confirmed rollback, a read failure after confirmed commit and an unclassified acknowledgment failure.
- [x] 2.2 Add the bounded ownership check for uncertain outcomes using the allocated ID and opaque key. Verify matching rows, conflicting ownership, confirmed absence after a settled write, and an empty read while a write could still commit. Cover a matching row already marked for deletion.
- [x] 2.3 Apply the outcome in `MediaUseCases.create` and extend its sanitized operational diagnostics. Verify the rollback and post-commit regressions pass, an inconclusive check retains the object, and cleanup or logger failures preserve the original error. Check that validation and authorization failures still precede the object write and that successful uploads perform no reconciliation.
- [x] 2.4 Simulate loss of acknowledgment after a real create, then failure of the reconciliation read. Verify each request reports failure and recovery issues no further write or delete. After removing the fault, verify the single active row, normalized tags, hash-filtered listing and exact object bytes. Retain the separate regression for failure of the application catalog read.

## 3. Document and verify the correction

- [x] 3.1 Update architecture §9.7 with the cleanup condition and link to the updated media contract. Verify the text explains why an error response can coexist with an active item and why an unresolved upload leaves its object in place.
- [x] 3.2 Run the focused media use-case, application-persistence and shared repository scenarios on file-backed SQLite, in-memory SQLite and local D1. Record the observed SQL state and byte comparisons for rollback, post-commit read failure and ambiguous acknowledgment.
- [x] 3.3 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate distinguish-media-upload-commit-outcomes --type change --strict` and record the results.
