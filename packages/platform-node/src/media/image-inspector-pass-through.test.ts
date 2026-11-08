import { afterEach, expect, test, vi } from "vitest";
import { CompleteImageContainerInspector } from "@lacecms/application";
import { InvariantError } from "@lacecms/content";
import { AccountError } from "@lacecms/domain";
import { NodeSharpImageInspector } from "./image-inspector.js";

afterEach(() => vi.restoreAllMocks());

test("image inspection passes every shared failure through with its code", async () => {
  for (const failure of [new InvariantError("Private invariant."), new AccountError("NOT_FOUND")]) {
    vi.spyOn(CompleteImageContainerInspector.prototype, "inspect").mockRejectedValue(failure);
    await expect(
      new NodeSharpImageInspector().inspect(new Uint8Array([1]), "image/png"),
    ).rejects.toBe(failure);
    vi.restoreAllMocks();
  }
});
