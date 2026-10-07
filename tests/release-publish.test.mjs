import { expect, test } from "vitest";
import { parsePublishArguments, publishRelease } from "../scripts/release-publish.mjs";

const id = (char) => `sha256:${char.repeat(64)}`;
const packages = ["@lacecms/content", "@lacecms/sdk", "create-lace"].map((name) => ({
  name,
  version: "0.1.0-alpha.3",
  file: `packages/${name.split("/").at(-1)}.tgz`,
}));
const images = ["amd64", "arm64"].map((arch, i) => ({
  kind: "api",
  platform: `linux/${arch}`,
  coordinate: `ghcr.io/lacecms/api:0.1.0-alpha.3-${arch}`,
  imageId: id(String(i + 1)),
  file: `images/api-${arch}.tar`,
}));
const inventory = {
  complete: true,
  publicationEligible: true,
  source: { revision: "source" },
  release: { version: "0.1.0-alpha.3", channel: "next", images: { api: "ghcr.io/lacecms/api" } },
  packages,
  images,
};
const local = { integrity: "sha512-reviewed", shasum: "reviewed" };
const options = { target: "npm", directory: "/artifacts" };

function harness(overrides = {}) {
  const commands = [];
  const receipts = [];
  const published = new Set();
  return {
    commands,
    receipts,
    operations: {
      verify: async () => inventory,
      loadSubmitted: async () => [],
      saveSubmitted: async () => {},
      packageHashes: async () => local,
      lookupPackage: async (item) =>
        published.has(item.name) ? { dist: local, tags: { next: item.version } } : { tags: {} },
      command: async (tool, args) => {
        commands.push([tool, ...args]);
        if (tool === "npm" && args[0] === "publish") {
          const item = packages.find((p) => args[1].endsWith(p.file));
          published.add(item.name);
        }
        return "";
      },
      save: async (path, receipt) => receipts.push({ path, receipt }),
      wait: async () => {},
      ...overrides,
    },
  };
}

test("publication arguments require explicit target and artifacts, reject unknown/duplicate options", () => {
  expect(
    parsePublishArguments([
      "npm",
      "--artifacts",
      "/artifacts",
      "--packages",
      "cli,create-lace",
      "--dry-run",
    ]),
  ).toMatchObject({
    target: "npm",
    directory: "/artifacts",
    only: ["cli", "create-lace"],
    dryRun: true,
  });
  for (const args of [
    ["npm"],
    ["all", "--artifacts", "/a"],
    ["npm", "--artifacts", "--dry-run"],
    ["images", "--artifacts", "/a", "--packages", "cli"],
    ["npm", "--artifacts", "/a", "--dry-run", "--dry-run"],
  ])
    expect(() => parsePublishArguments(args)).toThrow();
});

test("reject incomplete, preview, stable and invalid selections before mutation", async () => {
  for (const invalid of [
    { ...inventory, complete: false },
    { ...inventory, publicationEligible: false },
    { ...inventory, release: { ...inventory.release, channel: "latest" } },
  ]) {
    const h = harness({ verify: async () => invalid });
    await expect(publishRelease(options, h.operations)).rejects.toThrow();
    expect(h.commands).toEqual([]);
  }
  for (const only of [["typo"], ["sdk", "sdk"], ["sdk", "@lacecms/sdk"]]) {
    const h = harness();
    await expect(publishRelease({ ...options, only }, h.operations)).rejects.toThrow();
    expect(h.commands).toEqual([]);
  }
});

test("npm publishes selected exact tarballs in inventory order and saves verified receipt", async () => {
  const h = harness();
  const receipt = await publishRelease({ ...options, only: ["create-lace", "sdk"] }, h.operations);
  expect(h.commands.map((c) => c[2])).toEqual([
    "/artifacts/packages/sdk.tgz",
    "/artifacts/packages/create-lace.tgz",
  ]);
  for (const c of h.commands) {
    expect(c).toContain("next");
    expect(c).toContain("--access");
    expect(c).toContain("public");
    expect(c).not.toContain("--dry-run");
    expect(c).not.toContain("latest");
  }
  expect(receipt.items.map((item) => item.action)).toEqual(["published", "published"]);
  expect(h.receipts[0].path).toBe("/artifacts/publication-npm.json");
});

test("npm dry-run cannot change tags or write receipts and resumes matching versions", async () => {
  const h = harness({
    lookupPackage: async (item) =>
      item.name === packages[0].name ? { dist: local, tags: {} } : { tags: {} },
  });
  const receipt = await publishRelease({ ...options, dryRun: true }, h.operations);
  expect(receipt.items[0].action).toBe("already-published");
  expect(h.commands).toHaveLength(2);
  expect(h.commands.every((c) => c.includes("--dry-run") && c[1] === "publish")).toBe(true);
  expect(h.receipts).toEqual([]);
});

