import { expect, test } from "vitest";
import * as content from "@lacecms/content";
import * as domain from "@lacecms/domain";
import * as config from "@lacecms/config";
import * as application from "@lacecms/application";
import * as contracts from "@lacecms/contracts";
import { errorMatrixCases } from "./error-matrix.js";

test.each(errorMatrixCases)("shared classifier matrix: $name", ({ create, expected }) => {
  expect(contracts.classifyError(create())).toEqual(expected);
});

test("every exported portable error class has a matrix case", () => {
  const classes = new Map<Function, string>();
  for (const exports of [content, domain, config, application, contracts])
    for (const [name, value] of Object.entries(exports))
      if (typeof value === "function" && value.prototype instanceof Error) classes.set(value, name);
  const covered = new Set(errorMatrixCases.map((c) => c.errorClass));
  expect([...classes].filter(([value]) => !covered.has(value)).map(([, name]) => name)).toEqual([]);
});

test("foreign code properties and inherited table properties stay internal", () => {
  for (const error of [
    Object.assign(new Error("private driver failure"), { code: "NOT_FOUND" }),
    new content.LaceError("toString", "private failure"),
    new content.LaceError("__proto__", "private failure"),
  ])
    expect(contracts.classifyError(error)).toEqual({
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    });
});
