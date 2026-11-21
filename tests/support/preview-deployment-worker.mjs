import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  adminOrigin,
  authSecret,
  bootstrapSecret,
  exec,
  packedModule,
  previewOrigin,
  siteUrl,
  synchronize,
} from "./packed-preview-platforms.mjs";

export async function generatedWorkerPreview({ project, commit, cleanups, scratch }) {
  const command = (args) =>
    exec("pnpm", args, {
      cwd: project,
      timeout: 90_000,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    });
  const wrapper = createRequire(join(project, "package.json"));
  const { Miniflare, convertV4MiniflareOptions, Response: WorkerResponse } = wrapper("miniflare");
  const { parse } = createRequire(wrapper.resolve("wrangler/package.json"))("jsonc-parser");
  const configPath = join(project, "worker/wrangler.jsonc");
  const template = await readFile(configPath, "utf8");
  const config = parse(template);
  const { default: content } = await import(
    /* @vite-ignore */ pathToFileURL(join(project, "lace.config.ts")).href
  );
  const platformFile = await packedModule(project, "platform-cloudflare");
  const { D1ContentRepository, D1SecurityService } = await import(
    /* @vite-ignore */ pathToFileURL(platformFile).href
  );
  const serverFile = await realpath(join(dirname(platformFile), "../../server/dist/index.js"));
  const { contentModelResolver } = await import(/* @vite-ignore */ pathToFileURL(serverFile).href);
  const application = await import(
    /* @vite-ignore */ pathToFileURL(await packedModule(project, "application")).href
  );
  const runSecret = "packed-entrypoint-github-fixture-token";
  const runs = new Map();
  let publications = 0;
  const github = async (request) => {
    const { origin, pathname } = new URL(request.url);
    if (origin === "https://pages.lace.test" && pathname === "/deploy") {
      publications++;
      return new WorkerResponse(null, { status: 202 });
    }
    if (
      origin !== "https://api.github.com" ||
      request.headers.get("authorization") !== `Bearer ${runSecret}`
    )
      throw new Error("Unexpected outbound Worker request");
    if (pathname === "/repos/lace-fixture/preview/commits/main") return new WorkerResponse(commit);
    if (pathname.endsWith("/actions/workflows/lace-preview.yml/dispatches")) {
      const { ref, inputs } = await request.json();
      if (ref !== "main" || inputs.commit !== commit) throw new Error("Unexpected preview source");
      const run = {
        id: 1000 + runs.size,
        generation: inputs.generation,
        display_title: `Lace preview ${inputs.generation}`,
        path: ".github/workflows/lace-preview.yml@main",
        event: "workflow_dispatch",
        head_sha: commit,
        run_attempt: 1,
        status: "in_progress",
      };
      runs.set(run.id, run);
      return WorkerResponse.json({ workflow_run_id: run.id });
    }
    const match = /^\/repos\/lace-fixture\/preview\/actions\/runs\/(\d+)$/u.exec(pathname);
    const run = match && runs.get(Number(match[1]));
    if (run) return WorkerResponse.json(run);
    throw new Error("Unexpected GitHub endpoint");
  };
  const bindings = {
    ...config.vars,
    LACE_DEPLOY_HOOK_URL: "https://pages.lace.test/deploy",
    LACE_AUTH_SECRET: authSecret,
    LACE_PUBLIC_BASE_URL: adminOrigin + "/",
    LACE_PREVIEW_ORIGIN: previewOrigin,
    LACE_BUILD_SITE_URL: siteUrl,
    LACE_PREVIEW_GITHUB_REPOSITORY: "lace-fixture/preview",
    LACE_PREVIEW_GITHUB_REF: "main",
    LACE_PREVIEW_GITHUB_WORKFLOW: "lace-preview.yml",
    LACE_PREVIEW_GITHUB_TOKEN: runSecret,
    LACE_PREVIEW_RUNNER_SECRET: bootstrapSecret,
    LACE_PREVIEW_SITE_PATH: "site",
  };
  const {
    LACE_AUTH_SECRET,
    LACE_DEPLOY_HOOK_URL,
    LACE_PREVIEW_GITHUB_TOKEN,
    LACE_PREVIEW_RUNNER_SECRET,
    ...vars
  } = bindings;
  config.vars = { ...vars, LACE_PREVIEW_ENABLED: "true" };
  config.r2_buckets.push({ binding: "PREVIEW", bucket_name: "lace-fixture-preview" });
  config.triggers.crons.push("*/2 * * * *");
  try {
    await writeFile(configPath, JSON.stringify(config));
    await command(["cf:build"]);
  } finally {
    await writeFile(configPath, template);
  }
  const persistTo = join(scratch, "workerd");
  const bundle = await readFile(join(project, ".lace/data/cloudflare-bundle/index.js"), "utf8");
  // Restore the virtual Host at Miniflare's ingress, as Wrangler's local proxy does.
  const loopbackSecret = randomBytes(32).toString("hex");
  const options = (mode) => {
    const vars = { ...bindings };
    if (mode === undefined) delete vars.LACE_PREVIEW_ENABLED;
    else vars.LACE_PREVIEW_ENABLED = String(mode !== "off");
    if (mode === "incomplete") delete vars.LACE_PREVIEW_RUNNER_SECRET;
    return convertV4MiniflareOptions({
      modules: true,
      script: bundle,
      compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags,
      d1Databases: ["DB"],
      d1Persist: join(persistTo, "d1"),
      r2Buckets: config.r2_buckets.map(({ binding }) => binding),
      r2Persist: join(persistTo, "r2"),
      bindings: vars,
      outboundService: github,
      unsafeProxySharedSecret: loopbackSecret,
    });
  };
  let worker = new Miniflare(options(undefined));
  cleanups.push(() => worker.dispose());
  const db = () => worker.getD1Database("DB");
  const database = await db();
  const migrations = join(project, "node_modules/@lacecms/db/drizzle");
  const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8"));
  await database
    .prepare("create table d1_migrations (id integer primary key, name text not null)")
    .run();
  for (const { tag } of journal.entries) {
    const text = await readFile(join(migrations, tag + ".sql"), "utf8");
    await database.batch([
      ...text
        .split("--> statement-breakpoint")
        .filter((sql) => sql.trim())
        .map((sql) => database.prepare(sql)),
      database.prepare("insert into d1_migrations (name) values (?)").bind(tag + ".sql"),
    ]);
  }
  const clock = { now: Date.now };
  await synchronize({
    application,
    repository: new D1ContentRepository(database, contentModelResolver(content)),
    models: content.runtime.content,
    clock,
  });
  const fetch = (request) => {
    const headers = new Headers(request.headers);
    headers.set("MF-Proxy-Shared-Secret", loopbackSecret);
    return worker.dispatchFetch(request.url, new Request(request, { headers, redirect: "manual" }));
  };
  return {
    adminOrigin,
    initialOrigin: adminOrigin,
    previewOrigin,
    fetch,
    runs,
    reconcile: () =>
      worker.getWorker().then((entry) => entry.scheduled({ cron: config.triggers.crons[1] })),
    get publications() {
      return publications;
    },
    async configure(mode) {
      await worker.setOptions(options(mode));
      return adminOrigin;
    },
    async setupToken() {
      const security = new D1SecurityService(await db(), Date.now);
      return (await security.createSetupToken()).token;
    },
    async previewCommit(id) {
      const row = await (
        await db()
      )
        .prepare("select source_commit from preview_generations where id = ?")
        .bind(id)
        .first();
      return row?.source_commit;
    },
    async editorAccount(email) {
      await (
        await db()
      )
        .prepare("update user set role = ? where email = ?")
        .bind("editor", email)
        .run();
    },
    async privateRequest(path, _service, init) {
      return (await fetch(new Request(adminOrigin + path, init))).status;
    },
  };
}
