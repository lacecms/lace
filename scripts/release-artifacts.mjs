import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { packageName, readJson, validatePackedManifest } from "./release-model.mjs";

export async function run(command, args, { cwd, capture = false, env = {} } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, CI: "true", ...env },
      stdio: ["ignore", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"],
    });
    let stdout = "";
    if (capture) {
      child.stdout.setEncoding("utf8").on("data", (chunk) => {
        stdout += chunk;
      });
      // Errors identify the operation without echoing credentials from a tool.
      child.stderr.resume();
    }
    child.on("error", () => reject(new Error(`Could not start ${command}`)));
    child.on("close", (code) =>
      code === 0
        ? accept(stdout.trim())
        : reject(new Error(`${command} failed (${code}); inspect the failed preparation stage`)),
    );
  });
}

export async function checksum(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export async function jsonFile(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function safeSourcePath(path) {
  if (
    isAbsolute(path) ||
    path
      .split("/")
      .some((part) =>
        [
          "..",
          ".git",
          ".aws",
          ".ssh",
          ".codex",
          "node_modules",
          "dist",
          "dev-data",
          ".lace-acceptance",
          ".release-artifacts",
        ].includes(part),
      )
  )
    return false;
  const basename = path.split("/").at(-1);
  return (
    basename !== ".npmrc" &&
    basename !== ".pnpmrc" &&
    (!basename.startsWith(".env") || basename === ".env.example") &&
    !/\.(?:pem|key|sqlite|sqlite-shm|sqlite-wal)$/u.test(basename)
  );
}

async function sourceFiles(root) {
  return (
    await run("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      capture: true,
    })
  )
    .split("\0")
    .filter(Boolean)
    .sort();
}

export async function sourceFingerprint(root, files) {
  const hash = createHash("sha256");
  for (const path of files) {
    if (!safeSourcePath(path)) throw new Error(`Excluded release input: ${path}`);
    const stat = await lstat(join(root, path));
    if (!stat.isFile()) throw new Error(`Release input must be a regular file: ${path}`);
    hash
      .update(path)
      .update("\0")
      .update(String(stat.mode & 0o777))
      .update("\0")
      .update(await readFile(join(root, path)))
      .update("\0");
  }
  return hash.digest("hex");
}

export async function snapshotSource(root, destination, preview) {
  const revision = await run("git", ["rev-parse", "HEAD"], { cwd: root, capture: true });
  const dirty = Boolean(
    await run("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: root,
      capture: true,
    }),
  );
  if (dirty && !preview)
    throw new Error(
      "Release requires a clean Git revision; commit changes or use --preview (publication-ineligible)",
    );
  await mkdir(destination);
  if (!preview) {
    const archive = `${destination}.tar`;
    await run("git", ["archive", "--format=tar", `--output=${archive}`, revision], {
      cwd: root,
      capture: true,
    });
    await run("tar", ["-xf", archive, "-C", destination], { capture: true });
    await rm(archive);
    const files = await walk(destination);
    for (const file of files)
      if (!safeSourcePath(file)) throw new Error(`Excluded committed release input: ${file}`);
    return { revision, preview: false, fingerprint: await sourceFingerprint(destination, files) };
  }
  const files = await sourceFiles(root);
  const fingerprint = await sourceFingerprint(root, files);
  for (const file of files) {
    await mkdir(dirname(join(destination, file)), { recursive: true });
    await copyFile(join(root, file), join(destination, file));
    await chmod(join(destination, file), (await lstat(join(root, file))).mode & 0o777);
  }
  if (
    JSON.stringify(files) !== JSON.stringify(await sourceFiles(root)) ||
    fingerprint !== (await sourceFingerprint(root, files)) ||
    fingerprint !== (await sourceFingerprint(destination, files))
  )
    throw new Error("Source changed during preview snapshot; retry from a stable input");
  return { revision, preview: true, fingerprint };
}

export async function claimOutput(output) {
  await mkdir(dirname(output), { recursive: true });
  try {
    await mkdir(output);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error("Preparation output already exists; use a new destination");
    throw error;
  }
  await jsonFile(join(output, "status.json"), { state: "preparing" });
}

