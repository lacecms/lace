/// <reference types="node" />
import { expect } from "vitest";

export const draftPreviewOrigin = "https://preview.lace.test";

export async function seedReadyPreview(
  run: (sql: string, values: readonly unknown[]) => Promise<unknown>,
  id: string,
  now: number,
  manifest = { sha256: "a".repeat(64), bytes: 10 },
) {
  await run(
    `insert into preview_generations
      (id,entry_id,model_key,revision,path,public_version,configuration,source_commit,executor,
       created_by,idempotency_key,state,created_at,overall_deadline,ready_at,expires_at,output_sha256,output_bytes)
      values (?,?, 'home',7,'/',0,'fixture',?,'fixture','fixture',?,'ready',?,?,?,?,?,?)`,
    [
      id,
      id,
      "a".repeat(40),
      id,
      now,
      now + 900_000,
      now,
      now + 86_400_000,
      manifest.sha256,
      manifest.bytes,
    ],
  );
  await run("insert into preview_current (entry_id,generation_id) values (?,?)", [id, id]);
}

interface PreviewHandoffFixture {
  readonly adminOrigin: string;
  readonly parentCookie: string;
  readonly fetch: (request: Request) => Promise<Response>;
  readonly expire: (operation: () => Promise<void>) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly session: (token: string, generation: string) => Promise<unknown>;
  readonly otherCredentials: readonly string[];
}

function location(response: Response, status = 303): URL {
  expect(response.status).toBe(status);
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  return new URL(response.headers.get("location")!);
}

const pair = (cookie: string) => cookie.split(";")[0]!;
function exchangeBody(target: URL) {
  const values = new URLSearchParams(target.hash.slice(1));
  return new URLSearchParams({ flow: values.get("flow")!, code: values.get("code")! }).toString();
}

