import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
const execute = promisify(execFile);
const accepted = {
  "GHSA-67mh-4wv8-2f99": {
    package: "esbuild",
    mitigation: "Never start/expose the legacy esbuild development server; repository tooling only",
    reviewTrigger: "drizzle-kit/loader update or server invocation change",
  },
  "GHSA-vfj7-8cjw-p6xm": {
    package: "braces",
    mitigation:
      "OpenSpec receives trusted repository-controlled glob patterns only; no patched release reported",
    reviewTrigger: "upstream patch or untrusted pattern input",
  },
};
const knownLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "Apache-2.0 AND LGPL-3.0-or-later",
  "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MIT OR Apache-2.0",
  "MIT-0",
  "MPL-2.0",
  "OFL-1.1",
  "Python-2.0",
  "Unlicense",
]);
export function validateAudit(audit, licenses) {
  assert.ok(audit.metadata && audit.advisories, "missing advisory data");
  for (const advisory of Object.values(audit.advisories)) {
    const risk = accepted[advisory.url?.split("/").at(-1)];
    assert.ok(risk && risk.package === advisory.module_name, "undispositioned advisory");
    assert.ok(advisory.findings?.length, "advisory lacks dependency paths");
  }
  assert.ok(licenses.length > 0, "empty locked license inventory");
  for (const record of licenses)
    assert.ok(knownLicenses.has(record.license), "unknown or missing license metadata");
}
async function jsonCommand(args, audit = false) {
  let stdout;
  try {
    ({ stdout } = await execute("pnpm", args, { maxBuffer: 32 * 1024 * 1024 }));
  } catch (error) {
    if (!audit || error.code !== 1) throw new Error("Dependency metadata command failed");
    stdout = error.stdout;
  }
  return JSON.parse(stdout);
}
export async function auditDependencies(output) {
  const lock = await readFile("pnpm-lock.yaml", "utf8");
  const audit = await jsonCommand(["audit", "--json"], true);
  const installed = await jsonCommand(["licenses", "list", "--json"]);
  const known = new Map();
  for (const [license, packages] of Object.entries(installed))
    for (const item of packages)
      for (const version of item.versions) known.set(`${item.name}@${version}`, license);
  const keys = new Set();
  let section = false;
  for (const line of lock.split("\n")) {
    if (line === "packages:") {
      section = true;
      continue;
    }
    if (section && line && !line.startsWith(" ")) section = false;
    if (section && /^  \S.*:$/u.test(line))
      keys.add(
        line
          .trim()
          .slice(0, -1)
          .replace(/^['"]|['"]$/gu, ""),
      );
  }
  const names = [...keys].sort();
  const licenses = [];
  for (let index = 0; index < names.length; index += 12)
    licenses.push(
      ...(await Promise.all(
        names.slice(index, index + 12).map(async (key) => {
          const at = key.lastIndexOf("@");
          const name = key.slice(0, at),
            version = key.slice(at + 1);
          if (known.has(key))
            return {
              name,
              version,
              license: known.get(key),
              source: "installed package metadata via pnpm licenses list",
            };
          const source = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
          const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
          assert.ok(response.ok, "locked package license metadata unavailable");
          return { name, version, license: (await response.json()).license, source };
        }),
      )),
    );
  const report = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    lockSha256: createHash("sha256").update(lock).digest("hex"),
    node: process.version,
    pnpm: (await execute("pnpm", ["--version"])).stdout.trim(),
    source: "npm registry audit and exact package/version metadata",
    audit,
    licenses,
    acceptedRisks: accepted,
    complete: false,
  };
  await mkdir(dirname(resolve(output)), { recursive: true });
  const save = () => writeFile(output, JSON.stringify(report, null, 2) + "\n");
  await save();
  validateAudit(audit, licenses);
  assert.equal(
    licenses.length,
    audit.metadata.totalDependencies,
    "locked graph coverage differs from audit",
  );
  report.complete = true;
  await save();
  console.info(
    `34B audit: ${Object.keys(audit.advisories).length} explicitly dispositioned tooling advisories; ${licenses.length} locked license records`,
  );
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== "--output" || !process.argv[3])
    throw new Error("usage: node scripts/dependency-audit.mjs --output <report.json>");
  await auditDependencies(process.argv[3]);
}
