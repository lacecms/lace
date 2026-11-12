import { isAbsolute, resolve } from "node:path";
import { defaultPersistDirectory, devUsage, migrateUsage, UsageError } from "./cloudflare-lib.mjs";

/** pnpm may forward a literal `--` separator; it carries no meaning here. */
function withoutSeparator(argv) {
  return argv.filter((argument) => argument !== "--");
}

/** Exactly one explicit target; nothing ever defaults to a remote database. */
export function parseMigrateArguments(argv, cwd = process.cwd()) {
  const args = withoutSeparator(argv);
  let target;
  let persistTo;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--local" || argument === "--remote") {
      if (target !== undefined) throw new UsageError(`Choose exactly one target. ${migrateUsage}`);
      target = argument.slice(2);
    } else if (argument === "--persist-to") {
      const value = args[index + 1];
      if (persistTo !== undefined || value === undefined || value.startsWith("--"))
        throw new UsageError(migrateUsage);
      persistTo = isAbsolute(value) ? value : resolve(cwd, value);
      index += 1;
    } else {
      throw new UsageError(`Unknown argument ${JSON.stringify(argument)}. ${migrateUsage}`);
    }
  }
  if (target === undefined) throw new UsageError(`Choose a target. ${migrateUsage}`);
  if (target === "remote") {
    if (persistTo !== undefined)
      throw new UsageError(`--persist-to applies only to --local. ${migrateUsage}`);
    return Object.freeze({ target });
  }
  return Object.freeze({ persistTo: persistTo ?? defaultPersistDirectory, target });
}

export function parseDevArguments(argv) {
  const args = withoutSeparator(argv);
  for (const argument of args)
    if (argument !== "--kv")
      throw new UsageError(`Unknown argument ${JSON.stringify(argument)}. ${devUsage}`);
  return Object.freeze({ kv: args.includes("--kv") });
}
