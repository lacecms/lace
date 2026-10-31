## ADDED Requirements

### Requirement: Reference and generated starter sites deliver video embeds

The reference site and new generated starter sites SHALL register the canonical
`videoEmbed` component with its matching built-in definition, allow it in their
editable page model and include a current block installation record. Existing
consumer sites SHALL opt in through ordinary block installation and configuration
synchronization, without overwriting local sources. Reference fixtures SHALL cover
YouTube, Vimeo, a poster and no poster; generated starter builds SHALL work without
provider credentials, network metadata requests or a running media/video service.
Public content SHALL use the normal published export and static build path.

#### Scenario: Static builds do not contact video providers
- **WHEN** a reference or generated starter site builds supported embed fixtures
- **THEN** it emits canonical player or preview markup with no provider API or thumbnail requests

#### Scenario: A draft edit leaves public output intact
- **WHEN** an editor changes a published embed's URL or poster only in the draft
- **THEN** public export and the rebuilt site retain the previous published values until publication
