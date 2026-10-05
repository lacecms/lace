#!/usr/bin/env node
import { EXIT, loadEnvironment, parseArguments, presentResult, usage } from "./index.js";
import { runUpgradeCommand, upgradeUsage } from "./upgrade-command.js";
import { describeFailure, failureDiagnostic, identifyOperation } from "./diagnostics.js";
import type { Target } from "./index.js";
import { doctorUsage, parseDoctorArguments } from "./doctor-report.js";
import { addBlockUsage, runAddBlockCommand } from "./blocks-command.js";

import { parsePreflightArguments, preflightUsage } from "./preflight-options.js";

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    console.info(`${usage}\n${doctorUsage}\n${upgradeUsage}\n${addBlockUsage}\n${preflightUsage}`);
    return EXIT.OK;
  }
  const json = argv.includes("--json");
  const operation = identifyOperation(argv);
  let target: Target = "node";
  try {
    if (argv[0] === "cloudflare" && argv[1] === "preflight") {
      if (argv.length === 3 && ["--help", "-h"].includes(argv[2]!)) {
        console.info(preflightUsage);
        return EXIT.OK;
      }
      const options = parsePreflightArguments(argv.slice(2));
      target = "cloudflare-remote";
      const { runPreflight } = await import("./preflight.js");
      const result = await runPreflight(options);
      console.info(result.output);
      return result.exitCode;
    }
    if (argv[0] === "doctor") {
      if (argv.length === 2 && (argv[1] === "--help" || argv[1] === "-h")) {
        console.info(doctorUsage);
        return EXIT.OK;
      }
      const options = parseDoctorArguments(argv.slice(1));
      target = options.target;
      const { runDoctor } = await import("./doctor.js");
      const result = await runDoctor(options);
      console.info(result.output);
      return result.exitCode;
    }
    if (argv[0] === "upgrade") {
      if (argv.length === 2 && (argv[1] === "--help" || argv[1] === "-h")) {
        console.info(upgradeUsage);
        return EXIT.OK;
      }
      const result = await runUpgradeCommand(argv.slice(1));
      console.info(result.output);
      return result.exitCode;
    }
    if (argv[0] === "add" && argv[1] === "block") {
      if (argv.length === 3 && (argv[2] === "--help" || argv[2] === "-h")) {
        console.info(addBlockUsage);
        return EXIT.OK;
      }
      const result = await runAddBlockCommand(argv.slice(2));
      console.info(result.output);
      return result.exitCode;
    }
    const options = parseArguments(argv);
    target = options.target;
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
  } catch (error) {
    const { exitCode, ...failure } = describeFailure(error, operation, target);
    const output = presentResult(failure, json);
    if (json) console.info(output);
    else console.error(output);
    return exitCode;
  }
}

void main().then((code) => {
  process.exitCode = code;
});
