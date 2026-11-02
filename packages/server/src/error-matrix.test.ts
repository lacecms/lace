import { expect, test } from "vitest";
import { errorMatrixCases } from "@lacecms/test-utils";
import { fixture, json } from "./test-support/app-harness.js";

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
