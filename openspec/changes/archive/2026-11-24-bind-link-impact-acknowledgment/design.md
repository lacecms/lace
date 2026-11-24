## Context

`useLinkImpactReview` already stores the receipt selected by the checkbox and
compares it with the first source page. This comparison hides the checked state
on a receipt change but leaves the old selection in memory. Source pages have a
consistency check. `IncomingImpactSource` reports location loading and failure
to its parent, but a successful location response enters the displayed list
without being compared with the source review's receipt. The Delete dialog
reads its command data from the current render. Unpublish retains a key and
impact between retries while reading the expected snapshot from current props.

The API already returns the same opaque receipt in both pagination modes for
one target, action, actor, target preconditions and graph revision. The shared
removal plan checks those preconditions atomically on SQLite and D1, and a live
unpublish idempotency record can replay the original response. See the
[engineering notes](../../../../docs/internal-url-links.md#impact-receipts).

## Goals / Non-Goals

The shared entity review owns URL consent and page consistency. Each feature
dialog owns command submission and its existing lifecycle recovery. The design
uses the existing API, receipt, repository and typed-reference contracts.

## Decisions

1. **Use the server receipt as the review identity.** Keep the checkbox in
   transient dialog state scoped to the open session, entry and action. Derive
   the checkbox and submit guards from the active, coherent receipt in the same
   render. Retire old consent when the receipt changes, including when the new
   result needs no checkbox. A mixed or stale result restarts the view from the
   first source page and clears its location continuations. Scope or discard
   late results from earlier reviews. Gate pending or failed reads and announce
   a change once the UI discards consent or restarts the review. A coherent
   background replacement can be presented directly.

   A Boolean can outlive a replaced query result. Comparing the currently
   loaded rows would miss changes on unloaded pages. Receipt comparison includes
   those pages and keeps consent when requesting more pages of the same view.
   Pagination remains on demand, with the existing visibility labels and
   location limits.

2. **Check locations before admitting them to the URL review.** Pass the active
   receipt to the URL use of `IncomingImpactSource`. Compare each returned
   location page with that receipt before adding rows to the displayed list.
   Feed a mismatch into the same recovery path as a stale source continuation.
   Include the active review identity in the query scope or validate retained
   results before use so a cached or late response cannot join the newer review.
   Keep a source's existing typed-reference behavior behind its existing
   purpose. Reuse the admin client's validated response and error types.

3. **Capture command data at the confirmation event.** Delete passes the
   reviewed URL acknowledgment, independent typed acknowledgment and target
   precondition into the mutation from the enabled submit. Unpublish keeps the
   complete submitted input together, including the entry, expected published
   snapshot, receipt and idempotency key. When there are only advisory URL
   usages or none, keep passing the coherent current receipt under the existing
   command shape as a concurrency guard.

   After a no-response network failure the dialog can retry the original
   Unpublish attempt. If the review was replaced, identify that action as a
   retry of the prior request. A new attempt waits for a definitive response
   while this dialog stays open. A successful replay follows the existing
   result path. A terminal URL-impact conflict retires the attempt and restarts
   review. Existing stale-target errors still offer entry reload. Retrying the
   old key with a new body conflicts with the idempotency request hash, and
   issuing a new key immediately could lose the successful original result.

## Risks / Trade-offs

- An unrelated graph edit can rotate the existing receipt. The editor may have
  to confirm again even when the visible rows look identical. Use the server
  identity consistently, including for unopened pages.
- A cache result can arrive while a request is in flight or after the dialog
  changes scope. An immutable command input gives the API the review the editor
  actually confirmed, and its existing atomic guard determines whether that
  command can commit. The refreshed dialog governs the next new attempt.
- Location loading can overlap with source refresh. Exclude mismatched rows
  before display and keep submission gated during recovery. Use an accessible
  status for receipt changes and keep the existing dialog focus behavior.

## Migration Plan

Deploy the shared Admin bundle for both supported runtimes. It uses the current
read and command shapes and works with their existing persisted data. The
browser review is transient and starts fresh on reload.
