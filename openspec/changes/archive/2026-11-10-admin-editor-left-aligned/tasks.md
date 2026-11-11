## 1. Layout

- [x] 1.1 Remove the centering classes (`mx-auto w-full`) from the entry editor form in `pages/entry/EntryPage/EntryPage.tsx`; verify in the browser at a wide viewport that the editor starts at the content area's left padding, and that the entry page tests pass

## 2. Records and verification

- [x] 2.1 Record the change in the roadmap progress log; run admin typecheck, Oxlint, Oxfmt check, `pnpm spec:validate` and `pnpm exec openspec validate admin-editor-left-aligned --type change --strict`
