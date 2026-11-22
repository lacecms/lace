import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import {
  assertSecretFree,
  checkImageIdentity,
  requireReleaseInventory,
  scanFile,
  loadConsumerArtifacts,
  assertImageFileList,
} from "../scripts/consumer-security.mjs";
import { checksum, completeInventory, jsonFile } from "../scripts/release-artifacts.mjs";

const inventory = {
  complete: true,
  publicationEligible: true,
  source: { preview: false, revision: "a".repeat(40) },
  release: {
    version: "0.1.0-alpha.1",
    channel: "next",
    platforms: ["linux/arm64"],
    sourceRepository: "https://github.com/lacecms/lace",
  },
  images: ["api", "builder"].map((kind) => ({
    kind,
    platform: "linux/arm64",
    imageId: `sha256:${kind}`,
  })),
};

test("image path scan allows bundled npm config and rejects operator credential storage", () => {
  expect(() =>
    assertImageFileList("usr/local/lib/node_modules/npm/.npmrc\nusr/bin/node", "api"),
  ).not.toThrow();
  for (const path of [
    "root/.npmrc",
    "home/node/.aws/credentials",
    "opt/lace/.env",
    "opt/lace/.git/config",
    "root/.ssh/id_rsa",
  ])
    expect(() => assertImageFileList(path, "api")).toThrow("Credential storage found");
});

test("release acceptance refuses preview, partial and unsupported inventories", () => {
  expect(requireReleaseInventory(inventory, "linux/arm64").api).toEqual(inventory.images[0]);
  for (const overrides of [
    { complete: false },
    { publicationEligible: false },
    { source: { preview: true } },
    { images: inventory.images.slice(0, 1) },
  ])
    expect(() => requireReleaseInventory({ ...inventory, ...overrides }, "linux/arm64")).toThrow();
  expect(() => requireReleaseInventory(inventory, "linux/amd64")).toThrow("Unsupported");
});

test("consumer verifies immutable image identity and provenance", () => {
  const record = inventory.images[0];
  const metadata = {
    Id: record.imageId,
    Os: "linux",
    Architecture: "arm64",
    Config: {
      Labels: {
        "org.opencontainers.image.version": inventory.release.version,
        "org.opencontainers.image.revision": inventory.source.revision,
        "org.opencontainers.image.source": inventory.release.sourceRepository,
      },
    },
  };
  expect(() => checkImageIdentity(metadata, record, inventory)).not.toThrow();
  for (const overrides of [{ Id: "wrong" }, { Architecture: "amd64" }, { Config: { Labels: {} } }])
    expect(() => checkImageIdentity({ ...metadata, ...overrides }, record, inventory)).toThrow(
      "identity mismatch",
    );
});

test("secret errors identify the surface without echoing credential bytes", () => {
  const secret = "alpha-password-sentinel-9239";
  expect(() => assertSecretFree(`log: ${secret}`, [secret], "diagnostics")).toThrow(
    "Secret material detected in diagnostics",
  );
  try {
    assertSecretFree(secret, [secret], "static");
  } catch (error) {
    expect(error.message).not.toContain(secret);
  }
  expect(() =>
    assertSecretFree(
      `-----BEGIN PRIVATE KEY-----\n${"A".repeat(64)}\n-----END PRIVATE KEY-----`,
      [],
      "archive",
    ),
  ).toThrow();
  expect(() =>
    assertSecretFree("const header = '-----BEGIN PRIVATE KEY-----'", [], "source"),
  ).not.toThrow();
  expect(() =>
    assertSecretFree(
      Buffer.concat([
        Buffer.from([0]),
        Buffer.from(`-----BEGIN PRIVATE KEY-----\n${"A".repeat(64)}\n-----END PRIVATE KEY-----`),
      ]),
      [],
      "shared library",
    ),
  ).not.toThrow();
  expect(() => assertSecretFree("ordinary output", [secret], "static")).not.toThrow();
});

test("binary stream scan detects secrets split across read boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-secret-scan-"));
  try {
    const path = join(root, "image.tar");
    const secret = "deployment-secret-at-chunk-boundary";
    await writeFile(
      path,
      Buffer.concat([Buffer.alloc(65530), Buffer.from(secret), Buffer.alloc(65536)]),
    );
    await expect(scanFile(path, [secret], "image filesystem")).rejects.toThrow("image filesystem");
    await expect(scanFile(path, ["another-secret"], "image filesystem")).resolves.toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("consumer rejects a changed archive before extraction or generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-inventory-check-"));
  try {
    const archive = join(root, "package.tgz");
    await writeFile(archive, "original artifact");
    const digest = await checksum(archive);
    const release = {
      ...inventory.release,
      packages: ["create-lace"],
      images: { api: "api", builder: "builder" },
    };
    const source = { ...inventory.source, fingerprint: "b".repeat(64) };
    const packages = [
      { name: "create-lace", version: release.version, file: "package.tgz", sha256: digest },
    ];
    const images = inventory.images.map((item) => ({
      ...item,
      imageId: `sha256:${"c".repeat(64)}`,
      coordinate: `${item.kind}:${release.version}-arm64`,
      file: "package.tgz",
      sha256: digest,
      smokePassed: true,
    }));
    await jsonFile(
      join(root, "inventory.json"),
      completeInventory(release, source, packages, images),
    );
    await jsonFile(join(root, "status.json"), { state: "prepared" });
    await writeFile(archive, "changed artifact");
    await expect(
      loadConsumerArtifacts(root, join(root, "extracted"), "linux/arm64"),
    ).rejects.toThrow("Artifact checksum mismatch");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
