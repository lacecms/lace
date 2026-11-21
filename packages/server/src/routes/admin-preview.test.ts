import { expect, test, vi } from "vitest";
import { admin, editor, viewer, delegatedActor } from "@lacecms/test-utils";
import { unixMilliseconds } from "@lacecms/domain";
import type { LaceAppInput } from "../composition/input.js";
import { fixture, json } from "../test-support/app-harness.js";

const config = "/api/v1/admin/preview/config";
const target = "/api/v1/admin/entries/entry-1/preview";
const payload = { expectedRevision: 3, idempotencyKey: "request-1" };
const post = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
};

function previewCapability() {
  const status = vi
    .fn<Exclude<LaceAppInput["adminPreview"], string | undefined>["status"]>()
    .mockResolvedValue({
      id: "preview-1",
      revision: 3,
      state: "ready",
      createdAt: unixMilliseconds(100),
      readyAt: unixMilliseconds(200),
      expiresAt: unixMilliseconds(86_400_200),
    });
  const create = vi
    .fn<Exclude<LaceAppInput["adminPreview"], string | undefined>["create"]>()
    .mockResolvedValue({ kind: "rejected", reason: "PREVIEW_BUSY" });
  return { origin: "https://preview.lace.test", status, create };
}

test("preview readiness fails closed and reports missing setup only to settings managers", async () => {
  const disabled = await fixture();
  expect((await json(disabled.app, config)).body).toEqual({
    ready: false,
    missing: ["preview-disabled"],
  });
  expect((await json(disabled.app, target, post)).response.status).toBe(503);
  const missing = await fixture({ adminPreview: "configuration-required" });
  expect((await json(missing.app, config)).body).toEqual({
    ready: false,
    missing: ["preview-configuration"],
  });
  const readOnly = await fixture({ actor: viewer, adminPreview: "configuration-required" });
  expect((await json(readOnly.app, config)).body).toEqual({ ready: false });
});

test("preview routes reject delegated and anonymous actors and allow only writers to create", async () => {
  const preview = previewCapability();
  const anonymous = await fixture({ actor: null, adminPreview: preview });
  expect((await json(anonymous.app, config)).response.status).toBe(401);
  const automation = await fixture({
    actor: delegatedActor(admin, {
      permissions: ["content:read", "content:write"],
      operations: ["load", "save"],
    }),
    adminPreview: preview,
  });
  expect((await json(automation.app, target)).response.status).toBe(403);
  const reader = await fixture({ actor: viewer, adminPreview: preview });
  for (const credential of ["import", "build", "mcp"])
    expect(
      (await json(reader.app, target, { headers: { authorization: `Bearer ${credential}` } }))
        .response.status,
    ).toBe(403);
  const status = await json(reader.app, target);
  expect(status.response.headers.get("cache-control")).toBe("no-store");
  expect(status.body).toEqual({
    id: "preview-1",
    revision: 3,
    state: "ready",
    createdAt: new Date(100).toISOString(),
    readyAt: new Date(200).toISOString(),
    expiresAt: new Date(86_400_200).toISOString(),
  });
  expect((await json(reader.app, target, post)).response.status).toBe(403);
  expect(preview.create).not.toHaveBeenCalled();
  for (const actor of [admin, editor]) {
    const writer = await fixture({ actor, adminPreview: preview });
    const rejected = await json(writer.app, target, post);
    expect(rejected.response.status).toBe(409);
    expect(rejected.body).toMatchObject({ error: { code: "PREVIEW_BUSY" } });
    expect(preview.create).toHaveBeenLastCalledWith(actor, { entryId: "entry-1", ...payload });
  }
});
