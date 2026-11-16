import { MEDIA_DELETE_REQUESTED, SITE_BUILD_REQUESTED } from "@lacecms/contracts/outbox";
import { mediaId, unixMilliseconds } from "@lacecms/domain";
import {
  type RepositoryContractCase,
  count,
  noModels,
  registerContract,
  seedMedia,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "retires invalid registered work and completes legacy candidates from the same pass",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: noModels });
    await seedMedia(sql, "legacy-media", "deleting");
    await seedMedia(sql, "related-media", "deleting");
    const build = {
      targetVersion: 0,
      reason: "media_metadata",
      requestedAt: 1,
      requestedBy: "admin",
    };
    for (const [id, type, payload] of [
      ["bad-build-json", SITE_BUILD_REQUESTED, "{"],
      [
        "bad-build-field",
        SITE_BUILD_REQUESTED,
        JSON.stringify({ ...build, publishedSnapshotId: "" }),
      ],
      ["bad-media-json", MEDIA_DELETE_REQUESTED, "{"],
      ["bad-media-field", MEDIA_DELETE_REQUESTED, '{"mediaId":"related-media","requestedBy":3}'],
      ["legacy-build", SITE_BUILD_REQUESTED, JSON.stringify({ ...build, extra: "ignored" })],
      ["legacy-media", MEDIA_DELETE_REQUESTED, '{"mediaId":"legacy-media","extra":"ignored"}'],
    ]) {
      await sql.run(
        "insert into outbox_events (id, type, payload_json, attempts, available_at, locked_at, locked_by, created_at) values (?, ?, ?, 2, 1, 1, 'expired', 1)",
        id,
        type,
        payload,
      );
    }

    const now = unixMilliseconds(60_001);
    const claimBuilds = () => repository.claimSiteBuilds({ limit: 10, now });
    const claimMedia = () =>
      repository.claim({ eventTypes: [MEDIA_DELETE_REQUESTED], limit: 10, now });
    const builds = await claimBuilds();
    const deletions = await claimMedia();
    expect(builds.map(({ event }) => event)).toEqual([
      {
        id: "legacy-build",
        type: SITE_BUILD_REQUESTED,
        attempts: 2,
        availableAt: 1,
        payload: build,
      },
    ]);
    expect(deletions.map(({ event }) => event)).toEqual([
      {
        id: "legacy-media",
        type: MEDIA_DELETE_REQUESTED,
        attempts: 2,
        availableAt: 1,
        payload: { mediaId: "legacy-media" },
      },
    ]);
    await repository.recordSiteBuildSuccess({ leaseId: builds[0]!.id, now });
    await repository.completeMediaDeletion({
      leaseId: deletions[0]!.id,
      mediaId: mediaId("legacy-media"),
      completedAt: now,
    });
    expect(await claimBuilds()).toEqual([]);
    expect(await claimMedia()).toEqual([]);
    expect(await count(sql, "select count(*) as count from site_builds")).toBe(1);
    expect(await sql.all("select id, status from media")).toEqual([
      { id: "related-media", status: "deleting" },
    ]);
    expect(
      await sql.all(
        "select id, attempts, processed_at, locked_at, locked_by, last_error from outbox_events where id like 'bad-%' order by id",
      ),
    ).toEqual(
      [
        ["bad-build-field", "invalid_build_event"],
        ["bad-build-json", "invalid_build_event"],
        ["bad-media-field", "invalid_media_deletion_event"],
        ["bad-media-json", "invalid_media_deletion_event"],
      ].map(([id, last_error]) => ({
        id,
        last_error,
        attempts: 3,
        processed_at: now,
        locked_at: null,
        locked_by: null,
      })),
    );
  },
);
