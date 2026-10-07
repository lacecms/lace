import { realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const packed = process.env.LACE_34C_PACKED_ROOT;
const cli = packed && realpathSync(join(packed, "node_modules/@lacecms/cli"));
async function load(name) {
  const url = cli
    ? pathToFileURL(join(cli, `../${name}/dist/index.js`))
    : new URL(`../../packages/${name}/dist/index.js`, import.meta.url);
  if (packed && !url.pathname.includes("node_modules"))
    throw new Error("Expected installed platform artifact");
  return import(/* @vite-ignore */ url.href);
}
export const application = await load("application");
export const node = await load("platform-node");
export const cloudflare = await load("platform-cloudflare");
