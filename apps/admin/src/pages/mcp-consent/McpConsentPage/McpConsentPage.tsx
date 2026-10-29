import { getRouteApi } from "@tanstack/react-router";
import { McpConsentForm } from "../../../features/approve-mcp/index.js";
import { pageClass } from "../../../shared/ui/layout/index.js";
const route = getRouteApi("/_protected/mcp/consent");
export function McpConsentPage() {
  const { mcpTransaction } = route.useSearch();
  return (
    <section className={pageClass} aria-labelledby="mcp-consent-title">
      <div className="grid max-w-xl gap-5 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
        <h1 id="mcp-consent-title">Connect an assistant</h1>
        <McpConsentForm transaction={mcpTransaction} />
      </div>
    </section>
  );
}
