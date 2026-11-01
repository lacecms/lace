## ADDED Requirements

### Requirement: The admin presents rules the server enforces
The admin SHALL evaluate `visibility` rules only from the validated model and
block metadata it receives, with the same effective-value semantics as the
server, and SHALL use them only for presentation: which fields are shown,
which problems are reachable, and how items are summarized. The admin SHALL
NOT remove, rewrite or reorder hidden values before saving, and SHALL NOT be
the enforcement of any rule; drafts saved from the admin SHALL be validated and
published by the server exactly as drafts from MCP, REST or `lace import`.

#### Scenario: Admin save keeps hidden values
- **WHEN** an editor saves an item with `kind: "image"` that still holds a `videoUrl` typed earlier
- **THEN** the draft request contains the `videoUrl`, the server validates it with draft semantics, and publication omits it from the published projection

### Requirement: Block settings keep a separate presentation-only rule
Block settings SHALL keep `settingsVisibility` as a separate rule and SHALL NOT
accept `visibility`. `settingsVisibility` SHALL remain presentation-only:
settings hidden by it keep their defaults, validation and public delivery.
Data `visibility` SHALL remain the only rule that changes requiredness and
published content. Both maps SHALL remain available on the same block without
either replacing the other.

#### Scenario: A block uses both rules
- **WHEN** a block declares `settingsVisibility` for `layoutWrap` and `visibility` for a data field `videoUrl`, and an editor hides both through their controllers and publishes
- **THEN** the published block keeps its `layoutWrap` setting and omits `videoUrl`
