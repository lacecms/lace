import { copyFile, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { adminOrigin, bootstrapSecret, exec } from "./packed-preview-platforms.mjs";

export async function runLocalPreviewWorkflow({ project, scratch, platform, id, intercept }) {
  const site = join(project, "site");
  const [{ runPreview }, { createPreviewInputClient }, astro] = await Promise.all([
    import(
      /* @vite-ignore */ pathToFileURL(join(project, ".github/scripts/lace-preview.mjs")).href
    ),
    import(
      /* @vite-ignore */ pathToFileURL(join(site, "node_modules/@lacecms/sdk/dist/preview.js")).href
    ),
    import(
      /* @vite-ignore */ pathToFileURL(join(site, "node_modules/@lacecms/astro/dist/preview.js"))
        .href
    ),
  ]);
  const run = [...platform.runs.values()].find((item) => item.generation === id);
  if (!run) throw new Error("No correlated GitHub dispatch for the requested generation");
  const request = (url, init) => intercept(new Request(url, init), platform.fetch);
  const startedAt = Date.now();
  const claim = await request(`${adminOrigin}/api/v1/preview-runner/${id}/claim`, {
    method: "POST",
    headers: { authorization: `Bearer ${bootstrapSecret}`, "content-type": "application/json" },
    body: JSON.stringify({ commit: run.head_sha, runId: String(run.id) }),
  });
  if (claim.status !== 200)
    throw new Error(`Worker rejected the correlated claim (${claim.status})`);
  const runnerTemp = await mkdtemp(join(scratch, "runner-"));
  await writeFile(
    join(runnerTemp, "lace-preview-claim.json"),
    JSON.stringify({
      ...(await claim.json()),
      startedAt,
    }),
  );
  let passed = false;
  let staged;
  try {
    // The generated wrapper owns staging order, upload and completion. Local
    // command adapters use the packed toolchain and Workerd service directly.
    passed = await runPreview({
      env: {
        RUNNER_TEMP: runnerTemp,
        GITHUB_RUN_ID: String(run.id),
        LACE_PREVIEW_GENERATION: id,
        LACE_PREVIEW_COMMIT: run.head_sha,
        LACE_PREVIEW_API_ORIGIN: adminOrigin + "/",
        LACE_PREVIEW_IMAGE: "local-packed",
      },
      source: async (commit, destination) => {
        const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: project })).stdout.trim();
        if (head !== commit) throw new Error("PREVIEW_SOURCE_UNAVAILABLE");
        await mkdir(destination);
      },
      request,
      docker: async (args, signal, stdin) => {
        if (args[0] === "image" && args[1] === "inspect")
          return { code: 0, stdout: "sha256:" + "a".repeat(64) };
        if (args[0] === "pull" || args[0] === "rm") return { code: 0, stdout: "" };
        try {
          if (stdin) {
            const action = JSON.parse(stdin);
            if (action.action === "stage") {
              const client = createPreviewInputClient({
                apiBaseUrl: action.apiBaseUrl,
                generationId: action.generationId,
                claim: action.claim,
                fetch: request,
              });
              await astro.stageAstroPreviewInput(action.directory, client, signal);
              staged = action.directory;
              return { code: 0, stdout: "{}" };
            }
            if (action.action === "package") {
              const result = await astro.packageAstroPreview(action.inputFile, {
                forbiddenValues: action.forbiddenValues,
              });
              return { code: 0, stdout: JSON.stringify(result) };
            }
            throw new Error("Unexpected preview tool operation");
          }
          if (args.at(-1) !== "site") throw new Error("Incorrect Git-root-relative site selection");
          const input = args
            .find((arg) => arg.startsWith("LACE_PREVIEW_INPUT_FILE="))
            .split("=")[1];
          await copyFile(join(staged, "input.json"), input);
          await cp(
            join(staged, "_lace_preview_media"),
            join(dirname(input), "_lace_preview_media"),
            {
              recursive: true,
            },
          );
          await exec("pnpm", ["exec", "astro", "build"], {
            cwd: site,
            signal,
            env: {
              PATH: process.env.PATH,
              HOME: runnerTemp,
              ASTRO_TELEMETRY_DISABLED: "1",
              LACE_PREVIEW_INPUT_FILE: input,
            },
          });
          return { code: 0, stdout: "" };
        } catch (error) {
          console.warn("Local preview command failed", error.message);
          return { code: 1, stdout: "{}" };
        }
      },
    });
  } finally {
    run.status = "completed";
    run.conclusion = passed ? "success" : "failure";
    await rm(runnerTemp, { recursive: true, force: true });
  }
}
