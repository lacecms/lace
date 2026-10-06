import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertSecretFree } from "./consumer-security.mjs";

/** Upgrade metadata the CLI writes by design: conflict review and recovery records. */
export function upgradeMetadata(path) {
  return path.startsWith(".lace/conflicts/") || path.startsWith(".lace/upgrade/");
}

/** Variants of the published alpha template and the operator change that conflicts. */
const variants = [
  { name: "default", version: "0.14.0", flags: [], conflict: "docs/lace-operations.md" },
  {
    name: "cloudflare",
    version: "0.14.0",
    flags: ["--cloudflare"],
    conflict: "docs/lace-operations.md",
  },
  { name: "default", flags: [], conflict: "docker-compose.yml" },
  // The retired root wrangler.jsonc is removed by the upgrade; an edit makes it a removal conflict.
  { name: "cloudflare", flags: ["--cloudflare"], conflict: "wrangler.jsonc" },
];

const userReadme = "# Operator site\n\nOur own deployment notes; Lace upgrades never touch them.\n";

async function files(root, prefix = "") {
  const result = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(result, await files(root, path));
    else
      result[path] = createHash("sha256")
        .update(await readFile(join(root, path)))
        .digest("hex");
  }
  return result;
}

function withoutMetadata(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).filter(([path]) => !upgradeMetadata(path)));
}

/**
 * Upgrades the exact projects the published create-lace@0.1.0-alpha.1 generated
 * (template 0.4.0) with the packed CLI to the template of the generator under test: a modified managed file blocks apply,
 * and after it is restored, apply makes managed files current while the user's
 * README, configuration and site source stay byte-for-byte unchanged.
 */
