import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";
import { generateProject } from "../dist/index.js";

const exec = promisify(execFile);
const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function project() {
  const parent = await mkdtemp(join(tmpdir(), "lace-quickstart-test-"));
  roots.push(parent);
  return (await generateProject({ target: join(parent, "cms") })).path;
}

function curlExample(text) {
  const blocks = [...text.matchAll(/```bash\n([\s\S]*?)\n```/gu)].map((match) => match[1]);
  const examples = blocks.filter((block) => block.startsWith("curl "));
  expect(examples).toHaveLength(1);
  return examples[0];
}

test("development guide commands, setup order and README index match the generated project", async () => {
  const root = await project();
  const guide = await readFile(join(root, "docs/lace-compose-dev.md"), "utf8");
  const { scripts } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const blocks = [...guide.matchAll(/```bash\n([\s\S]*?)\n```/gu)].map((match) => match[1]);
  for (const block of blocks) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("pnpm ")) continue;
      const command = line.split(" ")[1];
      if (command === "install") continue;
      if (command === "exec") {
        expect(line).toBe("pnpm exec lace doctor --target node --mode compose --stage setup");
        continue;
      }
      expect(scripts).toHaveProperty(command);
    }
  }
  const sequence = [
    "pnpm install",
    "pnpm env:prepare",
    "pnpm exec lace doctor",
    "pnpm db:migrate",
    "pnpm content:sync",
    "pnpm auth:bootstrap",
    "pnpm dev:api",
    "curl --",
    "pnpm dev\n",
    "pnpm build\n",
  ];
  const fenced = `${blocks.join("\n")}\n`;
  const positions = sequence.map((command) => fenced.indexOf(command));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((left, right) => left - right));
  // The stopped-services rule precedes the first host database command sequence.
  expect(guide.indexOf("Run them only while those services are stopped")).toBeLessThan(
    guide.indexOf("```bash\npnpm exec lace doctor"),
  );
  // Every documented source/config path exists; guides describe actual delivered files.
  for (const [, path] of guide.matchAll(/`((?:site\/[^`]+|lace\.config\.ts))`/gu)) {
    if (path.includes("*") || path === "site/dist/") continue;
    await stat(join(root, path));
  }
  expect(guide).toContain("shell history and process arguments");
  expect(guide).toContain("at least 12 characters");
  expect(guide).toContain("later requests return 404");
  expect(guide).toContain("server-side");
  expect(guide).toContain("**Working directory:**");

  const readme = await readFile(join(root, "README.md"), "utf8");
  expect(readme).not.toContain("```bash");
  expect(readme).toContain("Node `>=24.12.0` and pnpm `>=12`");
  expect(readme).toContain("pins pnpm `12.3.4`");
  expect(readme).not.toMatch(/<25|<13/u);
  for (const path of [
    "docs/lace-compose-dev.md",
    "docs/lace-compose-production.md",
    "docs/lace-operations.md",
    "docs/lace-astro-site.md",
  ])
    expect(readme).toContain(`](${path}`);
  expect(readme).not.toContain("docs/lace-cloudflare.md");
});

test("documented curl examples send the exact setup request with a public path prefix", async () => {
  const root = await project();
  const readme = await readFile(join(root, "docs/lace-compose-dev.md"), "utf8");
  const guide = await readFile(join(root, "docs/lace-operations.md"), "utf8");
  expect(curlExample(readme)).toBe(curlExample(guide));
  expect(guide).toContain("read -r -s -p 'Setup token: '");
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({
      method: request.method,
      path: request.url,
      contentType: request.headers["content-type"],
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    });
    response.writeHead(201, { "content-type": "application/json" }).end("{}");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    for (const document of [readme, guide]) {
      const command = curlExample(document)
        .replaceAll("<PUBLIC_API_BASE_URL>", `http://127.0.0.1:${server.address().port}/cms/`)
        .replaceAll("<SETUP_TOKEN>", "test-only-setup-token")
        .replaceAll("<ADMIN_EMAIL>", "admin@example.test")
        .replaceAll("<PASSWORD_AT_LEAST_12_CHARACTERS>", "test-only-password");
      await exec("bash", ["-c", command], { cwd: root, timeout: 5000 });
    }
    expect(requests).toEqual(
      Array.from({ length: 2 }, () => ({
        method: "POST",
        path: "/cms/api/v1/setup/admin",
        contentType: "application/json",
        body: {
          token: "test-only-setup-token",
          email: "admin@example.test",
          password: "test-only-password",
        },
      })),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
