## Purpose

Allows authors to select content by stable entry identity and to publish, preview
and remove it with predictable ordering and direct dependency checks.

## ADDED Requirements

### Requirement: Typed selections identify reusable content independently of routing

A single selection SHALL store the raw opaque entry ID in the snapshot's content
JSON. A list of selections SHALL store those IDs in authored order. Model fields,
including page, collection and global fields, groups, list items and block data
SHALL support selections. An entry selected for a reference MUST belong to this
installation and to a page or collection model declared by the field, including
collections without routes. A new selection MUST identify an existing entry.
A permitted unpublished target SHALL be selectable and savable in drafts.
Published and draft content SHALL retain the original ID across changes to
target title, path, slug, fields or publication. The target's copied fields,
URL and title SHALL NOT become authored source data. Descriptor traversal alone
SHALL discover typed selections. Ordinary URL links, rich text, arbitrary
strings, block settings and SEO metadata SHALL NOT contribute typed edges.

#### Scenario: A service selects three reviews
- **WHEN** a service page selects three existing route-less reviews in the order C, A, B and another page selects review A
- **THEN** each page keeps its own ordered IDs and the same review can serve either page without a route or duplicate content

#### Scenario: A caller bypasses the picker
- **WHEN** a caller submits an unknown ID as a new selection, a global or an entry of a model outside the descriptor
- **THEN** the save fails at that field or list item without changing the draft, including when another model has the same title

### Requirement: Saved drafts and delivered publications are independently acyclic

The saved-draft graph SHALL contain all typed edges from current drafts,
including retained conditional values and hidden blocks. The public graph
SHALL contain only delivered edges from current published snapshots, after
visibility projection and hidden-block exclusion. For each affected phase,
admission SHALL replace a source's outgoing edges with that phase's candidate
edges and reject any directed cycle in the resulting graph. Checks SHALL
apply to actual entry IDs and SHALL permit a model to target its own model.
Draft and published versions of an entry MUST NOT be combined into one graph.
Every delivered selected target, including a selection in an optional field,
MUST exist in an allowed model and have a current publication at source
publication. Ordinary URL links SHALL keep their existing routability and
mutual-link behavior.

A refused cycle SHALL identify the candidate location and one deterministic
bounded witness of the cycle, with entry identities resolvable to authorized
display titles and an explicit truncation indication when necessary. A
publication blocked by an older published edge SHALL identify a source to
publish first when its saved draft removes that edge and can break the reported
cycle. A cycle with no such saved correction SHALL identify an edge to edit.
Guidance SHALL distinguish a next prerequisite from a guarantee of success
after one change.

#### Scenario: Direct, mutual and longer cycles
- **WHEN** a proposed draft points to itself, closes A → B → A, or closes A → B → C → A through a retained hidden field
- **THEN** its save fails with a field-addressed cycle issue; an acyclic chain among entries of that same model succeeds

#### Scenario: Prepare both drafts before reversing an existing dependency
- **WHEN** A → B is published, A's saved draft removes B, and B's saved draft adds A
- **THEN** both drafts can be saved; publishing B first fails with its location and A as the prerequisite, publishing A first succeeds, and B can then publish without editing its saved draft

#### Scenario: A cycle requires an editorial change
- **WHEN** a delivered candidate closes a published cycle and every other edge on that cycle remains present in its source's saved draft
- **THEN** the caller receives the implicated selection and cycle evidence without being told that republishing an unchanged source breaks the cycle

#### Scenario: An unselected optional field and a selected unpublished review
- **WHEN** a required-valid service has either an absent optional selection or an optional selection of an unpublished review
- **THEN** the former is publishable and the latter fails at that selection until the review is published or the selection is removed

### Requirement: All writers preserve graph and snapshot consistency

Create, save, publish, revert, duplicate, delete, unpublish, import, schema
rewrites and each committed block-migration unit SHALL maintain source JSON,
snapshot identity, direct usage locations and affected graph phase invariants
atomically. Location identity SHALL include source entry and snapshot, block
key or model fields, area and relative RFC 6901 pointer. The opposite phase
SHALL retain its own edges. Guarded checks SHALL cover active configuration,
target liveness/publication, required source revision and all graph evidence
used for admission. A live idempotent replay and a stale source precondition
SHALL keep their existing precedence. Changed graph evidence SHALL require
fresh proof before committing. A guard miss or rolled-back operation SHALL
leave content, references, public version, outbox, idempotency and preview
invalidation unchanged. Publication of a target SHALL request the existing
site rebuild without editing its sources.

#### Scenario: Concurrent mutations of different entries
- **WHEN** two saves or two publications would jointly create a cycle or one command publishes an incoming dependency as another removes its target
- **THEN** the committed state satisfies the applicable phase invariant under either commit order and neither command can rely on superseded proof

#### Scenario: Stale source revision wins
- **WHEN** a source is edited after a candidate is read and the candidate now has both a stale expected revision and an invalid dependency
- **THEN** the write reports the source revision conflict with no partial graph, content or build mutation

#### Scenario: Revert can introduce a draft-only cycle
- **WHEN** restoring published A → B into A's draft would conflict with B's saved draft pointing to A
- **THEN** revert refuses the cycle without changing either snapshot, revision, public state or queued work

