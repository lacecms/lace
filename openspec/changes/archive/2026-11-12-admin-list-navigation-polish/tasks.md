## 1. Preserve declaration order

- [x] 1.1 Preserve content declaration order for runtime model discovery while retaining key-sorted canonical public projections and hashes; verify reordered configurations produce identical identity hashes and sync classification in configuration and synchronization tests.
- [x] 1.2 Verify discovery through REST and MCP preserves interleaved model declaration order and retains authorization and runtime parity using focused contract tests.

## 2. Sidebar navigation

- [x] 2.1 Render each model group in discovery order with independent, initially expanded accessible disclosures; verify group order, permission filtering, empty groups and keyboard collapse/expand in sidebar tests.
- [x] 2.2 Verify many models on short desktop and mobile viewports remain reachable through the single navigation scroll area, including keyboard access and sheet behavior, with browser tests.

## 3. Collection controls

- [x] 3.1 Replace the combined sort choices with a bounded field selector and direction control, preserving URL, default sort, headers and pagination; verify long labels, direction changes, enabled fields and URL restoration in focused tests.
- [x] 3.2 Place sorting, search, status and field filters in a responsive toolbar; verify wide and narrow viewport layout and keyboard access with browser tests.
- [x] 3.3 Move search guidance into an accessible pointer/keyboard/touch disclosure and retain visible actionable invalid-budget feedback; verify Node and Cloudflare limits, Escape dismissal and preservation of valid query/results in focused tests.

## 4. Documentation and verification

- [x] 4.1 Update relevant user documentation for configuration-ordered navigation, collapsible groups and revised list controls; verify examples and links match the implementation.
- [x] 4.2 Run focused configuration, discovery, synchronization and admin tests including relevant browser coverage; verify the new ordering and responsive/accessibility scenarios pass. Config (88), synchronization (68), REST (14), MCP (6), admin (81), and 9 browser scenarios passed, including Node and D1.
- [x] 4.3 Run root typecheck, Oxlint, Oxfmt check and `pnpm exec openspec validate admin-list-navigation-polish --type change --strict`; resolve failures and record results. All passed; root build and documentation checks passed as well.
