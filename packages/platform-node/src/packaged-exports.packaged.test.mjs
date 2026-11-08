import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
    "UnsupportedDatabaseError",
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
    "uncheckedD1Migrations",
    "uncheckedNodeMigrations",
  ]);
});

test("the test subpath is not exported outside the source condition", () => {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", 'await import("@lacecms/platform-node/test");'],
    { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("ERR_PACKAGE_PATH_NOT_EXPORTED");
});
