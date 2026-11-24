## 1. Architecture and account persistence

- [x] 1.1 Record AC1 in the extensibility roadmap and update architecture §§12, 14 and 17 for direct creation, session requirements, the first-password handoff and the last-administrator guard. Review the updated invariants against the proposed deltas before editing code.
- [x] 1.2 Add the authorized creation command and implement the atomic write on Node/SQLite and Worker/D1. Run the shared security contract cases for normalized addresses, existing enabled and disabled users, pending and expired invitations, concurrent creation and invitation operations, and rollback of a failed dependent write.
- [x] 1.3 Reuse reset confirmation for a credential awaiting its first password and update the guarded administrator mutations on both runtimes. Verify first sign-in, one-time confirmation, expiry, supersession, and simultaneous disable or demotion with an administrator still awaiting a password.

## 2. Delivery and REST

- [x] 2.1 Render the access notification and send it after commit through `EmailSender`. Exercise accepted delivery, provider `none`, provider failure, link secrecy and a retry after a committed create in the account use-case tests. Check that role or actor denial performs no protected read, write or send.
- [x] 2.2 Add strict shared DTOs and the session-only `POST /api/v1/admin/users` policy and handler. Update OpenAPI and verify `201`, `no-store`, `422` for missing email, invalid role and legacy password input, address conflicts, credential and origin denial, and the shared `429` budget. Run `pnpm openapi:check`.

## 3. Admin and documentation

- [x] 3.1 Add **Create user** to the permission-gated Users screen, wire the admin client, update the final-administrator message, and reuse the existing role picker and link handoff. Check dialog accessibility, pending submission, form errors, session recovery, post-success refresh, and link removal on close with focused admin tests.
- [x] 3.2 Verify an end-to-end browser journey with delivery disabled and with an accepting test provider. Create an account, see it listed as Active, confirm the first password and sign in with the selected role. Re-run the existing invitation and manual link handoff flows.
- [x] 3.3 Update the public Accounts guide, API reference and generated operations guide. Verify that they distinguish direct creation from invitation acceptance and explain the manual handoff, one-hour expiry and replacement reset, then run `pnpm docs:check`.

## 4. Completion checks

- [x] 4.1 Run the focused account, API and admin tests, then root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate add-admin-user-creation --type change --strict`.