test("later npm conflict or registry failure prevents all publication", async () => {
  for (const fail of [false, true]) {
    const h = harness({
      lookupPackage: async (item) => {
        if (item.name !== "create-lace") return { tags: {} };
        if (fail) throw new Error("registry unavailable");
        return { dist: { integrity: "sha512-different" }, tags: {} };
      },
    });
    await expect(publishRelease(options, h.operations)).rejects.toThrow();
    expect(h.commands).toEqual([]);
  }
});

test("matching npm versions restore only next, never republish or move latest", async () => {
  let tagged = false;
  const h = harness({
    lookupPackage: async () => ({
      dist: local,
      tags: { next: tagged ? packages[0].version : "older", latest: "stable" },
    }),
  });
  h.operations.command = async (tool, args) => {
    h.commands.push([tool, ...args]);
    tagged = true;
  };
  await publishRelease({ ...options, only: ["content"] }, h.operations);
  expect(h.commands).toEqual([
    [
      "npm",
      "dist-tag",
      "add",
      "@lacecms/content@0.1.0-alpha.3",
      "next",
      "--registry",
      "https://registry.npmjs.org",
    ],
  ]);
});

test("unverified npm batch submits every package and produces no success receipt", async () => {
  const h = harness({ lookupPackage: async () => ({ tags: {} }) });
  await expect(publishRelease(options, h.operations)).rejects.toThrow("verification failed");
  expect(h.commands).toHaveLength(packages.length);
  expect(h.receipts).toEqual([]);
});

test("npm submits the whole batch before any processing wait or verification", async () => {
  let lookups = 0;
  let processingFinished = false;
  const h = harness({
    lookupPackage: async (item) => {
      lookups++;
      if (lookups > packages.length) expect(h.commands).toHaveLength(packages.length);
      return processingFinished ? { dist: local, tags: { next: item.version } } : { tags: {} };
    },
    wait: async () => {
      expect(h.commands).toHaveLength(packages.length);
      processingFinished = true;
    },
  });
  await publishRelease(options, h.operations);
  expect(h.commands.map((c) => c[2])).toEqual(packages.map((item) => `/artifacts/${item.file}`));
  expect(h.receipts).toHaveLength(1);
});

