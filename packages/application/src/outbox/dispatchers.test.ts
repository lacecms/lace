import { siteBuildId, unixMilliseconds } from "@lacecms/domain";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type {
  SiteBuildDispatchPort,
  SiteBuildTrigger,
  SiteBuildWorkLease,
} from "../ports/builds.js";
import { dispatcherEventId, dispatcherLeaseId } from "../shared/brands.js";
import { DISPATCHER_LEASE_DURATION_MS } from "../shared/limits.js";
import { buildWorkPort } from "../test-support/build-port.js";
import { SiteBuildDispatcher } from "./dispatchers.js";

const start = 1_000;
const expiry = start + DISPATCHER_LEASE_DURATION_MS;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(start);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function lease(id: string): SiteBuildWorkLease {
  return {
    id: dispatcherLeaseId(`lease-${id}`),
    buildId: siteBuildId(id),
    targetVersion: 3,
    expiresAt: unixMilliseconds(expiry),
    event: {
      id: dispatcherEventId(id),
      type: "site.build.requested",
      availableAt: unixMilliseconds(start),
      payload: {},
      attempts: 2,
    },
  };
}

function dispatcherFixture(
  input: Pick<SiteBuildDispatchPort, "claimSiteBuilds" | "renewSiteBuildLease">,
) {
  const success = vi.fn<SiteBuildDispatchPort["recordSiteBuildSuccess"]>();
  const accepted = vi.fn<SiteBuildDispatchPort["recordSiteBuildAccepted"]>();
  const tracking = vi.fn<SiteBuildDispatchPort["recordSiteBuildTracking"]>();
  const failure = vi.fn<SiteBuildDispatchPort["recordSiteBuildFailure"]>();
  const trigger = vi.fn<SiteBuildTrigger["trigger"]>(async () => ({ status: "succeeded" }));
  const heartbeat = vi.spyOn(globalThis, "setInterval");
  const random = vi.fn(() => 0);
  const logger = { error: vi.fn() };
  const dispatcher = new SiteBuildDispatcher({
    clock: { now: () => unixMilliseconds(Date.now()) },
    logger,
    random,
    trigger: { trigger },
    work: buildWorkPort({
      ...input,
      recordSiteBuildSuccess: success,
      recordSiteBuildAccepted: accepted,
      recordSiteBuildTracking: tracking,
      recordSiteBuildFailure: failure,
    }),
  });
  return { dispatcher, trigger, heartbeat, success, accepted, tracking, failure, logger, random };
}

test.each([true, false])("the first claim starts only if still live (%s)", async (live) => {
  const first = lease("first");
  const finishedClaimAt = expiry - Number(live);
  const renewSiteBuildLease = vi.fn(async () => true);
  const { dispatcher, trigger, heartbeat, success, failure, accepted, tracking, logger, random } =
    dispatcherFixture({
      claimSiteBuilds: async () => {
        vi.setSystemTime(finishedClaimAt);
        return [first];
      },
      renewSiteBuildLease,
    });

  await dispatcher.runOnce(1);

  expect(renewSiteBuildLease).not.toHaveBeenCalled();
  expect(trigger.mock.calls).toEqual(live ? [[{ buildId: first.buildId, targetVersion: 3 }]] : []);
  expect(success.mock.calls).toEqual(live ? [[{ leaseId: first.id, now: finishedClaimAt }]] : []);
  expect(heartbeat).toHaveBeenCalledTimes(Number(live));
  for (const unexpected of [failure, accepted, tracking, logger.error, random])
    expect(unexpected).not.toHaveBeenCalled();
});

test.each([
  { confirmation: "refused", delay: 0 },
  { confirmation: "throws", delay: 0 },
  { confirmation: "confirmed", delay: DISPATCHER_LEASE_DURATION_MS - 1 },
  { confirmation: "expired", delay: DISPATCHER_LEASE_DURATION_MS },
])(
  "a deferred claim starts only with a current confirmation ($confirmation)",
  async ({ confirmation, delay }) => {
    const first = lease("first");
    const second = lease("second");
    const requested = Promise.withResolvers<void>();
    const renewed = Promise.withResolvers<boolean>();
    const renewSiteBuildLease = vi.fn<SiteBuildDispatchPort["renewSiteBuildLease"]>(() => {
      requested.resolve();
      return renewed.promise;
    });
    const { dispatcher, trigger, heartbeat, success, failure, accepted, tracking, logger, random } =
      dispatcherFixture({ claimSiteBuilds: async () => [first, second], renewSiteBuildLease });
    const renewalAt = start + 5_000;
    trigger.mockImplementationOnce(async () => {
      vi.setSystemTime(renewalAt);
      return { status: "succeeded" };
    });

    const pass = dispatcher.runOnce(2);
    await Promise.race([requested.promise, pass]);
    expect(trigger).toHaveBeenCalledExactlyOnceWith({ buildId: first.buildId, targetVersion: 3 });
    expect(renewSiteBuildLease).toHaveBeenCalledExactlyOnceWith({
      leaseId: second.id,
      now: renewalAt,
    });

    const confirmedAt = renewalAt + delay;
    vi.setSystemTime(confirmedAt);
    if (confirmation === "throws") renewed.reject(new Error("unavailable"));
    else renewed.resolve(confirmation !== "refused");
    await pass;

    const calls = [{ buildId: first.buildId, targetVersion: 3 }];
    const writes = [{ leaseId: first.id, now: renewalAt }];
    if (confirmation === "confirmed") {
      calls.push({ buildId: second.buildId, targetVersion: 3 });
      writes.push({ leaseId: second.id, now: confirmedAt });
    }
    expect(trigger.mock.calls).toEqual(calls.map((call) => [call]));
    expect(success.mock.calls).toEqual(writes.map((write) => [write]));
    expect(heartbeat).toHaveBeenCalledTimes(calls.length);
    for (const unexpected of [failure, accepted, tracking, logger.error, random])
      expect(unexpected).not.toHaveBeenCalled();
  },
);
