import { createHash, randomUUID } from "node:crypto";
import { link, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checksum, verifyInventory } from "./release-artifacts.mjs";
import { withArtifactLock } from "./release-lock.mjs";

export const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fields = new Set(
  `schemaVersion recordedAt recordedDateEuropeRome artifactDirectory inventorySha256 harnessRevision harnessChangesAfterPackaging shippingArtifactsChangedAfterPackaging imageSmokePlatforms consumerPlatform remotePublicationPerformed realDeploymentVerified audit ownerPrerequisites acceptance preparedImages allPreparedImages sourceChecks registryChecks releaseSpecificAcceptance result version templateVersion platform source builds journeys packages images revision preview fingerprint first failed retried firstVersion recoveredVersion name file sha256 kind coordinate manifestCoordinate localTag imageId smokePassed licenseRecords vulnerabilities high moderate critical policy releaseTests generatorTests focusedCliTests focusedWorkspaceTasks fullWorkspaceTasks rootFiles rootTests openSpecItems typecheck lint format openapi frozenInstall thirdPartyDependenciesChanged sourceRevision alphaFivePublicPackages alphaFivePublicImageManifests alphaSixPackageVersionStatuses alphaSixImageManifestStatuses npmRights ghcrWriteRights node cloudflareLocal checks`.split(
    /\s+/u,
  ),
);

function publicFields(value) {
  if (Array.isArray(value)) {
    for (const item of value) publicFields(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (!fields.has(key)) throw new Error(`Non-public acceptance field: ${key}`);
      publicFields(item);
    }
  }
  if (typeof value === "string" && /\/(?:Users|home|private|var)\//u.test(value))
    throw new Error("Private absolute path in acceptance evidence");
}

export function validateAcceptance(report, inventory, inventorySha256) {
  publicFields(report);
  const accepted = report.acceptance;
  if (
    report.schemaVersion !== 1 ||
    report.inventorySha256 !== inventorySha256 ||
    !/^[a-f0-9]{40}$/u.test(report.harnessRevision) ||
    accepted?.result !== "passed" ||
    accepted.version !== inventory.release.version ||
    accepted.templateVersion !== inventory.release.templateVersion ||
    !inventory.release.platforms.includes(accepted.platform) ||
    report.consumerPlatform !== accepted.platform ||
    JSON.stringify(accepted.source) !== JSON.stringify(inventory.source) ||
    JSON.stringify(accepted.packages) !== JSON.stringify(inventory.packages) ||
    !Array.isArray(accepted.journeys) ||
    !accepted.journeys.length
  )
    throw new Error("Acceptance identity/results differ from inventory");
  const expected = inventory.images.filter((image) => image.platform === accepted.platform);
  if (JSON.stringify(accepted.images) !== JSON.stringify(expected))
    throw new Error("Acceptance image identity differs");
  return report;
}

export async function writeExclusive(path, bytes) {
  const temporary = `${path}.${randomUUID()}.pending`;
  await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try {
    await link(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function acceptanceBytes(directory, inventory) {
  const bytes = await readFile(join(directory, "acceptance.json"));
  validateAcceptance(
    JSON.parse(bytes),
    inventory,
    await checksum(join(directory, "inventory.json")),
  );
  return bytes;
}

export async function persistAcceptance(
  directory,
  inventory,
  result,
  harnessRevision,
  cleanupSucceeded = true,
) {
  if (!cleanupSucceeded || result?.result !== "passed")
    throw new Error("Acceptance or environment cleanup failed; no success report written");
  const report = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    inventorySha256: await checksum(join(directory, "inventory.json")),
    harnessRevision,
    imageSmokePlatforms: inventory.release.platforms,
    consumerPlatform: result.platform,
    remotePublicationPerformed: false,
    realDeploymentVerified: false,
    acceptance: result,
  };
  validateAcceptance(report, inventory, report.inventorySha256);
  await writeExclusive(join(directory, "acceptance.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export async function importAcceptance({ directory, receipt, apply = false }) {
  const work = async () => {
    const inventory = await verifyInventory(directory);
    const bytes = await readFile(receipt);
    validateAcceptance(
      JSON.parse(bytes),
      inventory,
      await checksum(join(directory, "inventory.json")),
    );
    try {
      const existing = await readFile(join(directory, "acceptance.json"));
      if (!existing.equals(bytes))
        throw new Error("Existing acceptance differs; refusing overwrite");
      return { action: "already-imported", sha256: hashBytes(bytes) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (apply) await writeExclusive(join(directory, "acceptance.json"), bytes);
    return { action: apply ? "imported" : "would-import", sha256: hashBytes(bytes) };
  };
  return apply ? withArtifactLock(directory, "import-acceptance", work) : work();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  const seen = new Set();
  try {
    for (let i = 0; i < args.length; i++) {
      const key = args[i];
      if (seen.has(key)) throw new Error("Duplicate option");
      seen.add(key);
      if (key === "--apply") options.apply = true;
      else if (
        ["--artifacts", "--receipt"].includes(key) &&
        args[i + 1] &&
        !args[i + 1].startsWith("--")
      )
        options[key === "--artifacts" ? "directory" : "receipt"] = resolve(args[++i]);
      else throw new Error("Use --artifacts <directory> --receipt <json> [--apply]");
    }
    if (!options.directory || !options.receipt) throw new Error("Artifacts and receipt required");
    console.info(JSON.stringify(await importAcceptance(options), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
