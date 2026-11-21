# Entry reference fields verification

## REL1A — Field descriptors and configuration

Verified on 2026-11-22.

`field.reference({ models })` stores one raw case-sensitive entry ID and
preserves literal model-key types. Nested groups and lists, model and block
defaults, metadata round trips and forged input were exercised in the
content, config and contracts suites. The config tests cover forward and
same-model declarations, route-less collections, rejection of globals and
unknown models, canonical model-set order and the pre-existing projection
fixture.

The normalized snapshot tests cover hidden values, visible and hidden
blocks, stable block keys, escaped pointers, materialized defaults and
repeated targets. The combined URL and typed reference count accepts 200
and rejects the 201st occurrence at its concrete path. The fixtures also
exercise the independent media, list and JSON byte limits. CE10 consumers
continue to receive the URL-only projection.

The sync planner treats widening as compatible, narrowing or replacing a
target set as validated and set reordering as equivalent. It accounts for
prospective target-model renames and retains existing source-model and
block version gates. Stored-target and graph evidence is the REL1B sync
checkpoint.

### Additive text-author migration fixture

The fixture in
[`reference-fields.test.ts`](../../../packages/application/src/configuration/reference-fields.test.ts)
starts with a populated `posts` model at version 1 with
`author: field.text()` holding `"Ada"`.

1. In model version 2 keep `author` and add
   `authorEntry: field.reference({ models: ["authors"] })`. The planner
   reports a compatible addition and preserves existing snapshot contents.
2. Map the text author explicitly to an author record and save its raw ID
   in `authorEntry` through the normal draft and publication workflow.
   The fixture represents the resulting draft and published data with
   `{ author: "Ada", authorEntry: "people/Ada" }`.
3. In model version 3 remove `author`, declare `removedFields: ["author"]`
   and check the sync plan. The fixture verifies one hinted removal and
   confirms the resulting snapshots preserve `authorEntry: "people/Ada"`.

Replacing the populated text field with a reference at the same key, or
moving it through a field-rename hint while changing the type, yields a
breaking type change.

### Checks

- Content, config and contracts passed 275, 111 and 211 tests respectively.
- The application planner and draft checks passed 88 tests. The focused
  admin and CLI checks passed 11 and 7 tests respectively.
- Content and contracts passed all three packaged-export checks. Generated
  OpenAPI adds the reference scalar to the field and list-item schemas.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and
  `pnpm exec openspec validate add-entry-reference-fields --type change --strict`
  passed.
