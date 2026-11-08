import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { sourceCondition } from "../../vitest.shared.mjs";

// Unit tests resolve workspace packages through their `@lacecms/source` export
// condition; the development server and production build keep `dist/`.
export default defineConfig(({ mode }) => ({
  base: "/admin/",
  plugins: [react(), tailwindcss(), ...(mode === "test" ? [sourceCondition()] : [])],
  server: { allowedHosts: ["admin"] },
  test: {
    css: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
}));
