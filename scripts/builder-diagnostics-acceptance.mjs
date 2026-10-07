import { chmod, readFile, writeFile, symlink, rm, rename, realpath } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import { reviewEnvironment } from "./consumer-guides.mjs";
import { loadBrowser, visible } from "./acceptance-browser.mjs";
import { expectNoAccessibilityViolations } from "../apps/admin/e2e/support/accessibility.ts";
import { assertSecretFree } from "./consumer-security.mjs";

/**
 * Fault injection only in an independent, disposable packed existing-site
 * consumer. `releaseArtifacts` selects already loaded API/builder images; without
 * `existingJourney` the existing-site consumer under `parent` must already exist.
 */
export async function builderDiagnosticsJourney(parent, operations) {
  const {
    existingJourney,
    prepareCompose,
    releaseArtifacts,
    compose,
    run,
    request,
    writeEnvironment,
    waitApiReady,
    secretValues,
    workspace,
  } = operations;
  // The suite may already have connected the existing-site consumer in this parent.
  if (existingJourney) await existingJourney();
  const root = join(parent, "existing-site");
  const project = join(root, "cms");
  // This disposable consumer uses newly packed/current dependencies. Declare its
  // age policy in operator-owned pnpm configuration, never a builder override.
  const workspaceFile = join(root, "pnpm-workspace.yaml");
  await writeFile(
    workspaceFile,
    (await readFile(workspaceFile, "utf8")) + "\nminimumReleaseAge: 0\n",
  );
  // Exact-artifact acceptance supplies the loaded release images instead of local builds.
  const context = await prepareCompose(project, parent, releaseArtifacts);
  const base = `http://127.0.0.1:${context.apiPort}/`;
  const publicBase = `http://127.0.0.1:${context.httpPort}/`;
  const envFile = join(project, ".env");
  const reviewed = reviewEnvironment(await readFile(envFile, "utf8"), {
    LACE_API_IMAGE: context.images.api,
    LACE_BUILDER_IMAGE: context.images.builder,
    LACE_API_PORT: String(context.apiPort),
    LACE_HTTP_PORT: String(context.httpPort),
    LACE_API_BASE_URL: base,
    LACE_PUBLIC_BASE_URL: base,
  });
  await writeFile(envFile, reviewed);
  context.values = parseEnv(reviewed);
  for (const name of ["LACE_AUTH_SECRET", "LACE_MINIO_ROOT_SECRET", "LACE_BUILDER_SECRET"])
    secretValues.add(context.values[name]);
  for (const script of ["db:migrate", "content:sync"])
    await run(`diagnostics-${script}`, "pnpm", [script, "--json"], { cwd: project });
  const setup = JSON.parse(
    await run("diagnostics-bootstrap", "pnpm", ["auth:bootstrap", "--json"], {
      cwd: project,
      intentionalReveal: true,
    }),
  );
  const token = setup.data.token;
  const email = "diagnostics@lace.test";
  const password = randomBytes(24).toString("hex");
  secretValues.add(token);
  secretValues.add(password);
  await compose("diagnostics-api", ["up", "-d", "--wait", "api"], { timeoutMs: 20 * 60_000 });
  await waitApiReady(base);
  await request(base, "/api/v1/setup/admin", { method: "POST", json: { email, password, token } });
  const login = await request(base, "/api/auth/sign-in/email", {
    method: "POST",
    headers: { origin: base.slice(0, -1) },
    json: { email, password },
  });
  const cookie = login.response.headers.getSetCookie()[0].split(";")[0];
  secretValues.add(cookie);
  const headers = { cookie };
  const createdToken = await request(base, "/api/v1/admin/api-tokens", {
    method: "POST",
    headers,
    json: { name: "diagnostics-builder" },
  });
  context.values.LACE_BUILD_TOKEN = createdToken.body.token;
  secretValues.add(createdToken.body.token);
  await writeEnvironment(context);
  const home = await request(base, "/api/v1/admin/models/home/entries", { headers });
  const published = await request(base, `/api/v1/admin/entries/${home.body.items[0].id}/publish`, {
    method: "POST",
    headers,
    json: { expectedRevision: 1 },
  });
  const targetVersion = published.body.build.targetVersion;
  await writeFile(join(root, "AGENTS.md"), "Service instructions excluded from site builds.\n");
  await symlink("AGENTS.md", join(root, "CLAUDE.md"));
  const resolved = JSON.parse(
    await compose("diagnostics-selection", ["config", "--format", "json"], {
      intentionalReveal: true,
    }),
  );
  const mount = resolved.services.builder.volumes.find((volume) => volume.target === "/source");
  if (
    (await realpath(mount.source)) !== (await realpath(root)) ||
    !mount.read_only ||
    resolved.services.builder.environment.LACE_BUILD_SITE_DIR !== "."
  )
    throw new Error("diagnostics: existing-site source selection mismatch");
  await compose("diagnostics-production", ["up", "-d", "--wait"], { timeoutMs: 20 * 60_000 });
  const execute = async (stage, service, code) =>
    (
      await compose(stage, ["exec", "-T", service, "node", "--input-type=module", "-e", code])
    ).trim();
  const dbCode = (code) =>
    `const {openNodeDatabase}=await import('@lacecms/platform-node');const db=openNodeDatabase('/data/lace.sqlite');try{${code}}finally{db.connection.close()}`;
  const history = async () =>
    (await request(base, "/api/v1/admin/site-builds", { headers })).body.items;
  async function wait(id, status, accelerate = false) {
    for (const deadline = Date.now() + 12 * 60_000; Date.now() < deadline;) {
      const build = (await history()).find((build) => build.id === id);
      if (build?.status === status) return build;
      if (status === "succeeded" && build?.status === "failed")
        throw new Error(`diagnostics: initial/retry build failed (${build.error})`);
      if (accelerate)
        await execute(
          "diagnostics-advance-retry",
          "api",
          dbCode(
            `db.connection.prepare("update outbox_events set available_at=? where id=? and processed_at is null and locked_by is null").run(Date.now(),${JSON.stringify(id)});`,
          ),
        );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`diagnostics: timed out waiting for ${status}`);
  }
  const initialId = published.body.build.eventId;
  const initial = initialId
    ? await wait(initialId, "succeeded")
    : await (async () => {
        for (let i = 0; i < 720; i++) {
          const match = (await history()).find(
            (b) => b.targetVersion === targetVersion && b.status === "succeeded",
          );
          if (match) return match;
          if (
            (await history()).some(
              (b) => b.targetVersion === targetVersion && b.status === "failed",
            )
          )
            throw new Error("diagnostics: initial build failed");
          await new Promise((r) => setTimeout(r, 1000));
        }
        throw new Error("diagnostics: no initial release");
      })();
  const pointer = () =>
    execute(
      "diagnostics-current",
      "builder",
      "const fs=await import('node:fs/promises');console.log(await fs.readlink('/output/current'));",
    );
  const html = async () => {
    const response = await fetch(publicBase);
    if (!response.ok) throw new Error("diagnostics: static release unavailable");
    return response.text();
  };
  let previousPointer = await pointer();
  const previousHtml = await html();
  const browser = await loadBrowser(workspace);
  const evidence = [{ case: "root-service-link", status: initial.status }];
  try {
    const browserContext = await browser.newContext({ baseURL: base.slice(0, -1) });
    const tab = await browserContext.newPage();
    await tab.goto("/admin/");
    await tab.getByRole("textbox", { name: "Email" }).fill(email);
    await tab.getByLabel("Password", { exact: true }).fill(password);
    await tab.getByRole("button", { name: "Sign in" }).click();
    await visible(tab.getByRole("heading", { name: "Content", exact: true }), "diagnostics-login");
    await tab.goto("/admin/builds");
    const sentinel = `outside-private-${randomBytes(12).toString("hex")}`;
    secretValues.add(sentinel);
    const outside = join(parent, "outside-secret");
    await writeFile(outside, sentinel);
    const faults = [
      {
        name: "in-site-link",
        reason: "source_symlink",
        path: "src/linked.astro",
        apply: () => symlink("pages/index.astro", join(root, "src/linked.astro")),
        undo: () => rm(join(root, "src/linked.astro")),
        correction: "Replace the included link",
      },
      {
        name: "escaping-link",
        reason: "source_symlink",
        path: "src/escaping",
        apply: () => symlink(outside, join(root, "src/escaping")),
        undo: () => rm(join(root, "src/escaping")),
        correction: "Replace the included link",
      },
      {
        name: "unreadable-entry",
        reason: "source_unreadable",
        path: "src/unreadable",
        apply: async () => {
          await writeFile(join(root, "src/unreadable"), "unreadable entry");
          await chmod(join(root, "src/unreadable"), 0);
        },
        undo: async () => {
          await chmod(join(root, "src/unreadable"), 0o644);
          await rm(join(root, "src/unreadable"));
        },
        correction: "Restore read access",
      },
      {
        name: "missing-lockfile",
        reason: "source_missing",
        path: "pnpm-lock.yaml",
        apply: () => rename(join(root, "pnpm-lock.yaml"), join(parent, "saved-lockfile")),
        undo: () => rename(join(parent, "saved-lockfile"), join(root, "pnpm-lock.yaml")),
        correction: "Restore the required entry",
      },
    ];
    const identity = JSON.parse(
      await execute(
        "diagnostics-builder-user",
        "builder",
        "console.log(JSON.stringify({uid:process.getuid()}))",
      ),
    );
    if (identity.uid === 0)
      throw new Error("diagnostics: unreadability cannot be verified as root");
    for (const fault of faults) {
      console.info(`Acceptance: diagnostics-${fault.name}`);
      await fault.apply();
      try {
        const probe = JSON.parse(
          await execute(
            "diagnostics-authenticated-builder",
            "builder",
            `const r=await fetch('http://127.0.0.1:8788/build',{method:'POST',headers:{authorization:'Bearer '+process.env.LACE_BUILDER_SECRET,'content-type':'application/json'},body:JSON.stringify({buildId:'diagnostic-probe',targetVersion:${targetVersion}})});console.log(await r.text());`,
          ),
        );
        if (probe.reason !== fault.reason || probe.path !== fault.path)
          throw new Error("diagnostics: builder result mismatch");
        const receipt = await request(base, "/api/v1/admin/builds", {
          method: "POST",
          headers,
          json: {},
        });
        const id = receipt.body.eventId;
        const failed = await wait(id, "failed", true);
        const detail = (await request(base, `/api/v1/admin/site-builds/${id}`, { headers })).body;
        for (const dto of [failed, detail])
          if (dto.error !== fault.reason || dto.errorPath !== fault.path)
            throw new Error("diagnostics: reason/path lost in DTO");
        const row = JSON.parse(
          await execute(
            "diagnostics-persisted",
            "api",
            dbCode(
              `console.log(JSON.stringify(db.connection.prepare('select error,attempts,last_error from site_builds join outbox_events using(id) where id=?').get(${JSON.stringify(id)})));`,
            ),
          ),
        );
        const error = JSON.parse(row.error);
        if (
          error.reason !== fault.reason ||
          error.path !== fault.path ||
          row.attempts !== 8 ||
          row.last_error !== fault.reason
        )
          throw new Error("diagnostics: persisted diagnostic/attempts mismatch");
        if ((await pointer()) !== previousPointer || (await html()) !== previousHtml)
          throw new Error("diagnostics: failed build replaced release");
        await tab.reload();
        const buildRow = tab
          .getByRole("row")
          .filter({ hasText: `v${targetVersion}` })
          .first();
        await buildRow.getByRole("button", { name: /View build/u }).click();
        const details = tab.getByRole("region", { name: "Build details" });
        await visible(details.getByText(id, { exact: true }), "diagnostics-build-id");
        if (
          !(await details.textContent()).includes(fault.path) ||
          !(await details.textContent()).includes(fault.correction)
        )
          throw new Error("diagnostics: Builds lacks correction/path");
        await expectNoAccessibilityViolations(tab, "packed failed-build details");
        assertSecretFree(await tab.content(), secretValues, "diagnostic browser");
        const logs = await compose("diagnostics-safe-logs", [
          "logs",
          "--no-color",
          "--tail",
          "100",
          "builder",
          "dispatcher",
        ]);
        assertSecretFree(logs, secretValues, "diagnostic logs");
        if (logs.includes(outside) || logs.includes("/source/src/"))
          throw new Error("diagnostics: absolute source path in logs");
        evidence.push({
          case: fault.name,
          reason: detail.error,
          path: detail.errorPath,
          attempts: row.attempts,
          uid: identity.uid,
          releasePreserved: true,
        });
      } finally {
        await fault.undo();
      }
      const beforeIds = new Set((await history()).map((build) => build.id));
      const details = tab.getByRole("region", { name: "Build details" });
      await details.getByRole("button", { name: "Retry build" }).click();
      await visible(
        tab.getByRole("status").filter({ hasText: "queued" }),
        "diagnostics-retry-receipt",
      );
      let retry;
      for (let i = 0; i < 30 && !retry; i++) {
        retry = (await history()).find((build) => !beforeIds.has(build.id));
        if (!retry) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!retry) throw new Error("diagnostics: admin retry was not dispatched");
      const successful = await wait(retry.id, "succeeded");
      if (
        successful.error !== undefined ||
        successful.errorPath !== undefined ||
        (await pointer()) === previousPointer
      )
        throw new Error("diagnostics: correction did not publish a clean new release");
      previousPointer = await pointer();
      if ((await html()) !== previousHtml)
        throw new Error("diagnostics: corrected release changed the baseline content");
      evidence[evidence.length - 1].retrySucceeded = true;
      await tab.reload();
      await tab
        .getByRole("row")
        .filter({ hasText: `v${targetVersion}` })
        .first()
        .getByRole("button", { name: /View build/u })
        .click();
      await visible(
        tab.getByRole("region", { name: "Build details" }).getByText("Succeeded", { exact: true }),
        "diagnostics-clean-success",
      );
      if (await tab.getByRole("region", { name: "Build details" }).getByRole("alert").count())
        throw new Error("diagnostics: stale error on successful retry");
    }
    console.info(
      JSON.stringify(
        {
          result: "passed",
          layout: "existing-site parent + cms child",
          images: context.images,
          evidence,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}
