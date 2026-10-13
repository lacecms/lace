## ADDED Requirements

### Requirement: Cross-runtime delivery covers composites and global navigation
The shared API scenario SHALL, on both runtimes, save through the admin API
and publish a page with a gallery block whose items reference uploaded media
with and without an alt override, and save and publish the `navigation`
global with a navigation block holding a submenu; it SHALL then save a later
navigation draft containing a draft sentinel without publishing it. The
canonical published-site projection SHALL include published globals, with
nested media identifiers replaced by the same documented placeholders as
top-level media. The Astro journey SHALL require, for each runtime, that every
emitted route's header renders the published navigation links and submenu,
that the gallery route renders one figure per item with the effective alt
text and resolved dimensions, and that no output contains the draft sentinel.

#### Scenario: Both runtimes deliver a gallery and navigation
- **WHEN** the common seed publishes a gallery and the navigation global on
  Node and on the local Worker
- **THEN** both canonical projections equal the shared expected output,
  including the global and the gallery's nested media placeholders, and both
  Astro builds render the same navigation and gallery markup

#### Scenario: A later navigation draft stays private
- **WHEN** the navigation global's draft is changed after publication
- **THEN** neither runtime's export, published-site view nor static output
  contains the draft link
