import { defineCollection, defineConfig } from "@lacecms/config";
import { field } from "@lacecms/content";
import {
  adminContentEntrySchema,
  errorEnvelopeSchema,
  publishContentEntryResultSchema,
  referenceImpactPageSchema,
  referenceTargetPageSchema,
  referenceTargetStatusesSchema,
  validationErrorDetailsSchema,
} from "@lacecms/contracts";
import * as v from "valibot";
import type { ExpectStatic } from "vitest";

export function referenceLifecycleConfig() {
  return defineConfig({
    content: [
      defineCollection({
        key: "notes",
        version: 1,
        fields: { related: field.list({ item: field.reference({ models: ["notes"] }) }) },
      }),
      defineCollection({ key: "other", version: 1, fields: {} }),
    ],
  });
}

interface ReferenceLifecycleRest {
  readonly request: (path: string, init?: RequestInit) => Promise<Response>;
  readonly raceRequest: ReferenceLifecycleRest["request"];
  readonly asViewer: (run: () => Promise<void>) => Promise<void>;
}

export async function assertReferenceLifecycleRest(
  { asViewer, raceRequest, request }: ReferenceLifecycleRest,
  expect: ExpectStatic,
): Promise<void> {
  const base = "/api/v1/admin";
  const picker = `${base}/reference-targets`;
  const entry = (id: string) => `${base}/entries/${id}`;

  const call = async (
    method: string,
    path: string,
    status: number,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<unknown> => {
    const response = await request(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    expect(response.status, `${method} ${path} ${text}`).toBe(status);
    return text.length ? JSON.parse(text) : undefined;
  };
  const error = async (action: Promise<unknown>, code: string) => {
    const parsed = v.parse(errorEnvelopeSchema, await action).error;
    expect(parsed.code).toBe(code);
    return parsed;
  };
  const issue = async (action: Promise<unknown>, code: string) => {
    const parsed = await error(action, "VALIDATION_FAILED");
    const details = v.parse(validationErrorDetailsSchema, parsed.details);
    expect(details.issues).toMatchObject([{ code, path: "/fields/related/0" }]);
    return details.issues[0]!;
  };
  const draft = (title: string, ...related: readonly string[]) => ({
    title,
    fields: related.length ? { related } : {},
    blocks: [],
  });
  const create = async (title: string, related?: string, model = "notes") =>
    v.parse(
      adminContentEntrySchema,
      await call(
        "POST",
        `${base}/models/${model}/entries`,
        201,
        draft(title, ...(related === undefined ? [] : [related])),
      ),
    );
  const save = (id: string, revision: number, title: string, ...related: readonly string[]) =>
    call("PUT", `${entry(id)}/draft`, 200, {
      expectedRevision: revision,
      ...draft(title, ...related),
    });
  const publish = async (id: string, revision: number, key?: string) =>
    v.parse(
      publishContentEntryResultSchema,
      await call(
        "POST",
        `${entry(id)}/publish`,
        200,
        { expectedRevision: revision },
        key === undefined ? undefined : { "idempotency-key": key },
      ),
    );

  const alpha = await create("Alpha");
  const beta = await create("Beta");
  const wrongModel = await create("Other model", undefined, "other");
  await issue(
    call("POST", `${base}/models/notes/entries`, 422, draft("Missing", "missing")),
    "reference_target_missing",
  );
  await issue(
    call("POST", `${base}/models/notes/entries`, 422, draft("Disallowed", wrongModel.id)),
    "reference_target_model",
  );
  await save(alpha.id, 1, "Alpha", beta.id);
  await issue(
    call("POST", `${entry(alpha.id)}/publish`, 422, { expectedRevision: 2 }),
    "reference_target_unpublished",
  );
  const publishedBeta = (await publish(beta.id, 1)).entry.published!;
  await publish(alpha.id, 2);
  const withdrawal = { expectedPublishedSnapshotId: publishedBeta.id };
  await error(
    call("POST", `${entry(beta.id)}/unpublish`, 409, withdrawal),
    "CONTENT_REFERENCES_IN_USE",
  );
  await save(alpha.id, 2, "Alpha");
  await save(beta.id, 1, "Beta", alpha.id);
  await error(
    call("POST", `${entry(beta.id)}/publish`, 409, { expectedRevision: 1 }),
    "CONTENT_REVISION_CONFLICT",
  );
  const cycle = await issue(
    call("POST", `${entry(beta.id)}/publish`, 422, { expectedRevision: 2 }),
    "reference_cycle",
  );
  expect(cycle).toHaveProperty("details", {
    witness: [beta.id, alpha.id, beta.id],
    truncated: false,
    publishFirst: { entryId: alpha.id, title: "Alpha" },
  });

  await asViewer(async () => {
    const targets = v.parse(
      referenceTargetPageSchema,
      await call("GET", `${picker}?modelKey=notes`, 200),
    );
    expect(targets.items.map((item) => [item.title, item.state])).toEqual([
      ["Alpha", "published"],
      ["Beta", "published"],
    ]);
    expect(targets.items.every((item) => !Object.hasOwn(item, "path"))).toBe(true);
    const reviewed = v.parse(
      referenceImpactPageSchema,
      await call("GET", `${entry(beta.id)}/reference-impact?action=unpublish`, 200),
    );
    expect(reviewed).toMatchObject({ hasPublishedBlockers: true, hasDraftUsages: false });
    const denied = await error(
      call("POST", `${entry(beta.id)}/publish`, 403, { expectedRevision: 2 }),
      "AUTHORIZATION_DENIED",
    );
    expect(denied).not.toHaveProperty("details");
    await error(
      call("DELETE", entry(alpha.id), 403, { expectedRevision: 3 }),
      "AUTHORIZATION_DENIED",
    );
  });
  const automation = { authorization: "Bearer automation-credential" };
  await error(
    call("GET", `${picker}?modelKey=notes`, 403, undefined, automation),
    "AUTHORIZATION_DENIED",
  );
  await error(
    call("POST", `${picker}/resolve`, 403, { ids: [alpha.id] }, automation),
    "AUTHORIZATION_DENIED",
  );
  await error(
    call("GET", `${entry(beta.id)}/reference-impact?action=delete`, 403, undefined, automation),
    "AUTHORIZATION_DENIED",
  );

  await publish(alpha.id, 3);
  const published = await publish(beta.id, 2, "reverse-order");
  const replayed = await publish(beta.id, 2, "reverse-order");
  expect(replayed).toMatchObject({ publication: "replayed", build: { status: "not-dispatched" } });
  expect(replayed.entry.published?.id).toBe(published.entry.published?.id);
  await error(
    call("DELETE", entry(alpha.id), 409, { expectedRevision: 3 }),
    "CONTENT_REFERENCES_IN_USE",
  );

  const unpublishBody = { expectedPublishedSnapshotId: published.entry.published!.id };
  const unpublishHeaders = { "idempotency-key": "withdraw-source" };
  await error(
    call("POST", `${entry(beta.id)}/unpublish`, 422, {
      ...unpublishBody,
      referenceImpact: { receipt: "unexpected", acknowledgeDraftReferences: true },
    }),
    "VALIDATION_FAILED",
  );
  await call("POST", `${entry(beta.id)}/unpublish`, 200, unpublishBody, unpublishHeaders);
  expect(
    await call("POST", `${entry(beta.id)}/unpublish`, 200, unpublishBody, unpublishHeaders),
  ).toMatchObject({ unpublication: "replayed", build: { status: "not-dispatched" } });

  const deletion = { expectedRevision: 3 };
  await error(call("DELETE", entry(alpha.id), 409, deletion), "CONTENT_REFERENCE_REVIEW_REQUIRED");
  const review = async () =>
    v.parse(
      referenceImpactPageSchema,
      await call("GET", `${entry(alpha.id)}/reference-impact?action=delete&limit=1`, 200),
    );
  const old = await review();
  expect(old).toMatchObject({ hasPublishedBlockers: false, hasDraftUsages: true });
  const retained = Array.from({ length: 12 }, () => alpha.id);
  await save(beta.id, 2, "Beta", ...retained);
  const acknowledgment = (receipt: string) => ({ receipt, acknowledgeDraftReferences: true });
  await error(
    call("DELETE", entry(alpha.id), 409, {
      ...deletion,
      referenceImpact: acknowledgment(old.receipt!),
    }),
    "CONTENT_REFERENCE_IMPACT_CHANGED",
  );
  const reviewed = await review();
  if (reviewed.mode !== "sources") throw new Error("Expected a source page");
  expect(reviewed.sources).toHaveLength(1);
  const group = reviewed.sources[0]!;
  expect(group.locations).toHaveLength(10);
  const query = new URLSearchParams({
    action: "delete",
    limit: "5",
    sourceEntryId: group.entryId,
    snapshotId: group.snapshotId,
    locationsAfter: group.nextLocationsCursor!,
  });
  const tail = v.parse(
    referenceImpactPageSchema,
    await call("GET", `${entry(alpha.id)}/reference-impact?${query}`, 200),
  );
  if (tail.mode !== "locations") throw new Error("Expected a location page");
  expect(tail.locations).toHaveLength(2);
  await call(
    "DELETE",
    entry(alpha.id),
    204,
    {
      referenceImpact: acknowledgment(reviewed.receipt!),
    },
    { "if-match": '"3"' },
  );
  const statuses = v.parse(
    referenceTargetStatusesSchema,
    await call("POST", `${picker}/resolve`, 200, { ids: [alpha.id, beta.id] }),
  );
  expect(statuses).toMatchObject({
    [alpha.id]: { id: alpha.id, state: "missing" },
    [beta.id]: { state: "unpublished", title: "Beta" },
  });
  const repaired = v.parse(adminContentEntrySchema, await call("GET", entry(beta.id), 200));
  expect(repaired.draft).toMatchObject({ revision: 3, fields: { related: retained } });
  await save(beta.id, 3, "Beta");
  const malformed = await request(entry(beta.id), {
    method: "DELETE",
    headers: { "if-match": '"4"', "content-type": "application/json" },
    body: "{",
  });
  expect(malformed.status).toBe(422);
  await call("DELETE", entry(beta.id), 204, undefined, { "if-match": '"4"' });

  const target = await create("Race target");
  const source = await create("Race source", target.id);
  const targetPublished = (await publish(target.id, 1)).entry.published!;
  const racePost = (path: string, body: unknown) =>
    raceRequest(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const [sourcePublish, targetWithdraw] = await Promise.all([
    racePost(`${entry(source.id)}/publish`, { expectedRevision: 1 }),
    racePost(`${entry(target.id)}/unpublish`, { expectedPublishedSnapshotId: targetPublished.id }),
  ]);
  const sourceWon = sourcePublish.status === 200;
  if (sourceWon) {
    expect(targetWithdraw.status).toBe(409);
    await error(targetWithdraw.json(), "CONTENT_REFERENCES_IN_USE");
    await sourcePublish.text();
  } else {
    expect(sourcePublish.status).toBe(422);
    await issue(sourcePublish.json(), "reference_target_unpublished");
    expect(targetWithdraw.status).toBe(200);
    await targetWithdraw.text();
  }
  const afterRace = v.parse(adminContentEntrySchema, await call("GET", entry(source.id), 200));
  expect(afterRace.published !== undefined).toBe(sourceWon);
  const targetAfter = v.parse(adminContentEntrySchema, await call("GET", entry(target.id), 200));
  expect(targetAfter.published !== undefined).toBe(sourceWon);
}
