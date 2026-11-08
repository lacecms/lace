## 1. Baseline

- [x] 1.1 Record the requirement titles of every capability before the change (for the title diff in 4.2).

## 2. Index and pointers

- [x] 2.1 Write `openspec/specs/README.md`: every capability (including the five new ones) in exactly one domain group, each group with its ownership rule; add a root test that the README lists exactly the capability directories.
- [x] 2.2 Repoint `docs/architecture/content-configuration.md` and `docs/architecture/admin.md` from `admin-draft-editor` to the owning sub-surface capability and add `gallery-block` to the built-in block pointers.
- [x] 2.3 Update the `openspec/specs` inventory row and add the RF8B log entry in `docs/refactoring-roadmap.md`.

## 3. Specifications

- [x] 3.1 Apply the deltas to a scratch copy of `openspec/specs` with the pinned OpenSpec CLI and confirm 89 capabilities, a strict validation pass and the new capabilities' purposes.

## 4. Verification

- [x] 4.1 Run `pnpm spec:validate`, the documentation link and architecture tests and the new README test (the README test against the scratch copy until archive).
- [x] 4.2 Compare requirement titles before and after (scratch copy): every title is present, or was re-added under a new title named in its REMOVED migration.
- [x] 4.3 Run root `pnpm lint`, `pnpm format:check` and `pnpm typecheck`.