### Requirement: Direct published use blocks removal and draft use is reviewable

Delete and unpublish SHALL refuse while any external current published source
has a delivered typed selection of the target, including optional selections.
The editor MUST remove or replace the selection and publish the source, or
otherwise remove that delivered use under existing lifecycle rules. A newer
saved draft alone SHALL NOT release the published dependency. Only direct
authored usages SHALL be reported. Source pages, route-less records and
globals SHALL all qualify. The result SHALL distinguish hard blockers, draft
usages and retained non-delivered published usages. The last group is
informational and SHALL NOT block removal or alone require a draft warning
acknowledgment.

If there are zero published blockers and at least one external draft
selection, deletion SHALL require explicit acknowledgment of current draft
impact. Unpublishing under the same conditions SHALL leave draft selections
intact and SHALL NOT require this acknowledgment. Warning acknowledgment
SHALL be bound to actor, target, action, guarded target state and graph
revision. It SHALL NOT waive another required URL acknowledgment or overcome
a published typed dependency. No action SHALL rewrite incoming source data.
Existing permissions, singleton restrictions and target preconditions SHALL
continue to apply. Direct impact access SHALL require `content:read`.

#### Scenario: Where used identifies the field to change
- **WHEN** a service page selects a review and that review selects author Anna
- **THEN** Anna's published blocker is the review's Author field; removing Anna in the review draft keeps the blocker until that review is republished, and the page never appears as a transitive blocker

#### Scenario: Hidden use can become visible later
- **WHEN** a review is selected only by a hidden published block and the review has no incoming draft selections
- **THEN** the selection is informational for removal; publishing a source that subsequently makes the selection visible requires an available published target

#### Scenario: Warning is scoped to reviewed draft uses
- **WHEN** the editor acknowledges deletion after reviewing draft usages but another draft adds the target before commit
- **THEN** that warning is stale, deletion writes nothing and a new review is required; if a delivered published usage appeared, the hard blocker takes precedence

### Requirement: Remaining draft selections can be repaired after deletion

Confirmed deletion SHALL leave any incoming draft selections at their existing
locations and their sources' revisions unchanged. The editor SHALL identify
each unresolved selection as deleted and permit removal or replacement.
Updates to the same existing draft SHALL permit retaining or reordering such
selections within the same reference field/list, including unrelated edits,
without permitting a new missing ID, additional occurrence, or transfer of a
missing ID to a different reference field or source. Availability SHALL be
rechecked before every publication or preview that delivers the selection.

#### Scenario: Keep an old missing selection while repairing the draft
- **WHEN** a review is deleted after draft-only confirmation and the editor changes the page title or reorders that page's review list
- **THEN** its draft saves with the dangling selection marked as deleted, while adding a second occurrence of the missing ID or copying it into another field fails

#### Scenario: Repair a page before preview or publication
- **WHEN** a delivered field still selects the deleted review
- **THEN** preview and publication give a location-specific error, and clearing the optional selection or choosing an available published review resolves that issue

#### Scenario: Duplicate would propagate a deleted target
- **WHEN** an editor duplicates a draft with a retained missing review
- **THEN** the operation identifies the missing selection and creates no copy until the source is repaired

#### Scenario: Reverting would reintroduce a missing selection
- **WHEN** a published hidden block still selects a deleted review and the current draft has already removed it
- **THEN** revert rejects the restored missing occurrence without modifying the draft

### Requirement: Integrity checks are bounded and equivalent on both runtimes

Node SQLite and Cloudflare D1 SHALL reach the same admission decisions. Checks
SHALL cover all reachable typed dependencies needed for the candidate, even
when its cycle is longer than the diagnostic witness. An exhausted proof
budget SHALL fail closed with a distinct bounded error, never certify an
unexamined branch or report it as a proven cycle. Shared descendants SHALL
NOT cause lookup work proportional to the number of distinct paths.
An aggregate SHALL retain the 200 combined URL/typed reference occurrence
cap independent of media limits. Impact reads, target lookup, graph checks
and mutations SHALL preserve the established D1 limit of 100 bindings per
statement, 40 statements per guarded mutation batch and 50 per HTTP
invocation including authorization. For each source and phase gaining edges,
the proof SHALL allow up to 2,048 distinct reachable entry IDs, counting the
added targets once and evaluating their reachability under the candidate
overlay. Without an already proven cycle, the 2,049th distinct ID SHALL
yield the graph-limit issue. Pure removals and reorderings SHALL NOT consume
this allowance. A cycle witness SHALL contain at most 16 entry IDs and
indicate any omitted middle segment. Unchanged outgoing tuples on a content-only
draft edit SHALL cause no reference writes or graph revision increment.

#### Scenario: Many paths reach one subgraph
- **WHEN** a valid set of selections within the work budget reaches the same dependency repeatedly through diamond-shaped branches and includes route-less targets
- **THEN** the complete check accepts the acyclic candidate within budget without a query per path or per selected occurrence

#### Scenario: Proof cannot be completed safely
- **WHEN** a new edge reaches an otherwise valid chain of exactly 2,048 distinct IDs, or one more in an acyclic graph
- **THEN** both runtimes accept the first and reject the second with the graph-limit issue, preserving prior content and permitting subsequent removal of edges
