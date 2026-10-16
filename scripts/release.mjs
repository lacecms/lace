import { withArtifactLock } from "./release-lock.mjs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readReleaseModel, validateReleaseModel } from "./release-model.mjs";
import {
  claimOutput,
  completeInventory,
  jsonFile,
  preparePackages,
  snapshotSource,
  verifyInventory,
  run,
} from "./release-artifacts.mjs";

export async function prepareRelease(options, operations = {}) {
  return (operations.withLock ?? withArtifactLock)(options.output, "prepare", () =>
    prepareUnlocked(options, operations),
  );
}

async function prepareUnlocked(
  { root, output, phase = "all", preview = false, platforms },
  operations = {},
) {
  const model = await readReleaseModel(root);
  const order = validateReleaseModel(model);
  if (
    process.versions.node !== "24.12.0" ||
    (await run("pnpm", ["--version"], { cwd: root, capture: true })) !== "12.3.4"
  )
    throw new Error("Preparation requires the pinned Node 24.12.0 and pnpm 12.3.4 toolchain");
  const selected = platforms ?? model.definition.platforms;
  if (
    selected.length === 0 ||
    new Set(selected).size !== selected.length ||
    selected.some((platform) => !model.definition.platforms.includes(platform))
  )
    throw new Error("Select supported distinct release platforms");
  if (!["all", "packages", "images"].includes(phase)) throw new Error("Invalid preparation phase");
  await claimOutput(output);
  try {
    const snapshot = join(output, "source");
    const source = await snapshotSource(root, snapshot, preview);
    await jsonFile(join(output, "source.json"), source);
    const frozen = await readReleaseModel(snapshot);
    validateReleaseModel(frozen);
    let packages = [];
    let images = [];
    if (phase !== "images")
      packages = await (operations.packages ?? preparePackages)(snapshot, output, frozen, order);
    if (phase !== "packages") {
      const { prepareImages } = await import("./release-images.mjs");
      images = await (operations.images ?? prepareImages)(
        snapshot,
        output,
        frozen.definition,
        source,
        selected,
      );
    }
    const inventory = completeInventory(frozen.definition, source, packages, images);
    await jsonFile(join(output, "inventory.pending.json"), inventory);
    const { rename } = await import("node:fs/promises");
    await rename(join(output, "inventory.pending.json"), join(output, "inventory.json"));
    await jsonFile(join(output, "status.json"), {
      state: "prepared",
      complete: inventory.complete,
    });
    return inventory;
  } catch (error) {
    const { rm } = await import("node:fs/promises");
    await rm(join(output, "inventory.json"), { force: true });
    await rm(join(output, "inventory.pending.json"), { force: true });
    await jsonFile(join(output, "status.json"), {
      state: "failed",
      message:
        "Preparation failed; no complete release was produced. Retry with a new output destination.",
    });
    throw error;
  }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const [phase = "check", ...args] = process.argv.slice(2);
  const options = { preview: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--preview") options.preview = true;
    else if (["--output", "--platforms"].includes(args[i]) && args[i + 1])
      options[args[i].slice(2)] = args[++i];
    else throw new Error(`Unsupported release option: ${args[i]}`);
  }
  if (phase === "verify") {
    if (!options.output) throw new Error("verify requires --output");
    const inventory = await verifyInventory(resolve(options.output));
    console.info(
      JSON.stringify(
        {
          complete: inventory.complete,
          publicationEligible: inventory.publicationEligible,
          source: inventory.source,
        },
        null,
        2,
      ),
    );
    return;
  }
  const model = await readReleaseModel(root);
  const order = validateReleaseModel(model);
  if (["check", "plan"].includes(phase)) {
    console.info(
      JSON.stringify(
        { release: model.definition, publicationOrder: order, remoteMutations: false },
        null,
        2,
      ),
    );
    return;
  }
  if (!options.output) throw new Error("Preparation requires --output <new-directory>");
  const inventory = await prepareRelease({
    root,
    phase,
    output: resolve(options.output),
    preview: options.preview,
    ...(options.platforms ? { platforms: options.platforms.split(",") } : {}),
  });
  console.info(
    JSON.stringify(
      {
        inventory: join(resolve(options.output), "inventory.json"),
        complete: inventory.complete,
        publicationEligible: inventory.publicationEligible,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
