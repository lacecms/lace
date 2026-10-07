import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonFile, verifyInventory } from "./release-artifacts.mjs";

const registry = "https://registry.npmjs.org";
const digestPattern = /^sha256:[a-f0-9]{64}$/u;

export function parsePublishArguments(args) {
  const [target, ...rest] = args;
  if (!["npm", "images"].includes(target)) throw new Error("Select npm or images");
  const options = { target, dryRun: false };
  const selection = target === "npm" ? "--packages" : "--images";
  const seen = new Set();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === "--dry-run") options.dryRun = true;
    else if (
      ["--artifacts", selection].includes(flag) &&
      rest[i + 1] &&
      !rest[i + 1].startsWith("--")
    ) {
      const value = rest[++i];
      if (flag === "--artifacts") options.directory = resolve(value);
      else options.only = value.split(",");
    } else throw new Error(`Unsupported or incomplete publication option: ${flag}`);
  }
  if (!options.directory) throw new Error("Publication requires --artifacts <prepared-directory>");
  return options;
}

function select(items, only, key) {
  if (!only) return items;
  if (
    new Set(only).size !== only.length ||
    only.some((name) => !items.some((item) => key(item) === name))
  )
    throw new Error(`Unknown or duplicate selection: ${only.join(",")}`);
  return items.filter((item) => only.includes(key(item)));
}

