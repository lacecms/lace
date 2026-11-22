import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { ExpectStatic } from "vitest";
import {
  collectMediaBytes,
  CompleteImageContainerInspector,
  MediaUseCases,
} from "@lacecms/application";
import type { OperationalError, PutObjectInput } from "@lacecms/application";
import { DomainError, mediaId, unixMilliseconds } from "@lacecms/domain";
import { InMemoryObjectStorage } from "../../adapters/fakes.js";
import { bytesStream } from "../../shared/assertions.js";
import { editor, noModels, registerContract, seedMedia } from "../shared.js";
import { viewer } from "../../fixtures/actors.js";
import type { ContractRepository, ContractSql, RepositoryContractCase } from "../shared.js";
import { rejectMediaTagInsert } from "./fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

const uploadId = mediaId("upload-1");
const storageKey = `media/${uploadId}`;
const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64",
  ),
);
const uploadSha256 = createHash("sha256").update(png).digest("hex");
const tags = ["birch", "ibiza"];
const isMediaReload = (sql: string) => sql.includes("from media m where m.id = ? limit 1");
const isOwnershipRead = (sql: string) => sql.includes("where id = ? or storage_key = ?");

class UploadStorage extends InMemoryObjectStorage {
  public puts = 0;
  public deletes = 0;

  public override async put(input: PutObjectInput) {
    this.puts++;
    return super.put(input);
  }

  public override async delete(key: string) {
    this.deletes++;
    await super.delete(key);
  }
}

function uploadFixture(repository: ContractRepository) {
  const storage = new UploadStorage();
  const logs: OperationalError[] = [];
  const media = new MediaUseCases({
    clock: { now: () => unixMilliseconds(5) },
    idGenerator: { next: () => uploadId },
    imageInspector: new CompleteImageContainerInspector(),
    logger: {
      error: (event) => {
        logs.push(event);
      },
    },
    media: repository,
    storage,
  });
  return {
    logs,
    media,
    storage,
    upload: () =>
      media.create({
        actor: editor,
        body: bytesStream(png),
        filename: "upload.png",
        tags: [" Birch ", "IBIZA", "birch"],
      }),
  };
}

async function expectCommittedUpload(
  sql: ContractSql,
  { media, storage }: ReturnType<typeof uploadFixture>,
  expect: ExpectStatic,
) {
  expect(await sql.all("select id, storage_key, status, sha256 from media")).toEqual([
    { id: uploadId, storage_key: storageKey, status: "active", sha256: uploadSha256 },
  ]);
  expect(
    await sql.all("select tag from media_tags where media_id = ? order by tag", uploadId),
  ).toEqual(tags.map((tag) => ({ tag })));
  await expect(
    media.list({ actor: viewer, limit: 10, sha256: uploadSha256 }),
  ).resolves.toMatchObject({
    items: [{ id: uploadId, status: "active", sha256: uploadSha256, tags }],
  });
  const stored = await media.preview({ actor: viewer, mediaId: uploadId });
  expect(stored === null ? null : await collectMediaBytes(stored.body)).toEqual(png);
  expect(storage.puts).toBe(1);
  expect(storage.deletes).toBe(0);
}

contract("keeps stored upload bytes after the repository reload fails", async (runtime, expect) => {
  const readError = new Error("injected repository media reload failure");
  let reads = 0;
  const { repository, sql } = await runtime.open({
    resolveModel: noModels,
    beforePrepare(statement) {
      if (isMediaReload(statement) && ++reads === 1) throw readError;
    },
  });
  const fixture = uploadFixture(repository);

  await expect(fixture.upload()).rejects.toBe(readError);
  expect(reads).toBe(1);
  expect(fixture.logs).toEqual([]);
  await expectCommittedUpload(sql, fixture, expect);
});

contract(
  "reports direct media create outcomes at the write and reload boundaries",
  async (runtime, expect) => {
    const readError = new Error("injected reload failure");
    const acknowledgmentError = new Error("injected acknowledgment loss");
    let fault: "read" | "acknowledgment" | undefined;
    const { repository, sql } = await runtime.open({
      resolveModel: noModels,
      beforePrepare(statement) {
        if (fault === "read" && isMediaReload(statement)) throw readError;
      },
      afterWrite() {
        if (fault === "acknowledgment") throw acknowledgmentError;
      },
    });
    const sha256 = "a".repeat(64);
    const create = (name: string) =>
      repository.createMedia({
        id: mediaId(name),
        storageKey: `media/${name}`,
        filename: "upload.png",
        mimeType: "image/png",
        size: png.byteLength,
        width: 1,
        height: 1,
        createdAt: unixMilliseconds(5),
        createdBy: editor.id,
        sha256,
        tags,
      });

    await expect(create("ok")).resolves.toMatchObject({ id: "ok", status: "active", sha256, tags });
    fault = "read";
    await expect(create("read")).rejects.toMatchObject({ outcome: "committed", cause: readError });
    fault = "acknowledgment";
    await expect(create("ack")).rejects.toMatchObject({
      outcome: expect.stringMatching(/^unknown(?:-settled)?$/u),
      cause: acknowledgmentError,
      operationError: { code: "CONTENT_INVALID_STATE" },
    });
    expect(await sql.all("select id from media order by id")).toEqual([
      { id: "ack" },
      { id: "ok" },
      { id: "read" },
    ]);
  },
);

