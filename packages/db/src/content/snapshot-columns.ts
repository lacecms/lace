export const SNAPSHOT_FIELDS_SQL = `s.id, s.entry_id, s.revision, s.slug, s.title, s.fields_json, s.seo_json, s.schema_version,
        s.created_at, s.updated_at, s.updated_by, profile.role`;
export const SNAPSHOT_FROM_SQL =
  "from content_snapshots s left join content_actor_profiles profile on profile.actor_id = s.updated_by";
export const SNAPSHOT_COLUMNS_SQL = `select ${SNAPSHOT_FIELDS_SQL}
   ${SNAPSHOT_FROM_SQL}`;
