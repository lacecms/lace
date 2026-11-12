## 1. Dependency and runtime loading

- [x] 1.1 Make Miniflare an optional peer and development dependency of the CLI, update the lockfile, and verify the packed manifest exposes the intended compatible peer and optional metadata.
- [x] 1.2 Move Cloudflare runtime imports behind target selection and verify Node migration works with a loader that rejects Miniflare and the Cloudflare platform.
- [x] 1.3 Report only an absent top-level Miniflare as a sanitized actionable operation error for either Cloudflare target; verify text and JSON errors, no mutation, and propagation of unrelated loading failures.
- [x] 1.4 Retain D1 close, migrations, synchronization and bootstrap behavior; run the CLI source and packaged D1/migration suites for both targets.

## 2. Consumer delivery

- [x] 2.1 Add a compatible direct Miniflare dependency to generated Cloudflare projects only, update generated fixtures and snapshots, and verify generated Node and Cloudflare manifests.
- [x] 2.2 Update Cloudflare setup and upgrade guidance with the compatible install instruction; run the relevant generator and documentation checks.
- [x] 2.3 Test a packed isolated CLI consumer without Miniflare for real Node migration and both missing-peer cases, then with the peer for a local D1 operation; assert doctor output and exit status remain unchanged.

## 3. Verification

- [x] 3.1 Run relevant CLI and generator source and packaged tests, then root typecheck, Oxlint, Oxfmt check and `pnpm exec openspec validate rf07a-lazy-cloudflare-path --type change --strict`; record results and any environmental limits.
