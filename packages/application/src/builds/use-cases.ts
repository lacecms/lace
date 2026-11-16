import { siteBuildId } from "@lacecms/domain";
import type { Actor, SiteBuildId } from "@lacecms/domain";
import type {
  BuildQueueReceipt,
  SiteBuildCommandPort,
  SiteBuildReadPort,
} from "../ports/builds.js";
import type { Clock } from "../ports/infrastructure.js";
import { siteBuildEvent } from "../ports/outbox.js";
import { requireSessionActor } from "../shared/permissions.js";

interface BuildSiteIdentity {
  readonly id: string;
  readonly label: string;
  readonly url?: string | undefined;
}

/** Exposes the deployment's safe public identity to a signed-in content reader. */
export function readBuildSite(actor: Actor, site: BuildSiteIdentity | null) {
  requireSessionActor(actor, "content:read");
  return site;
}

/** Administrator commands enqueue durable work without invoking a build provider. */
export class SiteBuildUseCases {
  public constructor(
    private readonly dependencies: {
      readonly clock: Clock;
      readonly builds: SiteBuildCommandPort & SiteBuildReadPort;
    },
  ) {}

  public list(actor: Actor) {
    requireSessionActor(actor, "content:read");
    return this.dependencies.builds.listSiteBuilds(50);
  }

  public get(actor: Actor, buildId: string) {
    requireSessionActor(actor, "content:read");
    return this.dependencies.builds.getSiteBuild(siteBuildId(buildId));
  }

  public request(actor: Actor, prepare?: () => Promise<void>): Promise<BuildQueueReceipt> {
    requireSessionActor(actor, "settings:manage");
    if (prepare !== undefined)
      return prepare().then(() => this.enqueue(actor, { reason: "manual" }));
    return this.enqueue(actor, { reason: "manual" });
  }

  public retry(
    actor: Actor,
    buildId: string | (() => Promise<string>),
  ): Promise<BuildQueueReceipt> {
    requireSessionActor(actor, "settings:manage");
    if (typeof buildId === "function") {
      return buildId().then((id) =>
        this.enqueue(actor, { reason: "retry", retryOfBuildId: siteBuildId(id) }),
      );
    }
    return this.enqueue(actor, { reason: "retry", retryOfBuildId: siteBuildId(buildId) });
  }

  private enqueue(
    actor: Actor,
    input: { reason: "manual" } | { reason: "retry"; retryOfBuildId: SiteBuildId },
  ) {
    const requestedAt = this.dependencies.clock.now();
    return this.dependencies.builds.requestBuild({
      events: [
        siteBuildEvent({
          ...input,
          requestedAt,
          requestedBy: actor.id,
          publishedSnapshotId: null,
        }),
      ],
      requestedAt,
      requestedBy: actor,
    });
  }
}
