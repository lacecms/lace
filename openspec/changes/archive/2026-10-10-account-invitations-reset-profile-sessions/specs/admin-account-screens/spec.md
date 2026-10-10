## Purpose

Provides the admin screens people use outside and inside the shell to accept
an invitation, recover a password, and manage their own account, with the same
accessibility and secret-handling standards as the rest of the admin.

## ADDED Requirements

### Requirement: Public account screens read tokens only from the URL fragment
`/accept-invite`, `/forgot-password` and `/reset-password` SHALL be reachable
without a session as focused cards outside the shell, like sign-in. Accept and
reset screens SHALL read the token from the URL fragment, SHALL remove the
fragment from the address bar after reading it, and SHALL keep the token only
in component state; it SHALL never enter the query string, router state, query
cache or browser storage. A signed-in visitor opening these screens SHALL keep
the session; the accept and reset screens SHALL still operate on the token.

#### Scenario: Token stays out of storage
- **WHEN** a visitor opens an accept link and the screen loads
- **THEN** the address bar no longer contains the token and no browser storage
  entry contains it

### Requirement: Invitees accept from a dedicated screen
The accept screen SHALL show the invited email read-only and the role, collect
an optional display name and a password with the stated 12-character minimum
and a show/hide toggle, and on success SHALL sign the invitee in and open the
content home. An invalid, expired or revoked invitation SHALL show one
explanation that asks the inviter for a new invitation, without a form.

#### Scenario: Invitee completes acceptance
- **WHEN** an invitee submits a valid password on a valid invitation
- **THEN** they are signed in and see the content home with navigation for
  their role

#### Scenario: Expired invitation
- **WHEN** an invitee opens an expired link
- **THEN** the screen explains the invitation is no longer valid and shows no
  password form

### Requirement: Password recovery screens never reveal account existence
The sign-in card SHALL link to `/forgot-password`. The forgot screen SHALL
collect an email and, after any accepted submission, SHALL show the same
confirmation that a link was sent if an account exists. The reset screen SHALL
collect and confirm a new password and, on success, SHALL send the user to
sign-in with a notice that the password changed and other sessions were signed
out; an invalid link SHALL offer requesting a new one.

#### Scenario: Unknown address on the forgot screen
- **WHEN** a visitor submits an address without an account
- **THEN** the screen shows the same confirmation as for an existing account

#### Scenario: Reset succeeds
- **WHEN** a user submits matching valid passwords on a valid reset link
- **THEN** they reach sign-in with the password-changed notice

### Requirement: Every signed-in user has an account screen
The user menu SHALL offer Account for every authenticated session, opening
`/account` in the shell. The screen SHALL let the user change the display name,
change the password (current, new, confirm, and an option to sign out other
sessions, on by default), and review sessions as a list with browser and OS,
created and last-active relative times, a "This device" marker, a Sign out
action for each other session and a Sign out all other sessions action with
confirmation. Successful changes SHALL be announced; failures SHALL stay in
place with the error. Account access SHALL require no permission beyond
authentication.

#### Scenario: Viewer opens Account
- **WHEN** a viewer opens Account from the user menu
- **THEN** the account screen shows their profile, password form and sessions

#### Scenario: User ends another session
- **WHEN** a user confirms Sign out for another listed session
- **THEN** the session disappears from the list after confirmation and a
  notification announces it

### Requirement: Account screens pass the accessibility gate
The accept-invite, forgot-password, reset-password and account screens SHALL
pass the automated WCAG A and AA audits in light and dark themes, work with the
keyboard alone, fit a 375 px viewport without horizontal scrolling, and use the
shared loading, error and retry patterns.

#### Scenario: Account screen is audited
- **WHEN** the accessibility suite opens the account screen in the dark theme
- **THEN** it reports no WCAG A or AA violation
