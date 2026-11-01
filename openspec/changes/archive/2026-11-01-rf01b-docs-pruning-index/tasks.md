## 1. Verification document

- [x] 1.1 Write `docs/verification.md` with the five sections of design decision 1 (Commands, Limits, Coverage, Recorded D1 budget measurements, Owner checks on real infrastructure), sourcing content from `mvp-traceability.md`, `local-operations-verification.md`, `local-security-verification.md`, `real-application-verification.md` and `verification/ce10-internal-url-links.md`; verify every command named exists in root `package.json` (`grep -o 'pnpm [a-z:-]*' docs/verification.md | sort -u` against `package.json` scripts) and every evidence file or script named in the Coverage tables exists.
- [x] 1.2 Replace evidence names in the Coverage tables with RF1A's renamed journeys, stages and variables (`consumer-security-probes`, `template-upgrade`, `verify:operations`, `LACE_VERIFY_*`); verify `grep -n "34[ABC]\|alpha-six\|alpha-seven\|alpha-eight\|verify:34\|LACE_34" docs/verification.md` returns nothing.
- [x] 1.3 Delete `docs/mvp-traceability.md`, `docs/real-application-verification.md`, `docs/local-operations-verification.md`, `docs/local-security-verification.md` and `docs/verification/`; verify `ls docs` lists none of them and `git status --short` shows the deletions.

## 2. Archived step records

- [x] 2.1 Delete `docs/archive/step-25`, `step-27`, `step-29`, `step-32`, `step-33` and `step-34`; verify `ls docs/archive` lists only `content-editor-roadmap.md`, `mvp-implementation-roadmap.md`, `mvp-implementation-roadmap-summary.md` and `site-migration-roadmap.md`.
- [x] 2.2 Record in `docs/README.md` the last commit that contained `docs/archive/step-*` (`git log -1 --format=%h -- docs/archive/step-34` before deletion); verify the hash resolves with `git cat-file -t`.

## 3. Link repair

- [x] 3.1 Replace the "See 34C local operations verification…" paragraph in `docs/auth-operations.md`, `docs/cloudflare-deployment-handoff.md`, `docs/cloudflare-worker.md`, `docs/database-migrations.md` and `docs/node-api.md` with one sentence linking `verification.md#owner-checks-on-real-infrastructure`; verify `grep -ln "local-operations-verification" docs/*.md` returns nothing.
- [x] 3.2 Repair `docs/alpha-release.md` (four step-record links → the archived `prepare-alpha-*` change paths or `verification.md`), `docs/compatibility.md` (two step-record links → archived change paths; owner-plan link → `verification.md`) and `docs/cloudflare-deployment-handoff.md` line 5; verify `grep -n "archive/step-\|real-application-verification\|mvp-traceability" docs/*.md` returns nothing.
- [x] 3.3 Repair `docs/mvp-architecture.md` §5, §8 and §25 per design decision 6 and add one sentence in §20 pointing at `docs/verification.md`; verify `grep -n "real-application-verification\|verification/ce10" docs/mvp-architecture.md` returns nothing.
- [x] 3.4 Update `docs/documentation-maintenance.md` (ownership map rows naming merged files; pointer to `docs/README.md`), `DEVELOPMENT.md` "Public documentation development" and "Verification" sections (link `docs/verification.md` and `docs/README.md`), `README.md` (the `docs/` sentence links the index) and `AGENTS.md` item 1 (adds `docs/README.md` as the index of internal documents); verify each file's links resolve by running the link guard from task 5.1.
- [x] 3.5 Confirm no generated template or consumer guide links a deleted path; verify `grep -rn "docs/archive/step\|mvp-traceability\|real-application-verification\|local-operations-verification\|local-security-verification" packages/create-lace/templates scripts/consumer-guides.mjs apps/docs/src` returns nothing.

## 4. Indexes

- [x] 4.1 Write `docs/README.md` per design decision 3 with one row per Markdown file under `docs/`, `docs/adr/` and `docs/archive/`, status words `authoritative`, `internal note` or `historical`, and the architecture section, capability or roadmap each file details; verify the row count equals `find docs -name '*.md' | wc -l` minus the two index files.
- [x] 4.2 Write `docs/adr/README.md` listing ADRs 0001–0018 with title, status (`accepted`, `amended`, `superseded`) and the superseding ADR where applicable; verify every `docs/adr/0*.md` has a row and every row's file exists.

## 5. Link guard and gates

- [x] 5.1 Add `tests/docs-links.test.mjs` per design decision 4 (relative link resolution across `README.md`, `DEVELOPMENT.md`, `AGENTS.md`, `backlog.md`, `docs/**/*.md`; index completeness for `docs/` and `docs/adr/`); verify it passes, then fails when a temporary dangling link, an unindexed `docs/temp.md` and an unindexed `docs/adr/0099-temp.md` are each introduced in a scratch copy.
- [x] 5.2 Update `docs/refactoring-roadmap.md` (RF1B session text matches the delivered structure; progress log row; baseline rows for docs count and verification documents) and `backlog.md` if any deferred item changes; verify the link guard passes.
- [x] 5.3 Run `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm docs:check` and `pnpm spec:validate`; verify all pass and that `tests/docs-publication.test.mjs` still reports `docs/` changes as non-publishing inputs.
