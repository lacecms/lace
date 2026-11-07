import { expect, test } from "vitest";
import { unmatchedErrorClasses } from "@lacecms/test-utils";
import * as platform from "./index.js";

test("every exported Node error class is classified by the shared error matrix", () => {
  // The host database guard protects CLI hosts and never reaches a transport.
  expect(unmatchedErrorClasses(platform, ["HostDatabaseSafetyError"])).toEqual([]);
});
