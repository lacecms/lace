export type ImpactPurpose = "url" | "reference";

export const EXTERNAL_URL_USAGE = "not (e.id=? and (?='delete' or e.published_snapshot_id=s.id))";

export function impactSourceCondition(purpose: ImpactPurpose): string {
  return purpose === "url" ? EXTERNAL_URL_USAGE : "e.id<>?";
}

export function incomingUsageSql(purpose: ImpactPurpose, phase: "draft" | "published"): string {
  const visibility = phase === "published" ? "and r.delivered=1" : "";
  return `select 1 from content_entry_link_references r
    join content_snapshots s on s.id=r.snapshot_id
    join content_entries e on e.id=s.entry_id and e.${phase}_snapshot_id=s.id
    where r.target_entry_id=? and r.purpose='${purpose}' ${visibility} and ${impactSourceCondition(purpose)}`;
}

function impactEvidenceSql(purpose: ImpactPurpose): string {
  const draftUsages =
    purpose === "reference"
      ? `, exists(${incomingUsageSql(purpose, "draft")}) as has_draft_usages`
      : "";
  return `select g.revision as graph_revision, d.revision as draft_revision,
    t.published_snapshot_id, t.id,
    exists(${incomingUsageSql(purpose, "published")}) as has_published_usages${draftUsages}
    from content_link_state g left join content_entries t on t.id=?
    left join content_snapshots d on d.id=t.draft_snapshot_id where g.singleton_key=1`;
}

export const LINK_IMPACT_EVIDENCE_SQL = impactEvidenceSql("url");
export const REFERENCE_IMPACT_EVIDENCE_SQL = impactEvidenceSql("reference");

export interface ImpactEvidenceRow {
  readonly graph_revision: number;
  readonly draft_revision: number | null;
  readonly published_snapshot_id: string | null;
  readonly id: string | null;
  readonly has_published_usages: number;
  readonly has_draft_usages?: number;
}
