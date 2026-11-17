import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, open, realpath } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { excludedBuildSource, validateSource, type SourceSelection } from "./source.js";

const git = promisify(execFile);
const commitPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})(?![\s\S])/u;
const environment = {
  PATH: process.env.PATH,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_NO_LAZY_FETCH: "1",
};

export class PreviewSourceError extends Error {
  public constructor(readonly detail: "dirty" | "unsupported" | "unavailable") {
    super("PREVIEW_SOURCE_UNAVAILABLE");
  }
}

function gitArgs(root: string, ...args: string[]) {
  return [
    "-C",
    root,
    "-c",
    `safe.directory=${root}`,
    "-c",
    "core.fsmonitor=false",
    "--no-replace-objects",
    ...args,
  ];
}

async function gitQuery(
  root: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<string> {
  const { stdout } = await git("git", gitArgs(root, ...args), {
    env: environment,
    ...(signal && { signal }),
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

const query = (root: string, ...args: string[]) => gitQuery(root, args);

function includesSource(path: string, selection: SourceSelection): boolean {
  return (
    !excludedBuildSource(path, posix.join(selection.siteDirectory, selection.outputDirectory)) &&
    !path
      .split("/")
      .some(
        (part) =>
          [".lace", ".wrangler", ".pnpmrc", ".netrc"].includes(part) ||
          /\.(?:sqlite(?:3)?(?:[-.].*)?|pem|key)$/iu.test(part),
      )
  );
}

export async function pinPreviewSource(root: string, selection: SourceSelection): Promise<string> {
  try {
    const checkout = (await query(root, "rev-parse", "--show-toplevel")).trimEnd();
    if (checkout !== (await realpath(root))) throw new PreviewSourceError("unsupported");
    const commit = (await query(root, "rev-parse", "--verify", "HEAD^{commit}")).trim();
    if (!commitPattern.test(commit)) throw new PreviewSourceError("unsupported");
    // Reject external clean/smudge processes before checking the worktree.
    const config = await query(root, "config", "--name-only", "--null", "--list");
    if (
      config
        .split("\0")
        .some(
          (name) =>
            name.startsWith("filter.") ||
            name === "extensions.partialclone" ||
            /^remote\..+\.promisor$/u.test(name),
        )
    )
      throw new PreviewSourceError("unsupported");
    const status = await query(
      root,
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--no-renames",
      "--ignore-submodules=all",
    );
    if (status.split("\0").some((line) => line && includesSource(line.slice(3), selection)))
      throw new PreviewSourceError("dirty");
    if ((await query(root, "rev-parse", "--verify", "HEAD^{commit}")).trim() !== commit)
      throw new PreviewSourceError("dirty");
    return commit;
  } catch (error) {
    if (error instanceof PreviewSourceError) throw error;
    throw new PreviewSourceError("unavailable");
  }
}

async function writeBlob(
  root: string,
  hash: string,
  target: string,
  mode: number,
  signal: AbortSignal,
) {
  await mkdir(dirname(target), { recursive: true });
  const child = spawn("git", gitArgs(root, "cat-file", "blob", hash), {
    env: environment,
    signal,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const exited = new Promise<boolean>((resolve) =>
    child.once("close", (code) => resolve(code === 0)),
  );
  child.once("error", () => child.stdout.destroy());
  try {
    await pipeline(child.stdout, createWriteStream(target, { flags: "wx", mode }), { signal });
  } finally {
    await exited;
  }
  if (!(await exited)) throw new PreviewSourceError("unavailable");
  const file = await open(target, "r");
  try {
    const marker = "version https://git-lfs.github.com/spec/v1";
    const header = Buffer.alloc(marker.length);
    await file.read(header, 0, header.length, 0);
    if (header.toString() === marker) throw new PreviewSourceError("unsupported");
  } finally {
    await file.close();
  }
}

export async function stagePreviewSource(
  root: string,
  commit: string,
  destination: string,
  selection: SourceSelection,
  signal: AbortSignal,
): Promise<void> {
  if (!commitPattern.test(commit)) throw new PreviewSourceError("unsupported");
  try {
    const tree = await gitQuery(root, ["ls-tree", "-rz", "--full-tree", commit], signal);
    for (const entry of tree.split("\0")) {
      if (!entry) continue;
      signal.throwIfAborted();
      const delimiter = entry.indexOf("\t");
      const path = entry.slice(delimiter + 1);
      if (!includesSource(path, selection)) continue;
      const [mode, type, hash] = entry.slice(0, delimiter).split(" ");
      if (
        type !== "blob" ||
        (mode !== "100644" && mode !== "100755") ||
        hash === undefined ||
        !commitPattern.test(hash) ||
        path.includes("\\") ||
        path.includes("\uFFFD") ||
        path.split("/").some((segment) => !segment || segment === "." || segment === "..")
      )
        throw new PreviewSourceError("unsupported");
      await writeBlob(
        root,
        hash,
        join(destination, path),
        Number.parseInt(mode, 8) & 0o777,
        signal,
      );
    }
    await validateSource(destination, selection);
  } catch (error) {
    if (signal.aborted || error instanceof PreviewSourceError) throw error;
    throw new PreviewSourceError("unavailable");
  }
}
