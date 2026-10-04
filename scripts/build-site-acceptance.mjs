import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { assertSecretFree, scanTree } from "./consumer-security.mjs";

/** Runs only against disposable packed consumers and their private Compose stack. */
export async function buildSiteJourney(context, session, operations) {
  const { compose, request, run, waitBuild, writeEnvironment, secretValues } = operations;
  const publicBase = `http://127.0.0.1:${context.httpPort}/`;
  const headers = { cookie: session.cookie };
  const evidence = [];
  const identities = [];
  for (const kind of ["standalone", "workspace"]) {
    const root = join(context.parent, `external-${kind}`);
    const siteDirectory = kind === "standalone" ? "." : "web";
    const site = join(root, siteDirectory);
    await mkdir(site, { recursive: true });
    const filteredCopy = {
      recursive: true,
      filter: (path) =>
        !["node_modules", "dist", ".astro", ".env", "data"].includes(basename(path)),
    };
    await cp(join(context.project, "site"), site, filteredCopy);
    // An actual generated CMS/example alongside the selected site, with distinct output.
    await cp(context.project, join(root, "cms"), filteredCopy);
    await writeFile(join(root, "cms/site/src/pages/index.astro"), "<h1>UNUSED-CMS-EXAMPLE</h1>\n");
    await cp(
      join(context.project, ".lace/acceptance-packages"),
      join(root, ".lace/acceptance-packages"),
      { recursive: true },
    );
    const packageJson = JSON.parse(await readFile(join(site, "package.json"), "utf8"));
    packageJson.name = `external-${kind}`;
    packageJson.dependencies["@lacecms/sdk"] =
      `file:${kind === "workspace" ? "../" : ""}.lace/acceptance-packages/${context.sdkTarball}`;
    await writeFile(join(site, "package.json"), JSON.stringify(packageJson, null, 2));
    if (kind === "workspace")
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({ name: "external-installation", private: true, type: "module" }),
      );
    const workspaceYaml = await readFile(join(context.project, "pnpm-workspace.yaml"), "utf8");
    const overrides = workspaceYaml.slice(workspaceYaml.indexOf("overrides:"));
    // Standalone has no package list; YAML is only disposable tarball/build policy.
    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      `${kind === "workspace" ? "packages:\n  - web\n" : ""}allowBuilds:\n  esbuild: true\n${overrides}\n`,
    );
    const marker = `SELECTED-EXTERNAL-${kind.toUpperCase()}`;
    const page = join(site, "src/pages/index.astro");
    await writeFile(page, (await readFile(page, "utf8")) + `\n<p>${marker}</p>\n`);
    const sourceHash = createHash("sha256")
      .update(await readFile(page))
      .digest("hex");
    await run(`external-${kind}-install`, "pnpm", ["install", "--no-frozen-lockfile"], {
      cwd: root,
    });
    await run(`external-${kind}-frozen`, "pnpm", ["install", "--frozen-lockfile", "--offline"], {
      cwd: root,
    });
    const secret = `excluded-${kind}-credential`;
    secretValues.add(secret);
    await writeFile(join(root, "cms/.env"), `SECRET=${secret}\n`);
    await mkdir(join(root, "cms/.lace/data"), { recursive: true });
    await writeFile(join(root, "cms/.lace/data/lace.sqlite"), secret);
    context.values.LACE_BUILD_SOURCE_ROOT = root;
    context.values.LACE_BUILD_SITE_DIR = siteDirectory;
    context.values.LACE_BUILD_OUTPUT_DIR = "release";
    context.values.LACE_BUILD_SITE_ID = `external-${kind}`;
    context.values.LACE_BUILD_SITE_LABEL = `External ${kind}`;
    await writeEnvironment(context);
    const config = JSON.parse(
      await compose(`external-${kind}-compose-config`, ["config", "--format", "json"]),
    );
    const mount = config.services.builder.volumes.find((volume) => volume.target === "/source");
    if (mount.source !== root || !mount.read_only || mount.bind?.create_host_path !== false)
      throw new Error("External source mount contract mismatch");
    if (
      config.services.builder.environment.LACE_BUILD_SITE_ID !==
      config.services.api.environment.LACE_BUILD_SITE_ID
    )
      throw new Error("API/builder site identity mismatch");
    await compose(
      `external-${kind}-recreate`,
      ["up", "--detach", "--wait", "--force-recreate", "api", "builder", "dispatcher"],
      { timeoutMs: 600000 },
    );
    const identity = await request(session.base, "/api/v1/admin/build-site", { headers });
    if (identity.body.site?.id !== `external-${kind}`) throw new Error("Current identity mismatch");
    identities.push(identity.body.site);
    const previous = (
      await request(session.base, "/api/v1/admin/site-builds", { headers })
    ).body.items.map((build) => build.id);
    await request(session.base, "/api/v1/admin/builds", { method: "POST", headers, json: {} });
    const built = await waitBuild(
      session,
      (build) => !previous.includes(build.id) && ["failed", "succeeded"].includes(build.status),
    );
    if (built.status !== "succeeded")
      throw new Error(`Selected ${kind} build failed: ${built.error}`);
    const response = await fetch(publicBase);
    const html = await response.text();
    if (!response.ok || !html.includes(marker) || html.includes("UNUSED-CMS-EXAMPLE"))
      throw new Error("Wrong Astro source served");
    assertSecretFree(html, secretValues, "selected-site HTML");
    if (
      createHash("sha256")
        .update(await readFile(page))
        .digest("hex") !== sourceHash
    )
      throw new Error("Builder changed source");
    // Frozen-lockfile failure on real Astro source, durable failure and supported retry.
    const packageBefore = await readFile(join(site, "package.json"), "utf8");
    const broken = {
      ...packageJson,
      dependencies: { ...packageJson.dependencies, astro: "0.0.0-invalid" },
    };
    await writeFile(join(site, "package.json"), JSON.stringify(broken));
    await request(session.base, "/api/v1/admin/builds", { method: "POST", headers, json: {} });
    const failed = await waitBuild(
      session,
      (build) => build.id !== built.id && !previous.includes(build.id) && build.status === "failed",
      true,
    );
    if ((await (await fetch(publicBase)).text()) !== html)
      throw new Error("Failed selected-source build replaced current release");
    await writeFile(join(site, "package.json"), packageBefore);
    await request(session.base, `/api/v1/admin/builds/${failed.id}/retry`, {
      method: "POST",
      headers,
      json: {},
    });
    const retried = await waitBuild(
      session,
      (build) =>
        ![...previous, built.id, failed.id].includes(build.id) && build.status === "succeeded",
    );
    if (!(await (await fetch(publicBase)).text()).includes(marker))
      throw new Error("Corrected retry not served");
    const output = await compose(`external-${kind}-scan-output`, [
      "exec",
      "-T",
      "builder",
      "node",
      "--input-type=module",
      "-e",
      "import {readFile,readdir} from 'node:fs/promises'; async function visit(p){for(const e of await readdir(p,{withFileTypes:true})){const f=p+'/'+e.name;if(e.isDirectory())await visit(f);else if(e.isFile())process.stdout.write(await readFile(f));}} await visit('/output/releases');",
    ]);
    assertSecretFree(output, secretValues, "selected releases");
    const selectedLogs = await compose(`external-${kind}-scan-logs`, [
      "logs",
      "--no-color",
      "builder",
      "dispatcher",
    ]);
    assertSecretFree(selectedLogs, secretValues, "selected build logs");
    assertSecretFree(selectedLogs, [root, context.parent], "selected private source paths");
    evidence.push({
      kind,
      site: identity.body.site,
      first: built.id,
      failed: failed.id,
      retried: retried.id,
      sourceUnchanged: true,
      selectedMarker: marker,
    });
  }
  const oldHtml = await (await fetch(publicBase)).text();
  const concurrency = JSON.parse(
    await compose(
      "concurrent-selected-builds",
      [
        "exec",
        "-T",
        "builder",
        "node",
        "--input-type=module",
        "-e",
        `
import {readdir} from 'node:fs/promises';
const exported = await fetch(new URL('api/v1/public/build-export', process.env.LACE_API_BASE_URL),
  {headers:{authorization:'Bearer '+process.env.LACE_BUILD_TOKEN}});
if (!exported.ok) throw new Error('export unavailable');
const targetVersion = Number(exported.headers.get('etag').slice(1,-1));
await exported.body.cancel();
let maximum = 0;
let sampling = Promise.resolve();
const timer = setInterval(() => {
  sampling = sampling.then(async () => {
    const active = (await readdir('/work')).filter(name => name.startsWith('build-')).length;
    maximum = Math.max(maximum, active);
  });
}, 25);
try {
  const results = await Promise.all(['concurrent-one','concurrent-two'].map(async buildId => {
    const response = await fetch('http://127.0.0.1:8788/build', {method:'POST',
      headers:{authorization:'Bearer '+process.env.LACE_BUILDER_SECRET,'content-type':'application/json'},
      body:JSON.stringify({buildId,targetVersion})});
    return {httpStatus:response.status,body:await response.json()};
  }));
  await sampling;
  console.log(JSON.stringify({maximum,results}));
} finally {clearInterval(timer);}
`,
      ],
      { timeoutMs: 600000 },
    ),
  );
  if (
    concurrency.maximum !== 1 ||
    concurrency.results.some(
      (result) => result.httpStatus !== 200 || result.body.status !== "succeeded",
    ) ||
    (await (await fetch(publicBase)).text()) !== oldHtml
  )
    throw new Error("Concurrent selected builds were not serialized safely");
  const oldRoot = context.values.LACE_BUILD_SOURCE_ROOT;
  context.values.LACE_BUILD_SOURCE_ROOT = join(context.parent, "missing-source");
  await writeEnvironment(context);
  let refused = false;
  try {
    await compose("missing-external-bind", ["up", "--detach", "--force-recreate", "builder"]);
  } catch {
    refused = true;
  }
  if (!refused || (await (await fetch(publicBase)).text()) !== oldHtml)
    throw new Error("Missing mount changed current output");
  context.values.LACE_BUILD_SOURCE_ROOT = oldRoot;
  context.values.LACE_BUILD_SITE_DIR = "../invalid";
  await writeEnvironment(context);
  await compose("invalid-selection-recreate", [
    "up",
    "--detach",
    "--wait",
    "--force-recreate",
    "builder",
  ]);
  const history = (
    await request(session.base, "/api/v1/admin/site-builds", { headers })
  ).body.items.map((build) => build.id);
  await request(session.base, "/api/v1/admin/builds", { method: "POST", headers, json: {} });
  const invalid = await waitBuild(
    session,
    (build) => !history.includes(build.id) && build.status === "failed",
    true,
  );
  if ((await (await fetch(publicBase)).text()) !== oldHtml)
    throw new Error("Invalid selection changed current output");
  // Separate reference-layout check: only the external journeys above prove
  // independent consumers. This one deliberately mounts the engine workspace.
  const referencePage = join(operations.referenceRoot, "apps/site/src/pages/index.astro");
  const referenceBefore = await readFile(referencePage);
  context.values.LACE_BUILD_SOURCE_ROOT = operations.referenceRoot;
  context.values.LACE_BUILD_SITE_DIR = "apps/site";
  context.values.LACE_BUILD_OUTPUT_DIR = "dist";
  context.values.LACE_BUILD_SITE_ID = "reference-site";
  context.values.LACE_BUILD_SITE_LABEL = "Reference site";
  await writeEnvironment(context);
  await compose(
    "reference-source-recreate",
    ["up", "--detach", "--wait", "--force-recreate", "api", "builder", "dispatcher"],
    { timeoutMs: 600000 },
  );
  const beforeReference = (
    await request(session.base, "/api/v1/admin/site-builds", { headers })
  ).body.items.map((build) => build.id);
  await request(session.base, "/api/v1/admin/builds", { method: "POST", headers, json: {} });
  const referenceBuild = await waitBuild(
    session,
    (build) =>
      !beforeReference.includes(build.id) && ["failed", "succeeded"].includes(build.status),
  );
  if (referenceBuild.status !== "succeeded")
    throw new Error(`Reference source failed: ${referenceBuild.error}`);
  const referenceHtml = await (await fetch(publicBase)).text();
  if (
    !referenceHtml.includes('data-lace-model="home"') ||
    referenceHtml.includes("SELECTED-EXTERNAL-") ||
    !(await readFile(referencePage)).equals(referenceBefore)
  )
    throw new Error("Reference source selection mismatch or mutation");
  assertSecretFree(referenceHtml, secretValues, "reference HTML");
  const logs = await compose("selected-source-log-scan", [
    "logs",
    "--no-color",
    "builder",
    "dispatcher",
  ]);
  assertSecretFree(logs, secretValues, "builder/dispatcher logs");
  assertSecretFree(logs, [context.parent], "private source paths in diagnostics");
  assertSecretFree(logs, [operations.referenceRoot], "reference source paths in diagnostics");
  await scanTree(join(context.project, "site/dist"), secretValues, "manual static output");
  const images = JSON.parse(
    await run("selected-image-identities", "docker", [
      "image",
      "inspect",
      context.values.LACE_API_IMAGE,
      context.values.LACE_BUILDER_IMAGE,
    ]),
  );
  console.info(
    JSON.stringify({
      result: "passed",
      platform: `linux/${process.arch}`,
      templateVersion: JSON.parse(
        await readFile(join(context.project, ".lace/manifest.json"), "utf8"),
      ).templateVersion,
      images: images.map((image) => ({ id: image.Id, architecture: image.Architecture })),
      sites: evidence,
      identities,
      invalidSelection: invalid.id,
      missingBindRefused: refused,
      referenceBuild: referenceBuild.id,
      concurrentBuilds: {
        succeeded: concurrency.results.length,
        maximumActive: concurrency.maximum,
      },
    }),
  );
}
