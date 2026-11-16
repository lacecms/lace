import {
  MEDIA_DELETE_REQUESTED,
  SITE_BUILD_REQUESTED,
  type RegisteredOutboxType,
} from "@lacecms/contracts/outbox";
import {
  MediaDeletionDispatcher,
  SiteBuildDispatcher,
  type MediaDeletionDispatcherOptions,
  type SiteBuildDispatcherOptions,
} from "./dispatchers.js";

export { MEDIA_DELETE_REQUESTED, SITE_BUILD_REQUESTED };

/** Bind the leased dispatchers by their persisted event types. */
export function createOutboxDispatchers(options: {
  readonly mediaDeletion: MediaDeletionDispatcherOptions;
  readonly siteBuild: SiteBuildDispatcherOptions;
}) {
  return {
    [MEDIA_DELETE_REQUESTED]: new MediaDeletionDispatcher(options.mediaDeletion),
    [SITE_BUILD_REQUESTED]: new SiteBuildDispatcher(options.siteBuild),
  } satisfies Record<RegisteredOutboxType, { runOnce(limit?: number): Promise<void> }>;
}
