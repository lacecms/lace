## MODIFIED Requirements

### Requirement: Reference and generated starter sites deliver video embeds

The reference site and new generated starter sites SHALL register the canonical
`videoEmbed` component with its matching built-in definition at version 2,
allow it in their editable page model and include a current block installation
record. Models that allow the block SHALL have raised versions so configuration
synchronization migrates stored version 1 blocks. Existing consumer sites SHALL
opt in through ordinary block installation and configuration synchronization,
without overwriting local sources; their upgrade instructions SHALL name both
steps and the `block_version_mismatch` failure of an older component.
Reference fixtures SHALL cover YouTube, Vimeo, a poster and no poster, a
non-default aspect ratio, and `ambient` playback with and without a poster;
generated starter builds SHALL work without provider credentials, network
metadata requests or a running media/video service. Public content SHALL use
the normal published export and static build path.

#### Scenario: Static builds do not contact video providers
- **WHEN** a reference or generated starter site builds supported embed fixtures, including ambient ones
- **THEN** it emits canonical player or preview markup and ambient templates with no provider API or thumbnail requests and no live ambient iframe in the static HTML

#### Scenario: Ambient and aspect-ratio fixtures render
- **WHEN** the reference site builds its fixture with a `1:1` ambient Vimeo block and a `16:9` player block
- **THEN** the output carries the selected ratio and playback hooks, the ambient URL in an inert template, and unchanged markup for the player block apart from its new hooks

#### Scenario: A draft edit leaves public output intact
- **WHEN** an editor changes a published embed's URL, poster or settings only in the draft
- **THEN** public export and the rebuilt site retain the previous published values until publication
