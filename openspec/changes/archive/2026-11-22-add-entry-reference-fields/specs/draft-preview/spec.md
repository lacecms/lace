## ADDED Requirements

### Requirement: Reference validation precedes replacement of a saved-draft preview

Preview creation SHALL check every data reference delivered by the selected
saved draft against the published context that will be frozen. An optional
field with a selected value SHALL be checked too. Each target SHALL be
published and belong to a permitted model. Substituting the candidate's
delivered references for its previous published references SHALL preserve
acyclicity in that context. A failed check SHALL return a field- or
block-addressed diagnostic before replacing a previous preview or dispatching
a runner. A publication-order conflict SHALL identify an actionable pending
correction when the current saved draft of the blocking source proves one.
Conditional values and hidden blocks excluded from delivery SHALL follow
existing publication projection and preview rules.

#### Scenario: Selected draft-only target blocks a service preview

- **WHEN** an otherwise valid saved service page selects a new unpublished testimonial in an optional visible field
- **THEN** preview identifies the field and testimonial to publish, keeps the previous ready generation and dispatches no build

#### Scenario: Staged reversal would introduce a published-context cycle

- **WHEN** published A uses B, the saved draft of A has removed that use, and the saved draft of B selects A
- **THEN** previewing B initially directs the editor to publish A first, and the same draft of B becomes eligible once that correction is published

#### Scenario: Hidden target is absent from the preview

- **WHEN** the only reference to an unpublished testimonial is in a hidden block or a field removed by a visibility rule
- **THEN** its unavailability does not block an otherwise valid preview, and neither the reference nor the testimonial's draft data is delivered through that source location

### Requirement: Frozen reference targets come exclusively from the published context

The renderer SHALL resolve references using the frozen site view that
overlays exactly the selected routed draft. For each reference made by that
draft the renderer SHALL see the referenced entry's captured publication,
including a published route-less record. It SHALL NOT fetch other drafts,
use live target state, or expose preview data through public SDK or REST
operations. The existing consistency, expiry and invalidation rules SHALL
apply throughout capture and rendering.

#### Scenario: Two versions of the author

- **WHEN** the selected article references an author with a published photo and a different draft photo
- **THEN** the preview displays the published photo captured for its generation, and a subsequent publication of the author's new photo does not change that ready preview

#### Scenario: Context changes while a related record is being captured

- **WHEN** a target's publication changes between captured pages and a consistent input cannot be sealed
- **THEN** the operation fails under the existing context-change rule without mixing record versions or loading the target's draft
