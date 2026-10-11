## ADDED Requirements

### Requirement: Synchronization classifies enabling and disabling SEO
Synchronization SHALL treat enabling `seo` on a page or collection as a
compatible structural change. It is applied without touching stored
snapshots, and like every structural change it requires a version increase.
Synchronization SHALL treat disabling `seo` as a destructive structural
change:

- when no draft or published snapshot of the model holds an SEO group, it is
  applied;
- when snapshots hold SEO groups and the model does not declare
  `removedSeo: true`, the plan is refused with diagnostic
  `SEO_REMOVAL_HAS_DATA`, which counts the draft and published holders, names
  up to 20 of them and tells the operator to declare `removedSeo: true`;
- with the hint, apply clears the SEO group of every snapshot of the model and
  deletes their `$seo` media references in the same guarded mutation that
  records the model. It does not change revisions, audit actors or
  timestamps.

A `removedSeo` hint on a model whose baseline did not enable SEO SHALL be
inert. Changing a fallback mapping or `seoDefaults` SHALL be a projection-only
change that needs no version increase and advances the published version like
other projection changes. Evidence for these decisions SHALL come from the
same bounded snapshot scan as other data-dependent decisions, and apply SHALL
reject the plan when a snapshot changed after planning.

#### Scenario: Enable SEO on a populated model
- **WHEN** `posts` with published entries gains `seo: true` and a version
  increase
- **THEN** the plan applies, stored snapshots are unchanged and the baseline
  records SEO enabled

#### Scenario: Refuse disabling SEO with data and no hint
- **WHEN** `posts` drops `seo` with a version increase while two drafts and one
  published snapshot hold SEO groups
- **THEN** the plan is refused with `SEO_REMOVAL_HAS_DATA`, reports two drafts
  and one published snapshot, and nothing is written

#### Scenario: Prune SEO with the hint
- **WHEN** the same change declares `removedSeo: true` and sync applies
- **THEN** no snapshot of `posts` holds an SEO group or a `$seo` media
  reference, revisions are unchanged and the published version advances once

#### Scenario: Disable SEO without data
- **WHEN** `notes` drops `seo` with a version increase and no snapshot holds an
  SEO group
- **THEN** the plan applies without the hint

#### Scenario: A mapping change needs no version bump
- **WHEN** only the `seo.description` mapping of `posts` changes
- **THEN** the plan updates the projection without a version increase, and
  applying it advances the published version
