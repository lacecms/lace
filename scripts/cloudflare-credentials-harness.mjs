// Runs inside an installed packed consumer; all provider/process operations are captured.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const moduleAt = (name) =>
  import(pathToFileURL(resolve(`node_modules/@lacecms/cli/dist/${name}.js`)));
const { runPreflight } = await moduleAt("preflight");
const { resolveOperatorEnvironment } = await moduleAt("operator-environment");
const { parseArguments, loadEnvironment } = await moduleAt("index");
const { runMigration } = await moduleAt("migrate");
const account = "a".repeat(32),
  token = "credential-acceptance-private-sentinel";
const configPath = "worker/wrangler.jsonc",
  privatePath = ".lace/cloudflare-operator.env";
const originalConfig = await readFile(configPath, "utf8");
await writeFile(
  configPath,
  originalConfig.replaceAll("00000000-0000-0000-0000-000000000000", "fixture-db"),
);
await mkdir(".lace", { recursive: true });
await writeFile(
  privatePath,
  `CLOUDFLARE_ACCOUNT_ID=${account}\nCLOUDFLARE_API_TOKEN=${token}\nLACE_D1_DATABASE_ID=fixture-db\nLACE_WRANGLER_CONFIG=${configPath}\n`,
  { mode: 0o600 },
);
const before = await readFile(privatePath);
const options = {
  target: "cloudflare-remote",
  wranglerAuth: "oauth",
  operatorEnv: privatePath,
  json: true,
};
let requests = 0;
const request = async (url, input) => {
  requests++;
  assert.ok(url.includes(`/accounts/${account}/d1/database/fixture-db/`));
  assert.equal(input.headers.authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(input.body), { batch: [{ sql: "SELECT 1", params: [] }] });
  return Response.json({ success: true, result: [{ success: true, results: [{ 1: 1 }] }] });
};
for (const source of ["process", ".env", ".env.local"]) {
  const environment = source === "process" ? { CLOUDFLARE_API_TOKEN: token } : {};
  if (source !== "process") await writeFile(source, `CLOUDFLARE_API_TOKEN=${token}\n`);
  const failed = await runPreflight(options, { environment, request });
  assert.equal(failed.exitCode, 4);
  assert.equal(requests, 0);
  assert.ok(!failed.output.includes(token));
  if (source !== "process") await rm(source);
}
for (const auth of ["oauth", "token"]) {
  const processValues = auth === "token" ? { CLOUDFLARE_API_TOKEN: token } : {};
  const result = await runPreflight(
    { ...options, wranglerAuth: auth },
    { environment: processValues, request },
  );
  assert.equal(result.exitCode, 0);
  assert.ok(!result.output.includes(token));
  assert.equal(result.report.data.wranglerSource, auth === "oauth" ? "oauth-candidate" : "process");
  const parsed = parseArguments([
    "db",
    "migrate",
    "--target",
    "cloudflare-remote",
    "--operator-env",
    privatePath,
  ]);
  const selected = await resolveOperatorEnvironment(parsed.operatorEnv, processValues);
  const settings = loadEnvironment("cloudflare-remote", selected.values);
  let migration;
  await runMigration({
    ...settings,
    target: "cloudflare-remote",
    run: (executable, args, input) => {
      migration = { args, env: input.env };
      return { status: 0 };
    },
  });
  assert.equal(migration.env.CLOUDFLARE_API_TOKEN, token);
  assert.equal(migration.env.CLOUDFLARE_ACCOUNT_ID, account);
  assert.ok(!migration.args.join(" ").includes(token));
  // Model pinned Wrangler's root dotenv/process selection for a separate deploy command.
  const deployEnvironment = auth === "token" ? parseEnv(await readFile(privatePath, "utf8")) : {};
  assert.equal(deployEnvironment.CLOUDFLARE_API_TOKEN, auth === "token" ? token : undefined);
}
assert.deepEqual(await readFile(privatePath), before);
await writeFile(configPath, originalConfig);
await rm(privatePath);
console.info(
  "Packed credentials: OAuth contamination refused; clean split and token preflight/migration/deploy selection passed (simulated, no login/deploy).",
);
