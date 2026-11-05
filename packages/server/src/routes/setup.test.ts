import { expect, test } from "vitest";
import { AccountError } from "@lacecms/domain";
import { notFound } from "../shared/http.js";
import { accountSecurity, fixture, json } from "../test-support/app-harness.js";

const submit = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "admin@lace.test",
    password: "correct horse battery staple",
    token: "A".repeat(43),
  }),
};

async function setupWith(failure: Error) {
  const { security } = accountSecurity({
    bootstrap: async () => {
      throw failure;
    },
  });
  const { app } = await fixture({ security });
  return json(app, "/api/v1/setup/admin", submit);
}

test("setup outcomes answer the same ambiguous 404 envelope as before", async () => {
  const expected = await notFound().json();
  // Unknown or expired token, completed setup, and a token claimed by another email.
  for (const outcome of ["unknown token", "completed setup", "foreign email"]) {
    const result = await setupWith(new AccountError("NOT_FOUND"));
    expect(result.response.status, outcome).toBe(404);
    expect(result.body, outcome).toEqual(expected);
  }
});

test("an unexpected failure during setup is a server error, not a bad token", async () => {
  const result = await setupWith(new Error("database is locked"));
  expect(result.response.status).toBe(500);
  expect(result.body).toEqual({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
});
