import { getRouteApi, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { canonicalTagFilter } from "../../../entities/media/index.js";
import { MediaLibrary } from "../../../widgets/media-library/index.js";

const mediaRoute = getRouteApi("/_protected/media");

export function MediaPage() {
  const search = mediaRoute.useSearch();
  const navigate = mediaRoute.useNavigate();
  const rawTag = useLocation({ select: (location) => (location.search as { tag?: unknown }).tag });
  const raw = JSON.stringify(rawTag);
  const canonical = JSON.stringify(canonicalTagFilter(rawTag));

  // Rewrite a tag filter that was normalized, trimmed, or dropped while parsing
  // so the address shows the filter actually applied. Compares the address with
  // itself because the validated search can lag behind a navigation.
  useEffect(() => {
    if (raw === undefined || raw === canonical) return;
    void navigate({
      replace: true,
      search: (previous) => ({ ...previous, tag: canonicalTagFilter(JSON.parse(raw)) }),
    });
  }, [canonical, navigate, raw]);

  return (
    <MediaLibrary
      onQueryChange={(query) => navigate({ replace: true, search: query })}
      query={search}
    />
  );
}
