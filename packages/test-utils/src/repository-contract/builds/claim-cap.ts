import {
  DISPATCHER_LEASE_DURATION_MS,
  MAX_DISPATCHER_CLAIMS_PER_CALL,
  MAX_SITE_BUILD_CLAIMS_PER_CALL,
} from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import {
  type ContractSql,
  type RepositoryContractCase,
  noModels,
  registerContract,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

/** Every seeded lease (locked at 1) has expired by then. */
const EXPIRED = DISPATCHER_LEASE_DURATION_MS + 100;

/** Zero-padded ids keep identifier order equal to availability order. */
function eventId(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(2, "0")}`;
}

async function seedEvents(
  sql: ContractSql,
  prefix: string,
  type: string,
  available: number,
  payload: (index: number) => string,
): Promise<readonly string[]> {
  const ids: string[] = [];
  for (let index = 0; index < available; index += 1) {
    const id = eventId(prefix, index);
    // Expired leases from a lost worker: several site-build events can then be
    // pending at once (only one unlocked one can), each with its own time.
    await sql.run(
      "insert into outbox_events (id, type, payload_json, attempts, available_at, locked_at, locked_by, created_at) values (?, ?, ?, 0, ?, 1, 'lost-worker', 1)",
      id,
      type,
      payload(index),
      index + 1,
    );
    ids.push(id);
  }
  return ids;
}

contract(
  "caps site-build and dispatcher claims per call and leaves the rest claimable",
  async (runtime, expect) => {
    expect(MAX_SITE_BUILD_CLAIMS_PER_CALL).toBe(10);
    expect(MAX_DISPATCHER_CLAIMS_PER_CALL).toBe(20);
    const { repository, sql } = await runtime.open({ resolveModel: noModels });
    // One more available event than a single call may claim.
    const buildCount = MAX_SITE_BUILD_CLAIMS_PER_CALL + 1;
    const builds = await seedEvents(sql, "build", "site.build.requested", buildCount, (index) =>
      JSON.stringify({
        publishedSnapshotId: null,
        reason: "manual",
        requestedAt: index + 1,
        requestedBy: "admin",
        targetVersion: 0,
      }),
    );
    const firstBuilds = await repository.claimSiteBuilds({
      limit: 50,
      now: unixMilliseconds(EXPIRED),
    });
    expect(firstBuilds.map((lease) => lease.buildId)).toEqual(
      builds.slice(0, MAX_SITE_BUILD_CLAIMS_PER_CALL),
    );
    const restBuilds = await repository.claimSiteBuilds({
      limit: 50,
      now: unixMilliseconds(EXPIRED + 1),
    });
    expect(restBuilds.map((lease) => lease.buildId)).toEqual(
      builds.slice(MAX_SITE_BUILD_CLAIMS_PER_CALL),
    );
    expect(
      await sql.get<{ count: number }>(
        "select count(*) as count from site_builds where status = 'running'",
      ),
    ).toEqual({ count: buildCount });

    const events = await seedEvents(
      sql,
      "custom",
      "custom.event",
      MAX_DISPATCHER_CLAIMS_PER_CALL + 1,
      () => "{}",
    );
    const firstEvents = await repository.claim({
      eventTypes: ["custom.event"],
      limit: 50,
      now: unixMilliseconds(EXPIRED + 2),
    });
    expect(firstEvents.map((lease) => lease.event.id)).toEqual(
      events.slice(0, MAX_DISPATCHER_CLAIMS_PER_CALL),
    );
    const restEvents = await repository.claim({
      eventTypes: ["custom.event"],
      limit: 50,
      now: unixMilliseconds(EXPIRED + 3),
    });
    expect(restEvents.map((lease) => lease.event.id)).toEqual(
      events.slice(MAX_DISPATCHER_CLAIMS_PER_CALL),
    );
  },
);