async function command(tool, args, { capture = false, missing = false } = {}) {
  console.info(`Publication: ${tool} ${args.join(" ")}`);
  return new Promise((accept, reject) => {
    const child = spawn(tool, args, {
      stdio: ["inherit", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"],
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
      child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    }
    child.on("error", () => reject(new Error(`Could not start ${tool}`)));
    child.on("close", (code) => {
      if (code === 0) accept(stdout.trim());
      else if (
        missing &&
        /manifest unknown|no such manifest|not found/iu.test(stderr) &&
        !/unauthorized|denied|forbidden/iu.test(stderr)
      )
        accept(null);
      else
        reject(
          new Error(
            `${tool} ${args.slice(0, 3).join(" ")} failed (${code}). Check registry access and authentication.`,
          ),
        );
    });
  });
}

async function packageHashes(path) {
  const sha512 = createHash("sha512");
  const sha1 = createHash("sha1");
  for await (const chunk of createReadStream(path)) {
    sha512.update(chunk);
    sha1.update(chunk);
  }
  return { integrity: `sha512-${sha512.digest("base64")}`, shasum: sha1.digest("hex") };
}

async function lookupPackage(item) {
  const response = await fetch(`${registry}/${encodeURIComponent(item.name)}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { "cache-control": "no-cache" },
  });
  if (response.status === 404) return { tags: {} };
  if (!response.ok)
    throw Object.assign(
      new Error(`npm metadata request failed (${response.status}): ${item.name}`),
      {
        retryable: response.status === 429 || response.status >= 500,
      },
    );
  const metadata = await response.json();
  return { dist: metadata.versions?.[item.version]?.dist, tags: metadata["dist-tags"] ?? {} };
}

function matchingPackage(item, local, remote) {
  if (!remote.dist) return false;
  const matches = remote.dist.integrity
    ? remote.dist.integrity.split(/\s+/u).includes(local.integrity)
    : remote.dist.shasum === local.shasum;
  if (!matches) throw new Error(`Published archive differs: ${item.name}@${item.version}`);
  return true;
}

async function inspectImage(coordinate) {
  const raw = await command("docker", ["buildx", "imagetools", "inspect", coordinate, "--raw"], {
    capture: true,
    missing: true,
  });
  if (raw === null) return null;
  const descriptor = JSON.parse(
    await command(
      "docker",
      ["buildx", "imagetools", "inspect", coordinate, "--format", "{{json .Manifest}}"],
      { capture: true },
    ),
  );
  if (!digestPattern.test(descriptor.digest))
    throw new Error(`Invalid registry digest: ${coordinate}`);
  return { ...JSON.parse(raw), digest: descriptor.digest };
}

function matchingImage(item, remote) {
  if (!remote) return false;
  if (remote.config?.digest !== item.imageId || !digestPattern.test(remote.digest))
    throw new Error(`Published image differs: ${item.coordinate}`);
  return true;
}

async function matchingIndex(coordinate, remote, items, inspect) {
  if (!remote) return false;
  if (!Array.isArray(remote.manifests) || remote.manifests.length !== items.length)
    throw new Error(`Published manifest platforms differ: ${coordinate}`);
  const repository = coordinate.slice(0, coordinate.lastIndexOf(":"));
  for (const item of items) {
    const descriptors = remote.manifests.filter(
      (entry) => `${entry.platform?.os}/${entry.platform?.architecture}` === item.platform,
    );
    if (descriptors.length !== 1 || !digestPattern.test(descriptors[0].digest))
      throw new Error(`Published manifest platform differs: ${coordinate} (${item.platform})`);
    const child = await inspect(`${repository}@${descriptors[0].digest}`);
    if (!matchingImage(item, child))
      throw new Error(`Missing published manifest image: ${coordinate}`);
  }
  return true;
}

export async function publishRelease(options, operations = {}) {
  const { directory, target, dryRun = false, only } = options;
  if (!["npm", "images"].includes(target)) throw new Error("Select npm or images");
  const inventory = await (operations.verify ?? verifyInventory)(directory);
  if (!inventory.complete || !inventory.publicationEligible || inventory.release.channel !== "next")
    throw new Error("Publication requires a complete, eligible alpha inventory with channel next");
  const run = operations.command ?? command;
  const receipt = {
    target,
    dryRun,
    version: inventory.release.version,
    source: inventory.source,
    items: [],
  };
  console.info(
    `Publication: ${dryRun ? "DRY RUN" : "LIVE"} ${target} ${inventory.release.version}`,
  );

  if (target === "npm") {
    const submittedPath = join(directory, "publication-npm-submitted.json");
    const submitted = await (
      operations.loadSubmitted ??
      (async (path) => {
        try {
          return JSON.parse(await readFile(path, "utf8"));
        } catch (error) {
          if (error.code === "ENOENT") return [];
          throw error;
        }
      })
    )(submittedPath);
    if (!Array.isArray(submitted)) throw new Error("Invalid npm submission journal");
    const names = only?.map((name) =>
      name === "create-lace" || name.startsWith("@") ? name : `@lacecms/${name}`,
    );
    const items = select(inventory.packages, names, (item) => item.name);
    const lookup = operations.lookupPackage ?? lookupPackage;
    const hashes = operations.packageHashes ?? packageHashes;
    const plans = [];
    // Check every selected version before publishing any package.
    for (const item of items) {
      const local = await hashes(join(directory, item.file));
      const remote = await lookup(item);
      const previous = submitted.find(
        (entry) => entry.name === item.name && entry.version === item.version,
      );
      if (previous && previous.integrity !== local.integrity)
        throw new Error(`Submitted archive differs: ${item.name}@${item.version}`);
      plans.push({
        item,
        local,
        remote,
        submitted: !!previous,
        exists: matchingPackage(item, local, remote),
      });
    }
    for (const { item, local, exists, submitted: alreadySubmitted } of plans) {
      if (exists)
        console.info(`Publication: matching archive already exists: ${item.name}@${item.version}`);
      else if (!alreadySubmitted) {
        await run("npm", [
          "publish",
          join(directory, item.file),
          "--access",
          "public",
          "--tag",
          "next",
          "--registry",
          registry,
          "--ignore-scripts",
          ...(dryRun ? ["--dry-run"] : []),
        ]);
        if (!dryRun) {
          submitted.push({ name: item.name, version: item.version, integrity: local.integrity });
          await (operations.saveSubmitted ?? jsonFile)(submittedPath, submitted);
        }
      } else
        console.info(
          `Publication: already submitted; awaiting registry: ${item.name}@${item.version}`,
        );
      receipt.items.push({
        name: item.name,
        version: item.version,
        integrity: local.integrity,
        action: exists
          ? "already-published"
          : alreadySubmitted
            ? dryRun
              ? "awaiting-registry"
              : "verified-submission"
            : dryRun
              ? "would-publish"
              : "published",
      });
    }
    if (!dryRun) {
      // Send the whole batch before checking registry processing or repairing tags.
      for (const { item, remote, exists } of plans) {
        if (exists && remote.tags.next !== item.version)
          await run("npm", [
            "dist-tag",
            "add",
            `${item.name}@${item.version}`,
            "next",
            "--registry",
            registry,
          ]);
      }
      const pending = new Map(plans.map((plan) => [plan.item.name, plan]));
      const deadline = Date.now() + 600_000;
      for (let attempt = 0; pending.size > 0 && attempt <= 60; attempt++) {
        const current = [...pending.values()];
        const results = await Promise.allSettled(current.map(({ item }) => lookup(item)));
        for (const [index, result] of results.entries()) {
          const { item, local } = current[index];
          if (result.status === "rejected") {
            const error = result.reason;
            if (!(error.retryable || error instanceof TypeError)) throw error;
            console.info(
              `Publication: temporary npm metadata error; retrying ${item.name}@${item.version}`,
            );
            continue;
          }
          if (matchingPackage(item, local, result.value) && result.value.tags.next === item.version)
            pending.delete(item.name);
        }
        if (pending.size === 0 || attempt === 60 || Date.now() >= deadline) break;
        console.info(
          `Publication: all packages submitted; waiting for npm processing (${pending.size} remaining): ${[...pending.keys()].join(", ")}`,
        );
        await (operations.wait ?? ((ms) => new Promise((done) => setTimeout(done, ms))))(
          Math.max(0, Math.min(10_000, deadline - Date.now())),
        );
      }
      if (pending.size > 0)
        throw new Error(
          `npm publication verification failed: ${[...pending.keys()].join(", ")}; not visible with tag next after 10 minutes of polling. Submission was saved; rerun the same command to continue waiting without republishing`,
        );
    }
  } else {
    const kinds = select(Object.keys(inventory.release.images), only, (kind) => kind);
    const inspect = operations.inspectImage ?? inspectImage;
    const plans = [];
    // Preflight platform tags and full manifests before loading or pushing.
    for (const kind of kinds) {
      const items = inventory.images.filter((item) => item.kind === kind);
      const coordinate = `${inventory.release.images[kind]}:${inventory.release.version}`;
      const platforms = [];
      for (const item of items) {
        const remote = await inspect(item.coordinate);
        platforms.push({ item, remote, exists: matchingImage(item, remote) });
      }
      const remote = await inspect(coordinate);
      const exists = await matchingIndex(coordinate, remote, items, inspect);
      plans.push({ coordinate, platforms, remote, exists });
    }
    for (const plan of plans) {
      for (const platform of plan.platforms) {
        const { item, exists } = platform;
        if (dryRun)
          console.info(
            `Publication: ${exists ? "skip matching" : "would load/tag/push"} ${item.coordinate}`,
          );
        else if (!exists) {
          await run("docker", ["load", "--input", join(directory, item.file)]);
          const [loaded] = JSON.parse(
            await run("docker", ["image", "inspect", item.imageId], { capture: true }),
          );
          if (loaded.Id !== item.imageId || `${loaded.Os}/${loaded.Architecture}` !== item.platform)
            throw new Error(`Loaded image identity/platform differs: ${item.coordinate}`);
          await run("docker", ["tag", item.imageId, item.coordinate]);
          await run("docker", ["push", item.coordinate]);
          platform.remote = await inspect(item.coordinate);
          if (!matchingImage(item, platform.remote))
            throw new Error(`Image missing after push: ${item.coordinate}`);
        }
      }
      if (dryRun)
        console.info(
          `Publication: ${plan.exists ? "skip matching" : "would create/push manifest"} ${plan.coordinate}`,
        );
      else if (!plan.exists) {
        const repository = plan.coordinate.slice(0, plan.coordinate.lastIndexOf(":"));
        await run("docker", [
          "buildx",
          "imagetools",
          "create",
          "--tag",
          plan.coordinate,
          ...plan.platforms.map(({ remote }) => `${repository}@${remote.digest}`),
        ]);
        plan.remote = await inspect(plan.coordinate);
        if (
          !(await matchingIndex(
            plan.coordinate,
            plan.remote,
            plan.platforms.map(({ item }) => item),
            inspect,
          ))
        )
          throw new Error(`Manifest missing after push: ${plan.coordinate}`);
      }
      receipt.items.push({
        coordinate: plan.coordinate,
        digest: plan.remote?.digest,
        platforms: plan.platforms.map(({ item, remote }) => ({
          coordinate: item.coordinate,
          platform: item.platform,
          imageId: item.imageId,
          digest: remote?.digest,
        })),
        action: plan.exists ? "already-published" : dryRun ? "would-publish" : "published",
      });
    }
  }
  if (!dryRun)
    await (operations.save ?? jsonFile)(join(directory, `publication-${target}.json`), {
      ...receipt,
      time: new Date().toISOString(),
    });
  return receipt;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  publishRelease(parsePublishArguments(process.argv.slice(2)))
    .then((receipt) => console.info(JSON.stringify(receipt, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
