---
title: Users, roles and accounts
description: Invite users, recover passwords, manage your account and sessions, and create build and import tokens.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

Lace has three roles. Administrators manage users, publication and Settings;
editors write drafts and upload media; viewers inspect content without changing
it. This guide covers inviting people, password recovery, your own account and
sessions, and the tokens that let a site build or an import script read or
write content.

## Before you start

- A completed first-administrator setup. The first administrator is created
  once per installation with a setup token from `lace auth bootstrap`
  ([Getting started](../../getting-started/)); after setup the endpoint closes
  for good. Recovering the last administrator is an operator task
  ([Operations](../../operations/)).
- Optional: configured email delivery. Without it, invitation and reset links
  are shown once in Admin for you to hand over.

The server enforces every permission, also for direct API requests; hiding a
control in Admin is not the security boundary.

| Role          | Can                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Administrator | Everything: publish and unpublish, manage users, invitations, Settings and tokens                             |
| Editor        | Read content, create and save drafts, duplicate, revert and delete unpublished entries, upload and edit media |
| Viewer        | Read content and media                                                                                        |

## Invite a user

1. Open **Users** and choose **Invite user**. Enter the email address and role.
2. With email configured, Lace sends the invitation. Otherwise, or when
   delivery fails, the dialog shows the link once with **Copy link**: send it
   through a private channel.
3. The invitee opens the link, chooses a password of 12 to 1,024 characters
   and signs in.

Nothing is created until the invitation is accepted. A link is single-use and
valid for 72 hours. An address that already has an account, or a pending
invitation, cannot be invited again. Pending invitations are listed without
their links: **Resend** issues a new link and restarts the expiry, and
**Revoke invitation** cancels it. An unknown, expired, revoked or used link
shows one generic error.

## Manage users

Administrators change a user's role, disable or enable an account, send a
password reset and **Sign out everywhere** from the Users list. A role change
applies to the user's next request. Disabling an account ends all its
sessions; enabling it again requires a fresh sign-in. Lace refuses to disable
or demote the last active administrator. An administrator never sets another
person's password.

## Recover a password

Choose **Forgot password?** on the sign-in screen and enter your email
address. The response is the same whether or not the address has an account.
An enabled account receives a link that is valid for one hour; requesting a
new link invalidates older ones. Setting a new password signs out every
session of the account.

Administrators can also send a reset from the Users list. Without email
delivery the link is shown once, as for invitations.

Invitation and reset links contain credentials: keep them private. Admin
removes the token from the address bar as soon as it reads it.

## Manage your account

Open **Account** from the account menu:

- **Display name**: 1 to 120 characters, shown as the last editor of drafts.
- **Change password**: requires the current password and can also sign out
  your other sessions. With email configured you receive a notice.
- **Sessions**: lists your sessions with browser, operating system, creation
  and last-active times, marking the current one. Sign out a session you no
  longer trust, or **Sign out other sessions**. End the current session by
  signing out.

## Create build tokens

A site build reads the published export with a read-only build token. In
**Settings**, create a named build token and copy its value immediately: it is
shown once and cannot be revealed later. Keep it in server-side site or build
configuration, never in public site variables. If it is lost or leaked, create
a replacement and revoke the old one. A build token reads published content
only: it is not an Admin session, an import token or a setup token.

## Create import tokens

[`lace import`](../import/) writes drafts with a short-lived import token. In
**Settings → Import tokens**, create one with a name and a lifetime of 1, 3 or
7 days. Administrators can also choose **Allow publishing**. Copy the value
when it is shown: it is shown once.

The list shows each token's creator, expiry, last use and whether it may
publish; revoke active tokens there. An import token acts as its creator with
the creator's current role, limited to reading content, writing drafts and
uploading media, plus publishing when allowed. It can never delete or
unpublish content, and it does not work for MCP or the build export.

Disabling the creator, resetting their password, **Sign out everywhere** and a
password change that signs out other sessions revoke the creator's import
tokens; enabling the account again does not restore them. If a token leaks,
revoke it and review the creator's recent drafts and media.

## Configure email delivery

Email is optional. Node installations can use SMTP or Resend; Cloudflare
Workers can use Resend or the Cloudflare Email Service binding. Configure the
sender and secrets in the server environment, then use the delivery test in
**Settings** and read its diagnostics. Never place mail credentials in public
site variables.

## Respect request limits

Sign-in, invitation acceptance, password reset and password changes are
limited to 10 attempts per 15 minutes per client or user. Reset requests are
also limited to 3 per hour per email address. Creating or revoking build and
import tokens, and sending invitations or administrator resets, are each
limited to 20 per hour per administrator; uploads are limited to 30 per minute
per user. A limited
request answers `429` with a `Retry-After` time; wait that long before trying
again.

## Manage assistant connections

When your operator enables MCP, **Account** lists the assistant clients you
connected, with their access (read, draft editing, publishing) and dates.
Choose **Revoke access** to stop a client. Every role manages its own
connections. An assistant can publish only with the separately granted
publishing permission and a role that may publish; it can never unpublish or
delete content. Disabling your account, a password reset and signing out other
sessions also end your connections; an ordinary sign-out does not. Setup for
each client is described in [MCP](../../operations/mcp/).

## Reference

- [CLI and environment](../../reference/cli-environment/):
  `lace auth bootstrap` and the email delivery settings.
- [API reference](../../reference/api/): setup, invitation, password reset,
  account, user and token endpoints with their permissions.
- [MCP reference](../../reference/mcp/): scopes and tools.
