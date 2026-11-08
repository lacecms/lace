import { cases as run0 } from "./builds/dispatch.js";
import { cases as run1 } from "./sync/apply.js";
import { cases as run2 } from "./entries/publication.js";
import { cases as run3 } from "./entries/lifecycle.js";
import { cases as run4 } from "./entries/listing.js";
import { cases as run5 } from "./builds/diagnostics.js";
import { cases as run6 } from "./entries/publication-failures.js";
import { cases as run7 } from "./media/bulk-reads.js";
import { cases as run8 } from "./sync/evolution.js";
import { cases as run9 } from "./sync/block-migrations.js";
import { cases as run10 } from "./entries/envelope.js";
import { cases as run11 } from "./sync/nested.js";
import { cases as run12 } from "./sync/projection-only.js";
import { cases as run13 } from "./delivery/build-export.js";
import { cases as run14 } from "./sync/list-migrations.js";
import { cases as run15 } from "./links/projections.js";
import { cases as run16 } from "./links/removal.js";
import { cases as run17 } from "./delivery/queries.js";
import { cases as run18 } from "./media/tags.js";
import { cases as run19 } from "./media/import-lookups.js";
import { cases as mediaCatalog } from "./media/catalog.js";
import { cases as globalsSeo } from "./entries/globals-seo.js";
import { cases as conditional } from "./entries/conditional.js";
import { cases as resultParity } from "./entries/result-parity.js";
import { cases as claimCap } from "./builds/claim-cap.js";
import type { RepositoryContractCase } from "./shared.js";

export const contentRepositoryContractCases: readonly RepositoryContractCase[] = Object.freeze([
  ...run0,
  ...run1,
  ...run2,
  ...run3,
  ...run4,
  ...run5,
  ...run6,
  ...run7,
  ...run8,
  ...run9,
  ...mediaCatalog,
  ...globalsSeo,
  ...run10,
  ...run11,
  ...run12,
  ...run13,
  ...run14,
  ...run15,
  ...run16,
  ...run17,
  ...run18,
  ...run19,
  ...conditional,
  ...resultParity,
  ...claimCap,
]);
