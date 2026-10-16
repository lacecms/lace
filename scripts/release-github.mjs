import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checksum, jsonFile, verifyInventory } from "./release-artifacts.mjs";
import { acceptanceBytes, hashBytes } from "./release-evidence.mjs";
import { assertArtifactIdle, withArtifactLock } from "./release-lock.mjs";
import { verifyPublishedInventory } from "./release-verify-published.mjs";

export function parseLifecycleArguments(args, cleanup = false) {
  const options = { apply: false, evidence: [], acceptance: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag) && flag !== "--evidence") throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === "--apply") options.apply = true;
    else if (cleanup && flag === "--acceptance") options.acceptance = true;
    else if (
      (flag === "--artifacts" || (cleanup && flag === "--evidence")) &&
      args[i + 1] &&
      !args[i + 1].startsWith("--")
    ) {
      const path = resolve(args[++i]);
      if (flag === "--artifacts") options.directory = path;
      else options.evidence.push(path);
    } else throw new Error(`Unsupported or incomplete option: ${flag}`);
  }
  if (!options.directory) throw new Error("Select --artifacts <directory>");
  return options;
}

export function repositoryName(source) {
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*)$/u.exec(
      source,
    );
  if (!match) throw new Error("Inventory must identify an HTTPS GitHub repository");
  return match[1];
}

