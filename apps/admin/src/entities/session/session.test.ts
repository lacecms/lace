import { expect, test, vi } from "vitest";
import { adminSessionFromDto, can, createBrowserSessionSource } from "./session.js";

const editorSummary = {
  permissions: ["content:read", "content:write", "media:write"],
  user: { displayName: "Ada Editor", email: "ada@lace.test", id: "editor-1", role: "editor" },
};

test("invalidating browser session state fetches a fresh same-origin session", async () => {
  const fetcher = vi.fn(async () => Response.json(editorSummary));
  const source = createBrowserSessionSource(fetcher);

  await source.get();
  await source.get();
  expect(fetcher).toHaveBeenCalledTimes(1);
  source.invalidate();
  await source.get();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("session adapter reads the validated summary with same-origin credentials", async () => {
  const fetcher = vi.fn(async () => Response.json(editorSummary));
  const session = await createBrowserSessionSource(fetcher).get();
  expect(session).toMatchObject({
    displayName: "Ada Editor",
    email: "ada@lace.test",
    id: "editor-1",
    role: "editor",
  });
  expect([...session!.permissions]).toEqual(["content:read", "content:write", "media:write"]);
  expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/session", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
});

test("session adapter fails closed on unauthenticated, malformed and failed reads", async () => {
  const read = (fetcher: typeof fetch) => createBrowserSessionSource(fetcher).get();
  await expect(read(async () => Response.json({}, { status: 401 }))).resolves.toBeNull();
  await expect(read(async () => new Response("bad", { status: 500 }))).resolves.toBeNull();
  await expect(read(async () => new Response("not json"))).resolves.toBeNull();
  await expect(
    read(async () => Response.json({ ...editorSummary, permissions: ["content:everything"] })),
  ).resolves.toBeNull();
  await expect(
    read(async () => Response.json({ user: { id: "editor-1", role: "editor" } })),
  ).resolves.toBeNull();
  await expect(
    read(async () => {
      throw new TypeError("network down");
    }),
  ).resolves.toBeNull();
});

test("display name prefers the user name, then email, and never the ID", () => {
  const session = (displayName?: string) =>
    adminSessionFromDto({
      permissions: ["content:read"],
      user: {
        ...(displayName === undefined ? {} : { displayName }),
        email: "ada@lace.test",
        id: "u-1",
        role: "viewer",
      },
    });
  expect(session(" Ada ").displayName).toBe("Ada");
  expect(session("  ").displayName).toBe("ada@lace.test");
  expect(session().displayName).toBe("ada@lace.test");
});

test("can answers only from the server-derived permission set", () => {
  const session = adminSessionFromDto({
    permissions: ["content:read", "settings:manage"],
    user: { email: "ops@lace.test", id: "ops-1", role: "viewer" },
  });
  expect(can(session, "settings:manage")).toBe(true);
  expect(can(session, "content:write")).toBe(false);
  expect(can(session, "users:manage")).toBe(false);
});
