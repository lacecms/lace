import { expect, test } from "vitest";
import { RateLimitExceededError } from "@lacecms/application";
import { classifyError } from "@lacecms/contracts";
import { errorMatrixCases } from "@lacecms/test-utils";
import { fixture, json } from "../test-support/app-harness.js";

test.each(errorMatrixCases)("REST error matrix: $name", async ({ create, expected }) => {
  const { app, content } = await fixture();
  content.loadAdminEntry = async () => {
    throw create();
  };
  const { body, response } = await json(app, "/api/v1/admin/entries/matrix-entry");
  expect({ status: response.status, body }).toEqual({
    status: expected.status,
    body: expected.body,
  });
  expect(response.headers.get("retry-after")).toBe(expected.headers?.["retry-after"] ?? null);
});

test.each([
  [30, "30"],
  [0.2, "1"],
])(
  "REST error matrix: request rate limit middleware with %s seconds left",
  async (retryAfterSeconds, header) => {
    const { app } = await fixture({
      rateLimiter: { check: async () => ({ allowed: false, retryAfterSeconds }) },
    });
    const { body, response } = await json(app, "/api/v1/admin/entries/matrix-entry");
    expect({ status: response.status, body }).toEqual({
      status: 429,
      body: classifyError(new RateLimitExceededError(retryAfterSeconds)).body,
    });
    expect(response.headers.get("retry-after")).toBe(header);
  },
);

test("REST error matrix: a boolean rate limit decision keeps its 60-second hint", async () => {
  const { response } = await json(
    (await fixture({ rateLimiter: { check: async () => false } })).app,
    "/api/v1/admin/entries/matrix-entry",
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
});
