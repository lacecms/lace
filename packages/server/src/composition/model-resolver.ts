import { contentModelRoute } from "@lacecms/application";

type RuntimeContentModel = Parameters<typeof contentModelRoute>[0];
type ContentModelRoute = ReturnType<typeof contentModelRoute>;

/** The normalized runtime models a composition root configures. */
export interface RuntimeContentConfig {
  readonly runtime: { readonly content: readonly RuntimeContentModel[] };
}

/** Resolves a model key to its route from the runtime configuration both repositories receive. */
export function contentModelResolver(
  config: RuntimeContentConfig,
): (key: string) => ContentModelRoute | undefined {
  return (key) => {
    const model = config.runtime.content.find((candidate) => candidate.key === key);
    return model === undefined ? undefined : contentModelRoute(model);
  };
}
