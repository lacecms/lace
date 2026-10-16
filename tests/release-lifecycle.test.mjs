import { expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lifecycleFixture } from "./release-lifecycle-fixture.mjs";
import {
  acquireArtifactLock,
  assertArtifactIdle,
  withArtifactLock,
} from "../scripts/release-lock.mjs";
import { verifyPublishedInventory } from "../scripts/release-verify-published.mjs";
import {
  importAcceptance,
  persistAcceptance,
  validateAcceptance,
} from "../scripts/release-evidence.mjs";
import {
  releaseBody,
  finalizeGithub,
  parseLifecycleArguments,
  githubClient,
  tool,
} from "../scripts/release-github.mjs";

const use = async (work) => {
  const f = await lifecycleFixture();
  try {
    await work(f);
  } finally {
    await f.cleanup();
  }
};
const ops = (f) => ({
  github: f.github,
  published: (inventory, directory) => verifyPublishedInventory(inventory, directory, f.operations),
});

test("shared lock prevents collisions, aliases and releases on failure without preview writes", () =>
  use(async (f) => {
    await assertArtifactIdle(f.directory);
    await expect(readFile(join(f.root, ".release-artifacts/.locks/no-file"))).rejects.toThrow();
    const release = await acquireArtifactLock(f.directory, "acceptance");
    await symlink(f.directory, join(f.root, "alias"));
    await expect(acquireArtifactLock(join(f.root, "alias"), "clean")).rejects.toThrow("active");
    await expect(assertArtifactIdle(f.directory)).rejects.toThrow("active");
    await release();
    await expect(
      withArtifactLock(f.directory, "test", () => {
        throw new Error("failure");
      }),
    ).rejects.toThrow("failure");
    await assertArtifactIdle(f.directory);
  }));

test("complete public verification ignores next but rejects subsets, missing versions and image changes", () =>
  use(async (f) => {
    const verified = await verifyPublishedInventory(f.inventory, f.directory, f.operations);
    expect(verified.npm.items).toHaveLength(15);
    expect(verified.images.items).toHaveLength(2);
    await expect(
      verifyPublishedInventory(
        { ...f.inventory, packages: f.inventory.packages.slice(1) },
        f.directory,
        f.operations,
      ),
    ).rejects.toThrow("Complete");
    await expect(
      verifyPublishedInventory(f.inventory, f.directory, {
        ...f.operations,
        lookupPackage: async () => ({ tags: {} }),
      }),
    ).rejects.toThrow("Missing published package");
    await expect(
      verifyPublishedInventory(f.inventory, f.directory, {
        ...f.operations,
        lookupPackage: async () => {
          throw new Error("401");
        },
      }),
    ).rejects.toThrow("401");
    f.remote.delete(f.inventory.images[0].coordinate);
    await expect(verifyPublishedInventory(f.inventory, f.directory, f.operations)).rejects.toThrow(
      "Missing published image",
    );
  }));

test("acceptance persists only on complete success and legacy import preserves bytes", () =>
  use(async (f) => {
    const receipt = join(f.root, "receipt.json");
    const original = await readFile(join(f.directory, "acceptance.json"));
    await writeFile(receipt, original);
    await rm(join(f.directory, "acceptance.json"));
    expect(await importAcceptance({ directory: f.directory, receipt })).toMatchObject({
      action: "would-import",
    });
    await expect(readFile(join(f.directory, "acceptance.json"))).rejects.toThrow();
    await importAcceptance({ directory: f.directory, receipt, apply: true });
    expect(await readFile(join(f.directory, "acceptance.json"))).toEqual(original);
    expect(await importAcceptance({ directory: f.directory, receipt, apply: true })).toMatchObject({
      action: "already-imported",
    });
    const report = JSON.parse(original);
    report.acceptance.source.revision = "e".repeat(40);
    await writeFile(receipt, JSON.stringify(report));
    await expect(
      importAcceptance({ directory: f.directory, receipt, apply: true }),
    ).rejects.toThrow("identity");
    await rm(join(f.directory, "acceptance.json"));
    await expect(
      persistAcceptance(f.directory, f.inventory, f.result, "c".repeat(40), false),
    ).rejects.toThrow("cleanup failed");
    await expect(
      persistAcceptance(
        f.directory,
        f.inventory,
        { ...f.result, result: "failed" },
        "c".repeat(40),
      ),
    ).rejects.toThrow("Acceptance");
    await expect(readFile(join(f.directory, "acceptance.json"))).rejects.toThrow();
    report.acceptance.source = f.inventory.source;
    report.password = "private";
    expect(() => validateAcceptance(report, f.inventory, report.inventorySha256)).toThrow();
  }));

