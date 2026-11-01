import type { ImportTokenDto } from "@lacecms/contracts";
import { RevokeImportTokenDialog } from "../../../features/revoke-import-token/index.js";
import { formatAbsoluteTime, formatRelativeTime } from "../../../shared/lib/index.js";
import { Badge } from "../../../shared/ui/Badge/index.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/ui/Table/index.js";

function Timestamp({ iso, now }: { readonly iso: string; readonly now: number }) {
  return (
    <time dateTime={iso} title={formatAbsoluteTime(iso)}>
      {formatRelativeTime(iso, now)}
    </time>
  );
}

type ImportTokenState = "Active" | "Expired" | "Revoked";

function tokenState(token: ImportTokenDto, now: number): ImportTokenState {
  if (token.revokedAt !== undefined) return "Revoked";
  return Date.parse(token.expiresAt) <= now ? "Expired" : "Active";
}

/** Import-token metadata; plaintext values are never part of a listing. */
export function ImportTokenTable({
  now = Date.now(),
  tokens,
}: {
  readonly now?: number;
  readonly tokens: readonly ImportTokenDto[];
}) {
  return (
    <Table aria-label="Import tokens" scrollRegionLabel="Import token list">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Token</TableHead>
          <TableHead>Created by</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>Last used</TableHead>
          <TableHead>Access</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tokens.map((token) => {
          const state = tokenState(token, now);
          const publishes = (token.capabilities as readonly string[]).includes("content:publish");
          return (
            <TableRow
              className={state === "Active" ? undefined : "text-muted-foreground"}
              key={token.id}
            >
              <TableCell className="font-medium">{token.name}</TableCell>
              <TableCell>
                <code className="font-mono text-xs">{`${token.tokenPrefix}…`}</code>
              </TableCell>
              <TableCell>{token.createdBy.displayName ?? token.createdBy.email}</TableCell>
              <TableCell>
                <Timestamp iso={token.createdAt} now={now} />
              </TableCell>
              <TableCell>
                <Timestamp iso={token.expiresAt} now={now} />
              </TableCell>
              <TableCell>
                {token.lastUsedAt === undefined ? (
                  "Never"
                ) : (
                  <Timestamp iso={token.lastUsedAt} now={now} />
                )}
              </TableCell>
              <TableCell>{publishes ? "Drafts, media, publish" : "Drafts and media"}</TableCell>
              <TableCell>
                <Badge variant={state === "Active" ? "success" : "outline"}>{state}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end">
                  {state === "Active" ? <RevokeImportTokenDialog token={token} /> : undefined}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
