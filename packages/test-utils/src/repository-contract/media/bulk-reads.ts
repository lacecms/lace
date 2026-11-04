import { type RepositoryContractCase, seedMedia, registerContract } from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "bulk metadata reads deduplicate IDs, cross chunks and preserve missing/inactive state",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: () => undefined });
    for (let index = 0; index < 201; index++)
      await seedMedia(sql, `bulk-${index}`, index === 200 ? "deleting" : "active");
    expect(await repository.loadMediaMany([])).toEqual([]);
    const records = await repository.loadMediaMany([
      ...Array.from({ length: 201 }, (_, index) => `bulk-${index}`),
      "bulk-0",
      "missing",
    ]);
    expect(records).toHaveLength(201);
    expect(new Set(records.map((record) => record.id)).size).toBe(201);
    expect(records.find((record) => record.id === "bulk-200")?.status).toBe("deleting");
    expect(records.filter((record) => record.status === "active")).toHaveLength(200);
  },
);
