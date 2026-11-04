import { unixMilliseconds } from "@lacecms/domain";

import { type RepositoryContractCase, admin, noModels, registerContract } from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract("build diagnostics persist safely across recovery and retry", async (runtime, expect) => {
  const { repository, sql, reopen } = await runtime.open({ resolveModel: noModels });
  const request = await repository.requestBuild({
    requestedAt: unixMilliseconds(1),
    requestedBy: admin,
  });
  const [lease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(5001) });
  await repository.recordSiteBuildFailure({
    leaseId: lease!.id,
    now: unixMilliseconds(5002),
    reason: "source_symlink",
    path: "src/linked.astro",
    terminal: false,
    retryAt: unixMilliseconds(6000),
  });
  expect(await repository.getSiteBuild(lease!.buildId)).toMatchObject({
    status: "pending",
    error: "source_symlink",
    errorPath: "src/linked.astro",
  });
  expect(await reopen().getSiteBuild(lease!.buildId)).toMatchObject({
    error: "source_symlink",
    errorPath: "src/linked.astro",
  });
  expect(
    await sql.get("select last_error from outbox_events where id = ?", request.eventId),
  ).toEqual({ last_error: "source_symlink" });
  const [retryLease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(6000) });
  await expect(
    repository.recordSiteBuildFailure({
      leaseId: lease!.id,
      now: unixMilliseconds(6001),
      reason: "source_missing",
      path: "package.json",
      terminal: true,
    }),
  ).rejects.toThrow();
  await repository.recordSiteBuildFailure({
    leaseId: retryLease!.id,
    now: unixMilliseconds(6001),
    reason: "source_symlink",
    path: "src/linked.astro",
    terminal: true,
  });
  const newRequest = await repository.requestBuild({
    requestedAt: unixMilliseconds(7000),
    requestedBy: admin,
    retryOfBuildId: lease!.buildId,
  });
  const [newLease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(12000) });
  await repository.recordSiteBuildSuccess({ leaseId: newLease!.id, now: unixMilliseconds(12001) });
  expect(await repository.getSiteBuild(newLease!.buildId)).not.toHaveProperty("error");
  expect(await repository.getSiteBuild(newLease!.buildId)).not.toHaveProperty("errorPath");
  expect(newRequest.eventId).not.toBe(request.eventId);
  expect(await repository.getSiteBuild(lease!.buildId)).toMatchObject({
    status: "failed",
    error: "source_symlink",
    errorPath: "src/linked.astro",
  });
});
