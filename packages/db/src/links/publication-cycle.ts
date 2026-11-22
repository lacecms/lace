import { MAX_REFERENCE_CYCLE_IDS } from "@lacecms/content";

/**
 * The existing published graph is acyclic. Find exits back to the subject
 * once, then follow the least ID at each step to witness a specific cycle.
 * The omitted tail can still supply a verified publish-first candidate.
 */
export function publicationCycleSql(visitLimit: number): string {
  return `, exits(id) as (
    select id from subject where (select cycle from result)=1
    union
    select a.source from exits x join arcs a on a.target=x.id
  ), next_edges(source, target) as materialized (
    select a.source, min(a.target) from arcs a join exits x on x.id=a.target group by a.source
    union all
    select s.id, min(a.id) from subject s cross join added a join exits x on x.id=a.id group by s.id
  ), walk(step, node) as materialized (
    select 0, id from subject where (select cycle from result)=1
    union all
    select w.step+1, edge.target from walk w join next_edges edge on edge.source=w.node
    where w.step<${visitLimit} and (w.step=0 or w.node<>(select id from subject))
  ), witness(value) as (
    select json_group_array(node order by step) from walk where step<=${MAX_REFERENCE_CYCLE_IDS}
  ), publish_first(value) as (
    select json_array(e.id, d.title) from walk w join next_edges edge on edge.source=w.node
    join content_entries e on e.id=w.node join content_snapshots d on d.id=e.draft_snapshot_id
    where w.step>0 and w.node<>(select id from subject)
    and not exists (
      select 1 from content_entry_link_references r indexed by content_entry_link_references_outgoing_idx
      where r.snapshot_id=d.id and r.purpose='reference' and r.delivered=1 and r.target_entry_id=edge.target
    )
    order by w.step limit 1
  )`;
}
