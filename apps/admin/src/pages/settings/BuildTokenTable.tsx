import type { BuildTokenDto } from "@lacecms/contracts";
import { RevokeTokenDialog } from "../../features/revoke-token/index.js";
import { formatAbsoluteTime, formatRelativeTime } from "../../shared/lib/index.js";
import { Badge } from "../../shared/ui/Badge/index.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/Table/index.js";

function Timestamp({ iso, now }: { readonly iso: string; readonly now: number }) {
  return (
    <time dateTime={iso} title={formatAbsoluteTime(iso)}>
      {formatRelativeTime(iso, now)}
    </time>
  );
}

/** Build-token metadata; plaintext values are never part of a listing. */
export function BuildTokenTable({
  now = Date.now(),
  tokens,
}: {
  readonly now?: number;
  readonly tokens: readonly BuildTokenDto[];
}) {
  return (
    <Table aria-label="Build tokens">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Token</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Last used</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tokens.map((token) => {
          const revoked = token.revokedAt !== undefined;
          return (
            <TableRow className={revoked ? "text-muted-foreground" : undefined} key={token.id}>
              <TableCell className="font-medium">{token.name}</TableCell>
              <TableCell>
                <code className="font-mono text-xs">{`${token.tokenPrefix}…`}</code>
              </TableCell>
              <TableCell>
                <Timestamp iso={token.createdAt} now={now} />
              </TableCell>
              <TableCell>
                {token.lastUsedAt === undefined ? (
                  "Never"
                ) : (
                  <Timestamp iso={token.lastUsedAt} now={now} />
                )}
              </TableCell>
              <TableCell>
                <Badge variant={revoked ? "outline" : "success"}>
                  {revoked ? "Revoked" : "Active"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end">
                  {revoked ? undefined : <RevokeTokenDialog kind="build" token={token} />}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