test("npm processing can take minutes and transient metadata failures do not republish", async () => {
  let lookups = 0;
  const waits = [];
  const submitted = [];
  const h = harness({
    lookupPackage: async () => {
      lookups++;
      if (lookups === 3)
        throw Object.assign(new Error("registry unavailable"), { retryable: true });
      return lookups > 13 ? { dist: local, tags: { next: packages[0].version } } : { tags: {} };
    },
    wait: async (ms) => waits.push(ms),
    saveSubmitted: async (_, entries) => submitted.push(...entries),
  });
  await publishRelease({ ...options, only: ["content"] }, h.operations);
  expect(waits.length).toBeGreaterThan(10);
  expect(waits.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThan(100_000);
  expect(h.commands).toHaveLength(1);
  expect(submitted).toEqual([
    { name: packages[0].name, version: packages[0].version, integrity: local.integrity },
  ]);
});

test("a submitted pending package is only verified on resume, even across another timeout", async () => {
  let submitted = [];
  const h = harness({
    lookupPackage: async () => ({ tags: {} }),
    loadSubmitted: async () => submitted,
    saveSubmitted: async (_, entries) => {
      submitted = structuredClone(entries);
    },
  });
  await expect(publishRelease({ ...options, only: ["content"] }, h.operations)).rejects.toThrow(
    "Submission was saved",
  );
  expect(h.commands).toHaveLength(1);
  h.commands.length = 0;
  await expect(publishRelease({ ...options, only: ["content"] }, h.operations)).rejects.toThrow(
    "Submission was saved",
  );
  expect(h.commands).toEqual([]);
  h.operations.lookupPackage = async () => ({ dist: local, tags: { next: packages[0].version } });
  await publishRelease({ ...options, only: ["content"] }, h.operations);
  expect(h.commands).toEqual([]);
});

test("changed submitted archive blocks publication before any command", async () => {
  const h = harness({
    loadSubmitted: async () => [
      { name: packages[0].name, version: packages[0].version, integrity: "sha512-different" },
    ],
  });
  await expect(publishRelease(options, h.operations)).rejects.toThrow("Submitted archive differs");
  expect(h.commands).toEqual([]);
});

function imageHarness(existing = new Map()) {
  const h = harness({ inspectImage: async (coordinate) => existing.get(coordinate) ?? null });
  h.operations.command = async (tool, args) => {
    h.commands.push([tool, ...args]);
    if (args[0] === "image") {
      const item = images.find((image) => image.imageId === args[2]);
      return JSON.stringify([
        { Id: item.imageId, Os: "linux", Architecture: item.platform.split("/")[1] },
      ]);
    }
    if (args[0] === "push") {
      const item = images.find((image) => image.coordinate === args[1]);
      const remote = {
        digest: id(item.platform.endsWith("amd64") ? "a" : "b"),
        config: { digest: item.imageId },
      };
      existing.set(item.coordinate, remote);
      existing.set(`ghcr.io/lacecms/api@${remote.digest}`, remote);
    }
    if (args[0] === "buildx")
      existing.set("ghcr.io/lacecms/api:0.1.0-alpha.3", {
        digest: id("c"),
        manifests: images.map((item) => ({
          digest: existing.get(item.coordinate).digest,
          platform: { os: "linux", architecture: item.platform.split("/")[1] },
        })),
      });
    return "";
  };
  return h;
}

test("image dry-run reads registry but never loads, tags, pushes or writes receipts", async () => {
  const h = imageHarness();
  const receipt = await publishRelease(
    { ...options, target: "images", dryRun: true },
    h.operations,
  );
  expect(h.commands).toEqual([]);
  expect(h.receipts).toEqual([]);
  expect(receipt.items[0].action).toBe("would-publish");
});

test("image publication loads exact archives, checks identities and assembles pinned remote digests", async () => {
  const h = imageHarness();
  const receipt = await publishRelease(
    { ...options, target: "images", only: ["api"] },
    h.operations,
  );
  expect(h.commands.filter((c) => c[1] === "load").map((c) => c.at(-1))).toEqual(
    images.map((i) => `/artifacts/${i.file}`),
  );
  expect(h.commands.at(-1)).toEqual([
    "docker",
    "buildx",
    "imagetools",
    "create",
    "--tag",
    "ghcr.io/lacecms/api:0.1.0-alpha.3",
    `ghcr.io/lacecms/api@${id("a")}`,
    `ghcr.io/lacecms/api@${id("b")}`,
  ]);
  expect(receipt.items[0]).toMatchObject({
    digest: id("c"),
    platforms: [{ digest: id("a") }, { digest: id("b") }],
  });
  expect(h.receipts[0].path).toBe("/artifacts/publication-images.json");
  expect(h.commands.flat()).not.toContain("build");
});

test("image rerun resumes missing platforms and subsequently skips the complete matching release", async () => {
  const existing = new Map([
    [images[0].coordinate, { digest: id("a"), config: { digest: images[0].imageId } }],
    [`ghcr.io/lacecms/api@${id("a")}`, { digest: id("a"), config: { digest: images[0].imageId } }],
  ]);
  const first = imageHarness(existing);
  await publishRelease({ ...options, target: "images" }, first.operations);
  expect(first.commands.filter((c) => c[1] === "push")).toEqual([
    ["docker", "push", images[1].coordinate],
  ]);
  const second = imageHarness(existing);
  await publishRelease({ ...options, target: "images" }, second.operations);
  expect(second.commands).toEqual([]);
});

test("conflicting image, malformed index or registry error blocks every push", async () => {
  for (const existing of [
    new Map([[images[1].coordinate, { digest: id("d"), config: { digest: id("e") } }]]),
    new Map([["ghcr.io/lacecms/api:0.1.0-alpha.3", { manifests: [] }]]),
  ]) {
    const h = imageHarness(existing);
    await expect(publishRelease({ ...options, target: "images" }, h.operations)).rejects.toThrow(
      "differ",
    );
    expect(h.commands).toEqual([]);
  }
  const h = imageHarness();
  h.operations.inspectImage = async () => {
    throw new Error("unauthorized");
  };
  await expect(publishRelease({ ...options, target: "images" }, h.operations)).rejects.toThrow(
    "unauthorized",
  );
  expect(h.commands).toEqual([]);
});

test("loaded image with wrong platform is never tagged or pushed", async () => {
  const h = imageHarness();
  h.operations.command = async (tool, args) => {
    h.commands.push([tool, ...args]);
    return args[0] === "image"
      ? JSON.stringify([{ Id: images[0].imageId, Os: "linux", Architecture: "arm64" }])
      : "";
  };
  await expect(publishRelease({ ...options, target: "images" }, h.operations)).rejects.toThrow(
    "Loaded image",
  );
  expect(h.commands.map((c) => c[1])).toEqual(["load", "image"]);
});
