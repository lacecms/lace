## MODIFIED Requirements

### Requirement: Acceptance covers recovery and route usability
The acceptance proof SHALL cover a stale-revision conflict that preserves local authoring and offers explicit recovery; narrow-viewport navigation without horizontal page scrolling; keyboard operation and visible focus for the main editorial controls; and loading, empty, and error states on Content, Media, Users, and Settings. Builds SHALL display its explicit operational state. The walkthrough SHALL run on the redesigned admin and SHALL run automated WCAG A and AA accessibility checks on the content home, a collection list, the entry editor, the media library, Users, and Settings with the acceptance stack's real data; any violation SHALL fail the walkthrough.

#### Scenario: Concurrent edit is rejected
- **WHEN** a writer saves against a stale draft revision during the walkthrough
- **THEN** the local values remain available and the writer can explicitly reload the server draft or copy the local draft representation

#### Scenario: Route failure is shown
- **WHEN** an authenticated route request fails or returns an empty valid result
- **THEN** its visible state distinguishes failure from emptiness and keeps the available recovery or next action keyboard accessible

#### Scenario: Narrow keyboard navigation
- **WHEN** a keyboard user navigates the Admin at a narrow viewport
- **THEN** the route navigation and primary actions remain reachable with visible focus and without horizontal page scrolling

#### Scenario: Accessibility is checked with real data
- **WHEN** the automated walkthrough reaches the content home, a collection list, the entry editor, the media library, Users, and Settings on the acceptance stack
- **THEN** the accessibility audit of each screen reports no WCAG A or AA violation
