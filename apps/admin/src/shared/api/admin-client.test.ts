import { expect, test, vi } from "vitest";
import { AdminClientError, createAdminClient, isSessionExpiredError } from "./admin-client.js";

test("reads only a validated credentialed build-site identity", async () => {
  const fetcher = vi.fn(async () => Response.json({ site: { id: "site", label: "Site" } }));
  await expect(createAdminClient(fetcher).loadBuildSite()).resolves.toEqual({
    site: { id: "site", label: "Site" },
  });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/v1/admin/build-site",
    expect.objectContaining({ credentials: "same-origin" }),
  );
  await expect(
    createAdminClient(async () =>
      Response.json({ site: { id: "site", label: "/private/secret" } }),
    ).loadBuildSite(),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("reads validated build history and sends administrator build commands", async () => {
  const build = {
    id: "build-1",
    reason: "publication",
    status: "failed",
    targetVersion: 4,
    requestedBy: "admin",
    requestedAt: "2026-09-27T00:00:00.000Z",
    error: "provider_failed",
  };
  const fetcher = vi.fn(async (path: string) =>
    Response.json(
      path.endsWith("/retry") || path === "/api/v1/admin/builds"
        ? { coalesced: false, eventId: "event-1", targetVersion: 4 }
        : path.endsWith("build-1")
          ? build
          : { items: [build] },
    ),
  );
  const client = createAdminClient(fetcher as typeof fetch);
  await expect(client.listBuilds()).resolves.toEqual({ items: [build] });
  await expect(client.getBuild("build-1")).resolves.toEqual(build);
  await expect(client.requestBuild()).resolves.toMatchObject({ eventId: "event-1" });
  await expect(client.retryBuild("build-1")).resolves.toMatchObject({ targetVersion: 4 });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/builds/build-1/retry",
    expect.objectContaining({ credentials: "same-origin", method: "POST" }),
  );
  await expect(
    createAdminClient(async () => Response.json({ items: [{ id: "bad" }] })).listBuilds(),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("rejects malformed responses and maps API errors with their request ID", async () => {
  await expect(
    createAdminClient(async () => Response.json({ unexpected: true })).listModels(),
  ).rejects.toBeInstanceOf(AdminClientError);

  const response = Response.json(
    { error: { code: "NOT_FOUND", message: "Missing model" } },
    { headers: { "x-request-id": "request-42" }, status: 404 },
  );
  await expect(createAdminClient(async () => response).listModels()).rejects.toMatchObject({
    code: "NOT_FOUND",
    requestId: "request-42",
    status: 404,
  });
});

test("retains only validated field issues from an API error", async () => {
  await expect(
    createAdminClient(async () =>
      Response.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            details: {
              issues: [{ code: "invalid_value", message: "Invalid", path: "/fields/body" }],
            },
            message: "Invalid request",
          },
        },
        { status: 422 },
      ),
    ).saveDraft("entry-1", { blocks: [], expectedRevision: 1, fields: {}, title: "Post" }),
  ).rejects.toMatchObject({ issues: [{ path: "/fields/body" }] });
});

test("identifies only authentication-status client errors as recovery candidates", () => {
  expect(isSessionExpiredError(new AdminClientError({ message: "Expired", status: 401 }))).toBe(
    true,
  );
  expect(isSessionExpiredError(new AdminClientError({ message: "Denied", status: 403 }))).toBe(
    false,
  );
  expect(isSessionExpiredError(new AdminClientError({ message: "Conflict", status: 409 }))).toBe(
    false,
  );
});
