## ADDED Requirements

### Requirement: Reference site renders block anchors and classes
The reference site's committed fixture export SHALL include published blocks
with an anchor, with a class name, and with both, and an in-page link whose
target is the `#` anchor of a block on the same page. The fixture build SHALL
render each anchor as the `id` of its block's root element, add each class
name to that root's `class`, and keep the link's `href` so that it resolves to
the anchored block on the emitted page. Blocks without an anchor or class name
SHALL keep the markup the site emitted before block envelopes. Every anchor
SHALL be unique within its page.

#### Scenario: An in-page anchor link
- **WHEN** the fixture's home hero links to `#get-started` and the home call
  to action has anchor `get-started` and class name `cta--highlight`
- **THEN** the built home page contains a link with `href="#get-started"` and
  exactly one element with `id="get-started"`, the call to action's root,
  whose `class` is `cta cta--highlight`

#### Scenario: A class name without an anchor
- **WHEN** a post's image block has class name `full-bleed` and no anchor
- **THEN** the built post's image root carries `class="full-bleed"` and no
  `id`

#### Scenario: Blocks without an envelope
- **WHEN** the about page and the note are built from blocks without anchors
  or class names
- **THEN** their block roots carry no `id` and the same classes as before
