import {
  MEDIA_DELETE_REQUESTED,
  SITE_BUILD_REQUESTED,
  outboxEvents,
} from "@lacecms/contracts/outbox";
import { mediaId, unixMilliseconds } from "@lacecms/domain";
import {
  type RepositoryContractCase,
  admin,
  noModels,
  registerContract,
  seedMedia,
  sequence,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract("rolls back media deletion at the enqueue checkpoint", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({
    resolveModel: noModels,
    beforeMutation: (checkpoint) => {
      if (checkpoint === "media.outbox") throw new Error("injected");
    },
  });
  await seedMedia(sql, "rollback", "active");
  await expect(
    repository.markForDeletion({
      mediaId: mediaId("rollback"),
      requestedAt: unixMilliseconds(3),
      requestedBy: admin,
      events: [
        {
          type: MEDIA_DELETE_REQUESTED,
          requestedAt: 3,
          payload: { mediaId: "rollback", requestedBy: admin.id },
        },
      ],
    }),
  ).rejects.toThrow();
  expect(await sql.get("select status from media where id = 'rollback'")).toEqual({
    status: "active",
  });
  expect(await sql.all("select * from outbox_events")).toEqual([]);
});

contract(
  "validates and atomically enqueues distinct media deletions and retries",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("enqueue"),
      resolveModel: noModels,
    });
    await seedMedia(sql, "first", "active");
    await seedMedia(sql, "second", "active");
    await seedMedia(sql, "retry", "delete_failed");

    const request = (id: string, at: number) => ({
      events: [
        {
          type: "media.delete.requested" as const,
          requestedAt: unixMilliseconds(at),
          payload: { mediaId: mediaId(id), requestedBy: admin.id },
        },
      ],
      mediaId: mediaId(id),
      requestedAt: unixMilliseconds(at),
      requestedBy: admin,
    });
    const media = (id: string) => sql.get("select status from media where id = ?", id);
    const events = () =>
      sql.all<{ id: string; type: string; available_at: number; payload_json: string }>(
        "select id, type, available_at, payload_json from outbox_events order by available_at",
      );

    const invalidActor = { ...admin, id: "" as typeof admin.id };
    await expect(
      repository.markForDeletion({
        ...request("first", 1),
        requestedBy: invalidActor,
        events: [
          {
            type: MEDIA_DELETE_REQUESTED,
            requestedAt: 1,
            payload: { mediaId: "first", requestedBy: invalidActor.id },
          },
        ],
      }),
    ).rejects.toThrow();
    await expect(
      repository.requestBuild({
        events: [
          {
            type: "site.build.requested" as const,
            requestedAt: unixMilliseconds(1),
            payload: {
              reason: "manual",
              requestedAt: unixMilliseconds(1),
              requestedBy: invalidActor.id,
              publishedSnapshotId: null,
            },
          },
        ],
        requestedAt: unixMilliseconds(1),
        requestedBy: invalidActor,
      }),
    ).rejects.toThrow();
    expect(await media("first")).toEqual({ status: "active" });
    expect(await events()).toEqual([]);

    await sql.run(
      "create trigger reject_enqueue before insert on outbox_events begin select raise(abort, 'late enqueue failure'); end",
    );
    await expect(repository.markForDeletion(request("first", 2))).rejects.toThrow();
    await expect(repository.retryDeletion(request("retry", 2))).rejects.toThrow();
    expect(await media("first")).toEqual({ status: "active" });
    expect(await media("retry")).toEqual({ status: "delete_failed" });
    expect(await events()).toEqual([]);
    await sql.run("drop trigger reject_enqueue");

    await repository.markForDeletion(request("first", 3));
    await repository.markForDeletion(request("second", 4));
    await repository.retryDeletion(request("retry", 5));
    const queued = await events();
    expect(new Set(queued.map(({ id }) => id)).size).toBe(3);
    expect(
      queued.map(({ type, available_at, payload_json }) => ({
        type,
        availableAt: available_at,
        payload: outboxEvents[MEDIA_DELETE_REQUESTED].decodeJson(payload_json),
      })),
    ).toEqual(
      ["first", "second", "retry"].map((id, index) => ({
        type: MEDIA_DELETE_REQUESTED,
        availableAt: index + 3,
        payload: { mediaId: id, requestedBy: admin.id },
      })),
    );
  },
);

contract("coalesces a valid build over unusable pending retry lineage", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({
    nextId: sequence("build-replacement"),
    resolveModel: noModels,
  });
  const request = (at: number) =>
    repository.requestBuild({
      events: [
        {
          type: "site.build.requested" as const,
          requestedAt: unixMilliseconds(at),
          payload: {
            reason: "manual",
            requestedAt: unixMilliseconds(at),
            requestedBy: admin.id,
            publishedSnapshotId: null,
          },
        },
      ],
      requestedAt: unixMilliseconds(at),
      requestedBy: admin,
    });
  const first = await request(10);
  expect(first).toMatchObject({ coalesced: false, targetVersion: 0 });
  await sql.run(
    "insert into published_state (singleton_key, version, updated_at) values (1, 7, 11)",
  );

  for (const [index, payload] of ["{", '{"retryOfBuildId":""}', '{"retryOfBuildId":3}'].entries()) {
    await sql.run(
      "update outbox_events set payload_json = ?, attempts = 3 where id = ?",
      payload,
      first.eventId,
    );
    const requestedAt = 20 + index;
    const receipt = await request(requestedAt);
    expect(receipt).toEqual({ coalesced: true, eventId: first.eventId, targetVersion: 7 });
    const row = await sql.get<{ attempts: number; available_at: number; payload_json: string }>(
      "select attempts, available_at, payload_json from outbox_events where id = ?",
      receipt.eventId,
    );
    expect(row).toMatchObject({ attempts: 3, available_at: requestedAt + 5_000 });
    expect(outboxEvents[SITE_BUILD_REQUESTED].decodeJson(row!.payload_json)).toEqual({
      publishedSnapshotId: null,
      reason: "manual",
      requestedBy: admin.id,
      requestedAt,
      targetVersion: receipt.targetVersion,
    });
  }

  const insert =
    "insert into outbox_events (id, type, payload_json, available_at, created_at) values (?, ?, '{}', 1, 1)";
  await expect(sql.run(insert, "duplicate", SITE_BUILD_REQUESTED)).rejects.toThrow();
  await sql.run("update outbox_events set locked_at = 1 where id = ?", first.eventId);
  await sql.run(insert, "next", SITE_BUILD_REQUESTED);
  expect(await sql.get("select id from outbox_events where locked_at is null")).toEqual({
    id: "next",
  });
});
