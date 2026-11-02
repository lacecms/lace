// Compiles source `.astro` components, including registry test fixtures.
import { getViteConfig } from "astro/config";
import { sharedTestConfig } from "../../vitest.shared.mjs";

export default getViteConfig(
  sharedTestConfig(),
  // Image tests serve originals from a local server on a random port.
  { image: { remotePatterns: [{ hostname: "127.0.0.1", protocol: "http" }] }, logLevel: "error" },
);
