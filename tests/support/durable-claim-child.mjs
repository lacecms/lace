import {
  NodeContentRepository,
  migrateNodeDatabase,
  openNodeDatabase,
} from "../../packages/platform-node/dist/index.js";
import { D1ContentRepository } from "../../packages/platform-cloudflare/dist/index.js";
import { openLocalCloudflare } from "../../packages/platform-cloudflare/src/d1-test-harness.mjs";

const { kind, path, mode, oldLease } = JSON.parse(process.argv[2]);
let repository, close;
if (kind === "node") {
  if (mode === "claim") migrateNodeDatabase(path);
  const db = openNodeDatabase(path);
  repository = new NodeContentRepository(db.connection, () => undefined);
  close = async () => db.connection.close();
} else {
  const local = await openLocalCloudflare({ persistTo: path, migrate: mode === "claim" });
  repository = new D1ContentRepository(local.database, () => undefined);
  close = local.dispose;
}
try {
  if (mode === "claim") {
    await repository.requestBuild({
      requestedAt: 1,
      requestedBy: { id: "restart-admin", role: "admin" },
    });
    const [lease] = await repository.claimSiteBuilds({ limit: 1, now: 5001 });
    if (!lease) throw new Error("durable claim missing");
    process.send({ checkpoint: "claim-committed", lease });
    await new Promise(() => {});
  } else {
    const [lease] = await repository.claimSiteBuilds({ limit: 1, now: oldLease.expiresAt + 1 });
    if (!lease || lease.event.id !== oldLease.event.id) throw new Error("durable recovery missing");
    let staleDenied = false;
    try {
      await repository.recordSiteBuildSuccess({
        leaseId: oldLease.id,
        now: oldLease.expiresAt + 2,
      });
    } catch {
      staleDenied = true;
    }
    await repository.recordSiteBuildSuccess({ leaseId: lease.id, now: oldLease.expiresAt + 3 });
    const build = await repository.getSiteBuild(lease.buildId);
    await close();
    process.send({
      checkpoint: "recovery-committed",
      staleDenied,
      status: build.status,
      targetVersion: build.targetVersion,
    });
    process.disconnect();
  }
} catch {
  await close();
  process.send({ checkpoint: "failed" });
  process.exitCode = 1;
  process.disconnect();
}