export function completeInventory(release, source, packages, images) {
  const names = new Set(packages.map((item) => item.name));
  const complete =
    packages.length === release.packages.length &&
    names.size === packages.length &&
    release.packages.every((directory) => names.has(packageName(directory))) &&
    Object.keys(release.images).every((kind) =>
      release.platforms.every((platform) =>
        images.some((item) => item.kind === kind && item.platform === platform && item.smokePassed),
      ),
    );
  return {
    schemaVersion: 1,
    state: "prepared",
    complete,
    publicationEligible: complete && !source.preview,
    release,
    source,
    packages,
    images,
  };
}

export async function walk(root, prefix = "") {
  const paths = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) paths.push(...(await walk(root, path)));
    else paths.push(path);
  }
  return paths.sort();
}

export async function inspectPackage(directory, release) {
  const manifest = await readJson(join(directory, "package.json"));
  validatePackedManifest(manifest, release);
  if (manifest.license === "MIT") await readFile(join(directory, "LICENSE"));
  for (const file of await walk(directory)) {
    const stat = await lstat(join(directory, file));
    if (
      !stat.isFile() ||
      !safeSourcePath(file.replace(/^dist\//u, "compiled/")) ||
      /(?:^|\/)(?:fixtures|test-results|coverage)(?:\/|$)|\.test\.|\.tgz$/u.test(file)
    )
      throw new Error(`Forbidden archive file: ${manifest.name}: ${file}`);
  }
  function exportFiles(value) {
    if (typeof value === "string") return [value];
    return Object.values(value ?? {}).flatMap(exportFiles);
  }
  for (const file of [
    ...exportFiles(manifest.exports),
    manifest.types,
    ...Object.values(manifest.bin ?? {}),
  ].filter(Boolean)) {
    if (!file.startsWith("./dist/") || file.includes(".."))
      throw new Error(`Invalid export path: ${manifest.name}: ${file}`);
    if (!(await lstat(join(directory, file)).catch(() => undefined))?.isFile())
      throw new Error(`Missing archive entry point: ${manifest.name}: ${file}`);
  }
  for (const file of Object.values(manifest.bin ?? {})) {
    if (
      !(await readFile(join(directory, file), "utf8")).startsWith("#!/usr/bin/env node\n") ||
      !((await lstat(join(directory, file))).mode & 0o111)
    )
      throw new Error(`Invalid executable: ${manifest.name}: ${file}`);
  }
  if (manifest.name === "@lacecms/db") {
    const journal = await readJson(join(directory, "drizzle/meta/_journal.json"));
    for (const entry of journal.entries)
      await readFile(join(directory, "drizzle", `${entry.tag}.sql`));
  }
  if (manifest.name === "@lacecms/platform-cloudflare") {
    // The packaged admin is the Workers static-assets directory of consumer Workers.
    if (!(await lstat(join(directory, "admin/index.html")).catch(() => undefined))?.isFile())
      throw new Error(`Missing packaged admin assets: ${manifest.name}: admin/index.html`);
    if ((await walk(join(directory, "admin"))).some((file) => file.endsWith(".map")))
      throw new Error(`Forbidden admin source map: ${manifest.name}`);
  }
  if (manifest.name === "create-lace") {
    const { TEMPLATE_FILES, TEMPLATE_VERSION } = await import(
      pathToFileURL(join(directory, "dist/inventory.js")).href
    );
    if (TEMPLATE_VERSION !== release.templateVersion)
      throw new Error("Packed template identity mismatch");
    const actual = await walk(join(directory, "templates"));
    if (JSON.stringify(actual) !== JSON.stringify(TEMPLATE_FILES.map((item) => item.path).sort()))
      throw new Error("Packed template inventory is incomplete or unclassified");
  }
  return manifest;
}

export async function extractPackage(archive, destination) {
  const listing = (await run("tar", ["-tf", archive], { capture: true })).split("\n");
  if (
    listing.some(
      (file) =>
        !file.startsWith("package/") || file.split("/").includes("..") || file.includes("\\"),
    )
  )
    throw new Error("Unsafe archive paths");
  const verbose = await run("tar", ["-tvf", archive], { capture: true });
  if (verbose.split("\n").some((line) => !["-", "d"].includes(line[0])))
    throw new Error("Archive links or special files are forbidden");
  await mkdir(destination, { recursive: true });
  await run("tar", ["-xf", archive, "-C", destination], { capture: true });
  return join(destination, "package");
}

export async function preparePackages(snapshot, output, model, order) {
  console.info("Preparing compiled package graph");
  await run("pnpm", ["install", "--frozen-lockfile"], { cwd: snapshot });
  await run("pnpm", ["exec", "turbo", "run", "build", ...order.map((name) => `--filter=${name}`)], {
    cwd: snapshot,
  });
  const staging = join(output, "pack-workspace");
  await mkdir(staging);
  await copyFile(join(snapshot, "pnpm-workspace.yaml"), join(staging, "pnpm-workspace.yaml"));
  await jsonFile(join(staging, "package.json"), {
    private: true,
    packageManager: model.rootManifest.packageManager,
  });
  const records = [];
  const archives = join(output, "packages");
  await mkdir(archives);
  for (const name of order) {
    const { directory, manifest: original } = model.manifests[name];
    const destination = join(staging, directory);
    const manifest = structuredClone(original);
    delete manifest.devDependencies;
    delete manifest.scripts;
    await mkdir(destination, { recursive: true });
    await jsonFile(join(destination, "package.json"), manifest);
    await copyFile(join(snapshot, "LICENSE"), join(destination, "LICENSE"));
    // Copy only files permitted by the package's shipping allowlist.
    for (const file of manifest.files ?? []) {
      const source = join(snapshot, directory, file);
      const stat = await lstat(source);
      const files = stat.isDirectory()
        ? (await walk(source)).map((child) => join(file, child))
        : [file];
      for (const child of files) {
        await mkdir(dirname(join(destination, child)), { recursive: true });
        await copyFile(join(snapshot, directory, child), join(destination, child));
      }
    }
    for (const file of Object.values(manifest.bin ?? {}))
      await chmod(join(destination, file), 0o755);
  }
  // pnpm pack resolves workspace:* through installed package metadata. These
  // staging-only links point to the already built shipping trees, never source.
  for (const name of order) {
    const directory = join(staging, model.manifests[name].directory);
    for (const dependency of Object.keys(model.manifests[name].manifest.dependencies ?? {})) {
      if (!dependency.startsWith("@lacecms/")) continue;
      const link = join(directory, "node_modules", dependency);
      await mkdir(dirname(link), { recursive: true });
      await symlink(
        relative(dirname(link), join(staging, model.manifests[dependency].directory)),
        link,
      );
    }
  }
  for (const name of order) {
    const directory = join(staging, model.manifests[name].directory);
    const result = JSON.parse(
      await run("pnpm", ["pack", "--pack-destination", archives, "--json"], {
        cwd: directory,
        capture: true,
      }),
    );
    const archive = resolve(directory, result.filename);
    const extracted = await extractPackage(
      archive,
      join(output, "extracted", name.replace("@lacecms/", "")),
    );
    await inspectPackage(extracted, model.definition);
    records.push({
      name,
      version: model.definition.version,
      file: relative(output, archive),
      sha256: await checksum(archive),
    });
  }
  await smokePackages(snapshot, output, model, records);
  return records;
}

async function smokePackages(snapshot, output, model, records) {
  const consumer = join(output, "package-smoke");
  await mkdir(consumer);
  const references = Object.fromEntries(
    records.map((item) => [item.name, `file:${join(output, item.file)}`]),
  );
  await jsonFile(join(consumer, "package.json"), {
    private: true,
    type: "module",
    packageManager: model.rootManifest.packageManager,
    dependencies: references,
  });
  await writeFile(
    join(consumer, "pnpm-workspace.yaml"),
    `packages: []\nallowBuilds:\n  better-sqlite3: true\n  esbuild: true\n  workerd: true\noverrides:\n${Object.entries(
      references,
    )
      .map(([name, file]) => `  '${name}': '${file}'`)
      .join("\n")}\n`,
  );
  await run("pnpm", ["install", "--no-frozen-lockfile"], { cwd: consumer });
  await run("pnpm", ["install", "--frozen-lockfile", "--offline"], { cwd: consumer });
  await run(process.execPath, ["node_modules/@lacecms/cli/dist/bin.js", "--help"], {
    cwd: consumer,
    capture: true,
  });
  await run(
    process.execPath,
    ["node_modules/create-lace/dist/bin.js", "create", join(consumer, "generated")],
    { cwd: consumer, capture: true },
  );
  await run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    for (const name of ${JSON.stringify(records.map((item) => item.name))}) await import(name);
    const node = await import('@lacecms/platform-node');
    if (node.migrateNodeDatabase(':memory:').length === 0) throw new Error('Missing migrations');
  `,
    ],
    { cwd: consumer, capture: true },
  );
  await copyFile(
    join(snapshot, "scripts/migration-consumer-smoke.mjs"),
    join(consumer, "migration-smoke.mjs"),
  );
  await run(process.execPath, ["migration-smoke.mjs"], { cwd: consumer });
  await writeFile(
    join(consumer, "imports.ts"),
    records.map((item, i) => `import * as p${i} from '${item.name}'; void p${i};`).join("\n"),
  );
  await run(
    process.execPath,
    [
      join(snapshot, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--strict",
      "--skipLibCheck",
      "imports.ts",
    ],
    { cwd: consumer },
  );
  const lock = await readFile(join(consumer, "pnpm-lock.yaml"), "utf8");
  if (lock.includes(snapshot) || lock.includes("workspace:"))
    throw new Error("Package smoke resolved engine source");
  // Test-only overrides are never copied back into any archive or template.
  await rm(consumer, { recursive: true });
  console.info("Packed imports, declarations, executables, generation and migrations passed");
}

export async function verifyInventory(directory) {
  const inventory = await readJson(join(directory, "inventory.json"));
  const status = await readJson(join(directory, "status.json"));
  if (
    inventory.schemaVersion !== 1 ||
    inventory.state !== "prepared" ||
    status.state !== "prepared"
  )
    throw new Error("Inventory is not prepared");
  if (
    !/^[a-f0-9]{40}$/u.test(inventory.source.revision) ||
    !/^[a-f0-9]{64}$/u.test(inventory.source.fingerprint) ||
    typeof inventory.source.preview !== "boolean"
  )
    throw new Error("Invalid inventory source identity");
  const names = inventory.packages.map((item) => item.name);
  if (
    new Set(names).size !== names.length ||
    inventory.packages.some(
      (item) =>
        !inventory.release.packages.map(packageName).includes(item.name) ||
        item.version !== inventory.release.version,
    )
  )
    throw new Error("Invalid inventory package graph");
  const imageKeys = inventory.images.map((item) => `${item.kind}:${item.platform}`);
  if (
    new Set(imageKeys).size !== imageKeys.length ||
    inventory.images.some(
      (item) =>
        !inventory.release.images[item.kind] ||
        !inventory.release.platforms.includes(item.platform) ||
        !item.smokePassed ||
        !/^sha256:[a-f0-9]{64}$/u.test(item.imageId) ||
        item.coordinate !==
          `${inventory.release.images[item.kind]}:${inventory.release.version}-${item.platform.split("/")[1]}`,
    )
  )
    throw new Error("Invalid inventory image set");
  for (const artifact of [...inventory.packages, ...inventory.images]) {
    if (isAbsolute(artifact.file) || artifact.file.split(/[\\/]/u).includes(".."))
      throw new Error("Unsafe inventory path");
    if (artifact.sha256 !== (await checksum(join(directory, artifact.file))))
      throw new Error(`Artifact checksum mismatch: ${artifact.file}`);
  }
  const expected = completeInventory(
    inventory.release,
    inventory.source,
    inventory.packages,
    inventory.images,
  );
  if (
    expected.complete !== inventory.complete ||
    expected.publicationEligible !== inventory.publicationEligible
  )
    throw new Error("Inventory completeness/eligibility mismatch");
  return inventory;
}
