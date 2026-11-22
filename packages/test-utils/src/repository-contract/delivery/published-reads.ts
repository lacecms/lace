import { contentModelKey } from "@lacecms/domain";
import type { PublicGlobalContent } from "@lacecms/application";
import type { ExpectStatic } from "vitest";
import type { RepositoryContractCase } from "../shared.js";
import { entry, publish, registerContract, resolveRoute } from "../shared.js";
import {
  publishedSubjectId,
  publishedSubjectPath,
  saveDraftOnlyValues,
  seedPublishedSubject,
  stageLargeDraft,
  stageNewPublication,
} from "./published-fixtures.js";
import { openPublicReadOverlap, publicReadTimings } from "./published-overlap.js";

declare const TextEncoder: new () => { encode(input: string): Uint8Array };

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

function expectPublication(
  expect: ExpectStatic,
  result: PublicGlobalContent | null | undefined,
  version: "old" | "new",
) {
  const at = version === "old" ? 10 : 30;
  expect(result?.entry.published).toMatchObject({
    createdAt: at,
    fields: {
      image: `image-${version}`,
      text: `${version} fields`,
      url: `entry:target-${version}`,
    },
    title: `${version} title`,
  });
  const keys = version === "old" ? ["alpha", "beta"] : ["beta", "alpha"];
  expect(
    result?.entry.published?.blocks.map(({ key, data, settings }) => ({ key, data, settings })),
  ).toEqual(
    keys.map((key) => ({
      key,
      data: { image: `image-${version}`, title: `${version} ${key}` },
      settings: { note: version },
    })),
  );
  expect(result?.internalLinks).toEqual([
    { sourceKey: "$fields", area: "fields", pointer: "/url", targetId: `target-${version}` },
  ]);
  expect(result?.media.map((item) => item.id)).toEqual([`image-${version}`]);
}

contract("a public path read stays complete across republication", async (runtime, expect) => {
  for (const timing of publicReadTimings(runtime)) {
    const { repository, writer, sql, overlap } = await openPublicReadOverlap(runtime, expect);
    await seedPublishedSubject(writer, sql, "posts");
    const republish = await stageNewPublication(writer, "posts");
    const read = () => repository.loadPublic(publishedSubjectPath);
    const oldBody = await read();
    expectPublication(expect, oldBody, "old");
    const overlapped = await overlap(read, republish, timing);
    const newBody = await read();
    expectPublication(expect, newBody, "new");
    expect(overlapped).toEqual(timing === "after" ? oldBody : newBody);
  }
});

contract("public payload size is independent of the draft", async (runtime, expect) => {
  const encoder = new TextEncoder();
  const resultRows: Record<string, unknown>[] = [];
  const { repository, reopen, sql, reads } = await runtime.open({
    resolveModel: resolveRoute,
    afterRead: (rows) => {
      resultRows.push(...(rows as Record<string, unknown>[]));
    },
  });
  const writer = reopen();
  await seedPublishedSubject(writer, sql, "posts");
  const measure = async () => {
    const draftBlocks = (await sql.get<{ total: number }>(
      "select count(*) as total from content_blocks where snapshot_id='subject-draft'",
    ))!.total;
    resultRows.length = 0;
    reads.reset();
    const body = await repository.loadPublic(publishedSubjectPath);
    const { rowsRead, statements, batches, maxParameters } = reads.snapshot();
    const bytes = (rows: readonly Record<string, unknown>[]) =>
      rows
        .flatMap((row) => Object.values(row))
        .reduce<number>(
          (sum, value) => sum + (typeof value === "string" ? encoder.encode(value).byteLength : 0),
          0,
        );
    const draftRows = resultRows.filter(
      (row) => row.id === "subject-draft" || row.snapshot_id === "subject-draft",
    );
    return {
      body,
      draftBlocks,
      resultRows: resultRows.length,
      payloadBytes: bytes(resultRows),
      draftRows: draftRows.length,
      draftBytes: bytes(draftRows),
      rowsRead,
      statements,
      batches,
      maxParameters,
    };
  };
  const { body: smallBody, ...small } = await measure();
  await stageLargeDraft(writer, 1);
  const { body: largeBody, ...large } = await measure();
  expect(largeBody).toEqual(smallBody);
  expect(small.draftBlocks).toBe(3);
  expect(large.draftBlocks).toBe(64);
  expect(small).toMatchObject({ resultRows: 5, draftRows: 0, draftBytes: 0, statements: 4 });
  expect(large).toEqual({ ...small, draftBlocks: 64 });
  runtime.recordEvidence?.({ publicRead: { small, large } });
});

