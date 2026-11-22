import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  DISPATCHER_LEASE_DURATION_MS,
  SITE_BUILD_DEBOUNCE_MS,
  siteBuildEvent,
} from "@lacecms/application";
import type { SiteBuildTrigger, SiteBuildWorkLease } from "@lacecms/application";
import { actorId, unixMilliseconds } from "@lacecms/domain";
import {
  migrateNodeDatabase,
  NodeBuilderSiteBuildTrigger,
  NodeContentRepository,
  NodeSiteBuildDispatcher,
  openNodeDatabase,
} from "@lacecms/platform-node";
import { startDispatchLoop } from "./dispatcher-loop.js";

let directory: string;
let path: string;
const connections: ReturnType<typeof openNodeDatabase>["connection"][] = [];
const clock = { now: () => unixMilliseconds(Date.now()) };

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "lace-vps-build-dispatch-"));
  path = join(directory, "lace.sqlite");
  migrateNodeDatabase(path);
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});

afterEach(async () => {
  vi.useRealTimers();
  for (const connection of connections.splice(0)) {
    if (connection.open) connection.close();
  }
  await rm(directory, { recursive: true, force: true });
});

function connect() {
  const { connection } = openNodeDatabase(path);
  connections.push(connection);
  return { connection, work: new NodeContentRepository(connection, () => undefined) };
}

async function requestBuild(work: NodeContentRepository) {
  const requestedBy = { id: actorId("admin"), role: "admin" as const };
  const requestedAt = clock.now();
  return work.requestBuild({
    events: [
      siteBuildEvent({
        reason: "manual",
        publishedSnapshotId: null,
        requestedBy: requestedBy.id,
        requestedAt,
      }),
    ],
    requestedAt,
    requestedBy,
  });
}

function fakeBuilder(holdBuildId: string, held: Promise<void>) {
  const calls: string[] = [];
  const trigger = new NodeBuilderSiteBuildTrigger({
    baseUrl: new URL("http://builder:8788/"),
    secret: "s".repeat(32),
    fetch: async (_url, init) => {
      const { buildId } = JSON.parse(String(init?.body)) as { buildId: string };
      calls.push(buildId);
      if (buildId === holdBuildId) await held;
      return Response.json({ status: "succeeded", log: "Static build succeeded." });
    },
  });
  return { calls, trigger };
}

function startPoll(work: NodeContentRepository, trigger: SiteBuildTrigger) {
  const onError = vi.fn();
  const loop = startDispatchLoop({
    buildDispatcher: new NodeSiteBuildDispatcher({
      clock,
      logger: { error: vi.fn() },
      trigger,
      work,
    }),
    media: async () => {},
    onError,
  });
  return { close: loop.close, onError };
}

async function prepareBacklog() {
  const previous = connect();
  const first = await requestBuild(previous.work);
  vi.setSystemTime(clock.now() + SITE_BUILD_DEBOUNCE_MS);
  const [lease] = await previous.work.claimSiteBuilds({ limit: 1, now: clock.now() });
  expect(lease?.buildId).toBe(first.eventId);
  const second = await requestBuild(previous.work);
  expect(second.eventId).not.toBe(first.eventId);
  previous.connection.close();

  vi.setSystemTime(lease!.expiresAt + 1);
  return { first, second };
}

test("a restarted VPS poller invokes each due build once behind a long build", async () => {
  const { first, second } = await prepareBacklog();
  const restartedAt = clock.now();
  const { connection, work } = connect();
  const held = Promise.withResolvers<void>();
  const { calls, trigger } = fakeBuilder(first.eventId, held.promise);
  const loop = startPoll(work, trigger);
  try {
    await vi.advanceTimersByTimeAsync(DISPATCHER_LEASE_DURATION_MS + 1);
    expect(calls).toEqual([first.eventId]);
    const lock = connection.prepare("select locked_at, locked_by from outbox_events where id = ?");
    expect(lock.get(first.eventId)).toEqual({
      locked_at: restartedAt + DISPATCHER_LEASE_DURATION_MS,
      locked_by: expect.any(String),
    });
    const secondLockWhileBusy = lock.get(second.eventId);
    const secondBuildWhileBusy = connection
      .prepare("select status from site_builds where id = ?")
      .get(second.eventId);

    held.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    const buildStatus = connection.prepare("select status from site_builds where id = ?");
    const eventStatus = connection.prepare(
      "select attempts, processed_at, locked_by from outbox_events where id = ?",
    );
    expect([buildStatus.get(first.eventId), buildStatus.get(second.eventId)]).toEqual([
      { status: "succeeded" },
      { status: "succeeded" },
    ]);
    for (const { eventId } of [first, second]) {
      expect(eventStatus.get(eventId)).toEqual({
        attempts: 0,
        processed_at: expect.any(Number),
        locked_by: null,
      });
    }
    await vi.advanceTimersByTimeAsync(DISPATCHER_LEASE_DURATION_MS + 1);
    expect({
      secondLockWhileBusy,
      secondBuildWhileBusy,
      calls,
      errors: loop.onError.mock.calls,
    }).toEqual({
      secondLockWhileBusy: { locked_at: null, locked_by: null },
      secondBuildWhileBusy: undefined,
      calls: [first.eventId, second.eventId],
      errors: [],
    });
  } finally {
    held.resolve();
    await loop.close();
  }
});

