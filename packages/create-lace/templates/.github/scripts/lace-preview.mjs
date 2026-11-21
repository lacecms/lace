import { execFile, spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";

const exec = promisify(execFile);
const tool = "/opt/lace-preview-tools/dist/preview-tool.js";
const excluded =
  /^(?:\.git|\.github|\.lace|\.wrangler|\.dev\.vars(?:\..*)?|\.env(?:\..*)?|\.npmrc|\.pnpmrc|\.netrc|node_modules|dist|\.astro|.*\.(?:pem|key|sqlite(?:3)?(?:[-.].*)?))$/u;
const toolFailure =
  /^PREVIEW_(?:CONFIGURATION_UNAVAILABLE|CONTEXT_CHANGED|DEPENDENCY_FAILED|RESOURCE_LIMIT|ROUTE_CONFLICT|RENDER_FAILED|STORAGE_FAILED)$/u;

async function copySource(commit, project, signal) {
  const git = async (...args) =>
    (await exec("git", args, { signal, maxBuffer: 16 * 1024 * 1024 })).stdout;
  if ((await git("rev-parse", "HEAD")).trim() !== commit)
    throw new Error("PREVIEW_SOURCE_UNAVAILABLE");
  const tree = await git("ls-tree", "-rz", "--full-tree", commit);
  const lfs = "version https://git-lfs.github.com/spec/v1";
  for (const entry of tree.split("\0").filter(Boolean)) {
    signal.throwIfAborted();
    const index = entry.indexOf("\t");
    const path = entry.slice(index + 1);
    if (path.split("/").some((part) => excluded.test(part))) continue;
    if (
      !/^100(?:644|755) blob [a-f0-9]{40}$/u.test(entry.slice(0, index)) ||
      /[\\\uFFFD]/u.test(path)
    )
      throw new Error("PREVIEW_SOURCE_UNAVAILABLE");
    const file = await open(path, "r");
    try {
      const prefix = Buffer.alloc(lfs.length);
      await file.read(prefix);
      if (prefix.toString() === lfs) throw new Error("PREVIEW_SOURCE_UNAVAILABLE");
    } finally {
      await file.close();
    }
    const target = join(project, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(path, target);
  }
}

function container(args, signal, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { signal, stdio: ["pipe", "pipe", "ignore"] });
    const chunks = [];
    let size = 0;
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size <= 2 * 1024 * 1024) chunks.push(chunk);
    });
    child.on("error", reject);
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    child.on("close", (code) => resolve({ code, stdout: Buffer.concat(chunks).toString("utf8") }));
  });
}

