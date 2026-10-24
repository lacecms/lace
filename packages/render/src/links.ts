import { decodeEntryLink, isSafeUrl } from "@lacecms/content";
import { LaceRenderError } from "./errors.js";
import type { BlockContext } from "./errors.js";

/** Structural contract shared with the published-site lookup; no SDK dependency. */
export type LinkResolution =
  | { readonly state: "resolved"; readonly href: string; readonly targetId?: string }
  | { readonly state: "unavailable"; readonly targetId: string }
  | { readonly state: "empty" };
export type LinkResolver = (value: unknown) => LinkResolution;

/** Defends both authored targets and a custom resolver's result before href output. */
export function createLinkResolver(
  resolve: LinkResolver | undefined,
  context: BlockContext,
): LinkResolver {
  return (value) => {
    const targetId = decodeEntryLink(value);
    const empty = value === undefined || value === null || value === "";
    if (!empty && targetId === undefined && !isSafeUrl(value))
      throw new LaceRenderError("invalid_link", "the URL field target is invalid.", { context });
    if (targetId !== undefined && resolve === undefined)
      throw new LaceRenderError(
        "missing_link_resolver",
        "an internal URL requires a published-site link resolver.",
        { context },
      );
    let result: LinkResolution;
    try {
      result =
        resolve === undefined
          ? empty
            ? { state: "empty" }
            : { state: "resolved", href: value as string }
          : resolve(value);
    } catch (cause) {
      throw new LaceRenderError("invalid_link", "the link resolver failed.", { cause, context });
    }
    if (
      result === null ||
      typeof result !== "object" ||
      (result.state === "resolved"
        ? !isSafeUrl(result.href) ||
          (targetId !== undefined && result.targetId !== undefined && result.targetId !== targetId)
        : result.state === "unavailable"
          ? targetId === undefined || result.targetId !== targetId
          : result.state !== "empty" || !empty) ||
      (empty && result.state !== "empty")
    )
      throw new LaceRenderError("invalid_link", "the link resolver returned an invalid result.", {
        context,
      });
    if (result.state === "resolved") {
      if (targetId === undefined && (result.href !== value || result.targetId !== undefined))
        throw new LaceRenderError("invalid_link", "manual links must retain their authored URL.", {
          context,
        });
      return Object.freeze({
        state: "resolved",
        href: result.href,
        ...(targetId === undefined ? {} : { targetId }),
      });
    }
    if ("href" in result)
      throw new LaceRenderError(
        "invalid_link",
        "an unavailable or empty link cannot have an href.",
        { context },
      );
    return result.state === "empty"
      ? Object.freeze({ state: "empty" })
      : Object.freeze({ state: "unavailable", targetId: result.targetId });
  };
}
