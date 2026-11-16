import { buildWorkPort } from "../test-support/build-port.js";
import { unixMilliseconds } from "@lacecms/domain";
import { expect, test, vi } from "vitest";
import {
  MEDIA_DELETE_REQUESTED,
  SITE_BUILD_REQUESTED,
  createOutboxDispatchers,
} from "./registered-dispatchers.js";

test("each registered event selects its own leased dispatch pass", async () => {
  const now = unixMilliseconds(8_000);
  const clock = { now: () => now };
  const logger = { error: vi.fn() };
  const claimBuilds = vi.fn(async () => []);
  const claimMedia = vi.fn(async () => []);
  const unexpected = () => {
    throw new Error("Unexpected dispatch operation");
  };
  const handlers = createOutboxDispatchers({
    siteBuild: {
      clock,
      logger,
      work: buildWorkPort({ claimSiteBuilds: claimBuilds }),
      trigger: { trigger: unexpected },
    },
    mediaDeletion: {
      clock,
      logger,
      storage: { createReadUrl: unexpected, delete: unexpected, get: unexpected, put: unexpected },
      work: {
        claim: claimMedia,
        complete: unexpected,
        retry: unexpected,
        completeMediaDeletion: unexpected,
        failMediaDeletion: unexpected,
        loadDeletingMedia: unexpected,
      },
    },
  });

  await handlers[SITE_BUILD_REQUESTED].runOnce(1);
  expect(claimBuilds).toHaveBeenCalledExactlyOnceWith({ now, limit: 1 });
  expect(claimMedia).not.toHaveBeenCalled();
  await handlers[MEDIA_DELETE_REQUESTED].runOnce(5);
  expect(claimMedia).toHaveBeenCalledExactlyOnceWith({
    eventTypes: [MEDIA_DELETE_REQUESTED],
    now,
    limit: 5,
  });
  expect(claimBuilds).toHaveBeenCalledOnce();
});
