import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gitFingerprint } from "./docs-inputs.mjs";

export async function successfulBaseline(request, repository) {
  for (let page = 1; ; page++) {
    const deployments = await request(
      `/repos/${repository}/deployments?environment=github-pages&per_page=100&page=${page}`,
    );
    if (!Array.isArray(deployments)) throw new Error("Invalid deployment history");
    for (const deployment of deployments) {
      // Environment deployments carry the Actions job/run URL. Only this workflow owns our baseline.
      const statuses = await request(
        `/repos/${repository}/deployments/${deployment.id}/statuses?per_page=100`,
      );
      if (!Array.isArray(statuses)) throw new Error("Invalid deployment statuses");
      const success = statuses.find((status) => status.state === "success");
      if (!success) continue;
      const runId = /\/actions\/runs\/(\d+)/.exec(success.log_url || "")?.[1];
      if (!runId) throw new Error("Successful Pages deployment lacks verifiable workflow identity");
      const run = await request(`/repos/${repository}/actions/runs/${runId}`);
      if (
        run.path !== ".github/workflows/docs-pages.yml" ||
        run.head_branch !== "main" ||
        run.head_repository?.full_name !== repository
      )
        continue;
      if (run.head_sha !== deployment.sha)
        throw new Error("Deployment source differs from its workflow run");
      if (!/^[a-f0-9]{40}$/.test(deployment.sha)) throw new Error("Invalid baseline SHA");
      return deployment.sha;
    }
    if (deployments.length < 100) return null;
  }
}
export function decide({ candidate, baseline, force, ref, event, ancestor, digest }) {
  if (ref !== "refs/heads/main" || !["push", "workflow_dispatch"].includes(event))
    return { publish: false, reason: "untrusted-ref" };
  if (baseline && candidate !== baseline) {
    if (ancestor(candidate, baseline)) return { publish: false, reason: "stale-revision" };
    if (!ancestor(baseline, candidate))
      throw new Error(
        "Divergent main/deployment history; restore deployed ancestry before publishing",
      );
  }
  const changed = !baseline || digest(candidate) !== digest(baseline);
  return {
    publish: changed || Boolean(force),
    reason: changed ? "changed-inputs" : force ? "manual-force" : "unchanged-inputs",
  };
}
export function gitAncestor(older, newer) {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", older, newer]);
  if (result.status !== 0 && result.status !== 1)
    throw new Error("Cannot resolve deployment ancestry");
  return result.status === 0;
}
export async function run() {
  const {
    GITHUB_TOKEN: token,
    GITHUB_REPOSITORY: repository,
    GITHUB_SHA: candidate,
    GITHUB_REF: ref,
    GITHUB_EVENT_NAME: event,
  } = process.env;
  if (ref !== "refs/heads/main" || !["push", "workflow_dispatch"].includes(event))
    throw new Error("Only main push/manual runs can publish documentation");
  if (
    !/^[a-f0-9]{40}$/.test(candidate || "") ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository || "") ||
    !token
  )
    throw new Error("Missing trusted GitHub context");
  const request = async (path) => {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error(`Deployment history read failed (${response.status})`);
    return response.json();
  };
  const baseline = await successfulBaseline(request, repository);
  // checkout fetch-depth=0 includes main history; never run historical scripts.
  execFileSync("git", ["cat-file", "-e", `${candidate}^{commit}`]);
  if (baseline) execFileSync("git", ["cat-file", "-e", `${baseline}^{commit}`]);
  if (!gitAncestor(candidate, "origin/main"))
    throw new Error("Candidate is not in current main history");
  const result = decide({
    candidate,
    baseline,
    force: process.env.DOCS_FORCE === "true",
    ref,
    event,
    ancestor: gitAncestor,
    digest: gitFingerprint,
  });
  const summary = `Documentation: ${result.reason}\nBaseline: ${baseline || "none (first publication)"}\nSource: ${candidate}\n`;
  console.log(summary);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `publish=${result.publish}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${summary}\n`);
  return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await run();
