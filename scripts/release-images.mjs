import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { checksum, run } from "./release-artifacts.mjs";
import { supportedPnpmVersion } from "./release-model.mjs";

export function imageBuildArguments(kind, platform, tag, release, source, snapshot) {
  if (!["api", "builder"].includes(kind) || !release.platforms.includes(platform))
    throw new Error("Unsupported image kind/platform");
  return [
    "buildx",
    "build",
    "--load",
    "--platform",
    platform,
    "--build-arg",
    `LACE_VERSION=${release.version}`,
    "--build-arg",
    `LACE_REVISION=${source.revision}`,
    "-f",
    join(snapshot, `apps/${kind}/Dockerfile`),
    "-t",
    tag,
    snapshot,
  ];
}

const apiSmoke = `
  import { readFile, readdir, realpath } from 'node:fs/promises';
  import { createRequire } from 'node:module';
  import { createServer } from 'node:http';
  const root = '/opt/lace/workspace';
  const node = await import('@lacecms/platform-node');
  if (node.migrateNodeDatabase(':memory:').length === 0) throw new Error('Missing migrations');
  const { loadProjectConfig } = await import(root + '/apps/api/dist/config/project-config.js');
  if (!(await loadProjectConfig()).content.length) throw new Error('Config loading failed');
  await import(root + '/apps/api/dist/server/node-server.js');
  createRequire(await realpath(root + '/packages/platform-node/src/minio-init.mjs')).resolve('@aws-sdk/client-s3');
  for (const path of ['apps/api/dist/production.js','apps/api/dist/dispatcher.js','packages/platform-node/dist/migrate.js','packages/platform-node/src/minio-init.mjs']) await readFile(root + '/' + path);
  const { createNodeAdminAssets } = await import(root + '/apps/api/dist/server/admin-assets.js');
  const assets = createNodeAdminAssets(root + '/apps/admin/dist');
  const server = createServer(async (request,response) => {
    const result = await assets.fetch(new Request('http://localhost' + request.url));
    response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const result = await fetch('http://127.0.0.1:' + server.address().port + '/admin/');
    if (!result.ok || !(await result.text()).includes('<html')) throw new Error('Admin serving failed');
  } finally { await new Promise(resolve => server.close(resolve)); }
  async function inspect(path) {
    for (const entry of await readdir(path,{withFileTypes:true})) {
      if (entry.name === 'node_modules') continue;
      if (['.git','.npmrc','.env','coverage','fixtures','test-results'].includes(entry.name) || entry.name.includes('.test.') || entry.name.endsWith('.sqlite')) throw new Error('Forbidden image file');
      const child = path + '/' + entry.name;
      if (entry.isDirectory()) await inspect(child);
      if (child === root + '/apps/admin/src') throw new Error('Editable admin source');
    }
  }
  await inspect(root);
  console.log('API native dependencies, migrations, generated configuration, runtime paths and compiled admin passed');
`;

const builderSmoke = `
  import { access } from 'node:fs/promises';
  import { constants } from 'node:fs';
  if (process.getuid() === 0) throw new Error('Builder must be non-root');
  await access('/work',constants.W_OK); await access('/output',constants.W_OK);
  await import('/opt/lace-builder/dist/main.js');
  const response = await fetch('http://127.0.0.1:8788/health');
  if (!response.ok) throw new Error('Builder health failed');
  process.exit(0);
`;

export async function prepareImages(snapshot, output, release, source, platforms, execute = run) {
  const directory = join(output, "images");
  await mkdir(directory);
  const records = [];
  for (const platform of platforms) {
    for (const kind of Object.keys(release.images)) {
      const suffix = platform.split("/")[1];
      // A snapshot-specific local tag avoids parallel runs overwriting one
      // another; publication retags the saved immutable image IDs explicitly.
      const coordinate = `${release.images[kind]}:${release.version}-${suffix}`;
      const tag = `${coordinate}-${source.fingerprint.slice(0, 12)}`;
      console.info(`Preparing ${kind} for ${platform}`);
      await execute("docker", imageBuildArguments(kind, platform, tag, release, source, snapshot));
      const metadata = JSON.parse(
        await execute("docker", ["image", "inspect", tag], { capture: true }),
      )[0];
      if (
        `${metadata.Os}/${metadata.Architecture}` !== platform ||
        metadata.Config.Labels?.["org.opencontainers.image.version"] !== release.version ||
        metadata.Config.Labels?.["org.opencontainers.image.revision"] !== source.revision ||
        metadata.Config.Labels?.["org.opencontainers.image.source"] !== release.sourceRepository
      )
        throw new Error(`Image platform/version/source mismatch: ${kind} ${platform}`);
      const args = ["run", "--rm", "--platform", platform, "--entrypoint", "node"];
      if (kind === "api")
        args.push(
          "--mount",
          `type=bind,src=${join(snapshot, "packages/create-lace/templates/lace.config.ts")},dst=/opt/lace/workspace/lace.config.ts,readonly`,
        );
      else
        args.push(
          "-e",
          "LACE_BUILDER_SECRET=local-smoke-secret-with-at-least-32-chars",
          "-e",
          "LACE_API_BASE_URL=http://127.0.0.1:3000/",
          "-e",
          "LACE_BUILD_TOKEN=local-smoke-placeholder",
        );
      await execute("docker", [
        ...args,
        metadata.Id,
        "--input-type=module",
        "-e",
        kind === "api" ? apiSmoke : builderSmoke,
      ]);
      if (kind === "builder")
        await execute(
          "docker",
          ["run", "--rm", "--platform", platform, "--entrypoint", "pnpm", metadata.Id, "--version"],
          { capture: true },
        ).then((version) => {
          if (!supportedPnpmVersion(version)) throw new Error("Builder requires pnpm 12 or later");
        });
      const archive = join(directory, `${kind}-${release.version}-${suffix}.tar`);
      await execute("docker", ["image", "save", "--output", archive, tag]);
      records.push({
        kind,
        coordinate,
        manifestCoordinate: `${release.images[kind]}:${release.version}`,
        localTag: tag,
        platform,
        imageId: metadata.Id,
        file: relative(output, archive),
        sha256: await checksum(archive),
        smokePassed: true,
      });
    }
  }
  return records;
}
