## ADDED Requirements

### Requirement: Acceptance verifies rendered block envelopes
The packed starter phase SHALL fail when the starter built from the served
export with a site URL does not render the home call to action's anchor as
its root `id`, its class name merged into its root `class`, and the home
hero's in-page link to that anchor. The generated Node journey SHALL publish,
through the admin API, an edit whose blocks include one with an anchor and a
class name and one hidden block with distinguishable text, and SHALL fail
when the built page lacks the anchor `id` or the merged class, or contains
the hidden block's text or block key.

#### Scenario: Starter renders an in-page anchor
- **WHEN** the packed starter is built from the export with a site URL
- **THEN** the home page contains `href="#get-started"` and the call to
  action's root with `id="get-started"` and class `cta cta--highlight`

#### Scenario: Node journey hides a block
- **WHEN** the Node journey publishes an edit with a hidden quote and an
  anchored hero and builds the site
- **THEN** the built page carries the hero's anchor and class name and does
  not contain the hidden quote's text or block key
