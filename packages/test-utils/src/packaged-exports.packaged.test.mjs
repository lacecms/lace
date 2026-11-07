import { expect, test } from "vitest";

test("packaged entry point keeps its public exports", async () => {
  expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([
    "DeterministicClock",
    "DeterministicIdGenerator",
    "DeterministicTokenHasher",
    "InMemoryCache",
    "InMemoryContentStore",
    "InMemoryDispatcherLeasePort",
    "InMemoryObjectStorage",
    "InMemorySiteBuildTrigger",
    "MEDIA_METADATA_CHECKPOINTS",
    "PUBLICATION_CHECKPOINTS",
    "REVERT_CHECKPOINTS",
    "SECURITY_CONTRACT_EPOCH",
    "UNPUBLICATION_CHECKPOINTS",
    "admin",
    "allowAllRateLimiter",
    "animatedGifFixture",
    "assertAtomicCheckpoints",
    "assertQueryPlanUsesIndex",
    "contentRepositoryContractCases",
    "createUserByInvitation",
    "delegatedActor",
    "editor",
    "errorMatrixCases",
    "fakePort",
    "gifFixture",
    "packageName",
    "readAllBuildContentPages",
    "readCompleteBuildExport",
    "securityContractCases",
    "silentLogger",
    "testActor",
    "unmatchedErrorClasses",
    "viewer",
    "visibilityParityCases",
  ]);
  const subpath = await import("@lacecms/test-utils/visibility-parity");
  expect(Object.keys(subpath)).toEqual(["visibilityParityCases"]);
  expect(subpath.visibilityParityCases).toEqual(
    (await import("../dist/index.js")).visibilityParityCases,
  );
  expect(Object.keys(await import("@lacecms/test-utils/filter-parity")).sort()).toEqual([
    "filterParityCases",
    "filterParityFields",
    "filterParityFilterableFields",
    "filterParityOptions",
    "filterParityUnlistedField",
  ]);
});
