import { expect, test } from "vitest";
import { packageName } from "./index.js";
test("exports its package identity", () => expect(packageName).toBe("@lacecms/server"));
