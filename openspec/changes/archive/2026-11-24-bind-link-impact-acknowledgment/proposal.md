## Why

Item 8 of the [pre-1.0 Lace audit](page://page_422b3a21dfd08191b6efbf905d01ba3b)
reproduced consent surviving a successful background update in the incoming URL
review shared by Delete and Unpublish. Admin now compares the checkbox with the
first source page's receipt. The full review also includes location pages, and
both dialogs need regression coverage for a successful refresh and for a server
conflict.

## What Changes

- Address audit item 8 as one pre-1.0 session following
  [CE10](../2026-10-24-ce10-internal-url-links/proposal.md). Bind explicit consent
  and each new destructive submission to one coherent URL impact receipt for the
  current dialog, target and action.
- Clear consent, explain what changed and present a fresh review when source or
  location pages report a different receipt or the server rejects the reviewed
  impact. A refresh under the same receipt keeps consent within the open review.
- Keep the original request for an uncertain unpublish retry. Start a new attempt
  only after the preceding attempt has a definite outcome and the current review
  permits the command.

## Capabilities

### New Capabilities

### Modified Capabilities

- [admin-draft-editor-publication](../../../specs/admin-draft-editor-publication/spec.md)
  defines how Delete and Unpublish present, invalidate and submit the URL review.

## Impact

Scope covers the shared Admin incoming-URL review, its Delete and Unpublish
callers from entry screens and collection rows, focused tests and the existing
editor guidance. It builds on [architecture §17](../../../../docs/architecture/admin.md#17-admin-application)
and the guarded lifecycle in [§10](../../../../docs/architecture/publication.md#10-content-publication).
The existing [URL impact semantics](../../../specs/internal-url-links/spec.md) and
[REST contract](../../../specs/rest-contracts/spec.md) supply the receipt and
commit-time checks on Node and Cloudflare. Typed entry-reference review follows
its existing [separate contract](../../../specs/entry-reference-fields/spec.md).
