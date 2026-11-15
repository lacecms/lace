import { SITE_BUILD_DEBOUNCE_MS } from "@lacecms/application";
import type { WritePlanGuard, WritePlanStatement } from "../write-plan/plan.js";
import { PENDING_SITE_BUILD_SQL } from "./requests.js";

/** Public state and outbox statements share the version committed by the plan. */
export function publicBuildStatements(
  guard: WritePlanGuard,
  input: {
    readonly eventId: string;
    readonly requestedAt: number;
    readonly requestedBy: string;
    readonly snapshotId: string | null;
  },
): readonly WritePlanStatement[] {
  const payload = (retry: string) =>
    `json_patch(json_object('publishedSnapshotId', ?, 'reason', ?, 'requestedAt', ?, 'requestedBy', ?, 'targetVersion', coalesce((select version from published_state where singleton_key = 1), 0)), json_object('retryOfBuildId', ${retry}))`;
  const params = [input.snapshotId, "publication", input.requestedAt, input.requestedBy];
  return [
    {
      checkpoint: "public-state",
      sql: `insert into published_state (singleton_key, version, updated_at) select 1, 1, ? where ${guard.sql} on conflict(singleton_key) do update set version=version+1, updated_at=excluded.updated_at`,
      params: [input.requestedAt, ...guard.params],
    },
    {
      checkpoint: "build-outbox",
      outbox: true,
      sql: `insert or ignore into outbox_events (id, type, payload_json, attempts, available_at, created_at) select ?, 'site.build.requested', ${payload("?")}, 0, ?, ? where ${guard.sql}`,
      params: [
        input.eventId,
        ...params,
        null,
        input.requestedAt + SITE_BUILD_DEBOUNCE_MS,
        input.requestedAt,
        ...guard.params,
      ],
    },
    {
      outbox: true,
      sql: `update outbox_events set payload_json=${payload("coalesce(?, json_extract(payload_json, '$.retryOfBuildId'))")}, available_at=? where ${PENDING_SITE_BUILD_SQL} and id<>? and ${guard.sql}`,
      params: [
        ...params,
        null,
        input.requestedAt + SITE_BUILD_DEBOUNCE_MS,
        input.eventId,
        ...guard.params,
      ],
    },
    {
      slot: "build",
      sql: "select coalesce((select version from published_state where singleton_key=1),0) as version",
      params: [],
    },
  ];
}
