## Why

`admin-editor-ui-polish` (archived 2026-11-10) centered the entry editor in
wide content areas. On a large screen the owner found the centered editor
"hanging in the air" and asked on 2026-11-10 to return it to the left edge.
This is an owner-inserted follow-up outside the RF steps; it changes only that
one part of the earlier change.

## What Changes

- The entry editor stays aligned to the start (left) of wide content areas, as
  before `admin-editor-ui-polish`. Its 80rem maximum width, two-column layout,
  block-less layout and every other part of that change stay unchanged.

Non-goals: any other layout, spacing or width change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-draft-editor`: the editor layout requirement is replaced by a
  start-aligned one (REMOVED + ADDED, because OpenSpec cannot drop the
  centering scenario from a MODIFIED block).

## Impact

`apps/admin` entry page form classes only; the roadmap progress log. No API,
data, permission, dependency or Node/Cloudflare parity change.
