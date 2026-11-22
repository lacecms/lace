import { expect, test } from "vitest";
import { defineCollection } from "@lacecms/config";
import { testActor } from "@lacecms/test-utils";
import { fixture, json } from "../test-support/app-harness.js";

const picker = "/api/v1/admin/reference-targets";
function resolveRequest(ids: readonly string[]): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  };
}

test("reference catalog requires a session and validates strict bounded inputs", async () => {
  const { app } = await fixture({
    actor: testActor("viewer"),
    models: [defineCollection({ key: "reviews", version: 1, fields: {} })],
  });
  expect(await json(app, `${picker}?modelKey=reviews`)).toMatchObject({
    response: { status: 200 },
    body: { items: [] },
  });
  expect(
    await json(app, `${picker}/resolve`, resolveRequest(["missing", "__proto__"])),
  ).toMatchObject({
    response: { status: 200 },
    body: { missing: { id: "missing", state: "missing" } },
  });
  const result = await json(app, `${picker}/resolve`, resolveRequest(["__proto__"]));
  expect(Object.entries(result.body)).toEqual([
    ["__proto__", { id: "__proto__", state: "missing" }],
  ]);
  for (const query of [
    "",
    "?modelKey=reviews&status=published",
    "?modelKey=reviews&modelKey=posts",
    "?modelKey=reviews&limit=51",
    "?modelKey=reviews&after=bad",
  ]) {
    expect((await json(app, picker + query)).response.status).toBe(422);
  }
  expect(
    (await json(app, `${picker}/resolve`, resolveRequest(["duplicate", "duplicate"]))).response
      .status,
  ).toBe(422);

  const guest = await fixture({ actor: null });
  expect((await json(guest.app, `${picker}?modelKey=reviews`)).response.status).toBe(401);
  expect(
    (
      await json(app, `${picker}?modelKey=reviews`, {
        headers: { authorization: "Bearer automation-token" },
      })
    ).response.status,
  ).toBe(403);
});
