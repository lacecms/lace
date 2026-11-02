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
    "animatedGifFixture",
    "assertAtomicCheckpoints",
    "assertQueryPlanUsesIndex",
    "contentRepositoryContractCases",
    "createUserByInvitation",
    "gifFixture",
    "packageName",
    "readAllBuildContentPages",
    "readCompleteBuildExport",
    "securityContractCases",
    "visibilityParityCases",
  ]);
  const subpath = await import("@lacecms/test-utils/visibility-parity");
  expect(Object.keys(subpath)).toEqual(["visibilityParityCases"]);
  expect(subpath.visibilityParityCases).toEqual(
    (await import("../dist/index.js")).visibilityParityCases,
  );
});
