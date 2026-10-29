// Compile real plugin composition with the same compiler settings as auth.
import { betterAuth } from "better-auth";
import { createMcpOAuthProvider } from "../../../packages/auth/dist/index.js";

betterAuth({
  plugins: [
    createMcpOAuthProvider({
      origin: new URL("https://cms.lace.test"),
      production: true,
      consentReferenceId: async () => "fixture-grant",
    }),
  ],
});
