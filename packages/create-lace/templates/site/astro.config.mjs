import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { laceImageConfig } from "@lacecms/astro";
import { defineConfig } from "astro/config";

// The project .env (the site's envDir) overlaid by the process environment, so
// image variants can fetch media originals from LACE_API_BASE_URL.
const envFile = new URL("../.env", import.meta.url);
const env = {
  ...(existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {}),
  ...process.env,
};

export default defineConfig({
  image: laceImageConfig(env),
  output: "static",
  vite: { envDir: "..", envPrefix: ["VITE_", "LACE_PUBLIC_"] },
});
