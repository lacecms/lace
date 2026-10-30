# Alpha.8 verification

## Completed — 2026-10-30 (Europe/Rome)

All release-preparation implementation work is complete. The authoritative
handoff is [readiness.md](./readiness.md), generated from the independently
verified inventory and validated durable acceptance receipt. Source
`001ad14b83a228c4ac4ccfb79d5963c86a07801f` produced the saved set at
`.release-artifacts/alpha-8-retry-1`; committed harness
`f3e4e1fb66c1679b203c8f2399591c7a6991aa90` completed all 22 exact-artifact
journeys and cleanup. Both image platforms passed smoke tests; full consumer
coverage is linux/arm64 plus local Worker/D1/R2, not two-platform end-to-end or
real-account deployment coverage. No remote publication or deployment occurred.

## Gates

- Full workspace/root regression: 44 Turborepo tasks and 222 root tests passed.
- Generator/CLI: 64/270 tests; focused release tooling: 57 tests.
- MCP provider/type/runtime compatibility: 106 tests across six files.
- Operations/runner suite: 28 tests; changed harness contracts: 12 tests.
- Root typecheck, Oxlint, Oxfmt, OpenAPI and strict OpenSpec validation passed.
- Docs check/build/variants and built-site browser navigation/deep-page/Pagefind
  smoke passed with English/latest targeting alpha.8.
- Published alpha.7 generator integrity and template 0.35.0 fixtures were
  verified; all historical upgrade/conflict/preservation journeys passed.
- Sixteen archives and four runtime images prepared from clean source; all
  platform smokes and independent saved-byte verification passed.
- Full exact-artifact acceptance passed. Node production MCP used a real HTTPS
  edge and explicit fixture CA; untrusted certificates were rejected, canonical
  Host/Origin and production HTTPS checks remained enabled. The native client
  callback used HTTP loopback independently of the HTTPS protected resource.
- Source replay/concurrency/D1-budget coverage remains separately identified;
  local clients, intercepted video providers and Pages stubs are not real client,
  provider or deployment acceptance.

## Audit and remediation

The initial report at `.release-artifacts/alpha-8-evidence/dependency-audit.json`
failed existing policy: 1 critical, 15 high, 29 moderate and 5 low findings.
Scanner counts are not claims of application exploitability. No exception was
added. Targeted fixes selected Better Auth/provider 1.7.7, Hono 4.13.11, Node
adapter 2.1.3, Astro 7.3.3, Vite 8.2.4, Vitest 5.0.3 and Nodemailer 10.1.4, with
bounded patched transitive overrides for Vite 8.3.3, Zod 4.6.6, Undici
7.30.1/8.12.2 and Seroval 1.6.11. Frozen dependencies and the delivered starter
Astro pin were updated together.

`.release-artifacts/alpha-8-evidence/dependency-audit-remediated.json` passed:
992 locked license records, 0 critical/high/low findings and one existing accepted
moderate esbuild tooling advisory. The original policy dispositions remain
unchanged. This is not a zero-vulnerability claim.

## Preparation and harness repairs

The initial `.release-artifacts/alpha-8` set remains preserved as failed: the
builder compile stage lacked Python/C++ tools for a native install lifecycle.
Installing build-essential/python3 in that compile stage fixed the actual
amd64 build; fresh complete preparation and both-platform smokes used the new
clean source and distinct retry directory. No failed set was overwritten.

Later changes were harness/notes only: the exact reviewed query configuration
transform is checked against its original shipping digest; every other consumer
edit still fails. TLS validates production MCP through generated nginx before
legacy field-trial teardown removes that stack. Legacy acceptance expectations
now match alpha.8, Gallery v4 and CQ1's 422 VALIDATION_FAILED at /after. Successful
focused tests did not create full release receipts. Only the final complete run,
after cleanup, wrote acceptance.json for the unchanged saved archives/images.

Registry checks are retained separately in `registry-checks.json` and
`registry-checks-final.json`: alpha.7's original fifteen packages/images are
public and immutable, MCP alpha.7 is absent as expected, and all alpha.8 candidate
coordinates were available. Availability does not reserve names or establish
publishing rights. The final handoff keeps publication authorization, source push,
real deployment/restore and actual assistant-client login as separate owner steps.
