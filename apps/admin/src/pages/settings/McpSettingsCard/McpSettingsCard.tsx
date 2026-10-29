import type { AdminSettingsStatusDto } from "@lacecms/contracts";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Plug } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../../shared/ui/Badge/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { cardClass } from "../../../shared/ui/layout/index.js";
import { ChoiceCards } from "../../../shared/ui/ChoiceCards/index.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/Tabs/index.js";
import { mcpConnectionExamples, type McpAccess } from "./connection-examples.js";
import { Skeleton } from "../../../shared/ui/Skeleton/index.js";

function CopyText({ label, value }: { readonly label: string; readonly value: string }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <div className="grid min-w-0 gap-2">
      <code className="block min-w-0 rounded-md border border-border bg-muted p-3 font-mono text-xs whitespace-pre-wrap wrap-anywhere select-all">
        {value}
      </code>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopy("copied");
            } catch {
              setCopy("failed");
            }
          }}
        >
          {copy === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {label}
        </Button>
        <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {copy === "copied"
            ? "Copied to the clipboard."
            : copy === "failed"
              ? "Copy failed. Select the text and copy it manually."
              : ""}
        </span>
      </div>
    </div>
  );
}

/** Configuration comes from the shared Settings query, never from browser location. */
export function McpSettingsCard({
  mcp,
  loading,
}: {
  readonly mcp: AdminSettingsStatusDto["mcp"] | undefined;
  readonly loading: boolean;
}) {
  const [access, setAccess] = useState<McpAccess>("read");
  const examples = mcp ? mcpConnectionExamples(mcp.endpoint, access) : undefined;
  return (
    <section aria-labelledby="mcp-settings-title" className={`${cardClass} min-w-0 gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mcp-settings-title" className="m-0 flex items-center gap-2">
          <Plug aria-hidden="true" className="size-4" />
          MCP
        </h2>
        {mcp ? (
          <Badge variant={mcp.enabled ? "success" : "secondary"}>
            {mcp.enabled ? "Enabled" : "Disabled"}
          </Badge>
        ) : loading ? (
          <Skeleton className="h-5 w-16" />
        ) : (
          <Badge variant="secondary">Unavailable</Badge>
        )}
      </div>
      <p className="m-0 text-sm text-muted-foreground">
        Connect an assistant to read content and prepare drafts. This status reflects deployment
        configuration, not a client connectivity test.
      </p>
      {mcp ? (
        <>
          <div className="grid min-w-0 gap-2">
            <p className="m-0 text-sm font-medium">MCP endpoint</p>
            <CopyText key={mcp.endpoint} label="Copy endpoint" value={mcp.endpoint} />
          </div>
          {mcp.enabled && examples ? (
            <div className="grid min-w-0 gap-4">
              <ChoiceCards
                id="mcp-access"
                label="Assistant access"
                describedBy="mcp-access-help"
                invalid={false}
                onBlur={() => undefined}
                value={access}
                onChange={(value) => setAccess(value === "write" ? "write" : "read")}
                choices={[
                  {
                    value: "read",
                    label: "Read only",
                    description: "Inspect models and read content.",
                  },
                  {
                    value: "write",
                    label: "Read and edit drafts",
                    description: "Also create entries and save drafts.",
                  },
                ]}
              />
              <p id="mcp-access-help" className="m-0 text-sm text-muted-foreground">
                Sign in through the browser and explicitly approve access. Viewers cannot grant
                draft editing. Publishing, unpublishing, and deletion are always unavailable.
              </p>
              <Tabs defaultValue="cli" className="min-w-0">
                <TabsList
                  aria-label="Connection format"
                  className="max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto"
                >
                  <TabsTrigger className="h-8" value="cli">
                    Codex CLI
                  </TabsTrigger>
                  <TabsTrigger className="h-8" value="toml">
                    Codex TOML
                  </TabsTrigger>
                  <TabsTrigger className="h-8" value="claude">
                    Claude Code
                  </TabsTrigger>
                  <TabsTrigger className="h-8" value="gemini">
                    Gemini CLI
                  </TabsTrigger>
                  <TabsTrigger className="h-8" value="other">
                    Other clients
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="cli" className="grid min-w-0 gap-3">
                  <p className="m-0 text-sm text-muted-foreground">
                    Run these commands in a terminal on the computer running Codex. Keep the CMS
                    running.
                  </p>
                  <CopyText key={examples.cli} label="Copy Codex commands" value={examples.cli} />
                </TabsContent>
                <TabsContent value="toml" className="grid min-w-0 gap-3">
                  <p className="m-0 text-sm text-muted-foreground">
                    Add or update this entry in <code>~/.codex/config.toml</code>, then run the
                    OAuth login command below.
                  </p>
                  <CopyText
                    key={examples.toml}
                    label="Copy TOML configuration"
                    value={examples.toml}
                  />
                  <CopyText
                    key={examples.login}
                    label="Copy login command"
                    value={examples.login}
                  />
                </TabsContent>
                <TabsContent value="claude" className="grid min-w-0 gap-3">
                  <p className="m-0 text-sm text-muted-foreground">
                    Run this command in your terminal. It adds an HTTP server with the selected
                    permissions. <code>--scope user</code> stores the configuration for your user;
                    it does not grant extra Lace permissions.
                  </p>
                  <CopyText
                    key={examples.claudeCommand}
                    label="Copy Claude Code command"
                    value={examples.claudeCommand}
                  />
                  <p className="m-0 text-sm text-muted-foreground">
                    Inside Claude Code, run the command below, select <code>lace</code>, and
                    authenticate through the browser with your Lace account. If <code>lace</code>
                    already exists, update its configuration instead of adding it again. After
                    changing scopes, authenticate again to approve the new access.
                  </p>
                  <CopyText label="Copy Claude Code sign-in command" value="/mcp" />
                </TabsContent>
                <TabsContent value="gemini" className="grid min-w-0 gap-3">
                  <p className="m-0 text-sm text-muted-foreground">
                    Merge this entry into <code>~/.gemini/settings.json</code>. Update an existing
                    <code> lace</code> entry and keep your other settings. This uses Streamable HTTP
                    with OAuth discovery and dynamic client registration.
                  </p>
                  <CopyText
                    key={examples.geminiJson}
                    label="Copy Gemini CLI configuration"
                    value={examples.geminiJson}
                  />
                  <p className="m-0 text-sm text-muted-foreground">
                    Inside an interactive Gemini CLI session, run the command below and approve
                    browser sign-in with your Lace account. This is separate from signing in to the
                    CLI's model provider. After changing scopes, authenticate again.
                  </p>
                  <CopyText label="Copy Gemini CLI sign-in command" value="/mcp auth lace" />
                </TabsContent>
                <TabsContent value="other" className="grid gap-2 text-sm text-muted-foreground">
                  <p className="m-0">
                    Choose Streamable HTTP and use the MCP endpoint above. The client must support
                    OAuth authorization code with PKCE and dynamic client registration (DCR).
                  </p>
                  <p className="m-0">
                    Request{" "}
                    {access === "write" ? (
                      <code>content:read, content:write, offline_access</code>
                    ) : (
                      <code>content:read, offline_access</code>
                    )}
                    . Sign in and approve consent when prompted. Compatibility depends on the
                    client; these settings do not mean it has been verified.
                  </p>
                </TabsContent>
              </Tabs>
              <p className="m-0 text-sm text-muted-foreground">
                If a server named <code>lace</code> already exists, update its configuration instead
                of adding it again. Restart or reload your client to pick up the configuration.
                Selecting access here does not change an existing grant; draft editing requires new
                write consent.
              </p>
              <p className="m-0 text-sm text-muted-foreground">
                Review and revoke your assistant connections in{" "}
                <Link to="/account" className="text-primary underline underline-offset-4">
                  Account
                </Link>
                .
              </p>
            </div>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">
              To enable MCP, ask the operator to set <code>LACE_MCP_ENABLED=true</code> and restart
              or redeploy the API. For local Docker Compose, pass the flag into the API container
              and recreate that container after changing the environment.
            </p>
          )}
        </>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">
          {loading
            ? "Loading MCP configuration…"
            : "MCP configuration is unavailable. Retry the status request above."}
        </p>
      )}
    </section>
  );
}
