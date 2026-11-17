import { BUILD_EXPORT_PAGE_BYTE_BUDGET, capturePreviewInput } from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import { publish, registerContract, save } from "../shared.js";
import type { RepositoryContractCase } from "../shared.js";
import { memoryInput } from "./capture.js";
import { openPreview, previewInput } from "./fixtures.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);
const clock = { now: () => unixMilliseconds(160) };

contract(
  "preview capture stops within the D1 query budget when the site exceeds three pages",
  async (runtime, expect) => {
    const { repository, target, sql, reads } = await openPreview(runtime);
    await sql.run(`with recursive ids(n) as (select 1 union all select n+1 from ids where n < 301)
    insert into content_entries (id,model_key,created_by,created_at,updated_at)
    select printf('e-%03d',n),'posts','editor',1,1 from ids`);
    await sql.run(`insert into content_snapshots
    (id,entry_id,revision,title,slug,fields_json,schema_version,created_at,updated_at,updated_by)
    select id||'-pub',id,1,id,id,'{}',1,1,1,'editor' from content_entries where id like 'e-%'`);
    await sql.run(
      "update content_entries set published_snapshot_id=id||'-pub' where id like 'e-%'",
    );
    await sql.run(`insert into published_routes (path,entry_id,snapshot_id,updated_at)
    select '/blog/'||id,id,published_snapshot_id,1 from content_entries where id like 'e-%'`);

    const receipt = await repository.preview.admitPreview(
      await previewInput(repository, target, "large"),
    );
    if (receipt.kind !== "admitted") throw new Error("Expected an admitted preview.");
    const memory = memoryInput();
    reads.reset();
    const result = await capturePreviewInput(
      { preview: repository.preview, content: repository.preview, store: memory.store, clock },
      receipt.generation,
    );
    expect(result).toEqual({ kind: "failed", reason: "PREVIEW_RESOURCE_LIMIT" });
    expect(memory.pages.map((page) => page.entries.length)).toEqual([100, 100, 100]);
    expect(memory.seals).toBe(0);
    const evidence = reads.snapshot();
    expect(evidence.statements).toBeLessThanOrEqual(40);
    runtime.recordEvidence?.({
      operation: "preview capture budget",
      statements: evidence.statements,
      rowsRead: evidence.rowsRead,
    });
  },
);

contract(
  "preview refuses oversized globals before loading their stored content",
  async (runtime, expect) => {
    const { repository, target, sql, reads } = await openPreview(runtime);
    await sql.run(
      "insert into content_entries (id,model_key,created_by,created_at,updated_at) values ('global','settings','editor',1,1)",
    );
    // Six separate JSON rows below D1's row limit exceed the first-page budget together.
    await sql.run(
      `insert into content_snapshots
    (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by)
    values ('global-pub','global',1,'global',json_object('text',replace(hex(zeroblob(?)), '00', 'x')),1,1,1,'editor')`,
      700_000,
    );
    for (const pos of [1000, 2000, 3000, 4000, 5000])
      await sql.run(
        `insert into content_blocks
    (snapshot_id,block_key,block_type,position,schema_version,data_json,created_at,updated_at)
    values ('global-pub',?,'hero',?,1,json_object('text',replace(hex(zeroblob(?)), '00', 'x')),1,1)`,
        `block-${pos}`,
        pos,
        700_000,
      );
    await sql.run(
      "update content_entries set published_snapshot_id='global-pub' where id='global'",
    );
    expect(6 * 700_000).toBeGreaterThan(BUILD_EXPORT_PAGE_BYTE_BUDGET);
    reads.reset();
    await expect(repository.preview.previewContextPage({ limit: 100 })).rejects.toMatchObject({
      name: "PreviewContextLimitError",
    });
    expect(reads.snapshot().statements).toBe(3);
    const receipt = await repository.preview.admitPreview(
      await previewInput(repository, target, "globals-budget"),
    );
    if (receipt.kind !== "admitted") throw new Error("Expected an admitted preview.");
    const memory = memoryInput();
    expect(
      await capturePreviewInput(
        { preview: repository.preview, content: repository.preview, store: memory.store, clock },
        receipt.generation,
      ),
    ).toEqual({ kind: "failed", reason: "PREVIEW_RESOURCE_LIMIT" });
    expect(memory.pages).toEqual([]);
  },
);

contract(
  "preview capture replaces an old publication path only inside the frozen input",
  async (runtime, expect) => {
    const { repository, other } = await openPreview(runtime);
    await repository.publish(publish(other.id, 1, 10));
    await repository.saveCompleteDraft(
      save(other.id, 1, 20, { slug: "renamed", title: "Renamed draft" }),
    );
    const draft = await repository.load({ entryId: other.id });
    const receipt = await repository.preview.admitPreview(
      await previewInput(repository, draft!, "renamed"),
    );
    if (receipt.kind !== "admitted") throw new Error("Expected an admitted preview.");
    const memory = memoryInput();
    expect(
      await capturePreviewInput(
        { preview: repository.preview, content: repository.preview, store: memory.store, clock },
        receipt.generation,
      ),
    ).toEqual({ kind: "sealed" });
    expect(receipt.generation).toMatchObject({ path: "/blog/renamed", revision: 2 });
    expect(memory.targets).toMatchObject([{ slug: "renamed", title: "Renamed draft" }]);
    expect(memory.pages.flatMap((page) => page.entries)).toEqual([]);
    expect(await repository.loadPublic("/blog/other")).toMatchObject({
      entry: { published: { revision: 1 } },
    });
    expect(await repository.loadPublic("/blog/renamed")).toBeNull();
  },
);