for (const [family, model] of [
  ["routed", "posts"],
  ["route-less", "testimonials"],
] as const) {
  contract(
    `a ${family} public list keeps its membership, payload and cursor coherent`,
    async (runtime, expect) => {
      for (const timing of publicReadTimings(runtime)) {
        for (const phase of ["first", "continuation"]) {
          const { repository, writer, sql, overlap } = await openPublicReadOverlap(runtime, expect);
          await seedPublishedSubject(writer, sql, model);
          for (const [id, at] of [
            ["leader", 20],
            ["tail", 5],
          ] as const) {
            await writer.create({
              entry: entry(id, model, { updatedAt: 1, ...(model === "posts" ? { slug: id } : {}) }),
              mediaReferences: [],
            });
            await writer.publish(publish(id, 1, at));
          }
          const list =
            model === "posts"
              ? repository.listPublic.bind(repository)
              : repository.listPublicRecords.bind(repository);
          const input = { limit: 1, modelKey: contentModelKey(model) };
          const oldFirst = await list(input);
          expect(oldFirst.items.map((item) => item.entry.id)).toEqual(["leader"]);
          expect(oldFirst.nextCursor).toBeDefined();
          const nextInput = { ...input, after: oldFirst.nextCursor! };
          const oldNext = await list(nextInput);
          expect(oldNext.items.map((item) => item.entry.id)).toEqual([publishedSubjectId]);
          expectPublication(expect, oldNext.items[0], "old");

          const republish = await stageNewPublication(writer, model);
          const overlapped = await overlap(
            () => list(phase === "first" ? input : nextInput),
            republish,
            timing,
          );
          const newFirst = await list(input);
          const newNext = await list(nextInput);
          const before = phase === "first" ? oldFirst : oldNext;
          const after = phase === "first" ? newFirst : newNext;
          expect(overlapped).toEqual(timing === "after" ? before : after);
          expect(newFirst.items.map((item) => item.entry.id)).toEqual([publishedSubjectId]);
          expectPublication(expect, newFirst.items[0], "new");
          expect(newFirst.nextCursor).toBeDefined();
          expect(newFirst.nextCursor).not.toBe(oldFirst.nextCursor);
          expect(newNext.items.map((item) => item.entry.id)).toEqual(["tail"]);
          expect(newNext.items[0]?.media).toEqual([]);
          expect(newNext.items[0]?.internalLinks).toEqual([]);
          expect(newNext.nextCursor).not.toBe(oldNext.nextCursor);
          expect(await list({ ...input, after: newFirst.nextCursor! })).toEqual(oldFirst);

          await saveDraftOnlyValues(writer, model);
          expect(await list(input)).toEqual(newFirst);
          expect(await list(nextInput)).toEqual(newNext);
        }
      }
    },
  );
}

contract("a public global read stays complete across republication", async (runtime, expect) => {
  for (const timing of publicReadTimings(runtime)) {
    const { repository, writer, sql, overlap } = await openPublicReadOverlap(runtime, expect);
    await seedPublishedSubject(writer, sql, "settings");
    const read = () => repository.loadPublicGlobal(contentModelKey("settings"));
    const oldBody = await read();
    expectPublication(expect, oldBody, "old");
    const republish = await stageNewPublication(writer, "settings");
    const overlapped = await overlap(read, republish, timing);
    const newBody = await read();
    expectPublication(expect, newBody, "new");
    expect(overlapped).toEqual(timing === "after" ? oldBody : newBody);
    await saveDraftOnlyValues(writer, "settings");
    expect(await read()).toEqual(newBody);
  }
});