export async function templateUpgradeJourney(temporary, operations) {
  const { cli, generator, run, secretValues, workspace } = operations;
  // Upgrade refuses symbolic links in its paths, such as macOS's /var -> /private/var.
  const parent = await realpath(temporary);
  const upgrade = (stage, project, template, apply) => {
    console.info(`Acceptance: ${stage}`);
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "upgrade",
        "--project",
        project,
        "--template",
        template,
        ...(apply ? ["--apply"] : []),
        "--json",
      ],
      { encoding: "utf8" },
    );
    assertSecretFree(`${result.stdout}${result.stderr}`, secretValues, `${stage} output`);
    try {
      return { status: result.status, report: JSON.parse(result.stdout) };
    } catch {
      throw new Error(`${stage}: invalid JSON output\n${result.stdout}${result.stderr}`);
    }
  };

  for (const variant of variants) {
    const version = variant.version ?? "0.4.0";
    const fixture = JSON.parse(
      await readFile(
        join(workspace, `tests/fixtures/template-${version}/${variant.name}.json`),
        "utf8",
      ),
    );
    const project = join(parent, `upgrade-${version}-${variant.name}`, "acceptance-site");
    for (const [path, content] of Object.entries(fixture.files)) {
      await mkdir(dirname(join(project, path)), { recursive: true });
      await writeFile(join(project, path), content);
    }
    // The operator's own changes since generation.
    await writeFile(join(project, "README.md"), userReadme);
    await writeFile(
      join(project, "lace.config.ts"),
      `${fixture.files["lace.config.ts"]}// Operator note: keep this configuration.\n`,
    );
    await writeFile(
      join(project, "site/src/pages/index.astro"),
      `${fixture.files["site/src/pages/index.astro"]}<!-- operator page edit -->\n`,
    );
    const template = join(parent, `upgrade-${version}-${variant.name}-template`, "acceptance-site");
    await mkdir(dirname(template), { recursive: true });
    await run(`upgrade-${version}-${variant.name}-template`, "node", [
      generator,
      "create",
      template,
      "--starter",
      ...variant.flags,
    ]);
    if (version === "0.14.0") {
      for (const path of [
        ".env",
        ".env.local",
        ".lace/cloudflare-operator.env",
        "worker/.dev.vars",
        ...(variant.name === "cloudflare" ? ["worker/wrangler.jsonc"] : []),
      ]) {
        await mkdir(dirname(join(project, path)), { recursive: true });
        await writeFile(
          join(project, path),
          `${fixture.files[path] ?? ""}\n# operator-owned setting\n`,
          { mode: 0o600 },
        );
      }
      if (fixture.provenance?.templateVersion !== version)
        throw new Error("Missing immutable fixture provenance");
      const baseline = JSON.parse(fixture.files[".lace/manifest.json"]);
      for (const [path, entry] of Object.entries(baseline.files)) {
        if (entry.owner !== "managed") continue;
        const hash = createHash("sha256").update(fixture.files[path]).digest("hex");
        if (hash !== entry.sha256) throw new Error(`Invalid baseline hash: ${path}`);
      }
    }
    const isUser = (path) =>
      path === "README.md" ||
      path === "lace.config.ts" ||
      path.startsWith("site/") ||
      [
        ".env",
        ".env.local",
        ".lace/cloudflare-operator.env",
        "worker/.dev.vars",
        "worker/wrangler.jsonc",
      ].includes(path);
    const user = Object.fromEntries(
      Object.entries(await files(project)).filter(([path]) => isUser(path)),
    );

    if (version === "0.14.0") {
      // A user file at a new managed guide path is a conflict, never overwritten.
      const path = "docs/lace-compose-dev.md";
      await writeFile(join(project, path), "# operator guide notes\n");
      const collision = upgrade(
        `upgrade-${version}-${variant.name}-guide-collision`,
        project,
        template,
        true,
      );
      if (collision.status === 0 || collision.report.code !== "UPGRADE_CONFLICTS")
        throw new Error(
          `upgrade-${version}-${variant.name}-guide-collision: new guide path was overwritten`,
        );
      if ((await readFile(join(project, path), "utf8")) !== "# operator guide notes\n")
        throw new Error(
          `upgrade-${version}-${variant.name}-guide-collision: collision bytes changed`,
        );
      await rm(join(project, path));
      await rm(join(project, ".lace/conflicts"), { recursive: true, force: true });
    }
    if (version === "0.14.0" && variant.name === "cloudflare") {
      const path = "docs/cloudflare-operator.env.example";
      await writeFile(join(project, path), "# operator collision\n");
      const collision = upgrade("operator-example-collision", project, template, true);
      if (collision.status === 0 || collision.report.code !== "UPGRADE_CONFLICTS")
        throw new Error("New managed example collision was overwritten");
      if ((await readFile(join(project, path), "utf8")) !== "# operator collision\n")
        throw new Error("Collision bytes changed");
      await import("node:fs/promises").then((fs) => fs.unlink(join(project, path)));
      await rm(join(project, ".lace/conflicts"), { recursive: true, force: true });
    }
    // Modified managed infrastructure is detected and blocks apply.
    await writeFile(
      join(project, variant.conflict),
      `${fixture.files[variant.conflict]}\n// operator change\n`,
    );
    const conflicted = upgrade(
      `upgrade-${version}-${variant.name}-conflict-plan`,
      project,
      template,
      false,
    );
    const conflict = conflicted.report.data?.decisions?.find(
      (decision) => decision.path === variant.conflict,
    );
    if (
      conflicted.status === 0 ||
      conflicted.report.data?.conflicts !== 1 ||
      conflict?.action !== "conflict"
    )
      throw new Error(
        `upgrade-${version}-${variant.name}-conflict-plan: modified ${variant.conflict} was not a conflict (${conflicted.report.code}: ${conflicted.report.message})`,
      );
    const before = await files(project);
    const refused = upgrade(
      `upgrade-${version}-${variant.name}-conflict-apply`,
      project,
      template,
      true,
    );
    if (refused.status === 0 || refused.report.code !== "UPGRADE_CONFLICTS")
      throw new Error(
        `upgrade-${version}-${variant.name}-conflict-apply: apply did not refuse the conflict`,
      );
    if (
      JSON.stringify(withoutMetadata(await files(project))) !==
      JSON.stringify(withoutMetadata(before))
    )
      throw new Error(
        `upgrade-${version}-${variant.name}-conflict-apply: a refused apply changed project files`,
      );

    // The operator restores the managed file and applies.
    await writeFile(join(project, variant.conflict), fixture.files[variant.conflict]);
    const plan = upgrade(`upgrade-${version}-${variant.name}-plan`, project, template, false);
    if (
      plan.status !== 0 ||
      plan.report.data.conflicts !== 0 ||
      plan.report.data.fromVersion !== version
    )
      throw new Error(
        `upgrade-${version}-${variant.name}-plan: unexpected plan ${plan.report.code}`,
      );
    const applied = upgrade(`upgrade-${version}-${variant.name}-apply`, project, template, true);
    if (applied.status !== 0 || applied.report.code !== "UPGRADE_APPLIED")
      throw new Error(
        `upgrade-${version}-${variant.name}-apply: ${applied.report.code} ${applied.report.message}`,
      );
    const after = await files(project);
    const targetManifest = JSON.parse(
      await readFile(join(template, ".lace/manifest.json"), "utf8"),
    );
    const manifest = JSON.parse(await readFile(join(project, ".lace/manifest.json"), "utf8"));
    if (manifest.templateVersion !== targetManifest.templateVersion)
      throw new Error(
        `upgrade-${version}-${variant.name}-apply: manifest version was not advanced`,
      );
    const changed = plan.report.data.decisions.filter((decision) =>
      ["add", "replace", "remove"].includes(decision.action),
    );
    if (
      (version === "0.4.0" || variant.name === "cloudflare") &&
      !changed.some((decision) => decision.action === "add")
    )
      throw new Error(`upgrade-${version}-${variant.name}-apply: no new managed file was added`);
    for (const decision of changed) {
      if (decision.action === "remove") {
        if (decision.path in after)
          throw new Error(
            `upgrade-${version}-${variant.name}-apply: retired ${decision.path} remains`,
          );
      } else if (after[decision.path] !== decision.targetHash) {
        throw new Error(
          `upgrade-${version}-${variant.name}-apply: ${decision.path} is not the current template`,
        );
      }
    }
    if (version === "0.14.0") {
      const guides = [
        "docs/lace-compose-dev.md",
        "docs/lace-compose-production.md",
        ...(variant.name === "cloudflare" ? ["docs/lace-cloudflare.md"] : []),
      ];
      for (const guide of guides) {
        if (!changed.some((decision) => decision.path === guide && decision.action === "add"))
          throw new Error(`upgrade-${version}-${variant.name}-apply: ${guide} was not delivered`);
        if (!applied.report.guidance?.includes(guide))
          throw new Error(
            `upgrade-${version}-${variant.name}-apply: instructions do not name ${guide}`,
          );
      }
      // Published alpha.2 engines lack the 33D build-outcome migration the candidate requires.
      for (const step of ["0003_site_build_outcomes", "Downgrading to 0.1.0-alpha.2"])
        if (!applied.report.guidance?.includes(step))
          throw new Error(
            `upgrade-${version}-${variant.name}-apply: instructions lack the database step (${step})`,
          );
      if (variant.name !== "cloudflare" && "docs/lace-cloudflare.md" in after)
        throw new Error(
          `upgrade-${version}-${variant.name}-apply: Cloudflare guide without Cloudflare`,
        );
    }
    if (variant.name === "cloudflare" && version === "0.4.0") {
      if (
        "wrangler.jsonc" in after ||
        !("worker/index.ts" in after) ||
        "worker/wrangler.jsonc" in after
      )
        throw new Error(
          "upgrade-cloudflare-apply: Worker files do not follow the upgrade contract",
        );
    }
    const userAfter = Object.fromEntries(Object.entries(after).filter(([path]) => isUser(path)));
    if (JSON.stringify(userAfter) !== JSON.stringify(user))
      throw new Error(
        `upgrade-${version}-${variant.name}-apply: user README, configuration or site changed`,
      );
    const repeat = upgrade(`upgrade-${version}-${variant.name}-repeat`, project, template, false);
    if (repeat.status !== 0 || repeat.report.data.changes !== 0)
      throw new Error(`upgrade-${version}-${variant.name}-repeat: upgraded project is not current`);
  }
  console.info(
    "Template 0.4.0/0.14.0 default and Cloudflare projects: managed conflicts and new-guide collisions refused, scenario guides and the alpha.2 database step delivered, user README, configuration and site source preserved, repeat plan current",
  );
}
