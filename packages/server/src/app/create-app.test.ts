import { expect, test } from "vitest";

import { editor, fixture, json } from "../test-support/app-harness.js";

test("mounts authentication before API and admin fallbacks", async () => {
  const { app } = await fixture({
    auth: { fetch: async () => new Response("auth-route", { status: 202 }) },
  });
  expect(
    await (await app.fetch(new Request("https://lace.test/api/auth/sign-in/email"))).text(),
  ).toBe("auth-route");
  expect((await app.fetch(new Request("https://lace.test/api/auth/sign-in/email"))).status).toBe(
    202,
  );
  expect(await (await app.fetch(new Request("https://lace.test/health/live"))).json()).toEqual({
    status: "live",
  });
  expect(await json(app, "/api/unknown")).toMatchObject({ response: { status: 404 } });
});

test("keeps liveness, readiness, request IDs, and logs separate", async () => {
  const { app, logs } = await fixture({ ready: false });
  const live = await json(app, "/health/live");
  const ready = await json(app, "/health/ready");
  expect(live).toMatchObject({ body: { status: "live" }, response: { status: 200 } });
  expect(ready).toMatchObject({ body: { status: "not_ready" }, response: { status: 503 } });
  expect(live.response.headers.get("x-request-id")).toBe("request-1");
  expect(JSON.stringify(logs)).not.toContain("authorization");
});

test("validates admin requests, rejects anonymous actors, and protects fallbacks", async () => {
  const anonymous = await fixture({ actor: null });
  expect(await json(anonymous.app, "/api/v1/admin/content-models")).toMatchObject({
    body: { error: { code: "AUTHORIZATION_DENIED" } },
    response: { status: 403 },
  });
  const authenticated = await fixture({ actor: editor });
  expect(await json(authenticated.app, "/api/v1/admin/content-models")).toMatchObject({
    body: {
      items: [
        { blockDefinitions: [], blocks: [], key: "home" },
        {
          blockDefinitions: [{ fields: { heading: { type: "text" } }, type: "hero" }],
          key: "posts",
        },
      ],
    },
    response: { status: 200 },
  });
  expect(
    await json(authenticated.app, "/api/v1/admin/models/posts/entries", {
      body: JSON.stringify({ blocks: [], fields: {}, title: "Post", unknown: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  ).toMatchObject({ body: { error: { code: "VALIDATION_FAILED" } }, response: { status: 422 } });
  expect(
    await json(authenticated.app, "/api/v1/admin/models/posts/entries", {
      body: JSON.stringify({ blocks: [], fields: {}, slug: "post", title: "Post" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  ).toMatchObject({ body: { model: { key: "posts" } }, response: { status: 201 } });
  const publisher = await fixture();
  const created = await json(publisher.app, "/api/v1/admin/models/posts/entries", {
    body: JSON.stringify({ blocks: [], fields: {}, slug: "publish", title: "Publish" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const entryId = created.body.id;
  expect(
    await json(publisher.app, `/api/v1/admin/entries/${entryId}/draft`, {
      body: JSON.stringify({
        blocks: [],
        expectedRevision: 1,
        fields: {},
        slug: "publish",
        title: "Changed",
      }),
      headers: { "content-type": "application/json", "if-match": '"2"' },
      method: "PUT",
    }),
  ).toMatchObject({ body: { error: { code: "VALIDATION_FAILED" } }, response: { status: 422 } });
  expect(
    await json(publisher.app, `/api/v1/admin/entries/${entryId}/publish`, {
      body: JSON.stringify({ expectedRevision: 1 }),
      headers: { "content-type": "application/json", "idempotency-key": "publish-key" },
      method: "POST",
    }),
  ).toMatchObject({
    body: {
      build: { status: "queued" },
      entry: { published: { state: "published" } },
      publication: "published",
    },
    response: { status: 200 },
  });
  expect(
    await (await authenticated.app.fetch(new Request("https://lace.test/admin/content"))).text(),
  ).toBe("admin-shell");
  expect(await json(authenticated.app, "/api/unknown")).toMatchObject({
    body: { error: { code: "NOT_FOUND" } },
    response: { status: 404 },
  });
});

test("renders stable body-limit and rate-limit envelopes", async () => {
  const { app } = await fixture();
  expect(
    await json(app, "/api/v1/admin/models/posts/entries", {
      body: JSON.stringify({ blocks: [], fields: {}, slug: "post", title: "x".repeat(1_000) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  ).toMatchObject({ body: { error: { code: "PAYLOAD_TOO_LARGE" } }, response: { status: 413 } });
  const throttled = await fixture({ allowed: false });
  expect(await json(throttled.app, "/health/live")).toMatchObject({
    body: { error: { code: "RATE_LIMITED" } },
    response: { status: 429 },
  });
});

test("optional API reference uses live same-origin contracts and preserves API boundaries", async () => {
  const disabled = await fixture();
  const explicit = await fixture({ apiDocsEnabled: false });
  const enabled = await fixture({ apiDocsEnabled: true, actor: null });
  for (const { app, logs } of [disabled, explicit]) {
    const response = await app.request("/api/docs");
    expect(response.status).toBe(404);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(await response.text()).not.toContain("admin-shell");
    expect(logs.at(-1)).toMatchObject({ path: "/api/docs", status: 404 });
  }
  const response = await enabled.app.request("/api/docs");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(response.headers.get("x-request-id")).toBeTruthy();
  const html = await response.text();
  expect(html).toContain("/api/v1/openapi.json");
  expect(html).toContain("@scalar/api-reference@1.75.0/dist/browser/standalone.js");
  expect(html).toMatch(/"persistAuth":\s*false/);
  expect(html).toMatch(/"telemetry":\s*false/);
  expect(html).toMatch(/"agent":\s*\{\s*"disabled":\s*true/);
  expect(html).toMatch(/"withDefaultFonts":\s*false/);
  expect(html).toMatch(/"servers":\s*\[\s*\{\s*"url":\s*"\/"/);
  expect(html).not.toContain("proxy.scalar.com");
  expect(html).not.toContain("authorization");
  expect(enabled.logs.at(-1)).toMatchObject({ path: "/api/docs", status: 200 });
  expect((await enabled.app.request("/api/v1/admin/content-models")).status).toBe(403);
  const schema = await (await disabled.app.request("/api/v1/openapi.json")).json();
  expect(await (await enabled.app.request("/api/v1/openapi.json")).json()).toEqual(schema);
  expect(schema.paths).not.toHaveProperty("/api/docs");
});
