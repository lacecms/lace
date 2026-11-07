import { expect, test, vi } from "vitest";
import { admin, fixture, json } from "../test-support/app-harness.js";

const lists = ["/api/v1/admin/models/posts/entries", "/api/v1/admin/media"] as const;

test("admin entry and media lists refuse a page limit above 100 before any read", async () => {
  const { app, store } = await fixture();
  const entryReads = vi.spyOn(store, "list");
  const mediaReads = vi.spyOn(store, "listMedia");
  for (const path of lists)
    for (const limit of ["101", "500"]) {
      const result = await json(app, `${path}?limit=${limit}`);
      expect(result.response.status, `${path} ${limit}`).toBe(422);
      expect(result.body.error.code).toBe("VALIDATION_FAILED");
      expect(
        result.body.error.details.issues.map((issue: { path: string }) => issue.path),
      ).toContain("/limit");
    }
  expect(entryReads).not.toHaveBeenCalled();
  expect(mediaReads).not.toHaveBeenCalled();
  for (const path of lists) {
    expect((await json(app, `${path}?limit=100`)).response.status, path).toBe(200);
    expect((await json(app, path)).response.status, path).toBe(200);
  }
});

test("an omitted page limit returns at most 50 entries", async () => {
  const { app, content } = await fixture();
  for (let index = 0; index < 51; index += 1)
    await content.create({
      actor: admin,
      blocks: [],
      fields: {},
      modelKey: "posts",
      slug: `post-${index}`,
      title: `Post ${index}`,
    });
  const page = await json(app, "/api/v1/admin/models/posts/entries");
  expect(page.body.items).toHaveLength(50);
  expect(typeof page.body.nextCursor).toBe("string");
});
