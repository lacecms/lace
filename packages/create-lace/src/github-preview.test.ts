import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { generateProject } from "./generator/project.js";

const template = new URL("../templates/.github/scripts/lace-preview.mjs", import.meta.url);
const token = "123." + "a".repeat(40) + "." + "c".repeat(64);

test("only Cloudflare projects with a site generate the gated workflow and wrapper", async () => {
  const parent = await mkdtemp(join(tmpdir(), "lace-preview-template-"));
  try {
    const cloud = await generateProject({ target: join(parent, "cloud"), cloudflare: true });
    const workflow = await readFile(join(cloud.path, ".github/workflows/lace-preview.yml"), "utf8");
    expect(workflow).toContain("timeout-minutes: 10");
    expect(workflow).toContain("github.run_attempt == 1 && github.sha == inputs.commit");
    expect(workflow.indexOf("/claim")).toBeLessThan(workflow.indexOf("actions/checkout@"));
    expect(workflow.match(/if: steps.claim.outputs.granted/g)).toHaveLength(3);
    expect(workflow).not.toMatch(/pages deploy|upload-artifact|LACE_BUILD_TOKEN/u);
    const templateEnv = await readFile(join(cloud.path, ".env.example"), "utf8");
    expect(workflow).toContain(templateEnv.match(/^LACE_BUILDER_IMAGE=(\S+)/mu)?.[1]);
    for (const options of [
      { target: join(parent, "node") },
      { target: join(parent, "none"), cloudflare: true, site: { mode: "none" as const } },
    ]) {
      const other = await generateProject(options);
      await expect(
        readFile(join(other.path, ".github/workflows/lace-preview.yml")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("trusted steps stage and upload while the site container receives only source and detached input", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lace-preview-runner-"));
  vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    // The generated runtime is a plain ESM script, copied verbatim to the project.
    const { runPreview } = await import(template.href);
    await writeFile(
      join(dir, "lace-preview-claim.json"),
      JSON.stringify({
        token,
        sitePath: "site",
        deadline: Date.now() + 60_000,
        startedAt: Date.now(),
      }),
    );
    let data: string;
    const manifest = { files: [{ path: "index.html", bytes: 7, sha256: "d".repeat(64) }] };
    const docker = vi.fn(async (args: string[], _signal: AbortSignal, input?: string) => {
      let stdout = "";
      if (args[0] === "image") stdout = "sha256:" + "e".repeat(64);
      if (input) {
        const action = JSON.parse(input);
        if (action.action === "stage") {
          expect(action.claim).toBe(token);
          data = action.directory;
          await mkdir(data);
          await writeFile(join(data, "input.json"), "{}");
        } else {
          expect(action.forbiddenValues).toEqual([token]);
          const directory = join(data, "render");
          await mkdir(directory);
          await writeFile(join(directory, "index.html"), "preview");
          stdout = JSON.stringify({ directory, manifest, mediaIds: [] });
        }
      } else if (args[0] === "run") {
        expect(args).toContain(`LACE_PREVIEW_INPUT_FILE=${join(data!, "input.json")}`);
        expect(args).toContain("site");
        expect(args.join(" ")).not.toContain(token);
        expect(args.join(" ")).not.toContain("/var/run/docker.sock");
      }
      return { code: 0, stdout };
    });
    const seal = { bytes: 456, sha256: "f".repeat(64) };
    const request = vi.fn(async (url: URL, init: RequestInit & { duplex?: "half" }) => {
      const req = new Request(url, init);
      expect(req.headers.get("authorization")).toBe(`Bearer ${token}`);
      if (url.pathname.endsWith("/manifest")) {
        expect(await req.json()).toEqual({ manifest, mediaIds: [] });
        return Response.json(seal);
      }
      if (url.pathname.endsWith("/index.html")) expect(await req.text()).toBe("preview");
      else expect(await req.json()).toEqual({ outcome: "ready", manifest: seal });
      return new Response(null, { status: 204 });
    });
    expect(
      await runPreview({
        env: {
          RUNNER_TEMP: dir,
          LACE_PREVIEW_API_ORIGIN: "https://cms.example.com/",
          LACE_PREVIEW_GENERATION: "one",
          LACE_PREVIEW_COMMIT: "a".repeat(40),
          GITHUB_RUN_ID: "123",
          LACE_PREVIEW_IMAGE: "lace-fixture",
        },
        source: async (_commit: string, project: string) => mkdir(project),
        docker,
        request,
      }),
    ).toBe(true);
    expect(request.mock.calls.map(([url]) => url.pathname)).toEqual([
      "/api/v1/preview-runner/one/artifacts/manifest",
      "/api/v1/preview-runner/one/artifacts/files/index.html",
      "/api/v1/preview-runner/one/complete",
    ]);
    expect(docker.mock.calls.filter(([args]) => args[0] === "run")).toHaveLength(3);
  } finally {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  }
});