export function releaseBody(changelog, version, repository, notesRevision) {
  const entries = [...changelog.matchAll(/^## ([^\n]+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gmu)].filter(
    (entry) => entry[1].trim() === version,
  );
  if (entries.length !== 1 || !entries[0][2].trim())
    throw new Error("Missing or duplicate changelog entry");
  return entries[0][2].trim().replace(/\]\(([^)]+)\)/gu, (whole, path) => {
    if (/^(?:https?:|#)/u.test(path)) return whole;
    if (path.startsWith("/") || path.split("/").includes("..") || /^[A-Za-z]+:/u.test(path))
      throw new Error("Unsafe changelog link");
    return `](https://github.com/${repository}/blob/${notesRevision}/${path})`;
  });
}

export async function tool(toolName, args, input) {
  return new Promise((accept, reject) => {
    const child = spawn(toolName, args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    let size = 0;
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) child.kill();
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.on("error", () => reject(new Error(`Could not start ${toolName}`)));
    child.on("close", (code) =>
      code === 0
        ? accept(Buffer.concat(chunks))
        : reject(
            new Error(
              toolName === "git"
                ? `Local git ${args[0]} failed (${code}); check repository state and revision availability`
                : `${toolName} failed (${code}); check authentication and remote access`,
            ),
          ),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export function githubClient(repository, command = tool) {
  const base = `repos/${repository}`;
  const api = async (endpoint, method = "GET", value) => {
    const args = ["api", endpoint, "--method", method];
    if (value !== undefined) args.push("--input", "-");
    return JSON.parse(
      await command(
        "gh",
        args,
        value === undefined ? undefined : Buffer.from(JSON.stringify(value)),
      ),
    );
  };
  return {
    async context() {
      const notesRevision = (await command("git", ["rev-parse", "HEAD"])).toString().trim();
      const notesPath = await command("git", [
        "ls-tree",
        "--name-only",
        "HEAD",
        "--",
        "CHANGELOG.md",
      ]);
      if (notesPath.toString().trim() !== "CHANGELOG.md")
        throw new Error(
          "Commit reviewed CHANGELOG.md and linked documentation, then push the notes commit before finalization; CHANGELOG.md is absent from HEAD",
        );
      const committed = await command("git", ["show", "HEAD:CHANGELOG.md"]);
      return { notesRevision, committedChangelog: committed.toString() };
    },
    async commit(revision) {
      const value = await api(`${base}/commits/${revision}`);
      if (value.sha !== revision) throw new Error("Remote commit differs");
    },
    async tag(tag) {
      // List through authenticated repository API; only a genuine absent ref is missing.
      const refs = await api(`${base}/git/matching-refs/tags/${encodeURIComponent(tag)}`);
      const ref = refs.find((entry) => entry.ref === `refs/tags/${tag}`);
      if (!ref) return null;
      let object = ref.object;
      for (let depth = 0; object.type === "tag" && depth < 8; depth++)
        object = (await api(`${base}/git/tags/${object.sha}`)).object;
      if (object.type !== "commit") throw new Error("Unsupported tag object");
      return object.sha;
    },
    async release(tag) {
      // Paginated listing also sees drafts; no broad interpretation of errors as 404.
      for (let page = 1; ; page++) {
        const entries = await api(`${base}/releases?per_page=100&page=${page}`);
        const found = entries.find((entry) => entry.tag_name === tag);
        if (found) return found;
        if (entries.length < 100) return null;
      }
    },
    create: (tag, revision, body) =>
      api(`${base}/releases`, "POST", {
        tag_name: tag,
        target_commitish: revision,
        name: tag,
        body,
        draft: true,
        prerelease: true,
        make_latest: "false",
      }),
    async upload(release, name, bytes) {
      const temporary = await mkdtemp(join(tmpdir(), "lace-release-asset-"));
      try {
        const path = join(temporary, name);
        await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
        await command("gh", ["release", "upload", release.tag_name, path, "--repo", repository]);
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    },
    download: (asset) =>
      command("gh", [
        "api",
        `${base}/releases/assets/${asset.id}`,
        "-H",
        "Accept: application/octet-stream",
      ]),
    publish: (release) =>
      api(`${base}/releases/${release.id}`, "PATCH", {
        draft: false,
        prerelease: true,
        make_latest: "false",
      }),
  };
}

export async function releaseContext(root, inventory, operations = {}, apply = false) {
  const repository = repositoryName(inventory.release.sourceRepository);
  const client = operations.github ?? githubClient(repository);
  const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
  let { notesRevision, committedChangelog } = await client.context();
  const tag = `v${inventory.release.version}`;
  const existing = await client.release(tag);
  const linkedRevisions = [
    ...new Set(
      [
        ...(existing?.body ?? "").matchAll(
          /https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([a-f0-9]{40})\//gu,
        ),
      ]
        .filter((match) => match[1] === repository)
        .map((match) => match[2]),
    ),
  ];
  if (linkedRevisions.length > 1) throw new Error("Ambiguous release notes revision");
  if (linkedRevisions.length === 1) notesRevision = linkedRevisions[0];
  if (!/^[a-f0-9]{40}$/u.test(notesRevision)) throw new Error("Invalid notes source revision");
  if (apply && committedChangelog !== changelog)
    throw new Error("Commit reviewed CHANGELOG.md before finalization");
  await client.commit(inventory.source.revision);
  await client.commit(notesRevision);
  const target = await client.tag(tag);
  if (target && target !== inventory.source.revision)
    throw new Error("Version tag points to another source revision");
  const body = releaseBody(changelog, inventory.release.version, repository, notesRevision);
  if (
    existing &&
    (existing.tag_name !== tag ||
      existing.body !== body ||
      !existing.prerelease ||
      (existing.draft && existing.target_commitish !== inventory.source.revision))
  )
    throw new Error("Existing release body/source conflicts; reconcile explicitly");
  if (existing && !existing.draft && !target)
    throw new Error("Published release has no matching source tag");
  return { repository, client, notesRevision, tag, body, existing };
}

function keys(value, allowed) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.split(" ").includes(key))
  )
    throw new Error("Non-public inventory fields");
}

export function validatePublicInventory(inventory) {
  keys(
    inventory,
    "schemaVersion state complete publicationEligible release source packages images",
  );
  keys(inventory.source, "revision preview fingerprint");
  keys(
    inventory.release,
    "schemaVersion version generatorVersion templateVersion publishedVersions channel sourceRepository images platforms packages",
  );
  keys(inventory.release.images, "api builder");
  for (const item of inventory.packages) keys(item, "name version file sha256");
  for (const image of inventory.images)
    keys(
      image,
      "kind coordinate manifestCoordinate localTag platform imageId file sha256 smokePassed",
    );
  const bytes = JSON.stringify(inventory);
  if (/\/(?:Users|home|private|var)\//u.test(bytes)) throw new Error("Private inventory path");
}

export async function publicAssets(directory, inventory, publication) {
  validatePublicInventory(inventory);
  return {
    "inventory.json": await readFile(join(directory, "inventory.json")),
    "acceptance.json": await acceptanceBytes(directory, inventory),
    // Build complete public verification reports from fresh registry facts. A
    // local subset receipt never authorizes a full handoff or becomes an asset.
    "publication-npm.json": Buffer.from(`${JSON.stringify(publication.npm, null, 2)}\n`),
    "publication-images.json": Buffer.from(`${JSON.stringify(publication.images, null, 2)}\n`),
  };
}

export async function verifyAssets(context, release, assets, allowMissing = false) {
  const remote = release.assets ?? [];
  const hashes = {};
  for (const [name, bytes] of Object.entries(assets)) {
    const matches = remote.filter((asset) => asset.name === name);
    if (!matches.length && allowMissing) continue;
    if (matches.length !== 1 || matches[0].state !== "uploaded")
      throw new Error(`Missing or ambiguous release asset: ${name}`);
    const hash = hashBytes(await context.client.download(matches[0]));
    if (hash !== hashBytes(bytes)) throw new Error(`Release asset bytes conflict: ${name}`);
    hashes[name] = hash;
  }
  // Do not silently expose files outside the public evidence allowlist.
  if (remote.some((asset) => !(asset.name in assets)))
    throw new Error("Unexpected release attachment; review before finalization/cleanup");
  return hashes;
}

export async function finalizeGithub(
  { directory, root = resolve(import.meta.dirname, ".."), apply = false },
  operations = {},
) {
  const work = async () => {
    const inventory = await (operations.verify ?? verifyInventory)(directory);
    const publication = await (operations.published ?? verifyPublishedInventory)(
      inventory,
      directory,
    );
    const context = await releaseContext(root, inventory, operations, apply);
    const assets = await publicAssets(directory, inventory, publication);
    if (!apply) {
      if (context.existing)
        await verifyAssets(context, context.existing, assets, context.existing.draft);
      return {
        action: "would-finalize",
        repository: context.repository,
        tag: context.tag,
        source: inventory.source,
        body: context.body,
        assets: Object.fromEntries(
          Object.entries(assets).map(([name, bytes]) => [name, hashBytes(bytes)]),
        ),
      };
    }
    let release =
      context.existing ??
      (await context.client.create(context.tag, inventory.source.revision, context.body));
    await verifyAssets(context, release, assets, release.draft);
    if (release.draft) {
      for (const [name, bytes] of Object.entries(assets))
        if (!(release.assets ?? []).some((asset) => asset.name === name))
          await context.client.upload(release, name, bytes);
      release = await context.client.release(context.tag);
      await verifyAssets(context, release, assets);
      const currentTag = await context.client.tag(context.tag);
      if (currentTag && currentTag !== inventory.source.revision)
        throw new Error("Version tag changed before publication");
      release = await context.client.publish(release);
    }
    release = await context.client.release(context.tag);
    if (
      !release ||
      release.draft ||
      !release.prerelease ||
      (await context.client.tag(context.tag)) !== inventory.source.revision
    )
      throw new Error("Published GitHub release identity verification failed");
    const receipt = {
      schemaVersion: 1,
      version: inventory.release.version,
      source: inventory.source,
      tag: context.tag,
      notesRevision: context.notesRevision,
      url: release.html_url,
      inventorySha256: await checksum(join(directory, "inventory.json")),
      assets: await verifyAssets(context, release, assets),
    };
    await (operations.save ?? jsonFile)(join(directory, "publication-github.json"), receipt);
    return receipt;
  };
  if (!apply) {
    await assertArtifactIdle(directory);
    try {
      return await work();
    } catch (error) {
      const inventory = await (operations.verify ?? verifyInventory)(directory);
      return {
        action: "blocked",
        tag: `v${inventory.release.version}`,
        source: inventory.source,
        unmetPrerequisites: [error.message],
      };
    }
  }
  return (operations.withLock ?? withArtifactLock)(directory, "github", work);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const report = await finalizeGithub(parseLifecycleArguments(process.argv.slice(2)));
    console.info(JSON.stringify(report, null, 2));
    if (report.action === "blocked") process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
