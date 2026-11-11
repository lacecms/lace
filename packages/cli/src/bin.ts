#!/usr/bin/env node
import { EXIT, loadEnvironment, parseArguments, presentResult, usage } from "./index.js";
import { parseUpgradeArguments, runUpgradeOptions, upgradeUsage } from "./upgrade-command.js";
import { describeFailure, failureDiagnostic, identifyOperation } from "./diagnostics.js";
import type { Target } from "./index.js";
import { doctorUsage, parseDoctorArguments } from "./doctor-report.js";
import { addBlockUsage, parseAddBlockArguments, runAddBlockOptions } from "./blocks-command.js";
import { importUsage } from "./import-usage.js";

import { parsePreflightArguments, preflightUsage } from "./preflight-options.js";
import { parseFlags } from "./parse-flags.js";
import { CliError } from "./index.js";

type Context = { target: Target; operation: ReturnType<typeof identifyOperation> };

function defineCommand<T>(definition: {
  name: string;
  usage: string;
  operator?: boolean;
  parse: (argv: readonly string[]) => T | Promise<T>;
  run: (options: T, context: Context) => Promise<number>;
}) {
  return {
    name: definition.name,
    usage: definition.usage,
    operator: definition.operator ?? false,
    execute: async (argv: readonly string[], context: Context) =>
      definition.run(await definition.parse(argv), context),
  };
}

const commandTable = [
  defineCommand({
    name: "__repository cloudflare-migrate",
    usage: "",
    parse(argv) {
      const parsed = parseFlags(argv, {
        boolean: [],
        value: ["--config", "--database-id"],
        invalid: () => {
          throw new CliError("USAGE", "Invalid internal migration options.", EXIT.USAGE);
        },
      });
      const config = parsed.values.get("--config");
      const databaseId = parsed.values.get("--database-id");
      if (!config || !databaseId)
        throw new CliError("USAGE", "Invalid internal migration options.", EXIT.USAGE);
      return { config, databaseId };
    },
    async run(options, context) {
      context.target = "cloudflare-remote";
      const { runWranglerMigration } = await import("./wrangler-migration.js");
      const versions = await runWranglerMigration(options);
      console.info(`D1 migrations installed: ${versions.join(", ")}.`);
      return EXIT.OK;
    },
  }),
  defineCommand({
    name: "cloudflare preflight",
    usage: preflightUsage,
    parse: parsePreflightArguments,
    async run(options, context) {
      context.target = "cloudflare-remote";
      const { runPreflight } = await import("./preflight.js");
      const result = await runPreflight(options);
      console.info(result.output);
      return result.exitCode;
    },
  }),
  defineCommand({
    name: "doctor",
    usage: doctorUsage,
    parse: parseDoctorArguments,
    async run(options, context) {
      context.target = options.target;
      const { runDoctor } = await import("./doctor.js");
      const result = await runDoctor(options);
      console.info(result.output);
      return result.exitCode;
    },
  }),
  defineCommand({
    name: "upgrade",
    usage: upgradeUsage,
    parse: parseUpgradeArguments,
    async run(options) {
      const result = await runUpgradeOptions(options);
      console.info(result.output);
      return result.exitCode;
    },
  }),
  defineCommand({
    name: "add block",
    usage: addBlockUsage,
    parse: parseAddBlockArguments,
    async run(options) {
      const result = await runAddBlockOptions(options);
      console.info(result.output);
      return result.exitCode;
    },
  }),
  defineCommand({
    name: "import",
    usage: importUsage,
    async parse(argv) {
      const module = await import("./import-command.js");
      try {
        const options = module.parseImportArguments(argv);
        return { argv, module, parse: () => options };
      } catch (error) {
        return {
          argv,
          module,
          parse: () => {
            throw error;
          },
        };
      }
    },
    async run({ argv, module, parse }) {
      const result = await module.runImportCommand(
        argv,
        {
          cwd: process.cwd(),
          env: process.env,
          progress: (line) => console.error(line),
        },
        parse,
      );
      const output = presentResult(
        {
          ok: result.ok,
          code: result.code,
          message: result.message,
          ...(result.data === undefined ? {} : { data: result.data }),
          ...(result.ok ? {} : failureDiagnostic("import", result.code)),
        },
        result.json,
      );
      if (result.json || result.ok) console.info(output);
      else console.error(output);
      return result.exitCode;
    },
  }),
  ...(["db migrate", "content sync", "auth bootstrap", "env prepare"] as const).map((name) =>
    defineCommand({ name, usage, operator: true, parse: parseArguments, run: runOperator }),
  ),
];

async function runOperator(
  options: ReturnType<typeof parseArguments>,
  context: Context,
): Promise<number> {
  context.target = options.target;
  const target = context.target;
  const operation = context.operation;
  if (options.command === "env prepare") {
    const { prepareEnvironment } = await import("./environment.js");
    const worker = options.target === "cloudflare-local";
    await prepareEnvironment(undefined, undefined, worker ? "cloudflare-local" : "project");
    console.info(
      presentResult(
        {
          ok: true,
          code: "ENV_PREPARED",
          message: worker
            ? "Created protected worker/.dev.vars with a local auth secret. Review its local origin; never commit it."
            : "Created protected .env. Review local settings; leave LACE_BUILD_TOKEN empty until Admin Settings issues it.",
        },
        options.json,
      ),
    );
    return EXIT.OK;
  }
  const values =
    options.operatorEnv === undefined
      ? process.env
      : (
          await (
            await import("./operator-environment.js")
          ).resolveOperatorEnvironment(options.operatorEnv)
        ).values;
  const environment = loadEnvironment(options.target, values);
  // Runtime adapters are unnecessary for upgrade, help and invalid settings.
  const { runCommand } = await import("./commands.js");
  const result = await runCommand(options, environment);
  const output = presentResult(
    {
      ok: result.ok,
      code: result.code,
      message: result.message,
      data: result.data,
      ...(result.ok ? {} : failureDiagnostic(operation, result.code, target)),
    },
    options.json,
  );
  if (options.json || result.ok) console.info(output);
  else console.error(output);
  return result.exitCode;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    console.info(
      `${usage}\n${doctorUsage}\n${upgradeUsage}\n${addBlockUsage}\n${importUsage}\n${preflightUsage}`,
    );
    return EXIT.OK;
  }
  const json = argv.includes("--json");
  const context: Context = { target: "node", operation: identifyOperation(argv) };
  try {
    for (const command of commandTable) {
      if (command.operator) continue;
      const words = command.name.split(" ");
      if (!words.every((word, index) => argv[index] === word)) continue;
      const args = argv.slice(words.length);
      if (args.length === 1 && ["--help", "-h"].includes(args[0]!)) {
        console.info(command.usage);
        return EXIT.OK;
      }
      return await command.execute(args, context);
    }
    // Operator flags may precede or separate the command words.
    const command =
      commandTable.find((item) => item.operator && item.name === context.operation) ??
      commandTable.find((item) => item.operator)!;
    return await command.execute(argv, context);
  } catch (error) {
    const { exitCode, ...failure } = describeFailure(error, context.operation, context.target);
    const output = presentResult(failure, json);
    if (json) console.info(output);
    else console.error(output);
    return exitCode;
  }
}

void main().then((code) => {
  process.exitCode = code;
});
