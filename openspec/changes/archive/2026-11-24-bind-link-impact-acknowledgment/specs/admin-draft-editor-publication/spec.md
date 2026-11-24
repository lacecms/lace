## MODIFIED Requirements

### Requirement: Destructive dialogs show link impact and require acknowledgment

Delete and Unpublish dialogs in entry screens and collection rows SHALL load the
paginated URL impact view, expose all entities and locations through continuation,
distinguish published-visible links from draft and hidden links, and explain
the post-build non-navigating fallback. Published-visible impact SHALL require
an initially unchecked explicit acknowledgment before a new destructive
submission is enabled. A coherent result containing only draft, hidden or no
incoming links SHALL allow a new submission without that checkbox, subject to
the existing lifecycle and typed reference checks.

The acknowledgment SHALL bind to the exact server receipt shown for the current
dialog session, target and action. Source pages and any location pages shown in
the review SHALL agree on that receipt. A successful refresh or continuation
with the same receipt SHALL preserve the acknowledgment within that review.
During active loading or read failure the dialog SHALL block new submission and
distinguish the read state from zero usages. Continuations SHALL remain available
on demand.

A changed receipt, mixed receipts, or an HTTP 409 indicating changed or
unacknowledged URL impact SHALL invalidate the prior acknowledgment. The dialog
SHALL announce the change and show current, coherent impact before allowing
another confirmation. A discarded acknowledgment SHALL stay cleared even if
its former receipt appears again, and opening a new review SHALL start with
fresh consent. A new submission that requires consent SHALL send the exact
receipt the editor explicitly acknowledged.

The dialog SHALL preserve local editor content, existing focus return, typed
reference checks, permissions and target revision error handling. Within an
open Unpublish dialog a retry of a submitted request after a network failure
SHALL keep its original expected publication, idempotency key and URL
acknowledgment. If the review has since changed, the dialog SHALL identify
retrying that request as a retry of the prior submission and SHALL require a
definite response before starting a new unpublish attempt. A rejection for URL
impact SHALL retire the old attempt and require review of the current impact.

#### Scenario: Impact lookup fails
- **WHEN** an incoming source or requested location page fails to load
- **THEN** the dialog displays retryable failure, does not present it as zero usages and blocks a new destructive submission

#### Scenario: Background refresh replaces acknowledged impact
- **WHEN** a successful background read replaces receipt A and its visible incoming URL usages with receipt B and different usages in an open Delete or Unpublish dialog
- **THEN** the dialog announces the change, displays B's usages with consent cleared and blocks a new submission until the editor explicitly checks the box for B
- **AND** the next new submission sends B's acknowledged receipt

#### Scenario: A continuation belongs to another review
- **WHEN** a source or location continuation returns receipt B while the displayed review uses A
- **THEN** the dialog invalidates consent and refreshes from the first source page without displaying the mixed pages as one review
- **AND** a later response carrying A does not restore the discarded acknowledgment

#### Scenario: More pages arrive for the same review
- **WHEN** a background refresh or an on-demand continuation succeeds with the same receipt throughout the open review
- **THEN** the dialog presents the loaded locations and retains any consent for that receipt

#### Scenario: Incoming set changes
- **WHEN** Delete or Unpublish returns `CONTENT_LINK_IMPACT_CHANGED` or `CONTENT_LINKS_IN_USE` for the submitted URL impact
- **THEN** the dialog stays open, announces the change, reloads the review and requires renewed consent if published-visible links remain
- **AND** any unsaved editor content remains recoverable

#### Scenario: Refresh removes the last published-visible link
- **WHEN** a successful refresh replaces acknowledged published-visible impact with a receipt for draft, hidden or no impact
- **THEN** the dialog shows that result without the published-link checkbox and permits a new submission once the other lifecycle checks pass

#### Scenario: Consent belongs to one dialog session
- **WHEN** an editor closes and reopens a destructive dialog, or its target or action changes, and published-visible impact is shown
- **THEN** the checkbox starts unchecked even if a receipt from an earlier review is cached

#### Scenario: Network retry after the review changes
- **WHEN** an Unpublish response is lost after submission with receipt A and a successful refresh then shows receipt B
- **THEN** the prior submission can be retried only with its original request data and idempotency key
- **AND** if that retry returns an impact conflict, a subsequent new attempt requires fresh consent for the current published-visible impact and a new key
