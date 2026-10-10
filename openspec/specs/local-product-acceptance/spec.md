# local-product-acceptance Specification

## Purpose

Defines the repeatable local product acceptance proof for Lace's complete browser-admin editorial workflow before deployment and build-dispatch work begins.

## Requirements

### Requirement: A fresh local editorial walkthrough is repeatable
The project SHALL document a repeatable local acceptance walkthrough that starts from an isolated migrated Node/SQLite/MinIO stack, synchronizes the code-owned models, and uses Admin to edit and publish a page and create and publish a collection entry. It SHALL include a media upload and reuse in content, issuance of the read-only build token through Settings, and a site refresh that displays the published page and collection URL in Astro. It SHALL state prerequisites, commands, expected browser and public-output observations, and how to clean up only acceptance-owned data. Completion SHALL require no fixture edit, direct content API call, or browser-console API call.

#### Scenario: Fresh administrator completes the walkthrough
- **WHEN** a contributor follows the documented steps from an isolated, migrated local stack with the configured Astro routes
- **THEN** the administrator can synchronize models, complete editing, media reuse, publication, and token issuance in Admin, and observe both published routes on the local site

#### Scenario: Acceptance rerun preserves ordinary development data
- **WHEN** the contributor runs the walkthrough or its automated checks again
- **THEN** acceptance-owned state is isolated or uniquely identified, and existing ordinary local content and object data are not reset or removed

### Requirement: Acceptance verifies public and private state boundaries
The acceptance proof SHALL verify that saving a later draft, including a changed collection slug, does not alter the published API export or Astro output until another successful publication and the documented site refresh. It SHALL create the editor and viewer accounts by inviting them in Users and accepting each invitation from the link in the email captured by the local mail service, and SHALL verify that an editor can save drafts but cannot publish or manage users and tokens, and that a viewer cannot mutate content or media. Browser affordances and corresponding API authorization SHALL both be checked.

#### Scenario: Draft changes after publication
- **WHEN** an administrator changes and saves a published entry's draft without republishing it
- **THEN** the public export and refreshed Astro route retain the previous published content and path

#### Scenario: Restricted roles attempt privileged actions
- **WHEN** editor and viewer sessions use Admin and independently attempt disallowed API operations
- **THEN** protected actions are absent or denied in the UI and the API rejects the unauthorized mutations

#### Scenario: Invited accounts join through email
- **WHEN** the administrator invites the editor and viewer during acceptance
- **THEN** each invitation email arrives in the local mail capture and its link
  lets the invitee set a password and sign in with the invited role

### Requirement: Acceptance covers recovery and route usability
The acceptance proof SHALL cover a stale-revision conflict that preserves local authoring and offers explicit recovery; narrow-viewport navigation without horizontal page scrolling; keyboard operation and visible focus for the main editorial controls; and loading, empty, and error states on Content, Media, Users, and Settings. Builds SHALL display its explicit operational state, without claiming history or retry support, until Step 21 connects it to persisted builds. The walkthrough SHALL run on the redesigned admin and SHALL run automated WCAG A and AA accessibility checks on the content home, a collection list, the entry editor, the media library, Users, and Settings with the acceptance stack's real data; any violation SHALL fail the walkthrough.

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
