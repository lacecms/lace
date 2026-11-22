import type { ContractValidationIssue } from "@lacecms/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { adminQueryKeys, useAdminClient } from "../../shared/api/index.js";
import { Button } from "../../shared/ui/Button/index.js";

export function ReferenceCycleGuidance({
  cycle,
}: {
  readonly cycle: Extract<ContractValidationIssue, { details: unknown }>["details"];
}) {
  const client = useAdminClient();
  const first = cycle.publishFirst;
  const ids = [...new Set(first ? [...cycle.witness, first.entryId] : cycle.witness)].sort();
  const targets = useQuery({
    queryKey: [...adminQueryKeys.referenceStatuses, ids],
    queryFn: ({ signal }) => client.resolveReferenceTargets(ids, signal),
    retry: false,
  });
  const next =
    first && targets.data && Object.hasOwn(targets.data, first.entryId)
      ? targets.data[first.entryId]
      : undefined;
  const titles =
    targets.data &&
    cycle.witness.map((id) => {
      const entry = targets.data && Object.hasOwn(targets.data, id) ? targets.data[id] : undefined;
      return entry && "title" in entry ? entry.title : "Unavailable entry";
    });
  if (titles && cycle.truncated) titles.splice(-1, 0, "…");
  return (
    <div className="grid gap-1 wrap-anywhere">
      {first ? (
        <p className="m-0">
          Publish{" "}
          {next && "modelKey" in next ? (
            <Link
              className="font-medium underline underline-offset-2"
              to="/content/$modelKey/$entryId"
              params={{ modelKey: next.modelKey, entryId: first.entryId }}
            >
              {first.title}
            </Link>
          ) : (
            <strong>{first.title}</strong>
          )}{" "}
          first, then try publishing this entry again. Further corrections may be needed.
        </p>
      ) : (
        <p className="m-0">Replace or remove the highlighted selection to break the cycle.</p>
      )}
      {titles && (
        <p className="m-0 text-muted-foreground">
          Reference cycle {titles.join(" → ")}
          {cycle.truncated ? " (additional entries omitted)" : ""}
        </p>
      )}
      {targets.isError && (
        <Button
          className="justify-self-start"
          onClick={() => {
            void targets.refetch();
          }}
          size="sm"
          variant="outline"
        >
          Retry loading related entries
        </Button>
      )}
    </div>
  );
}
