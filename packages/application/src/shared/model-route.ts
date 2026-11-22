import type { NormalizedContentModel } from "@lacecms/config";
import { contentModelKey, type ContentModelRoute } from "@lacecms/domain";

/** Maps a configured model to the route identity stored with its entries. */
export function contentModelRoute(model: NormalizedContentModel): ContentModelRoute {
  const key = contentModelKey(model.key);
  switch (model.kind) {
    case "page":
      return { key, kind: "page", path: model.path };
    case "collection":
      return model.route === undefined
        ? { key, kind: "collection" }
        : { key, kind: "collection", route: model.route };
    case "global":
      return { key, kind: "global" };
    default:
      return model satisfies never;
  }
}
