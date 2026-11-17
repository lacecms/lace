/// <reference types="node" />
import { expect } from "vitest";
import { describePreviewBytes } from "@lacecms/application";
import type { PreviewClaim, PreviewPackages } from "@lacecms/application";
import { draftPreviewOrigin, openPreviewSession } from "./preview.js";

export async function assertPreviewCleanup(input: {
  readonly packages: PreviewPackages;
  readonly claim: Omit<PreviewClaim, "now">;
  readonly parentCookie: string;
  readonly fetch: (request: Request) => Promise<Response>;
  readonly run: (sql: string, values: readonly unknown[]) => Promise<unknown>;
  readonly count: (sql: string) => Promise<number>;
  readonly put: (key: string) => Promise<unknown>;
  readonly head: (key: string) => Promise<unknown>;
  readonly sweep: () => Promise<void>;
  readonly failNextDeletion: () => void;
}) {
  const { packages, claim, parentCookie, fetch, run, count, put, head, sweep, failNextDeletion } =
    input;
  const prefix = `preview/${claim.id}/`;
  const body = new TextEncoder().encode("<main>Cleanup fixture</main>");
  const file = {
    path: "index.html",
    contentType: "text/html; charset=utf-8",
    ...(await describePreviewBytes(body)),
  };
  const output = await packages.prepare(claim, {
    schemaVersion: 1,
    html: file.path,
    files: [file],
  });
  expect(await packages.stage(claim, file.path, file, body)).toBe(true);
  expect(await packages.complete(claim, output!, [])).toBe(true);
  const cookie = await openPreviewSession(fetch, parentCookie, claim.id);
  const target = () =>
    fetch(new Request(`${draftPreviewOrigin}/p/${claim.id}/`, { headers: { cookie } }));
  expect(await (await target()).text()).toBe("<main>Cleanup fixture</main>");
  const archived = `${prefix}output/files/${file.sha256}`;
  const unrelated = "preview/other/input/target.json";
  await Promise.all([
    ...Array.from({ length: 65 }, (_, index) =>
      put(`${prefix}input/part-${String(index).padStart(2, "0")}`),
    ),
    put(unrelated),
  ]);
  await run(
    `with recursive seq(n) as (select 1 union all select n+1 from seq where n<18)
    insert into preview_sessions (token_hash,session_id,origin,expires_at)
    select 'expired-'||n, (select id from session limit 1),?,1 from seq`,
    [draftPreviewOrigin],
  );
  await run(
    `with recursive seq(n) as (select 1 union all select n+1 from seq where n<18)
    insert into preview_handoffs
      (id,browser_hash,admin_origin,preview_origin,return_path,generation_id,expires_at)
    select 'expired-'||n,'fixture','fixture',?,'/view/package',?,1 from seq`,
    [draftPreviewOrigin, claim.id],
  );
  await sweep();
  expect(await head(`${prefix}input/part-00`)).toBeNull();
  expect(await head(`${prefix}input/part-64`)).not.toBeNull();
  expect(await count("select count(*) as tally from preview_sessions where expires_at = 1")).toBe(
    2,
  );
  expect(await count("select count(*) as tally from preview_handoffs where expires_at = 1")).toBe(
    2,
  );
  expect(await (await target()).text()).toBe("<main>Cleanup fixture</main>");
  await sweep();
  expect(await head(`${prefix}input/part-64`)).toBeNull();
  expect(await count("select count(*) as tally from preview_sessions where expires_at = 1")).toBe(
    0,
  );
  expect(await count("select count(*) as tally from preview_handoffs where expires_at = 1")).toBe(
    0,
  );
  expect(await head(archived)).not.toBeNull();
  await run(
    "update preview_generations set created_at = 1, overall_deadline = 2, expires_at = 3 where id = ?",
    [claim.id],
  );
  expect((await target()).status).toBe(404);
  failNextDeletion();
  await sweep();
  expect(await head(archived)).not.toBeNull();
  expect((await target()).status).toBe(404);
  await sweep();
  expect(await head(archived)).toBeNull();
  expect(await head(`${prefix}output/manifest.json`)).toBeNull();
  expect(await head(unrelated)).not.toBeNull();
  expect((await target()).status).toBe(404);
  expect(await packages.complete(claim, output!, [])).toBe(false);
  expect(await packages.stage(claim, file.path, file, body)).toBe(false);
  expect(await count("select count(*) as tally from preview_execution_slot")).toBe(0);
  expect(await count("select count(*) as tally from site_builds")).toBe(0);
}
