/** Run the same destination/impact HTTP contract against the real Node and Worker compositions. */
export async function internalLinkHttpContract(call, expect) {
  const request = async (path, json, method = "GET", status = 200, headers) => {
    const result = await call(path, { method, ...(json === undefined ? {} : { json }), headers });
    expect(result.response.status, JSON.stringify(result.body)).toBe(status);
    return result.body;
  };
  const create = (title, blocks = []) =>
    request(
      "/api/v1/admin/models/notes/entries",
      { title, slug: title.toLowerCase(), fields: {}, blocks },
      "POST",
      201,
    );
  const target = await create("Target");
  const root = `/api/v1/admin/entries/${target.id}`;
  await request(`${root}/publish`, { expectedRevision: 1 }, "POST");
  const block = {
    key: "action",
    type: "cta",
    schemaVersion: 1,
    position: 1000,
    data: { heading: "Visit", actionLabel: "Open", actionUrl: `entry:${target.id}` },
  };
  const source = await create("Source", [
    block,
    { ...block, key: "hidden", hidden: true, position: 2000 },
  ]);
  await request(`/api/v1/admin/entries/${source.id}/publish`, { expectedRevision: 1 }, "POST");
  const publicSource = await request("/api/v1/public/content/by-path?path=%2Fnotes%2Fsource");
  expect(publicSource.entry.internalLinks).toEqual([
    { sourceKey: "action", area: "data", pointer: "/actionUrl", targetId: target.id },
  ]);
  const statuses = await request(
    "/api/v1/admin/link-targets/resolve",
    { ids: [target.id, "missing"] },
    "POST",
  );
  expect(statuses[target.id]).toMatchObject({
    state: "published",
    title: "Target",
    path: "/notes/target",
  });
  expect(statuses.missing).toEqual({ id: "missing", state: "missing" });
  const picker = await request(
    "/api/v1/admin/link-targets?search=%20tar%20&status=published&limit=1",
  );
  expect(picker.items.map((item) => item.id)).toEqual([target.id]);
  const token = await request(
    "/api/v1/admin/api-tokens",
    { name: "CE10 export journey" },
    "POST",
    201,
  );
  const scenarios = [];
  const capture = async (name, href) => {
    const headers = { authorization: `Bearer ${token.token}` };
    const first = await request(
      "/api/v1/public/build-export?limit=1",
      undefined,
      "GET",
      200,
      headers,
    );
    const exported = { ...first, entries: [...first.entries], media: { ...first.media } };
    let after = first.nextCursor;
    while (after !== undefined) {
      const page = await request(
        `/api/v1/public/build-export?limit=1&after=${encodeURIComponent(after)}`,
        undefined,
        "GET",
        200,
        headers,
      );
      expect(page.version).toBe(first.version);
      exported.entries.push(...page.entries);
      Object.assign(exported.media, page.media);
      after = page.nextCursor;
    }
    delete exported.nextCursor;
    if (name === "draft-isolation") expect(JSON.stringify(exported)).not.toContain("DRAFT PRIVATE");
    const sourceView = exported.entries.find((entry) => entry.id === source.id);
    expect(sourceView.internalLinks).toHaveLength(1);
    expect(sourceView.blocks).toHaveLength(1);
    expect(sourceView.blocks[0].data.actionUrl).toBe(`entry:${target.id}`);
    scenarios.push({ name, href, sourceId: source.id, exported });
  };
  await capture("original", "/notes/target");
  await request(
    `${root}/draft`,
    { title: "DRAFT PRIVATE", slug: "moved", fields: {}, blocks: [], expectedRevision: 1 },
    "PUT",
  );
  await capture("draft-isolation", "/notes/target");
  const moved = await request(`${root}/publish`, { expectedRevision: 2 }, "POST");
  await capture("moved", "/notes/moved");
  const impact = await request(`${root}/link-impact?action=unpublish&limit=1`);
  expect(impact).toMatchObject({ mode: "sources", hasPublishedUsages: true });
  expect(impact.sources).toHaveLength(1);
  expect(impact.sources[0].locations).toEqual([
    { sourceKey: "action", area: "data", pointer: "/actionUrl", delivered: true },
    { sourceKey: "hidden", area: "data", pointer: "/actionUrl", delivered: false },
  ]);
  const command = { expectedPublishedSnapshotId: moved.entry.published.id };
  const blocked = await request(`${root}/unpublish`, command, "POST", 409);
  expect(blocked.error.code).toBe("CONTENT_LINKS_IN_USE");
  await request(
    `${root}/unpublish`,
    { ...command, linkImpact: { receipt: impact.receipt, acknowledgePublishedLinks: false } },
    "POST",
    422,
  );
  const linkImpact = { receipt: impact.receipt, acknowledgePublishedLinks: true };
  const wrongAction = await request(root, { expectedRevision: 2, linkImpact }, "DELETE", 409);
  expect(wrongAction.error.code).toBe("CONTENT_LINK_IMPACT_CHANGED");
  await request(`${root}/unpublish`, { ...command, linkImpact }, "POST", 200, {
    "idempotency-key": "links-unpublish",
  });
  const replay = await request(`${root}/unpublish`, { ...command, linkImpact }, "POST", 200, {
    "idempotency-key": "links-unpublish",
  });
  expect(replay.unpublication).toBe("replayed");
  expect(
    (await request("/api/v1/admin/link-targets/resolve", { ids: [target.id] }, "POST"))[target.id]
      .state,
  ).toBe("unpublished");
  await capture("unavailable", null);
  await request(`${root}/publish`, { expectedRevision: 2 }, "POST");
  await capture("recovered", "/notes/moved");
  const deletion = await request(`${root}/link-impact?action=delete`);
  const stale = { receipt: deletion.receipt, acknowledgePublishedLinks: true };
  // Changing an incoming tuple invalidates the reviewed dependency revision.
  const sourcePath = `/api/v1/admin/entries/${source.id}`;
  await request(
    `${sourcePath}/draft`,
    { title: "Source", slug: "source", fields: {}, blocks: [], expectedRevision: 1 },
    "PUT",
  );
  expect(
    (await request(root, { expectedRevision: 2, linkImpact: stale }, "DELETE", 409)).error.code,
  ).toBe("CONTENT_LINK_IMPACT_CHANGED");
  const refreshed = await request(`${root}/link-impact?action=delete`);
  await request(
    root,
    { linkImpact: { receipt: refreshed.receipt, acknowledgePublishedLinks: true } },
    "DELETE",
    204,
    { "if-match": '"2"' },
  );
  expect(
    (await request("/api/v1/admin/link-targets/resolve", { ids: [target.id] }, "POST"))[target.id],
  ).toEqual({ id: target.id, state: "missing" });
  const reused = await create("Reused");
  await request(
    `/api/v1/admin/entries/${reused.id}/draft`,
    { title: "Reused", slug: "moved", fields: {}, blocks: [], expectedRevision: 1 },
    "PUT",
  );
  await request(`/api/v1/admin/entries/${reused.id}/publish`, { expectedRevision: 2 }, "POST");
  await capture("reused-slug", null);
  const sourceAfter = await request(sourcePath);
  expect(sourceAfter.published.blocks[0].data.actionUrl).toBe(`entry:${target.id}`);
  const unreferenced = await create("Unreferenced");
  await request(`/api/v1/admin/entries/${unreferenced.id}`, undefined, "DELETE", 204, {
    "if-match": '"1"',
  });
  return {
    scenarios,
    async assertPublication() {
      expect((await request(sourcePath)).published.blocks[0].data.actionUrl).toBe(
        `entry:${target.id}`,
      );
    },
  };
}