test("notes select one entry, normalize links and command arguments default to preview", () => {
  const text = "## 1.0.0-alpha.1\n\n- Change [guide](docs/guide.md).\n\n## 0.9.0\n\n- Old.\n";
  expect(releaseBody(text, "1.0.0-alpha.1", "lacecms/lace", "a".repeat(40))).toContain(
    "/blob/" + "a".repeat(40) + "/docs/guide.md",
  );
  expect(() => releaseBody(text + text, "1.0.0-alpha.1", "lacecms/lace", "a")).toThrow("duplicate");
  expect(() => releaseBody(text, "absent", "lacecms/lace", "a")).toThrow("Missing");
  expect(parseLifecycleArguments(["--artifacts", "/tmp/a"])).toMatchObject({
    apply: false,
    evidence: [],
  });
  for (const args of [
    [],
    ["--artifacts", "--apply"],
    ["--artifacts", "a", "--apply", "--apply"],
    ["--artifacts", "a", "--force"],
  ])
    expect(() => parseLifecycleArguments(args)).toThrow();
});

test("GitHub preview makes no mutations; apply publishes verified assets and reruns idempotently", () =>
  use(async (f) => {
    const options = { root: f.root, directory: f.directory };
    expect(await finalizeGithub(options, ops(f))).toMatchObject({
      action: "would-finalize",
      body: f.body,
    });
    expect(f.mutations).toEqual([]);
    const receipt = await finalizeGithub({ ...options, apply: true }, ops(f));
    expect(receipt.source).toEqual(f.inventory.source);
    expect(Object.keys(receipt.assets)).toHaveLength(4);
    expect(f.release.draft).toBe(false);
    const before = f.mutations.length;
    await finalizeGithub({ ...options, apply: true }, ops(f));
    expect(f.mutations).toHaveLength(before);
    // A later docs HEAD must not rewrite immutable links in release descriptions.
    f.github.context = async () => ({
      notesRevision: "f".repeat(40),
      committedChangelog: f.changelog,
    });
    await finalizeGithub({ ...options, apply: true }, ops(f));
    expect(f.mutations).toHaveLength(before);
  }));

test("GitHub refuses mismatched tags, unpublished source, unreviewed notes and public evidence leaks", () =>
  use(async (f) => {
    const options = { root: f.root, directory: f.directory, apply: true };
    f.tag = "e".repeat(40);
    await expect(finalizeGithub(options, ops(f))).rejects.toThrow("tag points");
    f.tag = null;
    const original = f.github.commit;
    f.github.commit = async () => {
      throw new Error("remote commit missing");
    };
    await expect(finalizeGithub(options, ops(f))).rejects.toThrow("remote commit");
    f.github.commit = original;
    await writeFile(join(f.root, "CHANGELOG.md"), f.changelog + "unreviewed");
    await expect(finalizeGithub(options, ops(f))).rejects.toThrow("Commit reviewed");
    await writeFile(join(f.root, "CHANGELOG.md"), f.changelog);
    const inventory = { ...f.inventory, secret: "private" };
    await expect(
      finalizeGithub(options, { ...ops(f), verify: async () => inventory }),
    ).rejects.toThrow("Non-public");
    expect(f.mutations).toEqual([]);
  }));

test("interrupted uploads resume a matching draft; conflicting assets are never replaced", () =>
  use(async (f) => {
    const options = { root: f.root, directory: f.directory, apply: true };
    const upload = f.github.upload;
    f.github.upload = async (...args) => {
      if (args[1] === "acceptance.json") throw new Error("interrupted upload");
      return upload(...args);
    };
    await expect(finalizeGithub(options, ops(f))).rejects.toThrow("interrupted upload");
    expect(f.release.draft).toBe(true);
    expect(f.release.assets).toHaveLength(1);
    f.github.upload = upload;
    await finalizeGithub(options, ops(f));
    expect(f.mutations.filter((value) => value === "create")).toHaveLength(1);
    f.assetBytes.set(f.release.assets[0].id, Buffer.from("changed"));
    await expect(finalizeGithub(options, ops(f))).rejects.toThrow("bytes conflict");
  }));

test("gh adapter uses structured stdin and publishes prerelease without latest", async () => {
  const calls = [];
  const client = githubClient("lacecms/lace", async (tool, args, input) => {
    calls.push({ tool, args, input });
    return Buffer.from("{}");
  });
  await client.create("v1.0.0-alpha.1", "a".repeat(40), "Short notes\n\n- Important change.");
  await client.publish({ id: 1 });
  expect(JSON.parse(calls[0].input)).toMatchObject({
    draft: true,
    prerelease: true,
    make_latest: "false",
  });
  expect(JSON.parse(calls[1].input)).toMatchObject({
    draft: false,
    prerelease: true,
    make_latest: "false",
  });
  expect(calls[0].args).toContain("--input");
});

