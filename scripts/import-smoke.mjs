// Imports the documented sample package with the packed CLI of a
// generated project and requires an unchanged rerun.
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The sample published by the documentation site. */
export const importSampleDirectory = (workspace) =>
  join(workspace, "apps/docs/public/examples/content-import");

/** Offline validation from the generated project root: no token, no API. */
export async function validateImportSample({ project, run, workspace }) {
  const directory = await copySample(workspace);
  const output = await run(
    "import-sample-validate",
    "pnpm",
    ["exec", "lace", "import", directory, "--validate-only", "--publish", "--json"],
    { cwd: project },
  );
  if (JSON.parse(output).code !== "IMPORT_VALID")
    throw new Error("import-sample-validate: the packed CLI did not accept the sample");
}

/**
 * Issues an import token with the administrator session, imports the sample with
 * `--publish`, checks the published export and reruns. `base` ends with `/`.
 */
export async function importSampleSmoke({
  stage,
  project,
  base,
  cookie,
  run,
  readExport,
  secretValues,
  workspace,
}) {
  const origin = new URL(base).origin;
  const admin = async (path, json) => {
    const response = await fetch(new URL(path, base), {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify(json),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json().catch(() => undefined);
    if (response.status !== 201) throw new Error(`${stage}: ${path} returned ${response.status}`);
    secretValues.add(body.token);
    return body.token;
  };
  const importToken = await admin("api/v1/admin/import-tokens", {
    name: "Acceptance import",
    expiresInDays: 1,
    allowPublish: true,
  });
  const directory = await copySample(workspace);
  const lace = async (suffix) =>
    JSON.parse(
      await run(
        `${stage}-${suffix}`,
        "pnpm",
        ["exec", "lace", "import", directory, "--url", origin, "--publish", "--json"],
        { cwd: project, env: { LACE_IMPORT_TOKEN: importToken } },
      ),
    );
  const first = await lace("first");
  if (first.code !== "IMPORT_COMPLETED")
    throw new Error(`${stage}: first import finished with ${first.code}`);
  const buildToken = await admin("api/v1/admin/api-tokens", { name: "acceptance-import" });
  const exported = await readExport(base, buildToken);
  const slugs = new Set(
    exported.entries.filter((entry) => entry.modelKey === "posts").map((entry) => entry.slug),
  );
  const settings = exported.globals.find((global) => global.modelKey === "settings");
  if (!slugs.has("hello-lace") || !slugs.has("first-project"))
    throw new Error(`${stage}: imported posts missing from the published export`);
  if (settings?.fields?.siteName !== "Sample Studio")
    throw new Error(`${stage}: imported settings missing from the published export`);
  const rerun = await lace("rerun");
  const items = [...rerun.data.plan.media, ...rerun.data.plan.entries];
  if (
    rerun.code !== "IMPORT_COMPLETED" ||
    items.some((item) => item.action !== "unchanged") ||
    rerun.data.plan.publishOrder.length !== 0
  )
    throw new Error(`${stage}: the rerun planned writes`);
  console.info(`${stage}: sample imported, published and rerun without changes`);
}

async function copySample(workspace) {
  const directory = join(await mkdtemp(join(tmpdir(), "lace-import-sample-")), "package");
  await cp(importSampleDirectory(workspace), directory, { recursive: true });
  return directory;
}
