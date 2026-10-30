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

## Inspect configuration and connect Codex

Admin **Settings → MCP** always shows the server-confirmed Enabled/Disabled
configuration and canonical endpoint, including while MCP is disabled. Refresh
status reloads it; a failed refresh labels the last values as stale. Enabled
means the deployment enables MCP, not that an external client has connected.
The section offers endpoint copying, Codex CLI/TOML, Claude Code and Gemini CLI
examples, and generic Streamable HTTP/OAuth guidance. Read only is selected by default; draft editing
adds write scope. **Account** lists and revokes your own connections when enabled.

For the default local endpoint, run on the computer running Codex:

```sh
codex mcp add lace --url 'http://127.0.0.1:3000/mcp'
codex mcp login lace --oauth-client-registration dcr --scopes content:read,offline_access
```

To request draft editing, use:

```sh
codex mcp login lace --oauth-client-registration dcr --scopes content:read,content:write,offline_access
```

An alternative configuration in `~/.codex/config.toml` is:

```toml
[mcp_servers.lace]
url = "http://127.0.0.1:3000/mcp"
scopes = ["content:read", "offline_access"]
```

Then run the OAuth login command above. Use your Settings endpoint instead of
the example if your origin or port differs. If `lace` is already configured,
update that entry instead of adding a duplicate. Sign in through the browser,
approve consent, and restart/reload your client to pick up configuration.
Selecting different scopes in Settings grants nothing by itself; an existing
read-only grant needs new write consent. To replace a connection, revoke it in
Account and repeat OAuth login. Viewers cannot grant write access. Publishing,
unpublishing and deletion remain unavailable. This guidance does not establish
acceptance of any particular external client release.

### Claude Code

For read-only access, run in your terminal:

```sh
claude mcp add-json --scope user lace '{"type":"http","url":"http://127.0.0.1:3000/mcp","oauth":{"scopes":"content:read offline_access"}}'
```

`--scope user` selects user-level client configuration, not Lace permissions.
Inside Claude Code, run `/mcp`, select `lace`, and authenticate with your Lace
account in the browser. For draft editing, use
`"scopes":"content:read content:write offline_access"` in the server definition
and authenticate again for new write consent. If `lace` already exists, update
its configuration rather than running add-json again. Keep unrelated settings.
See [Claude Code's official MCP guide](https://code.claude.com/docs/en/mcp).

### Gemini CLI

Merge the following read-only entry into `~/.gemini/settings.json`, preserving
other settings and updating an existing `lace` entry instead of duplicating it:

```json
{
  "mcpServers": {
    "lace": {
      "httpUrl": "http://127.0.0.1:3000/mcp",
      "oauth": {
        "enabled": true,
        "scopes": ["content:read", "offline_access"]
      }
    }
  }
}
```

Inside an interactive Gemini CLI session, run `/mcp auth lace` and approve
browser sign-in with your Lace account. This is separate from signing in to the
CLI's model provider. For draft editing, add `"content:write"` to the scopes
array and authenticate again. Gemini uses an array of scopes; Claude Code uses
a space-separated string. Both use discovery and public-client registration;
no client secret or manual bearer token is needed. Replace the sample endpoint
with the canonical URL in Settings and restart/reload your client after changes.
These recipes follow the [official Gemini CLI MCP guide](https://geminicli.com/docs/tools/mcp-server/);
they do not describe the consumer Gemini web app or claim a verified client login.
Lace role limits, explicit consent and the draft-only tool boundary still apply.
