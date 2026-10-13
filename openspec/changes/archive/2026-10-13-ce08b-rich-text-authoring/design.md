## Context

See proposal.md for motivation and scope. The current shared RichTextEditor builds a single stable Tiptap extension set, forwards getJSON() on updates and replaces external content only when JSON differs. RichTextToolbar uses roving focus, accessible shortcut hints and a field-labelled fixed toolbar. LinkPopover currently owns only a URL and links the selected range. The recursive field renderer already preserves item identity, mounted disclosure content and block panels; CE8B must retain these properties.

CE8A code already validates and renders the expanded format, but its accepted-spec sync is pending. CE8B intentionally modifies the older admin requirement that says href-only links and H1–H3; it does not redefine CE8A validation or rendering requirements. Before implementation, update architecture section 17 to describe the approved authoring behavior; before final spec sync, synchronize CE8A's verified deltas first.

## Goals / Non-Goals

**Goals:** produce precisely the shared safe JSON without losing valid expanded content, preserve editor identity and keyboard access, and prove published output through the common renderer.

**Non-Goals:** inventing a second document validator, changing API/persistence semantics, per-field feature configuration, adding a syntax highlighter or specialized office-document paste normalization.

## Decisions

1. Extend rich-text-extensions.ts with H4 and safe horizontal-rule/plain-code nodes using the existing Tiptap version. Reuse installed extensions where exported; otherwise add only matching catalog dependencies. Plain code declares no language attribute and forbids marks. Avoid default CodeBlock language:null and default Link target/rel/class/title JSON, which CE8A rejects. Centralize a transport serialization boundary that removes only absent optional link values; it must not erase unsupported non-null values to hide a validation failure. Test both incoming valid documents and outgoing commands, shortcuts, input rules and paste. Widening the shared validator to accept editor defaults is rejected.

2. Keep one editor per leaf and the existing callback/baseline behavior. Do not rebuild the editor when a link option, selection, list position or disclosure changes. Toolbar actions use the existing transaction history; horizontal rule is an insertion action, code block a toggle, and H4 joins the style selector. Marks/links are disabled in plain code. Show H4, rules and pre/code with design tokens and preserved whitespace; no raw palette colors or inline arbitrary styles.

3. Extend LinkPopover with the shared Switch primitive and labelled independent options. Capture the selection when opening, reuse it for Apply/Remove, extend the current link range for a cursor within a link and insert linked URL text for an empty unlinked selection. Prefill every option on each opening, avoid stale state between editors, omit cleared attributes, reject unsafe URLs without changing content, and restore text focus on dismissal. Do not persist renderer-derived rel tokens.

4. Add a co-located RichTextBubbleMenu component in the content entity using the pinned Tiptap selection-menu integration where available. Share formatting actions/state and link-popover behavior with the fixed toolbar; each editor owns its menu. Restrict visibility to nonempty text selections in the focused, visible editable editor, excluding code-block text. Controls retain selection and offer accessible labels, focus and Escape dismissal. Fixed toolbar remains the complete keyboard route; bubble visibility never moves focus. A pointer-only replacement for the fixed toolbar is rejected.

5. Use existing Vitest editor/component tests for JSON fidelity, link combinations, history and read-only behavior. Extend apps/admin/e2e/editor.e2e.ts and composites.e2e.ts or add a focused CE8B suite using their session/keyboard/accessibility helpers. Browser tests cover real selection/focus, switches, bubble menu and identity across moves/disclosures/tabs, including axe checks. Mocked browser requests prove UI payloads only; additionally exercise a real Node API draft-save/read/publish/export path and build Astro from that export, recording the evidence separately. Reuse existing cross-runtime shared-validation coverage for Cloudflare parity rather than claiming real-account deployment.

## Risks / Trade-offs

- Default editor attributes violate strict JSON → narrow node/mark schemas, omission-only serialization and a shared-validator round-trip corpus for all four link combinations.
- Incoming documents are silently stripped by Tiptap → load old/new fixtures and compare supported document semantics before and after edits; opening must remain clean.
- Selection is lost through portals or menus → capture/mapping of the intended selection and actual browser tests, including keyboard-only use.
- Hidden panels leave floating controls behind → visibility tied to editor/panel focus and visibility, checked across disclosures and tabs.
- Controlled updates reset history → retain editor instance and avoid setContent for semantically unchanged normalized values.
- Ordinary paste imports forbidden attributes or marks → exercise shared validation and disabled controls in code, without promising specialized Word/Google Docs compatibility.

## Migration Plan

No database migration, block schema-version increment, destructive conversion or existing-document rewrite. Update docs/compatibility.md and authoring guidance to replace the interim CE8A admin warning only after preservation is verified. Upgrade engine, admin and consumer renderer dependencies together. Rollback after expanded documents exist requires matching configuration/database backup or an explicit validated conversion.

After focused and mandatory root checks, record browser/product evidence, synchronize CE8A then CE8B deltas with verification, archive the completed changes as requested, and commit the complete scoped diff in the current branch. No release publication or deployment is implied.
