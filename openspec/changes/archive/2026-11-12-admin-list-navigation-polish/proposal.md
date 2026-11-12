## Why

Collection list controls consume excessive space, search guidance obscures the list, and model navigation ignores the configuration's declaration order. Large navigation groups are difficult to scan.

## What Changes

- Combine a bounded sort-field selector, accessible direction control, search, status and field filters into a responsive toolbar; preserve effective sort and URL behavior.
- Move search guidance to an accessible information disclosure and show actionable invalid-search feedback inline.
- Preserve model declaration order through discovery for the sidebar, retain the fixed group order, and make content groups collapsible within the existing navigation scroll area.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-remote-state-and-lists`: Compact responsive collection controls and accessible search guidance.
- `admin-application-shell`: Declaration-ordered, collapsible model navigation.

## Impact

This user-selected UI polish is one standalone session, outside the numbered refactoring roadmap; it combines the two related admin navigation and list usability issues identified in the same review, without changing roadmap delivery order. It relies on the existing configuration and discovery pipeline and affects admin components and their tests, plus configuration normalization as needed. Architecture §§8, 12 and 17 and the two named accepted specs govern the work. Preserve deterministic structural hashes, sync behavior, authorization and Node/Cloudflare parity. No database migration, personal ordering, drag-and-drop, separate group scroll areas, search semantics changes, or media-library redesign is in scope.
