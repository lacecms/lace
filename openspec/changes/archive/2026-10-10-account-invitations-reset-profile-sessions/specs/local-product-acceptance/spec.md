## MODIFIED Requirements

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
