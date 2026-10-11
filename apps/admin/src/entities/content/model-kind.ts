import type { ContentModelDto } from "@lacecms/contracts";

/** Pages and globals have exactly one configuration-defined entry. */
export function isSingletonModel(model: Pick<ContentModelDto, "kind">): boolean {
  return model.kind === "page" || model.kind === "global";
}
