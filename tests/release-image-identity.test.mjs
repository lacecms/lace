import { expect, test } from "vitest";
import { matchingImage, matchingIndex } from "../scripts/release-publish.mjs";
import { indexedImages, imageDigest } from "./release-image-fixture.mjs";
import { parseImageManifest } from "../scripts/release-image-identity.mjs";

const coordinate = "ghcr.io/lacecms/api:0.1.0-alpha.7";
const inputs = ["amd64", "arm64"].map((architecture) => ({
  coordinate: `${coordinate}-${architecture}`,
  platform: `linux/${architecture}`,
  kind: "api",
}));
const fixture = () => indexedImages(inputs);

test("manifest parsing authenticates exact bytes, including CLI newline handling", () => {
  const f = fixture();
  const root = f.store.get(inputs[0].coordinate);
  const raw = f.bytes.get(root.digest);
  expect(parseImageManifest(raw, root.digest)).toEqual(root);
  expect(parseImageManifest(`${raw}\n`, root.digest)).toEqual(root);
  for (const changed of [` ${raw}`, `${raw} `, `${raw}\n\n`])
    expect(() => parseImageManifest(changed, root.digest)).toThrow("digest mismatch");
  for (const body of [
    { schemaVersion: 2, config: {} },
    { schemaVersion: 2, config: {}, manifests: [] },
    { schemaVersion: 1, manifests: [] },
  ]) {
    const bytes = JSON.stringify(body);
    expect(() => parseImageManifest(bytes, imageDigest(bytes))).toThrow();
  }
});

test("bounds traversal and rejects cycles before unbounded registry reads", async () => {
  const f = fixture();
  const item = { ...f.items[0] };
  const root = structuredClone(f.store.get(item.coordinate));
  root.manifests = [{ digest: root.digest }];
  f.store.set(`ghcr.io/lacecms/api@${root.digest}`, root);
  await expect(matchingImage(item, root, f.inspect)).rejects.toThrow("cycle");
  let parent = f.store.get(f.items[1].coordinate);
  for (let i = 0; i < 6; i++)
    parent = f.index(`${coordinate}-nested-${i}`, [{ digest: parent.digest }]);
  await expect(
    matchingImage({ ...f.items[1], imageId: parent.digest }, parent, f.inspect),
  ).rejects.toThrow("limit");
});

test("recognizes the saved index ID and its runtime plus attestation graph", async () => {
  const f = fixture();
  expect(await matchingImage(f.items[0], f.store.get(inputs[0].coordinate), f.inspect)).toBe(true);
});

test.each([false, true])("recognizes exact multi-platform assembly (nested=%s)", async (nested) => {
  const f = fixture();
  expect(
    await matchingIndex(coordinate, f.final(coordinate, f.items, nested), f.items, f.inspect),
  ).toBe(true);
});

test.each([
  "root",
  "platform",
  "missing-child",
  "child-digest",
  "unrelated-attestation",
  "duplicate-platform",
])("rejects invalid platform image graph: %s", async (failure) => {
  const f = fixture();
  const item = { ...f.items[0] };
  let remote = f.store.get(item.coordinate);
  const runtime = remote.manifests[0];
  const repository = "ghcr.io/lacecms/api";
  if (failure === "root") item.imageId = `sha256:${"f".repeat(64)}`;
  if (failure === "platform") item.platform = "linux/arm64";
  if (failure === "missing-child") f.store.delete(`${repository}@${runtime.digest}`);
  if (failure === "child-digest")
    f.store.set(`${repository}@${runtime.digest}`, {
      config: {},
      digest: `sha256:${"f".repeat(64)}`,
    });
  if (failure === "unrelated-attestation" || failure === "duplicate-platform") {
    const descriptors = structuredClone(remote.manifests);
    if (failure === "unrelated-attestation")
      descriptors[1].annotations["vnd.docker.reference.digest"] = `sha256:${"f".repeat(64)}`;
    else descriptors.push(descriptors[0]);
    remote = f.index(item.coordinate, descriptors);
    item.imageId = remote.digest;
  }
  await expect(async () => matchingImage(item, remote, f.inspect)).rejects.toThrow();
});

test.each(["missing", "duplicate", "wrong-platform", "extra-attestation", "changed-attestation"])(
  "rejects a final assembly with %s descriptors",
  async (failure) => {
    const f = fixture();
    const manifests = structuredClone(
      f.items.flatMap((item) => f.store.get(item.coordinate).manifests),
    );
    if (failure === "missing") manifests.pop();
    if (failure === "duplicate") manifests.push(manifests[0]);
    if (failure === "wrong-platform") manifests[0].platform.architecture = "arm64";
    if (failure === "extra-attestation") manifests.push(manifests[1]);
    if (failure === "changed-attestation")
      manifests[1].annotations["vnd.docker.reference.digest"] = manifests[2].digest;
    await expect(
      matchingIndex(coordinate, f.index(coordinate, manifests), f.items, f.inspect),
    ).rejects.toThrow();
  },
);
