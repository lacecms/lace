import { expect, test, vi } from "vitest";
import {
  AdminClientError,
  adminQueryKeys,
  createAdminClient,
  type MediaUploadOptions,
} from "./admin-client.js";

const uploadedItem = {
  createdAt: "2026-09-20T00:00:00.000Z",
  createdBy: { displayName: "Admin", id: "admin-1" },
  filename: "hero.png",
  id: "media-1",
  mimeType: "image/png",
  size: 12,
  status: "active",
  updatedAt: "2026-09-20T00:00:00.000Z",
  url: "https://lace.test/api/v1/public/media/media-1",
  tags: [],
  usageCount: 0,
};

/** A scripted XMLHttpRequest double: `respond` settles the latest request. */
class FakeXhr {
  static latest: FakeXhr | undefined;
  readonly headers: Record<string, string> = {};
  readonly listeners: Record<string, (() => void)[]> = {};
  readonly uploadListeners: ((event: ProgressEvent) => void)[] = [];
  readonly upload = {
    addEventListener: (_type: string, listener: (event: ProgressEvent) => void) =>
      this.uploadListeners.push(listener),
  };
  method = "";
  path = "";
  body: unknown;
  status = 0;
  responseText = "";
  responseHeaders: Record<string, string> = {};

  constructor() {
    FakeXhr.latest = this;
  }
  open(method: string, path: string) {
    this.method = method;
    this.path = path;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  addEventListener(type: string, listener: () => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  getResponseHeader(name: string) {
    return this.responseHeaders[name] ?? null;
  }
  send(body: unknown) {
    this.body = body;
  }
  progress(loaded: number, total: number) {
    for (const listener of this.uploadListeners)
      listener({ lengthComputable: true, loaded, total } as ProgressEvent);
  }
  respond(status: number, body: unknown, headers: Record<string, string> = {}) {
    this.status = status;
    this.responseText = body === undefined ? "" : JSON.stringify(body);
    this.responseHeaders = headers;
    for (const listener of this.listeners.load ?? []) listener();
  }
  fail() {
    for (const listener of this.listeners.error ?? []) listener();
  }
}

test("lists validated media through the credentialed admin API", async () => {
  const item = {
    createdAt: "2026-09-20T00:00:00.000Z",
    createdBy: { displayName: "Admin", id: "admin-1" },
    filename: "hero.png",
    id: "media-1",
    mimeType: "image/png",
    size: 12,
    status: "active",
    updatedAt: "2026-09-20T00:00:00.000Z",
    url: "https://lace.test/api/v1/public/media/media-1",
    tags: [],
    usageCount: 0,
  };
  const fetcher = vi.fn(async () => Response.json({ items: [item], nextCursor: "next" }));
  await expect(createAdminClient(fetcher).listMedia("previous+/=")).resolves.toEqual({
    items: [item],
    nextCursor: "next",
  });
  expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/media?after=previous%2B%2F%3D", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  await expect(
    createAdminClient(async () => Response.json({ items: [{ id: "bad" }] })).listMedia(),
  ).rejects.toBeInstanceOf(AdminClientError);
  await createAdminClient(fetcher).listMedia(undefined, {
    limit: 24,
    q: "  hero ",
    sort: "filename",
    type: "image/png",
  });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/media?q=hero&type=image%2Fpng&sort=filename&limit=24",
    expect.objectContaining({ credentials: "same-origin" }),
  );
  await createAdminClient(fetcher).listMedia(undefined, { q: "   " });
  expect(fetcher).toHaveBeenLastCalledWith("/api/v1/admin/media", expect.anything());
});

