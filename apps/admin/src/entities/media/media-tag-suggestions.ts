import { normalizeMediaTag, type MediaTagCatalogDto } from "@lacecms/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminQueryKeys, useAdminClient } from "../../shared/api/index.js";

/** Pause after typing before suggestions are requested. */
export const TAG_SUGGESTION_DEBOUNCE_MS = 200;
/** How many catalog tags one suggestion request reads. */
export const TAG_SUGGESTION_LIMIT = 10;

type Prefix = { readonly valid: false } | { readonly valid: true; readonly q: string | undefined };

/** Blank text lists from the start; text that is not a tag requests nothing. */
function prefixOf(text: string): Prefix {
  if (text.trim() === "") return { q: undefined, valid: true };
  const q = normalizeMediaTag(text);
  return q === undefined ? { valid: false } : { q, valid: true };
}

/**
 * Catalog tags matching the normalized prefix of `text`, requested only after
 * the user pauses typing and only while `enabled`. Results are shared per
 * prefix and refreshed by invalidating the tag-suggestion prefix key.
 */
export function useMediaTagSuggestions(text: string, enabled: boolean) {
  const client = useAdminClient();
  const [prefix, setPrefix] = useState<Prefix>(() => prefixOf(text));

  useEffect(() => {
    const next = prefixOf(text);
    const timer = setTimeout(() => setPrefix(next), TAG_SUGGESTION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const q = prefix.valid ? prefix.q : undefined;
  return useQuery<MediaTagCatalogDto>({
    enabled: enabled && prefix.valid,
    queryFn: () =>
      client.listMediaTags({ ...(q === undefined ? {} : { q }), limit: TAG_SUGGESTION_LIMIT }),
    queryKey: adminQueryKeys.mediaTags(q),
    retry: false,
    staleTime: 30_000,
  });
}
