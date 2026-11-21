import { expect, test, vi } from "vitest";
import type { PreviewCommandPort, PreviewExecution } from "@lacecms/application";
import { previewRunnerClaim, readRunnerClaim } from "./runner-claim.js";

test("the preview bootstrap binds a single scoped credential to the reserved run", async () => {
  const now = 123 as PreviewExecution["deadline"];
  const clock = { now: () => now };
  const secret = "runner-bootstrap-credential-for-tests";
  const claimPreview = vi
    .fn<PreviewCommandPort["claimPreview"]>()
    .mockResolvedValueOnce({ deadline: now } as PreviewExecution)
    .mockResolvedValue(null);
  const claim = previewRunnerClaim({
    executor: "vps",
    bootstrapSecret: secret,
    clock,
    commands: { claimPreview },
    acceptsRun: (id, run) => id === "job" && run === "reserved",
  });
  const body = { runId: "reserved", commit: "ab".repeat(20) };
  const request = (payload: unknown = body, credential = secret) =>
    new Request("http://api.test/", {
      method: "POST",
      headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  expect(await claim(request(body, "build-token"), "job")).toEqual({ status: 401 });
  expect(await claim(request({ ...body, env: {} }), "job")).toEqual({ status: 400 });
  expect(await claim(request(), "other")).toEqual({ status: 409 });
  expect(claimPreview).not.toHaveBeenCalled();
  const result = await claim(request(), "job");
  expect(result.status).toBe(200);
  if (result.status !== 200) throw new Error("Expected scoped claim.");
  expect(await readRunnerClaim(request(body, result.token), "job", "vps", clock)).toEqual(
    claimPreview.mock.calls[0]?.[0],
  );
  expect(claimPreview.mock.calls[0]?.[0].credentialHash).not.toContain(result.token);
  expect(await claim(request(), "job")).toEqual({ status: 409 });
});
