# SM3B verification

Date: 2026-10-31. Change: `sm03b-admin-media-tagging`.

## Implemented behavior

- `@lacecms/contracts` re-exports the domain `normalizeMediaTag`; the admin
  pins its 20-per-item and five-per-filter limits to the contract schemas in a
  unit test.
- Shared `MediaTagInput` (entities/media): chips with named remove buttons, an
  ARIA combobox with debounced catalog suggestions (prefix, counts, chosen
  tags excluded, narrowed to the typed prefix while a request is pending),
  Enter/comma/Backspace/arrow handling, API-identical normalization, invalid
  text kept with an explanation, limit message, live announcements and a
  non-blocking suggestion failure. Escape closes only open suggestions; the
  details panel and picker consult `isOpenTagCombobox` in `onEscapeKeyDown`.
- Library: `tag` URL state (string or array accepted, normalized, sorted,
  first five kept), non-canonical addresses rewritten, tags in requests and
  query keys, Clear filters and the no-match state clear tags.
- Picker: the same filter in local state, reset on every opening.
- Details panel: tag editor inside the metadata form (set comparison, full-set
  patch, rejected tag named, conflict "Save mine anyway" replaces the tag
  set, tag catalog invalidated after tag saves), read-only tags for viewers
  and items pending deletion, discard confirmation mentions tags.
- Uploads: tags captured per queue entry from the active filter, reused on
  retry, hint "New uploads are tagged …" for writers in library and picker.
- `docs/media-tags.md` documents the admin tagging UI.

## Implementation findings

- Removing suggestion nodes during the input's blur let the Radix focus trap
  move focus to the panel container on Tab. Options stay mounted and the list
  is hidden with the `hidden` attribute instead; the list is never a tab stop.
- Admin end-to-end media fixtures lacked the `tags` key that SM3A made
  required in the media DTO, so the existing media e2e suites failed with
  "invalid response" before this change. Fixtures in six e2e files now carry
  `tags: []`; the focal-point keyboard test tabs over the new tag input.

## Checks

| Check | Result |
| --- | --- |
| Contracts tests | 153 passed |
| Focused admin unit tests (media entities, router, library widgets, metadata, uploads, API keys) | 183 passed |
| Full admin unit suite | 902 passed |
| `media-tags.e2e.ts` (keyboard tagging, URL filter and reload, tagged upload, picker reset, viewer, 320 px) | 5 passed |
| `media-metadata.e2e.ts` | 5 passed |
| `accessibility.e2e.ts` with new tag filter/editor axe scans | 57 passed |
| Full admin Playwright suite | 151 passed, 2 failed: the build-status popover audit passes when rerun alone (flaky under load); `composites.e2e.ts` "pointer drag changes only the selected list" fails identically on a clean `HEAD` checkout (pre-existing, unrelated) |
| Root `pnpm test` | 44 package tasks passed; root suite 221/222 on Node 24.22.1, the remaining `tests/release-artifacts.test.mjs` requires the pinned toolchain and passes on Node 24.12.0 |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | Passed |
| Boundary and admin color checks | Passed |
| `pnpm build`, `pnpm acceptance:starter`, `pnpm acceptance:existing-site` (Node 24.12.0) | Passed |
| `pnpm openapi:check` | Passed, no contract change |
| `openspec validate sm03b-admin-media-tagging --type change --strict` | Valid |
| `pnpm spec:validate` (all) | 83 passed, 1 failed: the unrelated stale draft `video-a-media-upload-delivery` omits SM3A's "Filter the library by tags" scenario in its `rest-contracts` MODIFIED block (pre-existing since the SM3A archive) |
