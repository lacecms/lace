/** Opt-in end-to-end VPS check: node tests/vps-build.integration.mjs (requires Docker Compose). */
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";

const project = `lace21c-it-${process.pid}`;
const secret = () => randomBytes(36).toString("base64url");
const environment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/^(?:LACE|COMPOSE)_/u.test(name)),
  ),
  LACE_AUTH_SECRET: secret(),
  LACE_BUILDER_SECRET: secret(),
  LACE_BUILD_TOKEN: "bootstrap-placeholder",
  LACE_MINIO_ROOT_ACCESS_KEY: "laceadmin",
  LACE_MINIO_ROOT_SECRET: secret(),
};

function compose(...args) {
  return execFileSync("docker", ["compose", "--env-file", "/dev/null", "-p", project, ...args], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: environment,
    timeout: 12 * 60_000,
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

async function until(label, predicate, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch {
      // Service or network not ready yet.
    }
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function main() {
  const port = await availablePort();
  environment.LACE_HTTP_PORT = String(port);
  environment.LACE_PUBLIC_BASE_URL = `http://127.0.0.1:${port}/`;
  const base = environment.LACE_PUBLIC_BASE_URL;
  let cookie = "";
  async function api(path, method = "GET", body, authenticated = true) {
    const response = await fetch(new URL(path, base), {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(method === "GET" ? {} : { origin: base.slice(0, -1) }),
        ...(authenticated && cookie !== "" ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(value)}`);
    return { response, value };
  }
  try {
    compose("up", "--build", "-d");
    await until("API readiness", async () => (await fetch(new URL("health/ready", base))).ok);
    compose("stop", "dispatcher");
    compose("exec", "-T", "api", "node", "apps/api/dist/content-sync-cli.js");
    const setupOutput = compose("exec", "-T", "api", "node", "apps/api/src/dev-bootstrap.mjs");
    const setupToken = setupOutput.trim().split("\n").at(-1);
    if (!setupToken || setupToken.length < 40)
      throw new Error("No first-admin setup token was issued.");
    await api(
      "api/v1/setup/admin",
      "POST",
      {
        email: "admin@lace.test",
        password: "integration-password-123",
        token: setupToken,
      },
      false,
    );
    const signIn = await api(
      "api/auth/sign-in/email",
      "POST",
      {
        email: "admin@lace.test",
        password: "integration-password-123",
      },
      false,
    );
    cookie = signIn.response.headers
      .getSetCookie()
      .map((part) => part.split(";", 1)[0])
      .join("; ");
    if (cookie === "") throw new Error("Sign-in did not issue a session cookie.");
    const token = await api("api/v1/admin/api-tokens", "POST", { name: "VPS integration" });
    environment.LACE_BUILD_TOKEN = token.value.token;
    compose("up", "-d", "--force-recreate", "builder");

    const homeList = await api("api/v1/admin/models/home/entries");
    const home =
      homeList.value.items[0] ??
      (
        await api("api/v1/admin/models/home/entries", "POST", {
          blocks: [],
          fields: {},
          title: "Home release",
        })
      ).value;
    await api(`api/v1/admin/entries/${home.id}/publish`, "POST", {
      expectedRevision: home.draft?.revision ?? home.draftRevision,
    });
    for (const [title, slug] of [
      ["First note", "first-note"],
      ["Second note", "second-note"],
    ]) {
      const created = await api("api/v1/admin/models/notes/entries", "POST", {
        blocks: [],
        fields: {},
        slug,
        title,
      });
      await api(`api/v1/admin/entries/${created.value.id}/publish`, "POST", {
        expectedRevision: created.value.draft.revision,
      });
    }
    compose("start", "dispatcher");
    const first = await until(
      "one successful coalesced build",
      async () => {
        const builds = (await api("api/v1/admin/site-builds")).value.items;
        return builds.length === 1 && builds[0].status === "succeeded" ? builds[0] : null;
      },
      240_000,
    );
    const firstPage = await fetch(base);
    const firstHtml = await firstPage.text();
    if (!firstPage.ok || !firstHtml.includes("<title>Home</title>"))
      throw new Error(
        `The first release is not served (${firstPage.status}: ${firstHtml.slice(0, 200)}).`,
      );
    if (
      !(await fetch(new URL("notes/first-note/", base))).ok ||
      !(await fetch(new URL("notes/second-note/", base))).ok
    )
      throw new Error("Rapidly published notes are missing from the first release.");

    environment.LACE_BUILD_TOKEN = "invalid-build-token";
    compose("up", "-d", "--force-recreate", "builder");
    const broken = await api("api/v1/admin/models/notes/entries", "POST", {
      blocks: [],
      fields: {},
      slug: "failure-case",
      title: "Failure case",
    });
    await api(`api/v1/admin/entries/${broken.value.id}/publish`, "POST", {
      expectedRevision: broken.value.draft.revision,
    });
    await until("failed trigger attempt", async () => {
      const builds = (await api("api/v1/admin/site-builds")).value.items;
      return builds.length === 2 && builds[0].error ? builds[0] : null;
    });
    const stillServed = await fetch(base);
    if (!stillServed.ok || !(await stillServed.text()).includes("<title>Home</title>"))
      throw new Error("Failed build replaced the previous release.");
    if ((await fetch(new URL("notes/failure-case/", base))).ok)
      throw new Error("Failed build exposed the unpublished release.");
    // Fast-forward only the test project's durable retry timestamps; production policy remains unchanged.
    const fastForward = `const {openNodeDatabase}=await import('./packages/platform-node/dist/index.js');const db=openNodeDatabase('/data/lace.sqlite');db.connection.prepare("update outbox_events set available_at=0 where type='site.build.requested' and processed_at is null").run();db.connection.close();`;
    const failed = await until(
      "terminal failed build",
      async () => {
        compose("exec", "-T", "api", "node", "--input-type=module", "-e", fastForward);
        const builds = (await api("api/v1/admin/site-builds")).value.items;
        return builds[0]?.status === "failed" ? builds[0] : null;
      },
      90_000,
    );
    environment.LACE_BUILD_TOKEN = token.value.token;
    compose("up", "-d", "--force-recreate", "builder");
    await api(`api/v1/admin/builds/${failed.id}/retry`, "POST");
    const retried = await until(
      "successful retry",
      async () => {
        const builds = (await api("api/v1/admin/site-builds")).value.items;
        return builds.length === 3 && builds[0].status === "succeeded" ? builds[0] : null;
      },
      240_000,
    );
    const notePage = await fetch(new URL("notes/failure-case/", base));
    if (!notePage.ok) throw new Error("The retried release is not served.");
    console.info(
      `VPS integration passed: versions ${first.targetVersion} → ${retried.targetVersion}, previous release retained.`,
    );
  } finally {
    try {
      compose("down", "--volumes", "--remove-orphans");
    } catch {
      /* preserve original failure */
    }
  }
}

await main();
