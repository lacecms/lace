import * as v from "valibot";

const planSchema = v.object({
  media: v.array(v.object({ key: v.string(), action: v.string() })),
  entries: v.array(v.object({ key: v.string(), action: v.string(), publish: v.string() })),
  draftOrder: v.array(v.string()),
  publishOrder: v.array(v.string()),
  summary: v.record(v.string(), v.number()),
});
export function outcomePlan(data: unknown) {
  return v.parse(v.object({ plan: planSchema }), data).plan;
}
export function outcomeIssues(data: unknown) {
  return v.parse(v.object({ issues: v.array(v.unknown()) }), data).issues;
}
