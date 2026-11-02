import { expect, test } from "vitest";

test("packaged entry point keeps its public exports", async () => {
  expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([
    "HostDatabaseSafetyError",
    "NodeBuilderSiteBuildTrigger",
    "NodeContentRepository",
    "NodeEnvironmentError",
    "NodeFixedWindowRateLimiter",
    "NodeInfrastructureUnavailableError",
    "NodeMediaDeletionDispatcher",
    "NodeMinioObjectStorage",
    "NodeObjectStorageError",
    "NodePlaceholderObjectStorage",
    "NodeSecurityService",
    "NodeSharpImageInspector",
    "NodeSiteBuildDispatcher",
    "NodeSqliteReadiness",
    "NoopNodeBuildTrigger",
    "NoopNodeCache",
    "SystemNodeClock",
    "UlidGenerator",
    "anonymousActorResolver",
    "assertHostDatabaseSafe",
    "checkedInMigrations",
    "createNodeEmailSender",
    "createNodeOAuthPersistence",
    "createNodeRuntime",
    "createSmtpEmailSender",
    "defaultNodeLogger",
    "defaultNodeRateLimiter",
    "defaultNodeRequestIds",
    "listAppliedMigrations",
    "migrateNodeDatabase",
    "nodeContentRepository",
    "nodePublicMediaUrl",
    "openNodeDatabase",
    "packageName",
    "parseNodeEmailSettings",
    "parseNodeRuntimeSettings",
    "resolveNodeClientAddress",
    "runLocalContentSync",
    "trustedProxyPolicy",
  ]);
});

test("packaged test subpath keeps its public exports", async () => {
  expect(Object.keys(await import("@lacecms/platform-node/test")).sort()).toEqual([
    "createTestActorResolver",
  ]);
});
