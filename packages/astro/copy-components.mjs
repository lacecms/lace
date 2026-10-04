// Ships the Astro components next to the compiled module; Astro compiles them in the site.
import { copyFile, readdir } from "node:fs/promises";

const source = new URL("./src/", import.meta.url);
const target = new URL("./dist/", import.meta.url);
for (const name of await readdir(source)) {
  if (name.endsWith(".astro")) await copyFile(new URL(name, source), new URL(name, target));
}
