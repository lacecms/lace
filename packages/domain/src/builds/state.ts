import type {
  ActorId,
  ContentSnapshotId,
  SiteBuildId,
  UnixMilliseconds,
} from "../shared/brands.js";
import type { SiteBuildStatus } from "./status.js";

/** Publication and build completion are deliberately represented separately. */
export interface SiteBuildState {
  readonly id: SiteBuildId;
  readonly publishedSnapshotId?: ContentSnapshotId;
  readonly requestedAt: UnixMilliseconds;
  readonly requestedBy: ActorId;
  readonly status: SiteBuildStatus;
  readonly targetVersion: number;
}

export interface PublishedState {
  readonly updatedAt: UnixMilliseconds;
  readonly version: number;
}
