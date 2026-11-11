## Context

All work is in `apps/admin`, which keeps its layer/slice structure (app → pages
→ widgets → features → entities → shared). Relevant observed code:

- `widgets/admin-shell/navigation.ts` builds the groups; the globals group has
  `key: "site"`, label "Site". `SidebarNav` links unsynchronized globals to
  `#site`, `tour.ts` adds a step for `key === "site"`, and
  `pages/content/ContentPage` renders `<section id="site">` headed "Site".
- `pages/entry/EntryPage/EntryPage.tsx` renders a `max-w-[80rem]` two-column
  form pinned left, a visible uppercase `h1` "Edit {label}", the
  `EntryListBudget` line always, `BlockEditor` always (which prints "This model
  does not allow blocks."), and model fields in the right-hand *Fields* card.
- `widgets/block-editor/BlockEditor` owns `activeKey` and `collapsed`; cards set
  the active key on `focus`/`pointerdown` capture, and nothing clears it.
- `FieldRenderer` always prints "`n` characters" for counted fields;
  `EntrySeoCard` prints "`n` / 60 characters (recommended). Limit: 200
  characters." `FieldRenderer` and `ListField` render "Create {label}".
- `shared/ui/Input` adds `dark:bg-input/30`, which overrides the title input's
  `bg-transparent` in the dark theme.
- The repository `lace.config.ts` `settings` global declares `helpUrl` first
  and a Title template description that repeats the `seoDefaults` annotation.

## Goals / Non-Goals

**Goals:** the behavior in the delta specs; the small visual fixes listed in
the proposal; no change outside the admin app except the development config,
backlog and roadmap.

**Non-Goals:** per-model navigation icons, template field order, API or
contract changes, new dependencies.

## Decisions

1. **Rename by key, not only label.** The group key becomes `globals`, the
   content-landing anchor `#globals`, the tour step id `globals`. A stale
   `#site` bookmark simply lands on the top of the content page; no redirect is
   kept (pre-release, cosmetic).
2. **Block-less layout is decided in `EntryPage`.** `hasBlockSection =
   allowedDefinitions.length > 0 || draft blocks length > 0`, read from the
   watched form value so that removing the last orphaned block keeps the
   section until reload (no layout jump mid-edit). Without the section the
   *Fields* card renders in the main column below the title/label at the
   column's full width (a narrower card left a gap before the right-hand
   column); the aside keeps publication and SEO. The
   same card component is reused so field rendering, errors and focus targets
   are unchanged. Rejected: a single full-width column, because the
   publication card would then sit above or below the fields and lose its
   "always at hand" role.
3. **Budget threshold** is a shared constant (400 = 80% of the existing 500
   limit) next to `EntryListBudget`; the component returns `null` below it
   unless `budget.problem` is set.
4. **Centering**: the form gets `mx-auto w-full`; the 80rem maximum stays.
5. **Clearing the active block** uses document-level `pointerdown` and
   `focusin` listeners registered by `BlockEditor` while a block is active.
   The highlight clears when the event target is outside the block list
   element and not inside an overlay (`[role="dialog"]`, `[role="menu"]`,
   `[role="listbox"]`, or a Radix popper wrapper) — those are portalled
   outside the list but belong to the block that opened them. Rejected:
   `onBlur` on the list, because portalled overlays and the media dialog would
   clear the highlight while the writer is still working in the block.
6. **Collapse all** lives in the `BlockEditor` heading row: an icon button
   (`ChevronsDownUp` / `ChevronsUpDown` from the existing `lucide-react`) with
   a matching `aria-label` and `title`, shown when `fields.length >= 2`.
   "Any expandable block is expanded" is computed from `collapsed` and the
   block error map; collapsing adds every key, expanding clears the set.
   Errored blocks already render expanded regardless of `collapsed`. Viewers
   may use it, as they may use per-card collapse.
7. **Counters**: `FieldRenderer` hides the count span for unbounded fields
   while the value is empty and drops its id from `aria-describedby`; bounded
   fields are unchanged. SEO text becomes "`n` / 60 recommended · 200 max";
   the advisory warning text is unchanged.
8. **Heading**: the eyebrow `h1` becomes `sr-only` with the same text, so the
   accessible name of the form (`aria-labelledby="entry-title"`) and the
   existing "Edit Site settings" heading scenario stay valid.
9. **Create label**: a small `sentenceCaseLabel` helper in the field-editor
   slice lowercases the first character only when the second is lowercase
   ("Links" → "links", "SEO links" unchanged).
10. **Title input**: add `dark:bg-transparent` and a hover/focus background to
    the title input's classes; `shared/ui/Input` is unchanged.
11. **Development config**: remove the Title template description and move
    `helpUrl` after `image`. Field order is presentation only; the change is
    checked with the configuration synchronization check before commit.

## Risks / Trade-offs

- Overlay detection by role/attribute could miss a future portalled widget;
  the failure mode is only a cleared highlight. Unit tests cover the media
  dialog and block menu.
- Hiding empty counters slightly changes established behavior; bounded and SEO
  counters, the ones tied to validation or advice, stay always visible.
- e2e and unit tests that select "Site" or expect "0 characters" / the old SEO
  sentence need updating in the same change.
