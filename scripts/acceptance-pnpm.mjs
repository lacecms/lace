import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";

export async function pinAcceptancePnpm(workspace, temporaryRoot, run) {
  const { packageManager } = JSON.parse(await readFile(join(workspace, "package.json"), "utf8"));
  const version = /^pnpm@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/u.exec(packageManager)?.[1];
  if (!version) throw new Error("Acceptance requires an exact workspace pnpm version");

  const tools = join(temporaryRoot, "tools");
  await mkdir(tools);
  await writeFile(
    join(tools, "package.json"),
    JSON.stringify({ private: true, scripts: { "pnpm-path": "node -p process.env.npm_execpath" } }),
  );
  const executable = (
    await run("resolve-pnpm", "pnpm", ["with", version, "--silent", "run", "pnpm-path"], {
      cwd: tools,
    })
  ).trim();
  if (!isAbsolute(executable)) throw new Error(`Could not resolve pnpm ${version} executable`);
  await symlink(executable, join(tools, "pnpm"));

  // Put the exact executable on PATH so nested scripts and Workers use it too.
  process.env.PATH = [tools, process.env.PATH].filter(Boolean).join(delimiter);
  process.env.npm_config_manage_package_manager_versions = "false";
  const actual = (await run("verify-pnpm", "pnpm", ["--version"], { cwd: tools })).trim();
  if (actual !== version) throw new Error(`Acceptance requires pnpm ${version}, found ${actual}`);
  console.info(`Acceptance uses pnpm ${actual}`);
}
