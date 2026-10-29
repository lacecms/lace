# Optional content assistant

MCP is disabled by default. Apply the release's checked-in database migrations,
then set `LACE_MCP_ENABLED=true` in the Node API environment or Worker vars and
restart/redeploy. Local Worker development uses `worker/.dev.vars`. No new
Cloudflare binding is needed. Other values except `false` are rejected.

Use the canonical API origin configured by `LACE_PUBLIC_BASE_URL`, with HTTPS
in production. Connect a Streamable HTTP OAuth client to `/mcp`. Discovery is
available at `/.well-known/oauth-protected-resource/mcp` and
`/.well-known/oauth-authorization-server/api/auth`. Public clients register at
`/api/auth/oauth2/register` and use authorization code with S256 PKCE.

Sign in with the existing Lace account and explicitly approve read access or
read plus draft writes. Only model discovery, list, get, create and save draft
are available. Publishing, unpublishing, deletion and media administration are
unavailable, including for administrators. The current role still applies.

Manage your own connections under Account. Access tokens expire within fifteen
minutes. Refresh requires `offline_access`, rotates on use and expires within
thirty days of the grant. Replaying a consumed refresh token revokes its family;
reconnect after a lost refresh response. Account disable, password reset,
sign-out-everywhere and revoke-others invalidate delegated authority. Ordinary
browser sign-out leaves independent connections intact.

After an uncertain create/save result, re-read content. Do not automatically
create another entry or overwrite a draft using a newly loaded revision.

Set `LACE_MCP_ENABLED=false` to disable discovery, issuance, refresh and MCP use.
Keep the additive migrations and stored connection records. Re-enabling does
not reactivate revoked authority. Local test evidence is separate from acceptance
of your actual Node/Cloudflare deployment.
