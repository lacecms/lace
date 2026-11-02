import { cases as builds } from "./builds.js";
import { cases as lifecycle } from "./lifecycle.js";
import { cases as sync } from "./sync.js";
import { cases as media } from "./media.js";
import { cases as globals_seo } from "./globals-seo.js";
import { cases as envelope } from "./envelope.js";
import { cases as exportCases } from "./export.js";
import { cases as conditional } from "./conditional.js";
import type { RepositoryContractCase } from "./shared.js";
export type {
  ContractRepository,
  ContractSql,
  ContractRepositoryOptions,
  RepositoryContractHarness,
  RepositoryContractRuntime,
  RepositoryContractCase,
} from "./shared.js";
export {
  PUBLICATION_CHECKPOINTS,
  UNPUBLICATION_CHECKPOINTS,
  REVERT_CHECKPOINTS,
} from "./shared.js";
export { MEDIA_METADATA_CHECKPOINTS } from "./media.js";
export const contentRepositoryContractCases: readonly RepositoryContractCase[] = Object.freeze([
  ...builds,
  ...lifecycle,
  ...sync,
  ...media,
  ...globals_seo,
  ...envelope,
  ...exportCases,
  ...conditional,
]);
