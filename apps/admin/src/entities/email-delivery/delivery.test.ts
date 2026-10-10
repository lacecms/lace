import { expect, test } from "vitest";
import { deliveryFailureExplanation } from "./delivery.js";

test("explains every closed delivery failure without provider text", () => {
  const reasons = [
    "invalid_message",
    "not_configured",
    "rate_limited",
    "rejected",
    "unavailable",
  ] as const;
  const sentences = reasons.map(deliveryFailureExplanation);
  expect(new Set(sentences).size).toBe(reasons.length);
  for (const sentence of sentences) expect(sentence).toMatch(/not sent\.$|no email was sent\.$/u);
  expect(deliveryFailureExplanation("not_configured")).toContain("not configured");
});