test("reads media details with usage through the credentialed admin API", async () => {
  const detail = {
    createdAt: "2026-09-20T00:00:00.000Z",
    createdBy: { displayName: "Admin", id: "admin-1" },
    filename: "hero.png",
    id: "media/1",
    mimeType: "image/png",
    size: 12,
    status: "active",
    updatedAt: "2026-09-20T00:00:00.000Z",
    url: "https://lace.test/api/v1/public/media/media-1",
    usage: [
      {
        entryId: "entry-1",
        locations: [{ field: "cover", source: "field", states: ["published"] }],
        modelKey: "posts",
        status: "published",
        title: "Hello",
      },
    ],
    tags: [],
    usageCount: 1,
  };
  const fetcher = vi.fn(async () => Response.json(detail));
  await expect(createAdminClient(fetcher).getMedia("media/1")).resolves.toEqual(detail);
  expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/media/media%2F1", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  expect(adminQueryKeys.mediaDetail("media-1")).toEqual(["admin", "media", "detail", "media-1"]);
  await expect(
    createAdminClient(async () => Response.json({ ...detail, usage: undefined })).getMedia("m"),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("uploads and requests media deletion with validated credentialed responses", async () => {
  const item = {
    createdAt: "2026-09-20T00:00:00.000Z",
    createdBy: { displayName: "Admin", id: "admin-1" },
    filename: "hero.png",
    id: "media-1",
    mimeType: "image/png",
    size: 12,
    status: "active",
    updatedAt: "2026-09-20T00:00:00.000Z",
    url: "https://lace.test/api/v1/public/media/media-1",
    tags: [],
    usageCount: 0,
  };
  const fetcher = vi.fn(async () => Response.json(item, { status: 201 }));
  const client = createAdminClient(fetcher);
  const file = new File(["image"], "hero.png", { type: "image/png" });
  await expect(client.uploadMedia(file)).resolves.toEqual(item);
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/media",
    expect.objectContaining({
      body: expect.any(FormData),
      credentials: "same-origin",
      method: "POST",
    }),
  );
  const uploadRequest = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(uploadRequest[1].body).toBeInstanceOf(FormData);
  expect((uploadRequest[1].body as FormData).get("file")).toEqual(file);
  await expect(client.deleteMedia("media/1")).resolves.toEqual(item);
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/media/media%2F1",
    expect.objectContaining({ credentials: "same-origin", method: "DELETE" }),
  );
  await expect(client.deleteMedia("media-1", { detachDrafts: true })).resolves.toEqual(item);
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/media/media-1?detach=drafts",
    expect.objectContaining({ credentials: "same-origin", method: "DELETE" }),
  );
  await expect(client.retryMediaDeletion("media-1")).resolves.toEqual(item);
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/media/media-1/retry-deletion",
    expect.objectContaining({ credentials: "same-origin", method: "POST" }),
  );
  await expect(
    createAdminClient(async () => Response.json({ id: "invalid" })).uploadMedia(file),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("updates media metadata guarded by the edited item's updatedAt", async () => {
  const media = {
    alt: "Red bicycle",
    createdAt: "2026-09-20T00:00:00.000Z",
    createdBy: { displayName: "Admin", id: "admin-1" },
    filename: "bike.png",
    focalPoint: { x: 0.52, y: 0.4 },
    id: "media-1",
    mimeType: "image/png",
    size: 12,
    status: "active",
    updatedAt: "2026-09-20T00:00:01.001Z",
    url: "https://lace.test/api/v1/public/media/media-1",
    tags: [],
    usageCount: 1,
  };
  const result = { build: { status: "queued", targetVersion: 7 }, media };
  const fetcher = vi.fn(async () => Response.json(result));
  await expect(
    createAdminClient(fetcher).updateMediaMetadata(
      "media/1",
      { alt: "Red bicycle", caption: null, focalPoint: { x: 0.52, y: 0.4 } },
      "2026-09-20T00:00:00.123Z",
    ),
  ).resolves.toEqual(result);
  expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/media/media%2F1", {
    body: JSON.stringify({ alt: "Red bicycle", caption: null, focalPoint: { x: 0.52, y: 0.4 } }),
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "if-match": `"${Date.parse("2026-09-20T00:00:00.123Z")}"`,
    },
    method: "PATCH",
  });
  const conflict = createAdminClient(async () =>
    Response.json(
      { error: { code: "MEDIA_UPDATE_CONFLICT", message: "The media item changed." } },
      { status: 409 },
    ),
  );
  await expect(
    conflict.updateMediaMetadata("media-1", { alt: "x" }, media.updatedAt),
  ).rejects.toMatchObject({ code: "MEDIA_UPDATE_CONFLICT", status: 409 });
  await expect(
    createAdminClient(async () => Response.json({ media })).updateMediaMetadata(
      "media-1",
      { alt: "x" },
      media.updatedAt,
    ),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("media mutations preserve API failures and map transport failure safely", async () => {
  const denied = createAdminClient(async () =>
    Response.json({ error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 }),
  );
  await expect(denied.deleteMedia("media-1")).rejects.toMatchObject({ status: 403 });
  const rejected = createAdminClient(async () =>
    Response.json(
      { error: { code: "VALIDATION_FAILED", message: "Invalid image" } },
      { status: 422 },
    ),
  );
  await expect(rejected.uploadMedia(new File(["bad"], "bad.png"))).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
  await expect(
    createAdminClient(async () => {
      throw new Error("sensitive transport detail");
    }).retryMediaDeletion("media-1"),
  ).rejects.toMatchObject({ message: "The Lace API could not be reached." });
});

test("the default client uploads through XHR and reports byte progress", async () => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  try {
    const progress = vi.fn();
    const file = new File(["image"], "hero.png", { type: "image/png" });
    const pending = createAdminClient().uploadMedia(file, { onProgress: progress });
    const request = FakeXhr.latest as FakeXhr;
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/api/v1/admin/media");
    expect(request.headers.accept).toBe("application/json");
    expect((request.body as FormData).get("file")).toEqual(file);
    request.progress(50, 100);
    request.progress(100, 100);
    expect(progress.mock.calls).toEqual([[0.5], [1]]);
    request.respond(201, uploadedItem);
    await expect(pending).resolves.toEqual(uploadedItem);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("XHR uploads map error envelopes, invalid bodies, and network failures", async () => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  try {
    const client = createAdminClient();
    const file = new File(["bad"], "bad.png", { type: "image/png" });
    const rejected = client.uploadMedia(file);
    (FakeXhr.latest as FakeXhr).respond(
      422,
      { error: { code: "VALIDATION_FAILED", message: "Invalid image" } },
      { "x-request-id": "request-7" },
    );
    await expect(rejected).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: "Invalid image",
      requestId: "request-7",
      status: 422,
    });
    const malformed = client.uploadMedia(file);
    (FakeXhr.latest as FakeXhr).respond(201, { id: "invalid" });
    await expect(malformed).rejects.toMatchObject({
      message: "The Lace API returned an invalid response.",
    });
    const offline = client.uploadMedia(file);
    (FakeXhr.latest as FakeXhr).fail();
    await expect(offline).rejects.toMatchObject({ message: "The Lace API could not be reached." });
  } finally {
    vi.unstubAllGlobals();
  }
});

test("an injected uploader replaces the default transport", async () => {
  const uploader = vi.fn(async (_path: string, _body: FormData, options: MediaUploadOptions) => {
    options.onProgress?.(1);
    return { body: uploadedItem, requestId: undefined, status: 201 };
  });
  const fetcher = vi.fn(async () => Response.json({}));
  const progress = vi.fn();
  await expect(
    createAdminClient(fetcher, uploader).uploadMedia(new File(["x"], "hero.png"), {
      onProgress: progress,
    }),
  ).resolves.toEqual(uploadedItem);
  expect(uploader).toHaveBeenCalledWith("/api/v1/admin/media", expect.any(FormData), {
    onProgress: progress,
  });
  expect(progress).toHaveBeenCalledWith(1);
  expect(fetcher).not.toHaveBeenCalled();
});

test("media tag client sends repeated filters and validates the catalog", async () => {
  const fetcher = vi.fn(async () => Response.json({ items: [{ tag: "project-2026", count: 2 }] }));
  await expect(
    createAdminClient(fetcher).listMediaTags({ q: "pro", limit: 1, after: "cursor" }),
  ).resolves.toEqual({ items: [{ tag: "project-2026", count: 2 }] });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/media/tags?q=pro&after=cursor&limit=1",
    expect.objectContaining({ credentials: "same-origin" }),
  );
  const list = vi.fn(async () => Response.json({ items: [] }));
  await createAdminClient(list).listMedia(undefined, { tags: ["cover", "project-2026"] });
  expect(list).toHaveBeenLastCalledWith(
    "/api/v1/admin/media?tag=cover&tag=project-2026",
    expect.anything(),
  );
});
