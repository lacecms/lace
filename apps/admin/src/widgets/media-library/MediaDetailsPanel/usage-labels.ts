import type { MediaUsageEntryDto } from "@lacecms/contracts";
import { fieldLabel } from "../../../entities/content/index.js";

type Location = MediaUsageEntryDto["locations"][number];

/**
 * Describes where an entry uses media, e.g. "Hero block · Image field · Draft".
 * Block keys are internal identifiers and are never shown.
 */
export function usageLocationLabel(location: Location): string {
  const states = location.states.includes("draft")
    ? location.states.includes("published")
      ? "Draft and published"
      : "Draft"
    : "Published";
  if (location.source === "seo") return `SEO image · ${states}`;
  const field = `${fieldLabel(location.field, undefined)} field`;
  return location.source === "field"
    ? `${field} · ${states}`
    : `${fieldLabel(location.blockType, undefined)} block · ${field} · ${states}`;
}
