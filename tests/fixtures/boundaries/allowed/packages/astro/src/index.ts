import { readFile } from "node:fs/promises";
import type { AstroGlobal } from "astro";
import { render } from "@lacecms/render";
import { sdk } from "@lacecms/sdk";
export type Global = AstroGlobal;
export const read = readFile;
export { render, sdk };
