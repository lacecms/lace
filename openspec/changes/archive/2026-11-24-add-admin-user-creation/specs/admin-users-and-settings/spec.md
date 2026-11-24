## ADDED Requirements

### Requirement: Administrators create an active account from Users
The Users screen SHALL show **Create user** alongside **Invite user** for
sessions with the server-derived `users:manage` permission, irrespective of
email configuration. Its dialog SHALL collect a valid required email and a
Lace role using the existing role descriptions, default to Viewer, and explain
that creation enables the account immediately and the recipient sets their own
password. The dialog SHALL prevent duplicate submission while the request is
pending. Cancelling before submission SHALL send no request and restore focus
to **Create user**.

Only a confirmed API success SHALL refresh the Users list and totals from
the server and announce the newly created active account. When delivery is
`sent`, the dialog SHALL close and report that the access email was sent.
When delivery fails, the dialog SHALL confirm that the account was created,
explain the delivery outcome, and offer **Copy link** and **Done** for the
first-password link. It SHALL explain that the link is single-use and expires
in one hour. The link SHALL exist only in transient dialog state, including
while the list refreshes. The dialog SHALL clear it on close, and the user row
SHALL offer a fresh link through **Send password reset**. An API error SHALL
keep the form open, preserve the entered values and show the error inline.

#### Scenario: Administrator creates a user without SMTP or another email provider
- **WHEN** an administrator submits a valid email and role with provider `none`
- **THEN** the Users list reflects the new Active account and the dialog shows a copyable first-password link, with no link shown after closing or reopening it

#### Scenario: Administrator creates a user with email delivery
- **WHEN** creation succeeds and the configured provider accepts the access email
- **THEN** the dialog closes, confirmation distinguishes account creation and email sending, and the Users list refreshes

#### Scenario: The address conflicts
- **WHEN** the API refuses creation because the address belongs to an account or a pending invitation
- **THEN** the dialog retains the email and role, explains the conflict and adds no row

#### Scenario: An editor or viewer opens Users
- **WHEN** a session lacks `users:manage`
- **THEN** the screen exposes neither creation nor invitation controls

## MODIFIED Requirements

### Requirement: Administrator manages users and invitations in the browser
The Users screen SHALL list users with email, role, and active or disabled
status, and SHALL mark the signed-in administrator's own row as "You". Role and
status SHALL be shown as labelled badges using the shared role vocabulary
(Admin, Editor, Viewer); raw user IDs SHALL never be shown. The screen SHALL
summarize how many accounts exist and how many are disabled.

An administrator SHALL add people from an Invite user dialog that collects
email and role; the role picker SHALL describe what each role can do. No admin
screen SHALL collect a password for another person. After the API confirms the
invitation, the dialog SHALL either announce that the invitation email was sent
or, when delivery was not `sent`, explain the closed reason and show the accept
link once with Copy, copy feedback and Done, stating that it cannot be shown
again; that link SHALL exist only in the dialog's transient state. A Pending
invitations list SHALL show each invitation's email, role, inviter, relative
expiry and state (Pending or Expired) with Resend and Revoke actions, the
latter behind a confirmation; Resend SHALL follow the same sent-or-link rules.

Each active row SHALL offer Change role, which opens a dialog preselecting the
confirmed role and submitting only a different role; Disable, which opens a
confirmation dialog stating that the user's sessions end; Send password reset,
which follows the sent-or-link rules; and Sign out everywhere, behind a
confirmation. Each disabled row SHALL offer Enable, which opens a confirmation
dialog, and SHALL offer no role change, reset or sign-out. The signed-in
administrator's own row SHALL offer no Disable, Send password reset or Sign out
everywhere action, and changing the administrator's own role away from Admin
SHALL warn in the dialog that they will lose access to Users and Settings.

A mutation SHALL appear successful only after API confirmation: the dialog
closes, a notification names the affected account and change, and the lists
refresh from remote state. A failed mutation SHALL keep its dialog open, show
the error inside it, and leave the listed role, status and invitations at their
last confirmed values; a final-administrator rejection SHALL be explained as
"At least one active administrator with a password must remain." Cancelling a
dialog SHALL issue no request and return focus to the control that opened it.

#### Scenario: Administrator invites a user with email delivery
- **WHEN** an administrator submits Invite user with a valid email and role and
  the provider accepts the email
- **THEN** the dialog closes, a notification says the invitation was sent, and
  the pending invitation is listed

#### Scenario: Administrator invites a user without email
- **WHEN** an administrator invites a user while email is not configured
- **THEN** the dialog shows the accept link once with Copy and explains that
  email is not configured, and the link is absent after Done

#### Scenario: Invitation conflicts
- **WHEN** the API rejects an invitation because the address already has an
  account or an active invitation
- **THEN** the dialog stays open with the entered email and role and shows the
  conflict

#### Scenario: Administrator changes a role
- **WHEN** an administrator opens Change role for an active user, picks a different role, and saves
- **THEN** the screen sends only the role change and shows the new role badge after confirmation

#### Scenario: Final administrator change is rejected
- **WHEN** the API rejects a role change or disable action that would remove the last active administrator with a password
- **THEN** the dialog shows the final-administrator explanation and the row retains its previously confirmed role and active status

#### Scenario: Administrator disables and re-enables a user
- **WHEN** an administrator confirms Disable for another active user and later confirms Enable for that user
- **THEN** the screen sends `disabled: true` and then `disabled: false`, and the row shows Disabled and then Active after each confirmation

#### Scenario: Administrator sends a password reset
- **WHEN** an administrator confirms Send password reset for another active user
  and the provider accepts the email
- **THEN** a notification says the reset email was sent and no link is shown

#### Scenario: Administrator signs a user out everywhere
- **WHEN** an administrator confirms Sign out everywhere for another user
- **THEN** a notification names the user and the number of ended sessions

#### Scenario: Administrator views their own row
- **WHEN** the signed-in administrator's account is listed
- **THEN** the row is marked "You", offers Change role, and offers no Disable, Send password reset or Sign out everywhere action

#### Scenario: Administrator demotes themselves
- **WHEN** the signed-in administrator picks a non-admin role for their own account in Change role
- **THEN** the dialog warns that they will lose access to Users and Settings before they save

#### Scenario: A dialog is cancelled
- **WHEN** an administrator cancels an Invite user, Change role, Disable, Enable, Revoke, Send password reset or Sign out everywhere dialog
- **THEN** no request is sent and focus returns to the control that opened the dialog

#### Scenario: Users cannot be loaded
- **WHEN** the user-list request fails for a reason other than an expired session
- **THEN** the screen shows the error with a Try again action that repeats the request

#### Scenario: Editor opens Users directly
- **WHEN** an editor opens `/users`
- **THEN** the screen shows access denied and issues no user-list or invitation-list request
