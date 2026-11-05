import { expect, test } from "vitest";
import { unmatchedErrorClasses } from "@lacecms/test-utils";
import * as platform from "./index.js";

test("every exported Cloudflare error class is classified by the shared error matrix", () => {
  expect(unmatchedErrorClasses(platform)).toEqual([]);
});
