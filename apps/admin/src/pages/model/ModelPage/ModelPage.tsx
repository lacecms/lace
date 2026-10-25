import { useEffect } from "react";
import { NODE_LIST_QUERY_LIMITS } from "@lacecms/contracts";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { isSingletonModel, resolveCollectionListSearch } from "../../../entities/content/index.js";
import { useSessionRecovery } from "../../../entities/session/index.js";
import { adminQueryKeys, useAdminClient } from "../../../shared/api/index.js";
import { PageError, PageLoading, PagePlaceholder } from "../../../shared/ui/PageState/index.js";
import { CollectionEntries } from "../../../widgets/collection-entries/index.js";

const modelRoute = getRouteApi("/_protected/content/$modelKey");

export function ModelPage() {
  const { modelKey } = modelRoute.useParams();
  const search = modelRoute.useSearch();
  const navigate = modelRoute.useNavigate();
  const client = useAdminClient();
  const models = useQuery({ queryFn: client.listModels, queryKey: adminQueryKeys.models });
  useSessionRecovery(models.error);
  const selectedModel = models.data?.items.find((item) => item.key === modelKey);
  const limits = models.data?.listQueryLimits ?? NODE_LIST_QUERY_LIMITS;
  const resolved = selectedModel
    ? resolveCollectionListSearch(search, selectedModel, limits)
    : search;
  const searchIdentity = JSON.stringify([search.q, search.sort, search.status, search.filters]);
  const resolvedIdentity = JSON.stringify([
    resolved.q,
    resolved.sort,
    resolved.status,
    resolved.filters,
  ]);
  useEffect(() => {
    if (selectedModel && searchIdentity !== resolvedIdentity)
      void navigate({ replace: true, search: { ...resolved } });
  }, [navigate, selectedModel, searchIdentity, resolvedIdentity]);
  if (models.isPending) return <PageLoading label="Loading content model" />;
  if (models.error !== null) return <PageError error={models.error} />;
  const model = models.data.items.find((item) => item.key === modelKey);
  if (model === undefined)
    return (
      <PagePlaceholder description="This content model does not exist." title="Page not found" />
    );
  if (isSingletonModel(model))
    return (
      <PagePlaceholder
        description={`Open this ${model.kind === "global" ? "global" : "page"} from the content landing route.`}
        title={model.label ?? model.key}
      />
    );
  return (
    <CollectionEntries
      listQueryLimits={models.data.listQueryLimits}
      model={model}
      onQueryChange={(query) => navigate({ replace: true, search: query })}
      query={resolved}
    />
  );
}