contract(
  "checks upload ownership by both indexed identities across media statuses",
  async (runtime, expect) => {
    const { reads, repository, sql } = await runtime.open({ resolveModel: noModels });
    const id = mediaId(uploadId);
    const other = mediaId("other");
    await expect(repository.checkMediaUploadOwnership(id, storageKey)).resolves.toBe("absent");
    await seedMedia(sql, id, "deleting");
    await seedMedia(sql, other, "delete_failed");
    reads.reset();
    await expect(repository.checkMediaUploadOwnership(id, storageKey)).resolves.toBe("matching");
    const observed = reads.snapshot();
    expect(observed.statements).toBe(1);
    const statement = observed.sql.find(isOwnershipRead)!;
    const plan = await sql.all<{ detail: string }>(
      `explain query plan ${statement}`,
      id,
      storageKey,
    );
    expect(plan.filter(({ detail }) => detail.includes("SEARCH media USING INDEX"))).toHaveLength(
      2,
    );
    await expect(repository.checkMediaUploadOwnership(other, `media/${other}`)).resolves.toBe(
      "matching",
    );
    await expect(repository.checkMediaUploadOwnership(id, `media/${other}`)).resolves.toBe(
      "conflicting",
    );
    await expect(repository.checkMediaUploadOwnership(id, "media/missing")).resolves.toBe(
      "conflicting",
    );
    await expect(
      repository.checkMediaUploadOwnership(mediaId("missing"), storageKey),
    ).resolves.toBe("conflicting");
  },
);

contract("removes stored upload bytes after the tag insert rolls back", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: noModels });
  await sql.run(rejectMediaTagInsert);
  const { logs, storage, upload } = uploadFixture(repository);

  await expect(upload()).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(await sql.all("select id, sha256 from media")).toEqual([]);
  expect(await sql.all("select * from media_tags")).toEqual([]);
  expect(await storage.get(storageKey)).toBeNull();
  expect(storage.puts).toBe(1);
  expect(storage.deletes).toBe(1);
  expect(logs).toEqual([{ code: "MEDIA_METADATA_CREATE_FAILED", storageKey }]);
});

for (const failOwnershipRead of [false, true]) {
  const scenario = failOwnershipRead
    ? "when reconciliation fails"
    : "when reconciliation finds the row";
  contract(
    `keeps committed upload bytes after lost acknowledgment ${scenario}`,
    async (runtime, expect) => {
      const acknowledgmentError = new DomainError(
        "CONTENT_INVALID_STATE",
        "injected acknowledgment loss",
      );
      let fault = true;
      let writes = 0;
      let checks = 0;
      const { repository, sql } = await runtime.open({
        resolveModel: noModels,
        beforePrepare(statement) {
          if (!isOwnershipRead(statement)) return;
          checks++;
          if (fault && failOwnershipRead) throw new Error("injected ownership read failure");
        },
        afterWrite() {
          writes++;
          if (fault) throw acknowledgmentError;
        },
      });
      const fixture = uploadFixture(repository);
      await expect(fixture.upload()).rejects.toBe(acknowledgmentError);
      fault = false;

      expect(writes).toBe(1);
      expect(checks).toBe(1);
      expect(fixture.logs).toEqual(
        failOwnershipRead ? [{ code: "MEDIA_METADATA_CREATE_OUTCOME_UNRESOLVED", storageKey }] : [],
      );
      await expectCommittedUpload(sql, fixture, expect);
    },
  );
}

contract(
  "keeps committed upload bytes after the application catalog read fails",
  async (runtime, expect) => {
    const catalogError = new Error("injected application catalog read failure");
    let catalogReads = 0;
    const { repository, sql } = await runtime.open({
      resolveModel: noModels,
      beforePrepare(statement) {
        if (
          statement.includes(
            "left join content_actor_profiles profile on profile.actor_id = m.created_by",
          ) &&
          statement.includes("where m.id = ? limit 1") &&
          ++catalogReads === 1
        )
          throw catalogError;
      },
    });
    const fixture = uploadFixture(repository);
    await expect(fixture.upload()).rejects.toBe(catalogError);
    expect(catalogReads).toBe(1);
    await expectCommittedUpload(sql, fixture, expect);
  },
);
