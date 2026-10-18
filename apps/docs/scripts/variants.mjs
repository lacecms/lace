import { mkdtemp, cp, symlink, readFile, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const app = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(app, ".variant-"));
try {
  for (const name of ["src", "public", "astro.config.mjs", "package.json", "tsconfig.json"])
    await cp(join(app, name), join(temporary, name), { recursive: true });
  await symlink(join(app, "node_modules"), join(temporary, "node_modules"), "dir");
  const definition = JSON.parse(await readFile(join(temporary, "src/catalog.json"), "utf8"));
  definition.locales.fr = { label: "French fixture", lang: "fr" };
  definition.versions["alpha-5"] = { label: "Alpha 5 fixture", target: "0.1.0-alpha.5" };
  await writeFile(join(temporary, "src/catalog.json"), JSON.stringify(definition));
  for (const [locale, version] of [
    ["fr", "latest"],
    ["fr", "alpha-5"],
    ["en", "alpha-5"],
  ])
    await cp(
      join(temporary, "src/content/docs/en/latest"),
      join(temporary, `src/content/docs/${locale}/${version}`),
      { recursive: true },
    );
  execFileSync(process.execPath, [join(app, "node_modules/astro/bin/astro.mjs"), "build"], {
    cwd: temporary,
    stdio: "pipe",
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
  });
  for (const route of ["en/latest", "fr/latest", "en/alpha-5", "fr/alpha-5"])
    await access(join(temporary, `dist/${route}/index.html`));
  console.log("Additional locale and fixed-version build passed; production output untouched");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
