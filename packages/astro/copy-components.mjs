// Ships the Astro components next to the compiled module; Astro compiles them in the site.
import { copyFile, mkdir, readdir } from "node:fs/promises";

const source = new URL("./src/", import.meta.url);
const target = new URL("./dist/", import.meta.url);
for (const name of await readdir(source)) {
  if (name.endsWith(".astro")) await copyFile(new URL(name, source), new URL(name, target));
}
await mkdir(new URL("rich-text/", target), { recursive: true });
await copyFile(
  new URL("rich-text/RichTextNodes.astro", source),
  new URL("rich-text/RichTextNodes.astro", target),
);
