import { seoText } from "@lacecms/contracts";
import type { AdminContentEntryDto, ContentModelDto } from "@lacecms/contracts";
import { useQuery } from "@tanstack/react-query";
import { adminQueryKeys, useAdminClient } from "../../shared/api/index.js";
import type { SeoSiteDefaults } from "./seo-preview.js";

/**
 * The site SEO defaults mapped from the published snapshot of the defaults
 * global, which is what the next site build reads. A draft-only entry has none.
 */
export function seoSiteDefaults(
  model: ContentModelDto,
  entry: AdminContentEntryDto | undefined,
): SeoSiteDefaults | undefined {
  const mapping = model.seoDefaults;
  const fields = entry?.published?.fields;
  if (mapping === undefined || fields === undefined) return undefined;
  const text = (key: string | null) => (key === null ? undefined : seoText(fields[key]));
  const image = mapping.image === null ? undefined : fields[mapping.image];
  const values = {
    description: text(mapping.description),
    image: typeof image === "string" && image !== "" ? image : undefined,
    siteName: text(mapping.siteName),
    titleTemplate: text(mapping.titleTemplate),
  };
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as SeoSiteDefaults;
}

/**
 * Reads the site SEO defaults for the editor's placeholders and preview. A
 * missing, unsynchronized, unpublished or unreadable defaults global yields no
 * defaults; `error` is returned so the page can recover a lost session.
 */
export function useSeoDefaults(models: readonly ContentModelDto[] | undefined): {
  readonly defaults: SeoSiteDefaults | undefined;
  readonly error: Error | null;
} {
  const client = useAdminClient();
  const model = models?.find((item) => item.seoDefaults !== undefined);
  const key = model?.key;
  const overview = useQuery({
    enabled: key !== undefined,
    queryFn: () => client.listEntries(key ?? "", undefined, { limit: 1 }),
    queryKey: adminQueryKeys.entryOverview(key ?? ""),
    staleTime: 30_000,
  });
  const entryId = overview.data?.items[0]?.id;
  const entry = useQuery({
    enabled: entryId !== undefined,
    queryFn: () => client.loadEntry(entryId ?? ""),
    queryKey: adminQueryKeys.entry(entryId ?? ""),
  });
  return {
    defaults: model === undefined ? undefined : seoSiteDefaults(model, entry.data),
    error: overview.error ?? entry.error,
  };
}