export async function openPreviewSession(
  fetch: PreviewHandoffFixture["fetch"],
  parent: string,
  id: string,
  previewOrigin = draftPreviewOrigin,
) {
  const start = await fetch(
    new Request(`${previewOrigin}/access/start?return=${encodeURIComponent(`/view/${id}`)}`),
  );
  const authorize = await fetch(new Request(location(start), { headers: { cookie: parent } }));
  const callback = location(authorize);
  const exchange = await fetch(
    new Request(callback.origin + callback.pathname, {
      method: "POST",
      headers: {
        cookie: pair(start.headers.getSetCookie()[0]!),
        origin: previewOrigin,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: exchangeBody(callback),
    }),
  );
  expect(exchange.status).toBe(204);
  return pair(exchange.headers.getSetCookie()[1]!);
}

export async function assertPreviewHandoff(fixture: PreviewHandoffFixture) {
  const call = (url: string | URL, headers?: Record<string, string>) =>
    fixture.fetch(new Request(url, { headers: new Headers(headers) }));
  const ready = new URL("/access/start?return=%2Fview%2Fone", draftPreviewOrigin);
  const admin = { cookie: fixture.parentCookie };
  const redeem = (target: URL, cookie = "", origin = draftPreviewOrigin) =>
    fixture.fetch(
      new Request(target.origin + target.pathname, {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/x-www-form-urlencoded" },
        body: exchangeBody(target),
      }),
    );
  const start = async (id = "one") => {
    const result = await call(new URL(`/access/start?return=%2Fview%2F${id}`, draftPreviewOrigin));
    const authorize = location(result);
    expect(authorize.origin).toBe(fixture.adminOrigin);
    const [nonce] = result.headers.getSetCookie();
    expect(nonce).toMatch(/^__Host-lace-preview-.*; Path=\/; Secure; HttpOnly; SameSite=Lax;/u);
    expect(nonce).not.toContain("Domain=");
    return { authorize, nonce: pair(nonce!) };
  };
  const setup = await start();
  const other = await start("two");
  expect(other.nonce).not.toBe(setup.nonce);
  expect(location(await call(setup.authorize)).pathname).toBe("/admin/login");
  const frame = await call(setup.authorize, { "sec-fetch-dest": "iframe" });
  expect(frame.status).toBe(401);
  expect(await frame.text()).toContain('target="_blank"');
  const resume = new URL(
    "/api/v1/admin/preview/authorize?resume=%2Fview%2Fone",
    fixture.adminOrigin,
  );
  expect(location(await call(resume, admin)).href).toBe(ready.href);

  const tampered = new URL(setup.authorize.href.replace("%2Fview%2Fone", "%2Fview%2Ftwo"));
  expect((await call(tampered, admin)).status).toBe(404);
  expect((await call(setup.authorize, { ...admin, origin: "https://foreign.test" })).status).toBe(
    403,
  );
  for (const token of fixture.otherCredentials)
    expect(
      (await call(setup.authorize, { ...admin, authorization: `Bearer ${token}` })).status,
    ).toBe(403);
  expect((await call(ready, { host: "foreign.test" })).status).toBe(404);
  expect((await call(new URL(ready.pathname + ready.search, "https://foreign.test"))).status).toBe(
    404,
  );
  expect(
    (await call(new URL("/access/start?return=%2F%2Fexample.com", draftPreviewOrigin))).status,
  ).toBe(400);
  const callbacks = await Promise.all(
    [setup, other].map(async (flow) => location(await call(flow.authorize, admin))),
  );
  const [first, second] = callbacks as [URL, URL];
  expect(first.origin).toBe(draftPreviewOrigin);
  expect(first.search).toBe("");
  expect(first.hash).toContain("code=");
  expect(
    (
      await fixture.fetch(
        new Request(first.origin + first.pathname, {
          method: "POST",
          headers: { origin: first.origin, "content-type": "application/x-www-form-urlencoded" },
          body: "x".repeat(161),
        }),
      )
    ).status,
  ).toBe(413);
  expect((await redeem(first)).status).toBe(401);
  expect((await redeem(first, other.nonce)).status).toBe(401);
  expect((await redeem(first, setup.nonce, fixture.adminOrigin)).status).toBe(403);
  const race = await Promise.all([1, 2].map(() => redeem(first, setup.nonce)));
  expect(race.map((response) => response.status).toSorted()).toEqual([204, 401]);
  const winner = race.find((response) => response.status === 204)!;
  expect(location(winner, 204).href).toBe(`${draftPreviewOrigin}/view/one`);
  const [clear, session] = winner.headers.getSetCookie();
  expect(clear).toContain("Max-Age=0");
  expect(session).toMatch(/^__Host-lace-preview=.*; Path=\/; Secure; HttpOnly; SameSite=Lax;/u);
  expect(session).not.toContain("Domain=");
  expect((await call(setup.authorize, admin)).status).toBe(404);
  expect(location(await redeem(second, other.nonce), 204).pathname).toBe("/view/two");
  const token = pair(session!).split("=")[1]!;
  for (const [method, path] of [
    ["GET", "/api/v1/admin/content-models"],
    ["GET", "/api/v1/build/export"],
    ["GET", "/api/v1/public/entries"],
    ["POST", "/api/auth/sign-out"],
    ["GET", "/api/auth/oauth2/authorize"],
    ["GET", "/.well-known/oauth-protected-resource/mcp"],
    ["POST", "/mcp"],
    ["POST", "/api/v1/preview-runner/one/claim"],
  ] as const)
    expect(
      (
        await fixture.fetch(
          new Request(draftPreviewOrigin + path, {
            method,
            headers: { cookie: `${pair(session!)}; ${fixture.parentCookie}` },
          }),
        )
      ).status,
    ).toBe(404);
  expect(
    (
      await call(`${fixture.adminOrigin}/api/v1/admin/content-models`, {
        cookie: pair(session!),
      })
    ).status,
  ).toBe(401);
  await expect(fixture.session(token, "one")).resolves.toMatchObject({ revision: 7 });
  await expect(fixture.session(token, "two")).resolves.toMatchObject({ revision: 7 });

  const expiring = await start();
  const expiredCallback = location(await call(expiring.authorize, admin));
  const expiringStart = await start();
  await fixture.expire(async () => {
    expect((await redeem(expiredCallback, expiring.nonce)).status).toBe(401);
    expect((await call(expiringStart.authorize, admin)).status).toBe(404);
  });

  const pending = await start();
  const revokedCallback = location(await call(pending.authorize, admin));
  await fixture.logout();
  expect((await redeem(revokedCallback, pending.nonce)).status).toBe(401);
  await expect(fixture.session(token, "one")).resolves.toBe("denied");
}
