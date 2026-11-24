## Context

The account lifecycle change `9f85372a` removed the administrator-password
creation route and introduced invitation acceptance. The current
[Invite user dialog](../../../../apps/admin/src/features/invite-user/InviteUserDialog/InviteUserDialog.tsx)
handles a failed send by showing a private link. With provider `none`, its
response is still successful and reports `not_configured`. The invitation
remains pending until acceptance creates the account and its credential.

The existing reset handlers update a credential row and consume a reset
token atomically. The credential password column is nullable and Better Auth
already rejects sign-in for a credential without a password. This lets the
account exist in its enabled state before the recipient has a sign-in
password.

## Goals / Non-Goals

**Goals** — commit account provisioning and first-password issuance together,
make email delivery an independent outcome, and keep the same behavior on
Node/SQLite and Worker/D1.

**Non-goals** — a separate enrollment token type, new public pages or auth
providers, delivery retries or an email outbox.

## Decisions

1. **Reuse the existing password-reset lifecycle.** Insert a Better Auth
   credential row with the standard IDs and a null password. Use the
   normalized email as the initial display name and the usual
   `email_verified = false`. The existing reset screen lets the recipient
   pick their password and continue to sign-in. The reset confirmation
   uses Better Auth hashing and existing credential invalidation. An
   administrator-chosen password would give another person a reusable login
   secret. A dedicated setup-token lifecycle would duplicate reset issuance,
   expiry and confirmation.
2. **Authorize in the account use case and commit once.** Add a creation
   operation to the portable `AccountSecurityPort`. The application checks
   `requireSessionActor(actor, "users:manage")` before protected work and passes
   the actor ID and composed time. The adapters generate the reset secret
   and derive the verifier, then write the enabled user, credential row
   and initial reset row in one Node transaction or one guarded D1 batch.
   Reuse the expiry and token rules of the existing resets. The existing
   actor-profile trigger runs in the same write as the user insert.
   Persisted values contain the token digest. The port exposes the secret
   only in the successful issuance result.
3. **Use one write boundary for email ownership.** Use the same normalized
   email and active-invitation predicate as invitation issuance. On Node,
   evaluate the predicates inside the write transaction. On D1, guard the
   user insert and select dependent rows by the newly generated user ID in
   the same batch. Determine success using the created row and dependent
   writes because trigger work can affect the user insert change count.
   Existing invitation creation, resend and acceptance already guard
   against an existing user. Keep a pending invitation intact and let the
   administrator revoke it explicitly before choosing direct creation.
   Apply the email uniqueness constraint as the database backstop for
   concurrent creates. A conflict leaves credentials and delivery untouched.
4. **Count administrators who can sign in when protecting the last one.**
   Use the existing credential row to distinguish an enabled administrator
   who has set a password from one awaiting first access. When disabling or
   demoting an enabled administrator with a password, check for another
   enabled administrator with a password inside the same guarded write.
   Both conditions use the matching nonempty Better Auth credential for
   the user. The password-reset confirmation that establishes the password
   makes the new administrator eligible for that guard. The Users badge
   continues to reflect the account's enabled state.
5. **Send access mail after commit.** The application constructs the existing
   reset URL from the configured public base and renders an access-granted
   template using the shared email renderer. Send at most once per
   successful create, using the composed `EmailSender` and its bounded
   transport. Its closed outcome controls whether the administrator gets
   the one-time link. Provider `none` resolves as `not_configured` without
   outbound I/O. A delivery failure preserves the committed account and
   returns the manual handoff. Use the existing sanitized provider
   diagnostics.
6. **Keep the credential mode and client state explicit.** Define a session
   route for `POST /api/v1/admin/users` and reuse its neighboring invitation
   routes' `invite` rate-limit policy. The server maps the use-case result
   to the shared contract and OpenAPI. The admin client calls the new route
   through the Users feature. Reuse the role picker, dialog and undelivered-link
   controls, and keep the secret out of the query and mutation caches.
   Refresh the Users list and totals on success. Preserve the stable dialog
   instance through the refresh until the administrator completes the
   handoff.

## Risks / Trade-offs

- A response can be lost after commit. A repeated submission returns a
  conflict without emailing again. The administrator can retrieve the
  committed row in Users and issue a replacement link with **Send password
  reset**.
- The initial link inherits the reset lifetime of one hour. An expired,
  superseded or lost link is recoverable through the existing reset flow
  for an enabled account.

## Migration Plan

The existing schema already supports the nullable credential and reset
records, so deployments require no data migration. Deploy the API and admin
together. On rollback, created users and reset records remain readable by the
previous release. Users who have set a password retain sign-in access, and
users awaiting one can still use the existing reset flow. The older runtime
uses its original enabled-account check for final-administrator protection.
