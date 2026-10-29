---
title: Users, roles and accounts
description: Manage access, invitations, passwords, sessions and build tokens.
---

Administrators manage Users, publication and Settings; editors author drafts and upload media; viewers inspect content without mutation. The server enforces permissions even if a user sends API requests directly. UI visibility is not the authorization boundary.

## Invite users

An administrator invites a user with an appropriate role. The recipient follows the expiring invitation link and chooses a password. Delivery depends on configured email; installations without a provider remain usable through the supported operator/link workflow. Reissue expired links through the intended UI rather than sharing passwords. Changing or removing a role affects subsequent authorized operations.

## Personal account

Use account screens for profile/password and session management. Password reset follows the supported reset link workflow when available. Keep reset/invitation links private: they contain credentials. Review active sessions and revoke those you no longer trust. Recovery of the first administrator is an operator procedure, not a reason to reopen the initial setup endpoint; successful initial setup consumes its token and closes that endpoint.

## Build tokens and email

Settings creates read-only build tokens for published export access. Copy the value once and keep it in server-side site/build configuration. A token cannot be revealed later; create a replacement and revoke the old one if lost. A build token is not an admin session or setup token.

Transactional email is optional. Node can use SMTP or Resend; Workers can use Resend or the configured Cloudflare Email Service binding. Choose a provider appropriate to the runtime, configure sender/secrets, then use Settings' delivery test and inspect diagnostics. Never place mail/API keys in public site variables.

## Assistant connections

When enabled by your operator, Account lists your own assistant connections.
Review the client, read or draft-write access and dates; confirm Revoke to stop
future access and token renewal. Every role can manage its own connections.
An assistant cannot publish, unpublish or delete content. Its writes replace the
complete draft and require the revision it read; after an uncertain result,
re-read content rather than automatically creating another entry or overwriting.

Access expires within fifteen minutes. Rotating refresh requires offline access
and expires within the original thirty-day grant. Replaying a consumed refresh
token requires reconnection. Account disable, password reset and revoke-others
invalidate connections; ordinary browser sign-out leaves them independent.
Changing roles affects future requests but promotion never widens your consent.

Settings → MCP provides canonical-endpoint copying and setup examples for Codex,
Claude Code and Gemini CLI. Read access is selected by default. Select draft
editing only when needed, update the existing client entry, complete browser
sign-in/consent again and restart the client after configuration changes.
Changing Settings examples does not widen an existing grant. Client-specific
recipes ship in the generated `docs/lace-mcp.md`; no client secret or manually
copied bearer token is needed.
