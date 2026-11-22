import { expect, test } from "vitest";

test("packaged entry point keeps its public exports", async () => {
  expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([
    "DeterministicClock",
    "DeterministicIdGenerator",
    "DeterministicTokenHasher",
    "InMemoryCache",
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
    "assertPreviewCleanup",
    "assertPreviewHandoff",
    "assertPreviewPackage",
    "assertPreviewResourceGuards",
    "assertQueryPlanUsesIndex",
    "assertReferenceLifecycleRest",
    "claimPreviewFixture",
    "contentRepositoryContractCases",
    "createUserByInvitation",
    "delegatedActor",
    "draftPreviewOrigin",
    "editor",
    "errorMatrixCases",
    "fakePort",
    "gifFixture",
    "openPreviewSession",
    "packageName",
    "readAllBuildContentPages",
    "readCompleteBuildExport",
    "referenceLifecycleConfig",
    "securityContractCases",
    "seedReadyPreview",
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
  expect(() => import.meta.resolve("@lacecms/test-utils/sqlite")).toThrow();
});
