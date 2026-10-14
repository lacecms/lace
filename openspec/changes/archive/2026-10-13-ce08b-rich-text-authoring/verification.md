# CE8B verification

Verified 2026-10-13 on `codex/content-editor-wave-4`.

## Implementation

- Shared editor schema enables H1–H4, horizontal rules and plain code with no language attribute or marks. Outgoing serialization omits only absent target/rel options; unsupported present values remain available to shared validation.
- Fixed toolbar, selection bubble and per-link switches preserve selection and editor identity. Escape uses a native menu listener and the Tiptap hide transaction; the menu integration's event proxy cannot safely invoke native cancellation methods in Chromium.
- Existing and expanded documents load without dirtying, survive history, list movement, disclosures, tabs, save/reload and explicit conflict recovery. Viewers have no editing controls.
- Updated architecture, roadmap, compatibility, authoring and reference/starter styling/renderer examples. No database migration, schema-version bump or automatic document rewrite.

## Passing checks

- `pnpm --filter @lacecms/app-admin exec vitest run src/entities/content/rich-text-extensions.test.ts src/entities/content/LinkPopover/LinkPopover.test.tsx src/entities/content/RichTextToolbar/RichTextToolbar.test.tsx src/entities/content/RichTextEditor/RichTextEditor.test.tsx src/entities/content/RichTextBubbleMenu/RichTextBubbleMenu.test.tsx --maxWorkers=2`: 33 tests.
- `pnpm --filter @lacecms/app-admin exec playwright test rich-text.e2e.ts editor.e2e.ts composites.e2e.ts --workers=2`: 30 scenarios. Includes focused axe WCAG A/AA checks of the open link dialog and existing narrow light/dark editor/viewer composite screens. Real keyboard/selection/menu operations, safe ordinary paste, old/new data, identity, history and conflict recovery are covered.
- `pnpm --filter @lacecms/platform-node exec vitest run src/rich-text-product.test.mjs --maxWorkers=1`: real SQLite-backed Node runtime API save/read/publish/export, nested model data and block data, all four link options, published isolation after later draft edits, and an Astro build fetching that runtime's public export. Actor resolution uses the explicit test-only injected admin; this is not an authentication test or real deployment.
- `pnpm --filter @lacecms/app-site exec vitest run src/fixture-build.test.mjs --maxWorkers=1`: 3 reference builds.
- `pnpm exec vitest run tests/block-sources.test.mjs --maxWorkers=1`: 48 reference/starter/registry parity checks.
- `pnpm --filter @lacecms/cli exec vitest run src/blocks-registry.test.mjs --maxWorkers=1`: 3 registry checks.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: pass. Oxlint retains pre-existing warnings in builder/db tests, with no errors or new CE8B warnings.
- `pnpm exec openspec validate ce08b-rich-text-authoring --type change --strict`: pass.

## Evidence boundaries

Browser routes use contract-shaped fixtures to verify UI requests and local state; the separate real Node integration verifies persistence/publication/delivery. Shared validation and rendering are runtime-portable; no Cloudflare account deployment, production publication or Word/Google Docs compatibility claim is made. Initial test fixture and keyboard-selection errors were corrected; the final listed runs pass. The history test separates actions beyond Tiptap's 500ms grouping window so Undo checks the rule insertion rather than an entire burst of authoring.

CE8A's prior verification remains the shared validation/rendering corpus evidence. Its four deltas synchronize before CE8B's admin delta, with exact requirement/scenario comparison before archive.
