import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checksum, verifyInventory } from "./release-artifacts.mjs";
import { hashBytes, validateAcceptance } from "./release-evidence.mjs";
import {
  parseLifecycleArguments,
  publicAssets,
  releaseContext,
  tool,
  validatePublicInventory,
  verifyAssets,
} from "./release-github.mjs";
import { assertArtifactIdle, operationPaths, withArtifactLock } from "./release-lock.mjs";
import { packageHashes } from "./release-publish.mjs";
import { verifyPublishedInventory } from "./release-verify-published.mjs";

const inside = (parent, child) => child === parent || child.startsWith(`${parent}${sep}`);
const optional = async (path) => {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

export async function validateCleanupPaths(root, directory, evidence = [], command = tool) {
  const allowed = join(resolve(root), ".release-artifacts");
  const paths = [resolve(directory), ...evidence.map((path) => resolve(path))];
  const base = await lstat(allowed);
  if (
    !base.isDirectory() ||
    base.isSymbolicLink() ||
    (await realpath(allowed)) !== join(await realpath(root), ".release-artifacts")
  )
    throw new Error("Unsafe artifact root");
  for (const path of paths) {
    if (
      dirname(path) !== allowed ||
      basename(path).startsWith(".") ||
      /[*?]/u.test(path) ||
      path.includes("[") ||
      path.includes("]") ||
      paths.filter((item) => item === path).length !== 1
    )
      throw new Error(
        "Select distinct explicit artifact/evidence child directories; root and escapes are refused",
      );
    try {
      const stat = await lstat(path);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        !inside(await realpath(allowed), await realpath(path))
      )
        throw new Error("Unsafe cleanup path or symlink");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const tracked = await command("git", [
      "-C",
      root,
      "ls-files",
      "-z",
      "--",
      relative(root, path),
    ]);
    if (tracked.length) throw new Error("Cleanup refuses tracked files");
    if (
      path !== paths[0] &&
      ((await optional(join(path, "inventory.json"))) ||
        (await optional(join(path, "status.json"))))
    )
      throw new Error(
        "Evidence selection contains another release; select it separately as artifacts",
      );
  }
  return paths;
}

async function inspectTree(path, boundary = path) {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
  if (stat.isSymbolicLink()) {
    const target = resolve(dirname(path), await readlink(path));
    if (!inside(boundary, target)) throw new Error("Cleanup refuses escaping symlink");
    try {
      if (!inside(await realpath(boundary), await realpath(path)))
        throw new Error("Cleanup refuses escaping symlink chain");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return stat.size;
  }
  if (!stat.isDirectory()) return stat.size;
  let size = 0;
  for (const name of await readdir(path)) size += await inspectTree(join(path, name), boundary);
  return size;
}

export async function acceptanceSelection(root) {
  const directory = join(root, ".lace-acceptance");
  try {
    if ((await lstat(directory)).isSymbolicLink()) throw new Error("Unsafe acceptance directory");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const statePath = join(directory, "state.json");
  if ((await lstat(statePath)).isSymbolicLink()) throw new Error("Unsafe acceptance state");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  if (
    !/^lace-acceptance-[a-f0-9]{10}$/u.test(state.project) ||
    !Number.isInteger(state.port) ||
    state.port < 1 ||
    state.port > 65535
  )
    throw new Error("Invalid named acceptance state; refusing to stop unknown stack");
  // The existing stop uses this environment file; never follow an external file.
  if ((await lstat(join(directory, ".env"))).isSymbolicLink())
    throw new Error("Unsafe acceptance environment");
  return { directory, state, hash: hashBytes(await readFile(statePath)) };
}

async function validateRemaining(inventory, directory) {
  for (const item of [...inventory.packages, ...inventory.images]) {
    if (item.file.split(/[\\/]/u).includes("..") || item.file.startsWith("/"))
      throw new Error("Unsafe inventory path");
    try {
      if ((await checksum(join(directory, item.file))) !== item.sha256)
        throw new Error("Remaining artifact checksum differs");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export async function cleanRelease(
  {
    root = resolve(import.meta.dirname, ".."),
    directory,
    evidence = [],
    acceptance = false,
    apply = false,
  },
  operations = {},
) {
  directory = resolve(directory);
  root = resolve(root);
  const command = operations.command ?? tool;
  const paths = await validateCleanupPaths(root, directory, evidence, command);
  const exists = await lstat(directory).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
  const lockPaths = await operationPaths(directory);
  const journalDirectory = join(root, ".release-artifacts/.cleanup");
  const journalPath = join(journalDirectory, `${lockPaths.key}.json`);
  if (!exists && !(await optional(journalPath)))
    return { action: "already-clean", directory, untouched: evidence, acceptanceUntouched: true };
  try {
    if ((await lstat(journalDirectory)).isSymbolicLink())
      throw new Error("Unsafe cleanup journal directory");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let previewSelection;
  const work = async () => {
    await validateCleanupPaths(root, directory, evidence, command);
    const journalBytes = await optional(journalPath);
    const journal = journalBytes ? JSON.parse(journalBytes) : null;
    if (
      journal &&
      (journal.schemaVersion !== 1 ||
        JSON.stringify(journal.paths) !== JSON.stringify(paths) ||
        journal.acceptance !== acceptance)
    )
      throw new Error("Cleanup retry scope changed; use the recorded selection");
    const inventory =
      journal?.inventory ?? (await (operations.verify ?? verifyInventory)(directory));
    validatePublicInventory(inventory);
    let savedAssets;
    if (journal) {
      savedAssets = Object.fromEntries(
        Object.entries(journal.assets).map(([name, value]) => [name, Buffer.from(value, "base64")]),
      );
      if (
        hashBytes(savedAssets["inventory.json"]) !== journal.inventorySha256 ||
        JSON.stringify(JSON.parse(savedAssets["inventory.json"])) !== JSON.stringify(inventory)
      )
        throw new Error("Cleanup journal inventory differs");
      validateAcceptance(
        JSON.parse(savedAssets["acceptance.json"]),
        inventory,
        journal.inventorySha256,
      );
      await validateRemaining(inventory, directory);
    }
    const priorNpm = journal ? JSON.parse(savedAssets["publication-npm.json"]) : null;
    const publishedOperations = { ...operations.registry };
    if (journal)
      publishedOperations.packageHashes = async (path) => {
        const item = inventory.packages.find((item) => join(directory, item.file) === path);
        const expected = priorNpm.items.find(
          (entry) => entry.name === item?.name && entry.version === item.version,
        );
        if (
          !expected ||
          !/^sha512-[A-Za-z0-9+/]+=*$/u.test(expected.integrity) ||
          !/^[a-f0-9]{40}$/u.test(expected.shasum)
        )
          throw new Error("Invalid cleanup package identity");
        try {
          const actual = await packageHashes(path);
          if (actual.integrity !== expected.integrity) throw new Error("Remaining archive differs");
          return actual;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          return expected;
        }
      };
    const publication = await (operations.published ?? verifyPublishedInventory)(
      inventory,
      directory,
      publishedOperations,
    );
    const context = await releaseContext(root, inventory, operations);
    if (!context.existing || context.existing.draft)
      throw new Error("Published GitHub release required before cleanup");
    const assets = journal ? savedAssets : await publicAssets(directory, inventory, publication);
    for (const [name, value] of [
      ["publication-npm.json", publication.npm],
      ["publication-images.json", publication.images],
    ]) {
      if (!assets[name].equals(Buffer.from(`${JSON.stringify(value, null, 2)}\n`)))
        throw new Error("Archived publication evidence differs from current registry identity");
    }
    const hashes = await verifyAssets(context, context.existing, assets);
    const stack = acceptance ? await acceptanceSelection(root) : null;
    if (stack) await inspectTree(stack.directory);
    const selected =
      previewSelection ??
      (await Promise.all(paths.map(async (path) => ({ path, bytes: await inspectTree(path) }))));
    const report = {
      action: apply ? "cleaned" : "would-clean",
      version: inventory.release.version,
      url: context.existing.html_url,
      selected,
      acceptance: stack?.state.project ?? null,
    };
    if (!apply) return report;
    if (stack) {
      const current = await acceptanceSelection(root);
      if (current?.hash !== stack.hash) throw new Error("Acceptance state changed before stopping");
      await (
        operations.stopAcceptance ?? (() => command("pnpm", ["--dir", root, "acceptance:stop"]))
      )();
      if (
        await lstat(stack.directory).then(
          () => true,
          (error) => {
            if (error.code === "ENOENT") return false;
            throw error;
          },
        )
      )
        throw new Error("Acceptance stop did not remove its directory; release data retained");
    }
    await mkdir(journalDirectory, { recursive: true, mode: 0o700 });
    const state = {
      schemaVersion: 1,
      inventory,
      inventorySha256: hashBytes(assets["inventory.json"]),
      paths,
      acceptance,
      hashes,
      assets: Object.fromEntries(
        Object.entries(assets).map(([name, value]) => [name, value.toString("base64")]),
      ),
    };
    const temporary = `${journalPath}.pending`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, journalPath);
    try {
      const remove = operations.remove ?? ((path) => rm(path, { recursive: true, force: true }));
      // Keep identity metadata until all payload directories and evidence are gone.
      const metadata = new Set([
        "inventory.json",
        "status.json",
        "source.json",
        "acceptance.json",
        "publication-github.json",
        "publication-npm.json",
        "publication-images.json",
        "publication-npm-submitted.json",
      ]);
      const entries = await readdir(directory).catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      for (const name of entries.filter((name) => !metadata.has(name))) {
        await validateCleanupPaths(root, directory, evidence, command);
        await remove(join(directory, name));
      }
      for (const path of paths.slice(1)) {
        await validateCleanupPaths(root, directory, evidence, command);
        await remove(path);
      }
      for (const name of entries.filter((name) => metadata.has(name)))
        await remove(join(directory, name));
      await validateCleanupPaths(root, directory, evidence, command);
      await remove(directory);
      await rm(journalPath, { force: true });
    } catch (error) {
      throw new Error(
        `Cleanup interrupted; retry the same selection. Journal retained: ${journalPath}. ${error.message}`,
      );
    }
    return report;
  };
  // Preview must check the real lock but never create one. Apply takes all
  // explicitly selected locks in stable order, preventing overlapping cleaners.
  if (!apply) {
    for (const path of paths) await assertArtifactIdle(path);
    previewSelection = await Promise.all(
      paths.map(async (path) => ({ path, bytes: await inspectTree(path) })),
    );
    try {
      return await work();
    } catch (error) {
      return { action: "blocked", selected: previewSelection, unmetPrerequisites: [error.message] };
    }
  }
  const lock = operations.withLock ?? withArtifactLock;
  const locked = async (index) =>
    index === paths.length
      ? work()
      : lock([...paths].sort()[index], "cleanup", () => locked(index + 1));
  return locked(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const report = await cleanRelease(parseLifecycleArguments(process.argv.slice(2), true));
    console.info(JSON.stringify(report, null, 2));
    if (report.action === "blocked") process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
