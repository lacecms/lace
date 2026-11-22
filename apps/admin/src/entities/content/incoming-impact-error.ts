import { AdminClientError } from "../../shared/api/index.js";

const changedCodes = {
  url: new Set(["CONTENT_LINK_IMPACT_CHANGED", "CONTENT_LINKS_IN_USE"]),
  reference: new Set([
    "CONTENT_REFERENCE_IMPACT_CHANGED",
    "CONTENT_REFERENCE_REVIEW_REQUIRED",
    "CONTENT_REFERENCES_IN_USE",
  ]),
};

export function isIncomingImpactChanged(error: unknown, purpose: "url" | "reference"): boolean {
  return (
    error instanceof AdminClientError &&
    error.code !== undefined &&
    changedCodes[purpose].has(error.code)
  );
}
