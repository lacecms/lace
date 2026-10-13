## ADDED Requirements

### Requirement: Acceptance verifies Gallery and site navigation in the packed starter
The packed starter phase SHALL serve an export whose post contains a
published gallery and whose `navigation` global is published with a
navigation block that has a submenu, and SHALL fail when the built post
lacks the gallery root with one figure per item and the effective alt text,
when any built page lacks the global's navigation root in its header, its
links, its `details` submenu or `aria-current="page"` on the link to that
page, or when the fallback navigation is also present. The build from the
export without globals SHALL fail the phase when any page lacks the static
fallback navigation or contains a navigation block root in its header.

#### Scenario: Starter renders published navigation and a gallery
- **WHEN** the packed starter is built from the export with a published
  navigation global and a post gallery
- **THEN** every page's header contains the navigation block with its submenu
  disclosure, the home link carries `aria-current="page"` on the home page,
  and the post contains the gallery figures with their alt text

#### Scenario: Starter falls back without the navigation global
- **WHEN** the packed starter is built from the export without globals
- **THEN** every page shows the static fallback navigation and no navigation
  block root in its header
