## Why

Wave 4 session CE8B completes CE8A's shared rich-text format with authoring tools. The current admin supports only H1–H3 and href-only links and cannot preserve expanded documents, so authors cannot safely adopt the new format yet.

## What Changes

- Enable H4, horizontal rules and plain code blocks in every rich-text editor, including recursive model and block fields, with fixed-toolbar actions and safe shortcuts/input rules.
- Add independent Open in a new tab and nofollow link switches, preserving selection while applying, editing or removing links.
- Add a compact selection bubble menu for Bold, Italic, Strike, inline Code and Link; retain every action in the keyboard-accessible fixed toolbar.
- Preserve expanded documents through undo/redo, nested list moves, disclosures, block tabs, save/reload and publication to Astro.
- Update architecture section 17, authoring and consumer upgrade guidance, and common-renderer reference/starter examples; verify browser behavior and accessibility.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-draft-editor`: expand the shared safe editor subset and link controls, add selection formatting, and verify preservation across the complete draft lifecycle.

## Impact

Implements only roadmap session CE8B in docs/content-editor-roadmap.md. Architecture sections 8, 11, 13 and 17 and accepted admin-draft-editor, content-validation, render-core and astro-adapter capabilities govern this work. Depends on verified active change ce08a-shared-document-format-rendering: its four deltas must be synchronized before CE8B final spec synchronization/archive, rather than treating the still-scalar accepted format as current expanded behavior.

Primary targets are apps/admin/src/entities/content/{rich-text-extensions.ts,RichTextEditor,RichTextToolbar,LinkPopover}, nearby component/extension tests, apps/admin/e2e editor/composite/accessibility coverage, reference/starter content and docs/compatibility.md. Any added Tiptap extensions must use the existing pinned catalog version; reuse installed packages where possible.

No REST/database changes, migration, block schema bump or automatic document rewrite. New-format documents require coordinated engine/admin/site upgrades. Non-goals: CE9 forms, per-field rich-text restrictions, syntax highlighting/language selection, raw HTML, rich-text tables/media and dedicated Word/Google Docs paste cleanup. Ordinary paste remains subject to shared document and URL safety. Spec synchronization and archive occur only after verified implementation; the requested final commit stays on codex/content-editor-wave-4.
