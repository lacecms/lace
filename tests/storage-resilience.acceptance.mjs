import { expect, test, vi } from "vitest";
import { openProductRuntime, png } from "./support/cross-runtime-fixture.mjs";
import { MediaDeletionDispatcher } from "../packages/application/dist/index.js";

for (const kind of ["node", "worker"]) {
  test(`34B ${kind}: real object storage faults preserve lifecycle and recover after eight attempts`, async () => {
    const f = await openProductRuntime(kind);
    try {
      const storage = f.runtime.deletionDispatcher.options.storage;
      const upload = () => {
        const body = new FormData();
        body.append("file", new Blob([png], { type: "image/png" }), "fault.png");
        return f.call("/api/v1/admin/media", { method: "POST", cookie: f.cookies.admin, body });
      };
      const failedPut = vi
        .spyOn(storage, "put")
        .mockRejectedValueOnce(new Error("private storage fault"));
      expect((await upload()).status).toBe(500);
      expect(
        await (await f.call("/api/v1/admin/media", { cookie: f.cookies.admin })).json(),
      ).toMatchObject({ items: [] });
      failedPut.mockRestore();
      const written = vi.spyOn(storage, "put");
      const failedMetadata = vi
        .spyOn(f.runtime.repository, "createMedia")
        .mockRejectedValueOnce(new Error("private SQL fault"));
      expect((await upload()).status).toBe(500);
      const orphanKey = written.mock.calls[0][0].key;
      expect(await storage.get(orphanKey)).toBeNull();
      failedMetadata.mockRestore();
      written.mockRestore();
      const created = await upload();
      expect(created.status).toBe(201);
      const media = await created.json();
      const record = await f.runtime.repository.loadMedia(media.id);
      expect(await storage.get(record.storageKey)).not.toBeNull();
      let now = 1000;
      const admin = (await f.runtime.security.listUsers()).find((user) => user.role === "admin");
      await f.runtime.repository.markForDeletion({
        mediaId: media.id,
        requestedAt: now,
        requestedBy: { id: admin.id, role: "admin" },
      });
      const failures = vi
        .spyOn(storage, "delete")
        .mockRejectedValue(new Error("private object deletion detail"));
      const logs = [];
      const dispatcher = new MediaDeletionDispatcher({
        work: f.runtime.repository,
        storage,
        clock: { now: () => now },
        random: () => 0.5,
        logger: { error: (record) => logs.push(record) },
      });
      for (let attempt = 1; attempt <= 8; attempt++) {
        await dispatcher.runOnce();
        const state = await f.runtime.repository.loadMedia(media.id);
        expect(state.status).toBe(attempt === 8 ? "delete_failed" : "deleting");
        if (attempt < 8) {
          const [lease] = await f.runtime.repository.claim({
            eventTypes: ["media.delete.requested"],
            limit: 1,
            now,
          });
          expect(lease).toBeUndefined();
          // Advance to the retry's deterministic scheduled time, without sleeping.
          now += Math.min(300000, 1000 * 2 ** (attempt - 1)) + 1;
        }
      }
      expect(failures).toHaveBeenCalledTimes(8);
      expect(JSON.stringify(logs)).not.toContain("private");
      expect(await storage.get(record.storageKey)).not.toBeNull();
      failures.mockRestore();
      await f.runtime.repository.retryDeletion({
        mediaId: media.id,
        requestedAt: ++now,
        requestedBy: { id: admin.id, role: "admin" },
      });
      await dispatcher.runOnce();
      expect(await f.runtime.repository.loadMedia(media.id)).toBeNull();
      expect(await storage.get(record.storageKey)).toBeNull();
    } finally {
      vi.restoreAllMocks();
      await f.close();
    }
  }, 120000);
}
