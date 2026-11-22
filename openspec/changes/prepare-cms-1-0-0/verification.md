# CMS 1.0.0 qualification

## Origin and availability, 2026-11-22

EX7A was archived at `e93ee49d`. Its exact-artifact qualification used pnpm 12.21.0 and the reviewed build at `0f8f8be0`.

Read-only registry checks found all sixteen RC5 packages and no 1.0.0 entry in any of their npm version maps. The downloaded RC5 generator matched npm integrity `sha512-mNsYs5GJeCUAPGgxEYpt7SoJ1Mj0hDxLnadUuhi0eCF8BEO9ad69m5Fz1PbRgLVh1dPs0vjX2ScFrWVvDgRV+g==` and archive SHA-256 `a436e4b08913ad512a35b734c50c04a772cd3b92e841960746da5e303be22260`. The GitHub RC5 release and tag were visible and the tag matched local commit `bb3d17e813f504c2133a7664af0174c5e0a60cf0`. The GitHub 1.0.0 tag and release returned 404.

| RC5 GHCR image | Index digest | linux/amd64 manifest | linux/arm64 manifest |
| --- | --- | --- | --- |
| api | sha256:0359eae1c62cdde3b71a201588a332b3fdbcc9746b8f3caec5a3ac64bdfabc5a | sha256:95fa3a896c1c0e67cfc31122f5c138cf0ec13574634bee72a3895ebe62407b9b | sha256:c7d52d6a14cb33d650a9f6a6e1384d950d35125e175d90416adbcf3301185300 |
| builder | sha256:2c9aeb850f75801e43236893d635cc3eb19e9c2ffd1d323f26b760dc2b4dcfd0 | sha256:05d4973d097468eb225d272a16726bfd45f4c39cb3b5f28f122ec82409a193e5 | sha256:9a880f66fc74ad93705cc63855e475598a9cd2c7b1298eceb6e6196897aae2f0 |

Both GHCR 1.0.0 tags returned 404. Availability is dated to this check.

## Migration coverage cleanup

The two RC4 generator outputs were replaced with checksummed RC5 outputs.
The obsolete built-in gallery transform and its companion tests were deleted,
along with the old built-in image/gallery scenarios in the application sync
suite. Generic custom-block failure, atomicity and resume cases remain.
The SQLite index suite now seeds the two-step RC5 schema before forward
migration. The timestamp and filename examples in ledger, doctor, Worker
and migration CLI refusal tests use synthetic unknown entries. The packaged
CLI's alpha-coordinate upgrade replay was removed and its generic filesystem
and conflict fixtures now use synthetic template identifiers.

Focused results included 274 content tests, 193 application tests, 6 schema
and ledger tests, 7 Node migration tests, 21 Worker/D1 tests, 42 packaged CLI
migration/doctor tests, 26 packaged upgrade-command tests and 3 RC5 fixture
integrity tests.

## Local source qualification

The published RC5 default and Cloudflare projects passed managed conflict, clean
apply and repeat-plan checks. All six current generator variants matched two
regenerations and all 22 packaged generator checks passed. The local D1/R2
cutover exercised published credentials, distinct revisions, a v6 gallery, an
entry URL, durable work, all five migrations, a fresh-schema comparison,
a repeated migration, a new upload, restart, Astro rebuild and RC5 restore.

The full suite exposed two existing regressions. The contract inventory omitted
two active draft-media cases. D1 draft saving read the entry before checking the
persistence bounds. The inventory now includes both tests and both D1 save paths
check the same bounds before database access. The MCP compatibility run passed
456 tests. The operations runner completed all phases, including its rollback
and restore exercises. The dependency audit covered 981 locked license records
and one tooling advisory with an existing policy disposition.

The separate local Node run completed the same five-step cutover using the
digest-pinned published RC5 API and builder, the original generated MinIO
Dockerfile, stopped SQLite and independently copied object volumes. The stable
installation read the original bytes, retained a second upload across restart,
rebuilt the public gallery and matched the fresh schema. The isolated restored
RC5 installation served the original static output and accepted the original
sign-in. The exact-inventory harness repeats both journeys and checks that the
stable-only media is absent after restore. It records the release origin,
data/output checksums and both media digests.

The stable package/image set was prepared from clean shipping commit
`357ebbbc8d2eb73acf164ae62db40647dce2a046`. Its [reviewed inventory](inventory.json)
has SHA-256 `8be5e95234a622cac36e65a6050665505c686b7fa16fe01930b3b30762510341`.
Independent reads of the 16 package archives and four Docker archives matched
every digest. All four image smoke checks passed, including linux/amd64 on
the arm64 host. The reviewed source fingerprint is
`f63bd2fa2e5d7578f9eedcd43b73caa22b5628131c643b4b0f0a50b98aec9914`.

Follow-up verification changes teach the Admin/OpenAPI test to inspect the
detach request's transport and query parameters, let the deletion test's
simulated server return its committed state, give the synthetic tampered
inventory its prerequisite channel, and restrict root verification discovery
to this checkout's tests. These changes concern the verification harness.
