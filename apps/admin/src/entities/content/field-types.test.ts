import { expect, test } from "vitest";
import { FIELD_FILTER_OPERATIONS, fieldTypeCapabilities } from "@lacecms/content";
import type { FieldType } from "@lacecms/content";
import { fieldFilterControl, fieldTypeSupport } from "./field-types.js";
import { fieldFilterOperations } from "./collection-query.js";

test("admin list cells and filter controls cover exactly the queryable field kinds", () => {
  for (const type of Object.keys(fieldTypeCapabilities) as FieldType[]) {
    expect(fieldTypeSupport[type].listCell !== undefined, type).toBe(
      fieldTypeCapabilities[type].listQueryable,
    );
    expect(fieldFilterControl(type) !== undefined, type).toBe(
      fieldTypeCapabilities[type].listQueryable,
    );
  }
});

test("admin filter operations equal the shared operators followed by presence checks", () => {
  for (const type of Object.keys(fieldTypeCapabilities) as FieldType[]) {
    const capability = fieldTypeCapabilities[type];
    expect(fieldFilterOperations(type)).toEqual(
      capability.listQueryable
        ? [...FIELD_FILTER_OPERATIONS[capability.filterKind], "isSet", "isNotSet"]
        : [],
    );
  }
});
