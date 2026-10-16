import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  lookupPackage,
  matchingPackage,
  matchingImage,
  matchingIndex,
  packageHashes,
} from "./release-publish.mjs";

const tokens = new Map();
export async function inspectPublicImage(coordinate) {
  const match = /^ghcr\.io\/(lacecms\/(?:api|builder))(?::([^/@]+)|@(sha256:[a-f0-9]{64}))$/u.exec(
    coordinate,
  );
  if (!match) throw new Error("Unsupported public image coordinate");
  const [, repository, tag, digest] = match;
  if (!tokens.has(repository)) {
    const response = await fetch(
      `https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok) throw new Error(`Public GHCR authorization unavailable (${response.status})`);
    const { token } = await response.json();
    if (typeof token !== "string" || !token) throw new Error("Missing public registry token");
    tokens.set(repository, token);
  }
  const response = await fetch(`https://ghcr.io/v2/${repository}/manifests/${digest ?? tag}`, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      authorization: `Bearer ${tokens.get(repository)}`,
      accept:
        "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Public GHCR manifest unavailable (${response.status})`);
  const bytes = await response.text();
  const actual = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (
    (digest && digest !== actual) ||
    (response.headers.get("docker-content-digest") &&
      response.headers.get("docker-content-digest") !== actual)
  )
    throw new Error("Public manifest digest mismatch");
  return { ...JSON.parse(bytes), digest: actual };
}

export async function verifyPublishedInventory(inventory, directory, operations = {}) {
  if (
    !inventory.complete ||
    !inventory.publicationEligible ||
    inventory.packages.length !== 15 ||
    inventory.images.length !== 4 ||
    inventory.release.channel !== "next"
  )
    throw new Error("Complete eligible alpha inventory required");
  const packages = [];
  for (const item of inventory.packages) {
    const local = await (operations.packageHashes ?? packageHashes)(join(directory, item.file));
    if (!matchingPackage(item, local, await (operations.lookupPackage ?? lookupPackage)(item)))
      throw new Error(`Missing published package: ${item.name}@${item.version}`);
    packages.push({
      name: item.name,
      version: item.version,
      integrity: local.integrity,
      shasum: local.shasum,
      action: "already-published",
    });
  }
  const inspect = operations.inspectImage ?? inspectPublicImage;
  const images = [];
  for (const kind of ["api", "builder"]) {
    const items = inventory.images.filter((item) => item.kind === kind);
    if (items.length !== 2 || new Set(items.map((item) => item.platform)).size !== 2)
      throw new Error("Incomplete platform graph");
    const platforms = [];
    for (const item of items) {
      const remote = await inspect(item.coordinate);
      if (!matchingImage(item, remote))
        throw new Error(`Missing published image: ${item.coordinate}`);
      platforms.push({
        coordinate: item.coordinate,
        platform: item.platform,
        imageId: item.imageId,
        digest: remote.digest,
      });
    }
    const coordinate = `${inventory.release.images[kind]}:${inventory.release.version}`;
    const remote = await inspect(coordinate);
    if (!(await matchingIndex(coordinate, remote, items, inspect)))
      throw new Error(`Missing published multi-platform image: ${coordinate}`);
    images.push({ coordinate, digest: remote.digest, platforms, action: "already-published" });
  }
  const common = { dryRun: false, version: inventory.release.version, source: inventory.source };
  return {
    npm: { ...common, target: "npm", items: packages },
    images: { ...common, target: "images", items: images },
  };
}