test("a peer VPS poller takes the next build while the first poller is busy", async () => {
  const { first, second } = await prepareBacklog();
  const owner = connect();
  const peer = connect();
  const held = Promise.withResolvers<void>();
  const { calls, trigger } = fakeBuilder(first.eventId, held.promise);
  const ownerLoop = startPoll(owner.work, trigger);
  try {
    await vi.advanceTimersByTimeAsync(DISPATCHER_LEASE_DURATION_MS + 1);
    expect(calls).toEqual([first.eventId]);
    const peerLoop = startPoll(peer.work, trigger);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toEqual([first.eventId, second.eventId]);
      expect(
        peer.connection.prepare("select id, status from site_builds order by requested_at").all(),
      ).toEqual([
        { id: first.eventId, status: "running" },
        { id: second.eventId, status: "succeeded" },
      ]);
      expect(peerLoop.onError).not.toHaveBeenCalled();
    } finally {
      await peerLoop.close();
    }
    held.resolve();
    await vi.advanceTimersByTimeAsync(DISPATCHER_LEASE_DURATION_MS + 1);
    expect(calls).toEqual([first.eventId, second.eventId]);
    expect(ownerLoop.onError).not.toHaveBeenCalled();
  } finally {
    held.resolve();
    await ownerLoop.close();
  }
});

test("a replacement poller recovers a build after expiry while the old holder is paused before trigger", async () => {
  const owner = connect();
  const peer = connect();
  const queued = await requestBuild(owner.work);
  vi.setSystemTime(clock.now() + SITE_BUILD_DEBOUNCE_MS);

  const acquired = Promise.withResolvers<readonly SiteBuildWorkLease[]>();
  const resume = Promise.withResolvers<void>();
  const claim = owner.work.claimSiteBuilds.bind(owner.work);
  vi.spyOn(owner.work, "claimSiteBuilds").mockImplementationOnce(async (input) => {
    const leases = await claim(input);
    acquired.resolve(leases);
    await resume.promise;
    return leases;
  });
  const held = Promise.withResolvers<void>();
  const { calls, trigger } = fakeBuilder(queued.eventId, held.promise);
  const ownerPass = new NodeSiteBuildDispatcher({
    clock,
    logger: { error: vi.fn() },
    trigger,
    work: owner.work,
  }).runOnce(1);
  let peerLoop: ReturnType<typeof startPoll> | undefined;
  try {
    const [lease] = await acquired.promise;
    expect(lease?.buildId).toBe(queued.eventId);
    vi.setSystemTime(lease!.expiresAt - 1_000);
    peerLoop = startPoll(peer.work, trigger);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(clock.now()).toBe(lease!.expiresAt);
    expect(calls).toEqual([queued.eventId]);
    const event = peer.connection.prepare(
      "select attempts, locked_at, locked_by, processed_at from outbox_events where id = ?",
    );
    const recovered = event.get(queued.eventId);
    expect(recovered).toEqual({
      attempts: 0,
      locked_at: lease!.expiresAt,
      locked_by: expect.any(String),
      processed_at: null,
    });
    expect(recovered).not.toMatchObject({ locked_by: lease!.id });

    resume.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([queued.eventId]);
    await ownerPass;
    await expect(
      owner.work.recordSiteBuildSuccess({ leaseId: lease!.id, now: clock.now() }),
    ).rejects.toThrow("expired");
    expect(event.get(queued.eventId)).toEqual(recovered);

    held.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(event.get(queued.eventId)).toEqual({
      attempts: 0,
      locked_at: null,
      locked_by: null,
      processed_at: clock.now(),
    });
    expect(await peer.work.getSiteBuild(lease!.buildId)).toMatchObject({ status: "succeeded" });
    expect(peerLoop.onError).not.toHaveBeenCalled();
  } finally {
    resume.resolve();
    held.resolve();
    await ownerPass;
    await peerLoop?.close();
  }
});
