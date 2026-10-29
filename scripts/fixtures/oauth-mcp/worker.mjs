// Isolated test Worker only. Its test database has no production credentials.
import { guardedWorkerFetch } from "./baseline.mjs";
import { probeHandler } from "./mcp-baseline.mjs";
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/mcp") {
      const handler = probeHandler();
      try {
        return await handler.fetch(request);
      } finally {
        await handler.close();
      }
    }
    return guardedWorkerFetch(env.DB, request);
  },
};
