## ADDED Requirements

### Requirement: Model navigation follows declaration order and supports collapsing
Within each Pages, Collections and Globals group, model links SHALL follow their relative declaration order in the configured content array, including after a configuration reload. The group order SHALL remain Pages, Collections, Globals, followed by the existing permitted resource groups. Empty and unauthorized groups SHALL retain existing omission rules. Reordering declarations SHALL change navigation order without changing structural identity or requiring content migration.

Each non-empty model group SHALL have a labelled keyboard-operable disclosure that reports its expanded state. Groups SHALL start expanded when the navigation mounts; collapsing one SHALL hide its links from the accessibility tree and keyboard sequence, and expanding it SHALL restore their configured order. Collapse state SHALL be transient and independent for each group; it SHALL NOT alter configuration or other users' navigation. Desktop navigation and the narrow-screen navigation sheet SHALL both support this behavior. The navigation SHALL retain one scrollable area rather than adding independent group scroll areas, so all groups and permitted resource links remain reachable at short viewport heights and with many models.

#### Scenario: Interleaved configuration order
- **WHEN** the content array declares page Z, collection B, page A and collection A in that order
- **THEN** Pages shows Z before A and Collections shows B before A, while the group order remains Pages then Collections

#### Scenario: Reorder without a content migration
- **WHEN** only model declarations are reordered and the configuration is reloaded
- **THEN** the sidebar reflects the new relative order and structural identities and synchronization classification remain unchanged

#### Scenario: Collapse and expand by keyboard
- **WHEN** a user collapses Pages with the keyboard
- **THEN** its disclosure reports collapsed, its links leave the tab order, and other groups remain unchanged; expanding restores its links in configured order

#### Scenario: Many models on a short screen
- **WHEN** expanded model groups exceed the available navigation height on desktop or in the mobile sheet
- **THEN** the user can scroll the navigation to reach every permitted link and collapse or expand each model group
