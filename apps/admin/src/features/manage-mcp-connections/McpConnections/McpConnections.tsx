import type { OAuthConnectionDto } from "@lacecms/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSessionRecovery } from "../../../entities/session/index.js";
import { adminQueryKeys, errorDescription, useAdminClient } from "../../../shared/api/index.js";
import { formatAbsoluteTime } from "../../../shared/lib/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/Dialog/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import { listClass } from "../../../shared/ui/layout/index.js";
import { toast } from "../../../shared/ui/Toaster/index.js";

/** Every role manages only the connections returned by its session-only account API. */
export function McpConnections() {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<OAuthConnectionDto | null>(null);
  const capabilities = useQuery({
    queryKey: adminQueryKeys.accountCapabilities,
    queryFn: client.loadAccountCapabilities,
  });
  const connections = useInfiniteQuery({
    queryKey: adminQueryKeys.mcpConnections,
    queryFn: ({ pageParam }) => client.listMcpConnections(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: capabilities.data?.mcpEnabled === true,
  });
  useSessionRecovery(capabilities.error ?? connections.error);
  const revoke = useMutation({
    mutationFn: (id: string) => client.revokeMcpConnection(id),
    onSuccess: async () => {
      setSelected(null);
      toast.success("Connection revoked.");
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.mcpConnections });
    },
  });
  if (capabilities.isPending || capabilities.data?.mcpEnabled === false) return null;
  if (capabilities.error)
    return (
      <ErrorState
        title="Could not check assistant connections"
        description={errorDescription(capabilities.error)}
        onRetry={() => void capabilities.refetch()}
      />
    );
  const items = connections.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section
      aria-labelledby="mcp-connections-title"
      className="grid gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xs md:p-6"
    >
      <div className="grid gap-1">
        <h2 id="mcp-connections-title" className="m-0">
          Assistant connections
        </h2>
        <p className="m-0 text-sm text-muted-foreground">
          Assistants connected to your account. Revoking access also stops token renewal.
        </p>
      </div>
      {connections.isPending ? (
        <LoadingState label="Loading assistant connections" lines={2} />
      ) : connections.error ? (
        <ErrorState
          title="Could not load connections"
          description={errorDescription(connections.error)}
          onRetry={() => void connections.refetch()}
        />
      ) : (
        <>
          {items.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">No assistant connections.</p>
          ) : (
            <ul className={listClass} aria-label="Assistant connections">
              {items.map((item) => {
                const inactive =
                  item.revokedAt !== null || Date.parse(item.expiresAt) <= Date.now();
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="grid min-w-0 gap-1">
                      <p className="m-0 break-words font-medium">{item.clientName}</p>
                      <p className="m-0 text-sm text-muted-foreground">
                        {item.scopes.includes("content:write")
                          ? "Read and edit drafts"
                          : "Read content"}
                        {inactive ? ` · ${item.revokedAt ? "Revoked" : "Expired"}` : ""}
                      </p>
                      <p className="m-0 text-xs text-muted-foreground">
                        Connected{" "}
                        <time dateTime={item.createdAt}>{formatAbsoluteTime(item.createdAt)}</time>{" "}
                        · Expires{" "}
                        <time dateTime={item.expiresAt}>{formatAbsoluteTime(item.expiresAt)}</time>
                        {item.lastUsedAt ? (
                          <>
                            {" "}
                            · Last used{" "}
                            <time dateTime={item.lastUsedAt}>
                              {formatAbsoluteTime(item.lastUsedAt)}
                            </time>
                          </>
                        ) : null}
                      </p>
                    </div>
                    {!inactive ? (
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Revoke ${item.clientName}`}
                        onClick={() => {
                          revoke.reset();
                          setSelected(item);
                        }}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {connections.hasNextPage ? (
            <div>
              <Button
                variant="outline"
                disabled={connections.isFetchingNextPage}
                onClick={() => void connections.fetchNextPage()}
              >
                {connections.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke assistant access?</DialogTitle>
            <DialogDescription>
              {selected?.clientName} will lose access and must reconnect with your approval. Your
              browser session and other connections stay active.
            </DialogDescription>
          </DialogHeader>
          {revoke.error ? (
            <ErrorState
              title="Connection not revoked"
              description={errorDescription(revoke.error)}
            />
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => {
                if (selected) revoke.mutate(selected.id);
              }}
            >
              {revoke.isPending ? "Revoking…" : "Revoke access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
