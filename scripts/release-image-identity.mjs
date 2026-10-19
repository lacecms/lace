import { createHash } from "node:crypto";

export const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const indexes = new Set([
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
]);
const manifests = new Set([
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
]);
const digestOf = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

/** Check registry bytes before trusting any of their graph descriptors. */
export function parseImageManifest(raw, digest) {
  if (!digestPattern.test(digest)) throw new Error("Invalid registry digest");
  // The CLI can append a newline; only remove it if the exact expected hash proves it.
  const bytes = digestOf(raw) === digest ? raw : raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  if (digestOf(bytes) !== digest) throw new Error("Registry manifest digest mismatch");
  const value = JSON.parse(bytes);
  if (
    value.schemaVersion !== 2 ||
    (value.mediaType !== undefined &&
      !indexes.has(value.mediaType) &&
      !manifests.has(value.mediaType)) ||
    Array.isArray(value.manifests) === !!value.config
  )
    throw new Error("Unsupported registry manifest");
  const result = { ...value, digest, byteLength: Buffer.byteLength(bytes) };
  indexOf(result);
  return result;
}

function repositoryOf(coordinate) {
  return coordinate.includes("@")
    ? coordinate.split("@")[0]
    : coordinate.slice(0, coordinate.lastIndexOf(":"));
}

function requireDigest(value) {
  if (!digestPattern.test(value)) throw new Error("Invalid image graph digest");
}

function indexOf(value) {
  requireDigest(value?.digest);
  if (value.config && value.manifests) throw new Error("Ambiguous image graph");
  if (Array.isArray(value.manifests)) {
    if (value.mediaType !== undefined && !indexes.has(value.mediaType))
      throw new Error("Invalid index media type");
    return true;
  }
  if (!value.config || (value.mediaType !== undefined && !manifests.has(value.mediaType)))
    throw new Error("Invalid runtime manifest");
  requireDigest(value.config.digest);
  return false;
}

/** Resolve immutable references with bounded depth/size and no tag caching. */
async function graph(root, repository, inspect) {
  const cache = new Map();
  const leaves = [];
  const seen = new Set();
  let count = 0;
  async function visit(value, descriptor = {}, inheritedPlatform, path = new Set()) {
    if (++count > 64 || path.size >= 5 || path.has(value?.digest))
      throw new Error("Image graph traversal limit or cycle");
    const isIndex = indexOf(value);
    if (descriptor.digest && descriptor.digest !== value.digest)
      throw new Error("Image child digest mismatch");
    if (descriptor.mediaType && descriptor.mediaType !== value.mediaType)
      throw new Error("Image child media type mismatch");
    if (
      descriptor.size !== undefined &&
      (!Number.isSafeInteger(descriptor.size) ||
        descriptor.size <= 0 ||
        (value.byteLength !== undefined && descriptor.size !== value.byteLength))
    )
      throw new Error("Image child size mismatch");
    const platform = descriptor.platform
      ? `${descriptor.platform.os}/${descriptor.platform.architecture}`
      : inheritedPlatform;
    if (
      inheritedPlatform &&
      descriptor.platform &&
      platform !== inheritedPlatform &&
      platform !== "unknown/unknown"
    )
      throw new Error("Nested image platform mismatch");
    const annotations = descriptor.annotations ?? {};
    const attestation = annotations["vnd.docker.reference.type"] === "attestation-manifest";
    if (isIndex) {
      if (attestation || value.manifests.length === 0 || value.manifests.length > 64)
        throw new Error("Invalid image index graph");
      const next = new Set(path).add(value.digest);
      for (const entry of value.manifests) {
        requireDigest(entry.digest);
        const coordinate = `${repository}@${entry.digest}`;
        if (!cache.has(coordinate))
          cache.set(
            coordinate,
            Promise.resolve().then(() => inspect(coordinate)),
          );
        const child = await cache.get(coordinate);
        if (!child) throw new Error(`Missing image child: ${coordinate}`);
        await visit(child, entry, platform, next);
      }
      return;
    }
    if (seen.has(value.digest)) throw new Error("Duplicate image graph descriptor");
    seen.add(value.digest);
    if (attestation) {
      requireDigest(annotations["vnd.docker.reference.digest"]);
      if (platform !== "unknown/unknown") throw new Error("Invalid attestation platform");
    } else if (!/^linux\/(?:amd64|arm64)$/u.test(platform ?? ""))
      throw new Error("Unsupported image platform");
    leaves.push({
      digest: value.digest,
      platform,
      kind: attestation ? "attestation" : "runtime",
      mediaType: descriptor.mediaType ?? value.mediaType,
      size: descriptor.size ?? value.byteLength,
      annotations: Object.fromEntries(
        Object.entries(annotations).sort(([a], [b]) => a.localeCompare(b)),
      ),
    });
  }
  await visit(root);
  const runtimes = new Set(
    leaves.filter((entry) => entry.kind === "runtime").map((entry) => entry.digest),
  );
  for (const leaf of leaves)
    if (
      leaf.kind === "attestation" &&
      !runtimes.has(leaf.annotations["vnd.docker.reference.digest"])
    )
      throw new Error("Unrelated image attestation");
  return leaves;
}

async function expectedGraph(item, remote, inspect) {
  if (!remote) throw new Error(`Missing published image: ${item.coordinate}`);
  if (!indexOf(remote)) {
    if (remote.config.digest !== item.imageId)
      throw new Error(`Published image differs: ${item.coordinate}`);
    return [
      {
        digest: remote.digest,
        platform: item.platform,
        kind: "runtime",
        mediaType: remote.mediaType,
        size: remote.byteLength,
        annotations: {},
      },
    ];
  }
  if (remote.digest !== item.imageId)
    throw new Error(`Published image differs: ${item.coordinate}`);
  const leaves = await graph(remote, repositoryOf(item.coordinate), inspect);
  const runtime = leaves.filter((entry) => entry.kind === "runtime");
  if (runtime.length !== 1 || runtime[0].platform !== item.platform)
    throw new Error(`Published image platform differs: ${item.coordinate}`);
  return leaves;
}

export async function matchingImage(item, remote, inspect) {
  if (!remote) return false;
  await expectedGraph(item, remote, inspect);
  return true;
}

export async function matchingIndex(coordinate, remote, items, inspect) {
  if (!remote) return false;
  if (!digestPattern.test(remote.digest) || !indexOf(remote) || remote.manifests.length === 0)
    throw new Error(`Published manifest platforms differ: ${coordinate}`);
  const expected = [];
  for (const item of items)
    expected.push(...(await expectedGraph(item, await inspect(item.coordinate), inspect)));
  if (new Set(items.map((item) => item.platform)).size !== items.length)
    throw new Error("Duplicate expected image platform");
  const actual = await graph(remote, repositoryOf(coordinate), inspect);
  const canonical = (leaves) => leaves.map((entry) => JSON.stringify(entry)).sort();
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected)))
    throw new Error(`Published manifest image graph differs: ${coordinate}`);
  return true;
}
