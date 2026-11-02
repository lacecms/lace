import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FixedCommandBuilder } from "../index.js";

export async function builderFixture(
  Builder: typeof FixedCommandBuilder,
  cleanup: (() => Promise<void>)[],
  extra: Partial<ConstructorParameters<typeof FixedCommandBuilder>[0]> = {},
) {
  const root = await mkdtemp(join(tmpdir(), "lace-builder-test-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source");
  await mkdir(join(source, "apps/site"), { recursive: true });
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "apps/site/package.json",
  ])
    await writeFile(
      join(source, file),
      file.endsWith("site/package.json")
        ? JSON.stringify({ dependencies: { astro: "7.3.1" } })
        : "{}",
    );
  await writeFile(join(source, ".env"), "SECRET=do-not-copy");
  const tool = join(root, "fake-pnpm");
  await writeFile(
    tool,
    `#!/bin/sh
if [ "$1" = "install" ]; then
  test "$2" = "--frozen-lockfile" || exit 1
  test ! -e .env || exit 1
  echo "$*" >> "${root}/install-args"
  if [ "$3" = "--store-dir" ]; then
    mkdir -p "$4"
    echo package > "$4/package"
  fi
  mkdir -p apps/site/node_modules/astro
  exit 0
fi
test "$1" = "--dir" || exit 1
test "$2" = "apps/site" || exit 1
test "$3" = "exec" || exit 1
test "$4" = "astro" || exit 1
test "$5" = "build" || exit 1
test "$6" = "--outDir" || exit 1
test "$7" = "dist" || exit 1
if [ -e apps/site/node_modules/.astro/assets/variant.webp ]; then
  echo hit >> "${root}/astro-cache"
else
  echo miss >> "${root}/astro-cache"
fi
mkdir -p apps/site/node_modules/.astro/assets
echo variant > apps/site/node_modules/.astro/assets/variant.webp
test ! -e fail-build || exit 1
mkdir -p apps/site/dist
echo '<h1>ok</h1>' > apps/site/dist/index.html
`,
  );
  await chmod(tool, 0o755);
  let version = 1;
  const builder = new Builder({
    sourceRoot: source,
    siteDirectory: "apps/site",
    outputDirectory: "dist",
    workRoot: join(root, "work"),
    outputRoot: join(root, "output"),
    apiBaseUrl: "http://api.test/",
    buildToken: "build-token",
    toolPath: tool,
    versionReader: async () => version,
    ...extra,
  });
  return {
    builder,
    root,
    source,
    tool,
    setVersion: (value: number) => {
      version = value;
    },
  };
}
