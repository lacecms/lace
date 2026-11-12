// Directory dependencies: shared ← diagnostics ← upgrade ← blocks ← doctor; import → upgrade, shared; operator → diagnostics, shared.
export const packageName = "@lacecms/cli";

export { planUpgrade, presentUpgradePlan } from "./upgrade/upgrade.js";
export type { UpgradePlan, UpgradeDecision, UpgradeAction } from "./upgrade/upgrade.js";
export { UpgradeError, validateUpgradeManifest } from "./upgrade/upgrade-input.js";
export type { UpgradeManifest } from "./upgrade/upgrade-input.js";
export { applyUpgrade } from "./upgrade/upgrade-apply.js";
export { rollbackUpgrade } from "./upgrade/upgrade-rollback.js";
export type { ApplyOptions, UpgradeOutcome } from "./upgrade/upgrade-apply.js";
export type { UpgradeInstructions } from "./upgrade/upgrade-instructions.js";

export {
  CliError,
  EXIT,
  usage,
  parseArguments,
  loadEnvironment,
  presentResult,
} from "./shared/cli.js";
export type { CliOptions, Command, Target, CliEnvironment } from "./shared/cli.js";
