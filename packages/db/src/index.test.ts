// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { packageName } from "./index.js";

test("exports its package identity", () => expect(packageName).toBe("@lacecms/db"));
