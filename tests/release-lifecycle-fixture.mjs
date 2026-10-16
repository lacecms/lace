import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checksum, completeInventory, jsonFile } from "../scripts/release-artifacts.mjs";
import { packageHashes } from "../scripts/release-publish.mjs";
import { hashBytes, persistAcceptance } from "../scripts/release-evidence.mjs";
import { releaseBody } from "../scripts/release-github.mjs";

export async function lifecycleFixture() {
  const root = await mkdtemp(join(tmpdir(), "lace-lifecycle-test-"));
  const directory = join(root, ".release-artifacts", "candidate");
  await mkdir(join(directory, "packages"), { recursive: true });
  await mkdir(join(directory, "images"));
  const release = JSON.parse(await readFile(new URL("../release/alpha.json", import.meta.url)));
  const source = { revision: "a".repeat(40), preview: false, fingerprint: "b".repeat(64) };
  const packages = [];
  for (const name of release.packages) {
    const file = `packages/${name}.tgz`;
    await writeFile(join(directory, file), `archive ${name}`);
    packages.push({
      name: name === "create-lace" ? name : `@lacecms/${name}`,
      version: release.version,
      file,
      sha256: await checksum(join(directory, file)),
    });
  }
  const images = [];
  for (const platform of release.platforms)
    for (const kind of ["api", "builder"]) {
      const file = `images/${kind}-${platform.split("/")[1]}.tar`;
      await writeFile(join(directory, file), `image ${file}`);
      const coordinate = `${release.images[kind]}:${release.version}-${platform.split("/")[1]}`;
      images.push({
        kind,
        platform,
        coordinate,
        manifestCoordinate: `${release.images[kind]}:${release.version}`,
        localTag: coordinate,
        imageId: `sha256:${String(images.length + 1).repeat(64)}`,
        file,
        sha256: await checksum(join(directory, file)),
        smokePassed: true,
      });
    }
  const inventory = completeInventory(release, source, packages, images);
  await jsonFile(join(directory, "inventory.json"), inventory);
  await jsonFile(join(directory, "status.json"), { state: "prepared" });
  const result = {
    result: "passed",
    version: release.version,
    templateVersion: release.templateVersion,
    platform: "linux/arm64",
    source,
    journeys: ["node", "cloudflare"],
    packages,
    images: images.filter((image) => image.platform === "linux/arm64"),
  };
  await persistAcceptance(directory, inventory, result, "c".repeat(40));
  const changelog = `# Changelog\n\n## ${release.version}\n\n- Important change; [upgrade](docs/compatibility.md).\n`;
  await writeFile(join(root, "CHANGELOG.md"), changelog);
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@lace.test");
  await writeFile(join(root, ".gitignore"), ".release-artifacts/\n.lace-acceptance/\n");
  git("add", ".gitignore", "CHANGELOG.md");
  git("commit", "-m", "fixture");
  const remote = new Map();
  for (const image of images) {
    const manifest = {
      digest: `sha256:${hashBytes(image.coordinate)}`,
      config: { digest: image.imageId },
    };
    remote.set(image.coordinate, manifest);
    remote.set(`${release.images[image.kind]}@${manifest.digest}`, manifest);
  }
  for (const kind of ["api", "builder"])
    remote.set(`${release.images[kind]}:${release.version}`, {
      digest: `sha256:${hashBytes(kind)}`,
      manifests: images
        .filter((image) => image.kind === kind)
        .map((image) => ({
          digest: remote.get(image.coordinate).digest,
          platform: { os: "linux", architecture: image.platform.split("/")[1] },
        })),
    });
  const publishedPackages = new Map(
    await Promise.all(
      packages.map(async (item) => [item.name, await packageHashes(join(directory, item.file))]),
    ),
  );
  const operations = {
    lookupPackage: async (item) => ({
      dist: publishedPackages.get(item.name),
      tags: { next: "future" },
    }),
    inspectImage: async (coordinate) => remote.get(coordinate) ?? null,
  };
  const notesRevision = "d".repeat(40);
  let releaseRecord = null;
  let tag = null;
  let uploads = 0;
  const mutations = [];
  const assetBytes = new Map();
  const github = {
    context: async () => ({ notesRevision, committedChangelog: changelog }),
    commit: async () => {},
    tag: async () => tag,
    release: async () => releaseRecord,
    create: async (tagName, revision, body) => {
      mutations.push("create");
      releaseRecord = {
        id: 1,
        tag_name: tagName,
        target_commitish: revision,
        body,
        draft: true,
        prerelease: true,
        assets: [],
        html_url: `https://github.com/lacecms/lace/releases/tag/${tagName}`,
      };
      return releaseRecord;
    },
    upload: async (_release, name, bytes) => {
      mutations.push(`upload:${name}`);
      const asset = { id: ++uploads, name, state: "uploaded" };
      releaseRecord.assets.push(asset);
      assetBytes.set(asset.id, bytes);
      return asset;
    },
    download: async (asset) => assetBytes.get(asset.id),
    publish: async () => {
      mutations.push("publish");
      releaseRecord.draft = false;
      tag = source.revision;
      return releaseRecord;
    },
  };
  return {
    root,
    directory,
    inventory,
    result,
    changelog,
    notesRevision,
    body: releaseBody(changelog, release.version, "lacecms/lace", notesRevision),
    operations,
    github,
    remote,
    mutations,
    assetBytes,
    get release() {
      return releaseRecord;
    },
    set release(value) {
      releaseRecord = value;
    },
    set tag(value) {
      tag = value;
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
