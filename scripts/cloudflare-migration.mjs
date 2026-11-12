import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import {
  root,
  remoteDatabase,
  remoteConfirmationMatches,
  remoteConfirmationMode,
  UsageError,
  wranglerConfigPath,
} from "./cloudflare-lib.mjs";
import { parseMigrateArguments } from "./cloudflare-options.mjs";

const cli = join(root, "packages", "cli", "dist", "bin.js");

export async function migrate(
  argv,
  { readConfig, run, env = process.env, interactive = process.stdin.isTTY === true, confirm = ask },
) {
  const plan = parseMigrateArguments(argv);
  const config = await readConfig();
  if (plan.target === "local") {
    const database = config.d1_databases?.find((item) => item.binding === "DB");
    if (typeof database?.database_id !== "string" || !database.database_id)
      throw new UsageError("apps/api/wrangler.jsonc declares no DB D1 database ID.");
    console.info(`Applying D1 migrations to local state in ${plan.persistTo}.`);
    return run(process.execPath, [cli, "db", "migrate", "--target", "cloudflare-local"], {
      env: {
        ...env,
        LACE_D1_DATABASE_ID: database.database_id,
        LACE_CLOUDFLARE_PERSIST_TO: plan.persistTo,
        LACE_WRANGLER_CONFIG: wranglerConfigPath,
      },
    });
  }
  const database = remoteDatabase(config);
  if (
    remoteConfirmationMode({ env, interactive }) === "prompt" &&
    !remoteConfirmationMatches(await confirm(database.name), database.name)
  ) {
    console.error("Confirmation did not match; no migration was applied.");
    return 1;
  }
  return run(
    process.execPath,
    [
      cli,
      "__repository",
      "cloudflare-migrate",
      "--config",
      wranglerConfigPath,
      "--database-id",
      database.id,
    ],
    { env },
  );
}

async function ask(name) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await prompt.question(
      `This applies migrations to the REMOTE D1 database "${name}". Type its name to continue: `,
    );
  } finally {
    prompt.close();
  }
}
