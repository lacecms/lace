## Why

Users currently offers **Invite user**. Without an email provider, Lace shows an invitation link for the administrator to share manually, and the account is created when the recipient accepts it. Administrators need a way to create the account immediately, even on an installation without email delivery.

## What Changes

- Add **Create user** alongside **Invite user** for signed-in users with `users:manage`. The form requires an email and a Lace role. Successful creation immediately adds an Active account to the Users list.
- Give the recipient a single-use link to set their first password. Send an access notification through the configured email provider, including SMTP where supported. When the provider is absent or the send fails, show the link once to the administrator for private handoff. The account stays Active in either case and can sign in after its owner sets a password.
- Reject an email already used by an account or an unexpired pending invitation. Keep at least one enabled administrator who has set a password when applying the final-administrator guard.
- Reintroduce `POST /api/v1/admin/users` with strict email and role input and a safe creation result. The previous password-bearing request shape is rejected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [`bootstrap-user-token-abuse-controls`](../../../specs/bootstrap-user-token-abuse-controls/spec.md) covers immediate account creation, first-password handoff and the final-administrator guard.
- [`application-ports-and-commands`](../../../specs/application-ports-and-commands/spec.md) extends the existing session authorization and persistence rules to direct creation.
- [`rest-contracts`](../../../specs/rest-contracts/spec.md) defines the closed creation request and response.
- [`hono-app-factory`](../../../specs/hono-app-factory/spec.md) adds the session-only creation route and its rate-limit policy.
- [`admin-users-and-settings`](../../../specs/admin-users-and-settings/spec.md) specifies the form, feedback and one-time link handoff.

## Impact

**Roadmap step and session unit** — AC1, Direct admin account creation, one owner-requested maintenance session outside EX1–EX7. The first apply task records AC1 in the [roadmap](../../../../docs/extensibility-roadmap.md) and reconciles [architecture §§12, 14 and 17](../../../../docs/architecture/README.md). Section 14 currently reserves direct creation for bootstrap. This proposal explicitly adds a second, session-authorized path and preserves the requirement that each user chooses their own password. The existing invitation and password-recovery capabilities are dependencies.

The work covers application account operations, Node/SQLite and Worker/D1 security adapters, shared REST contracts, the OpenAPI reference and the admin Users screen. It uses the current Better Auth credential schema and email providers. Public registration, administrator-set passwords, new email settings, and bulk creation are outside AC1.
