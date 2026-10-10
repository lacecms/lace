## 1. Architecture and theme tokens

- [x] 1.1 Update the "Accessibility acceptance" paragraph of `docs/mvp-architecture.md` to state that the admin ships light and dark themes selected by a remembered System/Light/Dark preference; verify no remaining "light theme only" statement with `grep -n "light theme only" docs/mvp-architecture.md`
- [x] 1.2 Add the `:root[data-theme="dark"]` token block with `color-scheme: dark` and every light token name to `apps/admin/src/app/styles/theme.css`, replacing the "added later" comment; verify `pnpm lint` color checks still pass
- [x] 1.3 Update `theme.test.ts` to parse both theme blocks, assert identical token names, assert the `dark:` variant targets only `data-theme="dark"`, and run the AA contrast pairs for each theme; verify with `pnpm --filter @lacecms/app-admin test -- theme`
- [x] 1.4 Remove `dark:bg-destructive/60` from the destructive variants of `shared/ui/Button` and `shared/ui/Badge`; verify their component tests pass

## 2. Theme preference

- [x] 2.1 Implement `shared/lib/theme-preference.ts` (factory, default browser instance, `start`, `setPreference`, `subscribe`, `useThemePreference`) and export it from `shared/lib/index.ts`; verify unit tests cover default `system`, OS dark resolution, OS change while open, explicit choice persistence across instances, invalid stored values, throwing acquisition/read/write with in-memory fallback, `storage` events from another tab, and the `data-theme`/`color-scheme` written to the root
- [x] 2.2 Call the preference `start()` in `apps/admin/src/main.tsx` before `createRoot().render()`; verify with `pnpm --filter @lacecms/app-admin typecheck`
- [x] 2.3 Make `shared/ui/Toaster` pass the resolved theme to Sonner instead of the fixed `light`; verify a Toaster test renders the dark theme when the preference resolves to dark

## 3. Theme selection in the shell

- [x] 3.1 Add the labelled "Theme" radio group (System, Light, Dark) to `widgets/admin-shell/UserMenu`; verify `UserMenu.test.tsx` covers the checked option, selecting Dark applying `data-theme="dark"` and storing `dark`, and keyboard selection of Light
- [x] 3.2 Seed the theme preference in `apps/admin/e2e/accessibility.e2e.ts` and run sign-in, every route, and the main-dialog audits in both light and dark; verify with `pnpm --filter @lacecms/app-admin test:e2e -- accessibility`

## 4. Verification

- [x] 4.1 Run the admin unit tests, root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` (Oxfmt), and `pnpm exec openspec validate admin-dark-theme --type change --strict`; verify all pass
