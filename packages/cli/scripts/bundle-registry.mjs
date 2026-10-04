// Copies the repository block registry into dist/ so the published CLI
// carries the exact registry sources it installs; nothing is fetched at runtime.
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../../registry/", import.meta.url));
const target = fileURLToPath(new URL("../dist/registry/", import.meta.url));

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
