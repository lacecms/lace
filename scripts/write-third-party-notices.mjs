import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Retain dependency notices alongside bundled admin/font assets. Includes build
// tooling as well as runtime dependencies; inclusion is not a reachability claim.
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, process.argv[2]);
const modules = join(root, "node_modules/.pnpm");
const packages = new Map();
for (const directory of await readdir(modules, { withFileTypes: true })) {
  if (!directory.isDirectory() || directory.name === "node_modules") continue;
  const base = join(modules, directory.name, "node_modules");
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const roots = entry.name.startsWith("@")
      ? (await readdir(join(base, entry.name), { withFileTypes: true }))
          .filter((item) => item.isDirectory())
          .map((item) => join(base, entry.name, item.name))
      : [join(base, entry.name)];
    for (const path of roots) {
      const manifest = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
      const key = `${manifest.name}@${manifest.version}`;
      if (packages.has(key)) continue;
      const names = (await readdir(path, { withFileTypes: true }))
        .filter((item) => item.isFile())
        .map((item) => item.name)
        .filter(
          (name) =>
            /^(?:licen[cs]e|copying|notice|ofl)(?:\.|$)/iu.test(name) ||
            (manifest.name.startsWith("@img/sharp-libvips-") && name === "README.md"),
        );
      const notices = [];
      for (const name of names)
        notices.push(`${name}\n${await readFile(join(path, name), "utf8")}`);
      packages.set(
        key,
        `${key}\nLicense: ${typeof manifest.license === "string" ? manifest.license : JSON.stringify(manifest.license ?? "see package metadata")}\n${notices.join("\n")}`,
      );
    }
  }
}
const preface = `Lace third-party notices\n\nThis inventory retains notices from installed dependencies used to build or run Lace, including tooling. It does not assert that every listed package is bundled. Each package retains its own license.\n\nNative sharp/libvips binaries are dynamically loaded and replaceable through the installed sharp packages. Corresponding upstream source and build recipes for sharp-libvips 1.3.4: https://github.com/lovell/sharp-libvips/tree/v1.3.4 ; component versions and notices remain in each @img/sharp-libvips package's versions.json and README.md. sharp source: https://github.com/lovell/sharp/tree/v0.35.5 . Native packages are unmodified.\n\n`;
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  preface +
    [...packages]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, notice]) => notice)
      .join("\n\n--------------------\n\n") +
    "\n",
);
console.info(`Retained notices for ${packages.size} installed dependency versions`);