export async function runPreview({
  env,
  source = copySource,
  docker = container,
  request = fetch,
}) {
  const generation = env.LACE_PREVIEW_GENERATION;
  const commit = env.LACE_PREVIEW_COMMIT;
  const claimFile = join(env.RUNNER_TEMP, "lace-preview-claim.json");
  const { token, deadline, sitePath, startedAt } = JSON.parse(await readFile(claimFile, "utf8"));
  await rm(claimFile);
  if (
    !/^[A-Za-z0-9_-]{1,128}$/u.test(generation) ||
    !/^[a-f0-9]{40}$/u.test(commit) ||
    !/^(?:\.|[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*)$/u.test(sitePath)
  )
    throw new Error("PREVIEW_CONFIGURATION_UNAVAILABLE");
  const origin = new URL(env.LACE_PREVIEW_API_ORIGIN);
  if (origin.protocol !== "https:" || origin.href !== origin.origin + "/")
    throw new Error("PREVIEW_CONFIGURATION_UNAVAILABLE");
  const remaining = Math.min(600_000, deadline - Date.now());
  const signal = remaining > 0 ? AbortSignal.timeout(remaining) : AbortSignal.abort();
  const endpoint = new URL(`api/v1/preview-runner/${generation}/`, origin);
  const scratch = await mkdtemp(join(env.RUNNER_TEMP, "lace-preview-"));
  const buildDirectory = join(scratch, "build");
  const project = join(buildDirectory, "project");
  const data = join(scratch, "data");
  const staged = join(data, "input");
  const inputFile = join(staged, "input.json");
  const renderInputFile = join(buildDirectory, "input.json");
  const originals = "_lace_preview_media";
  const name = `lace-preview-${env.GITHUB_RUN_ID}`;
  const putJson = (path, body) =>
    send(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  async function send(path, options) {
    signal.throwIfAborted();
    const response = await request(new URL(path, endpoint), {
      ...options,
      headers: { ...options.headers, authorization: `Bearer ${token}` },
      signal,
      redirect: "error",
    });
    if (response.ok) return response;
    await response.body?.cancel();
    throw new Error("PREVIEW_STORAGE_FAILED");
  }
  const diagnostics = () => ({
    generation,
    commit,
    runId: env.GITHUB_RUN_ID,
    startedAt,
    durationMs: Date.now() - startedAt,
  });
  let image;
  let phase = "source";
  const mount = (path) => ["--volume", `${path}:${path}`];
  const run = (args, stdin) =>
    docker(
      [
        "run",
        "--rm",
        "--init",
        "--interactive",
        "--name",
        name,
        "--user",
        `${process.getuid()}:${process.getgid()}`,
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--env",
        "HOME=/tmp",
        ...args,
      ],
      signal,
      stdin,
    );
  async function trusted(action) {
    const result = await run([...mount(data), image, "node", tool], JSON.stringify(action));
    const output = JSON.parse(result.stdout || "{}");
    if (result.code !== 0)
      throw new Error(toolFailure.test(output.reason) ? output.reason : "PREVIEW_STORAGE_FAILED");
    return output;
  }
  async function cleanupContainer() {
    return docker(["rm", "--force", name], AbortSignal.timeout(5_000)).catch(() => undefined);
  }
  try {
    signal.throwIfAborted();
    await mkdir(buildDirectory);
    await source(commit, project, signal);
    await mkdir(data);
    phase = "toolchain";
    if ((await docker(["pull", env.LACE_PREVIEW_IMAGE], signal)).code !== 0)
      throw new Error("PREVIEW_DEPENDENCY_FAILED");
    const inspect = await docker(
      ["image", "inspect", "--format", "{{.Id}}", env.LACE_PREVIEW_IMAGE],
      signal,
    );
    image = inspect.stdout.trim();
    if (inspect.code || !/^sha256:[a-f0-9]{64}$/u.test(image))
      throw new Error("PREVIEW_DEPENDENCY_FAILED");
    phase = "input";
    await trusted({
      action: "stage",
      directory: staged,
      apiBaseUrl: origin.href,
      generationId: generation,
      claim: token,
    });
    phase = "render";
    // Astro renames prerender assets into the output, so both need the same mount.
    const build = await run([
      ...mount(buildDirectory),
      "--volume",
      `${inputFile}:${renderInputFile}:ro`,
      "--volume",
      `${join(staged, originals)}:${join(buildDirectory, originals)}:ro`,
      "--workdir",
      project,
      "--env",
      `LACE_PREVIEW_INPUT_FILE=${renderInputFile}`,
      "--env",
      "ASTRO_TELEMETRY_DISABLED=1",
      image,
      "bash",
      "-eu",
      "-c",
      "pnpm install --frozen-lockfile || exit 42\n" +
        'if [ "$1" != . ] && [ -f "$1/pnpm-lock.yaml" ]; then pnpm --dir "$1" install --frozen-lockfile || exit 42; fi\n' +
        'pnpm --dir "$1" exec astro build',
      "lace-preview",
      sitePath,
    ]);
    if (build.code !== 0)
      throw new Error(build.code === 42 ? "PREVIEW_DEPENDENCY_FAILED" : "PREVIEW_RENDER_FAILED");
    phase = "package";
    await rename(
      join(buildDirectory, "render-report.json"),
      join(staged, "render-report.json"),
    ).catch((error) => {
      throw new Error(
        error.code === "ENOENT" ? "PREVIEW_CONFIGURATION_UNAVAILABLE" : "PREVIEW_STORAGE_FAILED",
      );
    });
    await rename(join(buildDirectory, "render"), join(staged, "render")).catch((error) => {
      throw new Error(error.code === "ENOENT" ? "PREVIEW_RENDER_FAILED" : "PREVIEW_STORAGE_FAILED");
    });
    const { directory, manifest, mediaIds } = await trusted({
      action: "package",
      inputFile,
      forbiddenValues: [token, buildDirectory],
    });
    if (directory !== join(staged, "render")) throw new Error("PREVIEW_RENDER_FAILED");
    phase = "upload";
    const seal = await (await putJson("artifacts/manifest", { manifest, mediaIds })).json();
    for (const file of manifest.files) {
      const stream = file.bytes > 0 ? createReadStream(join(directory, file.path)) : undefined;
      try {
        await (
          await send(`artifacts/files/${file.path}`, {
            method: "PUT",
            headers: {
              "content-type": "application/octet-stream",
              "content-length": String(file.bytes),
              "x-lace-sha256": file.sha256,
            },
            body: stream ? Readable.toWeb(stream) : new Uint8Array(0),
            ...(stream && { duplex: "half" }),
          })
        ).body?.cancel();
      } finally {
        stream?.destroy();
      }
    }
    await (await putJson("complete", { outcome: "ready", manifest: seal })).body?.cancel();
    console.info(
      JSON.stringify({
        ...diagnostics(),
        status: "ready",
        files: manifest.files.length,
        bytes: manifest.files.reduce((total, file) => total + file.bytes, 0),
      }),
    );
  } catch (error) {
    const reason = signal.aborted
      ? "PREVIEW_TIMED_OUT"
      : toolFailure.test(error.message) || error.message === "PREVIEW_SOURCE_UNAVAILABLE"
        ? error.message
        : "PREVIEW_PROVIDER_UNAVAILABLE";
    console.error(JSON.stringify({ ...diagnostics(), phase, reason }));
    await cleanupContainer();
    if (!signal.aborted)
      await putJson("complete", { outcome: "failed", reason })
        .then((response) => response.body?.cancel())
        .catch(() => {});
    return false;
  } finally {
    await cleanupContainer();
    await rm(scratch, { force: true, recursive: true }).catch(() => {});
  }
  return true;
}

if (import.meta.main) {
  try {
    if (!(await runPreview({ env: process.env }))) process.exitCode = 1;
  } catch {
    console.error("PREVIEW_CONFIGURATION_UNAVAILABLE");
    process.exitCode = 1;
  }
}