test("GitHub preview reports unavailable prerequisites without creating a release", () =>
  use(async (f) => {
    const report = await finalizeGithub(
      { root: f.root, directory: f.directory },
      {
        ...ops(f),
        published: async () => {
          throw new Error("publication incomplete");
        },
      },
    );
    expect(report).toMatchObject({
      action: "blocked",
      unmetPrerequisites: ["publication incomplete"],
    });
    expect(f.mutations).toEqual([]);
  }));

test("untracked changelog is an actionable local prerequisite in preview and apply", () =>
  use(async (f) => {
    const command = (name, args, input) => {
      expect(name).toBe("git");
      return tool(name, ["-C", f.root, ...args], input);
    };
    const client = githubClient("lacecms/lace", command);
    expect(await client.context()).toMatchObject({ committedChangelog: f.changelog });
    execFileSync("git", ["-C", f.root, "rm", "--cached", "CHANGELOG.md"]);
    execFileSync("git", ["-C", f.root, "commit", "-m", "fixture without notes"]);
    f.github.context = client.context;
    const options = { root: f.root, directory: f.directory };
    const report = await finalizeGithub(options, ops(f));
    expect(report.action).toBe("blocked");
    expect(report.unmetPrerequisites[0]).toContain("Commit reviewed CHANGELOG.md");
    expect(report.unmetPrerequisites[0]).toContain("absent from HEAD");
    expect(report.unmetPrerequisites[0]).not.toContain("authentication");
    await expect(finalizeGithub({ ...options, apply: true }, ops(f))).rejects.toThrow(
      "Commit reviewed CHANGELOG.md",
    );
    expect(f.mutations).toEqual([]);
    expect(await readFile(join(f.root, "CHANGELOG.md"), "utf8")).toBe(f.changelog);
  }));

test("local git failures do not suggest remote authentication", async () => {
  await expect(tool("git", ["show", "HEAD:lace-missing-file-for-diagnostic-test"])).rejects.toThrow(
    "Local git show failed (128); check repository state and revision availability",
  );
});

test("a tag changed during asset upload is refused before publication", () =>
  use(async (f) => {
    const upload = f.github.upload;
    f.github.upload = async (...args) => {
      const result = await upload(...args);
      f.tag = "e".repeat(40);
      return result;
    };
    await expect(
      finalizeGithub({ root: f.root, directory: f.directory, apply: true }, ops(f)),
    ).rejects.toThrow("tag changed");
    expect(f.release.draft).toBe(true);
    expect(f.mutations).not.toContain("publish");
  }));

test("anonymous GHCR verification checks manifest bytes and refuses private or malformed coordinates", async () => {
  const { inspectPublicImage } = await import("../scripts/release-verify-published.mjs");
  const { createHash } = await import("node:crypto");
  const original = globalThis.fetch;
  const body = JSON.stringify({ schemaVersion: 2, config: { digest: `sha256:${"a".repeat(64)}` } });
  const digest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
  try {
    globalThis.fetch = async (url) =>
      String(url).includes("/token?")
        ? Response.json({ token: "public-test-token" })
        : new Response(body, { headers: { "docker-content-digest": digest } });
    expect(await inspectPublicImage(`ghcr.io/lacecms/api@${digest}`)).toMatchObject({ digest });
    await expect(
      inspectPublicImage(`ghcr.io/lacecms/api@sha256:${"b".repeat(64)}`),
    ).rejects.toThrow("digest mismatch");
    globalThis.fetch = async () => new Response(null, { status: 401 });
    await expect(inspectPublicImage("ghcr.io/lacecms/api:0.1.0-alpha.6")).rejects.toThrow(
      "unavailable",
    );
    await expect(inspectPublicImage("https://private.invalid/image")).rejects.toThrow(
      "Unsupported",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("gh upload uses a temporary allowlisted filename without clobber and removes its local file", async () => {
  let uploadedPath;
  const client = githubClient("lacecms/lace", async (name, args) => {
    expect(name).toBe("gh");
    expect(args.slice(0, 3)).toEqual(["release", "upload", "v0.1.0-alpha.6"]);
    expect(args).not.toContain("--clobber");
    uploadedPath = args[3];
    expect(await readFile(uploadedPath, "utf8")).toBe('{"public":true}');
    return Buffer.from("");
  });
  await client.upload(
    { tag_name: "v0.1.0-alpha.6" },
    "inventory.json",
    Buffer.from('{"public":true}'),
  );
  await expect(readFile(uploadedPath)).rejects.toThrow();
});
