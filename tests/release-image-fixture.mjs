import { createHash } from "node:crypto";

export const OCI_INDEX = "application/vnd.oci.image.index.v1+json";
export const OCI_MANIFEST = "application/vnd.oci.image.manifest.v1+json";
export const imageDigest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

/** Content-addressed graphs shaped like buildx/containerd's saved platform images. */
export function indexedImages(input) {
  const store = new Map();
  const bytes = new Map();
  const save = (repository, body) => {
    const raw = JSON.stringify(body);
    const digest = imageDigest(raw);
    const value = { ...body, digest, byteLength: Buffer.byteLength(raw) };
    store.set(`${repository}@${digest}`, value);
    bytes.set(digest, raw);
    return value;
  };
  const descriptor = (value, extra = {}) => ({
    mediaType: value.mediaType,
    digest: value.digest,
    size: value.byteLength,
    ...extra,
  });
  const items = input.map((item) => {
    const repository = item.coordinate.slice(0, item.coordinate.lastIndexOf(":"));
    const [os, architecture] = item.platform.split("/");
    const runtime = save(repository, {
      schemaVersion: 2,
      mediaType: OCI_MANIFEST,
      config: { digest: imageDigest(`config:${item.coordinate}`) },
      layers: [],
    });
    const attestation = save(repository, {
      schemaVersion: 2,
      mediaType: OCI_MANIFEST,
      config: { digest: imageDigest(`attestation:${item.coordinate}`) },
      layers: [],
    });
    const root = save(repository, {
      schemaVersion: 2,
      mediaType: OCI_INDEX,
      manifests: [
        descriptor(runtime, { platform: { os, architecture } }),
        descriptor(attestation, {
          platform: { os: "unknown", architecture: "unknown" },
          annotations: {
            "vnd.docker.reference.type": "attestation-manifest",
            "vnd.docker.reference.digest": runtime.digest,
          },
        }),
      ],
    });
    store.set(item.coordinate, root);
    return { ...item, imageId: root.digest };
  });
  const index = (coordinate, manifests) => {
    const repository = coordinate.slice(0, coordinate.lastIndexOf(":"));
    const root = save(repository, { schemaVersion: 2, mediaType: OCI_INDEX, manifests });
    store.set(coordinate, root);
    return root;
  };
  const final = (coordinate, selected = items, nested = false) =>
    index(
      coordinate,
      selected.flatMap((item) => {
        const root = store.get(item.coordinate);
        return nested
          ? [
              descriptor(root, {
                platform: { os: "linux", architecture: item.platform.split("/")[1] },
              }),
            ]
          : root.manifests;
      }),
    );
  return {
    items,
    store,
    bytes,
    index,
    final,
    inspect: async (coordinate) => store.get(coordinate) ?? null,
  };
}
