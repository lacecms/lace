import { cases as run0 } from "./setup.js";
import { cases as run1 } from "./users.js";
import { cases as run2 } from "./passwords-sessions.js";
import { cases as run3 } from "./credentials.js";
import { cases as run4 } from "./rate-limits.js";
import type { SecurityContractCase } from "./harness.js";
export const securityContractCases: readonly SecurityContractCase[] = Object.freeze([
  ...run0,
  ...run1,
  ...run2,
  ...run3,
  ...run4,
]);
